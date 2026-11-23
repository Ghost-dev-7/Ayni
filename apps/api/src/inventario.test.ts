import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { STOCK_MINIMO } from '@ayni/shared';
import { abrirBD, type BD } from './bd.ts';
import { inventarioCentral, obtenerInventario, productosFaltantes, registrarConsumo, registrarEntrada } from './inventario.ts';
import { crearComedor, crearComercio, crearDonacion, listarNotificacionesComedor, recogerDonacion, reservarDonacion } from './repositorio.ts';
import { sembrar } from './semilla.ts';

const AHORA = new Date('2026-11-23T15:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString();

describe('inventario', () => {
  let db: BD;

  beforeEach(() => {
    db = abrirBD(':memory:');
    crearComercio(db, { nombre: 'Comercio A', tipo: 'panaderia', direccion: 'Dir', lat: -12.2, lng: -76.9 });
    const base = { zona: 'Z', direccion: 'Dir', lat: -12.2, lng: -76.9, racionesDia: 100, necesidades: [] as [], refrigeracion: true, horarioRecojo: 'Todo el día' };
    crearComedor(db, { ...base, nombre: 'Comedor 1' });
    crearComedor(db, { ...base, nombre: 'Comedor 2' });
  });

  const entrada = (producto: string, cantidad: number, horasParaVencer: number | null, comedorId = 1, unidad: 'kg' | 'unidades' | 'litros' = 'kg') =>
    registrarEntrada(
      db,
      comedorId,
      { producto, categoria: 'abarrotes', unidad, cantidad, caducaEn: horasParaVencer === null ? null : enHoras(horasParaVencer) },
      { origen: 'manual', ahora: AHORA },
    );
  const consumir = (producto: string, cantidad: number, comedorId = 1, unidad: 'kg' | 'unidades' | 'litros' = 'kg') =>
    registrarConsumo(db, comedorId, { producto, unidad, cantidad }, AHORA);
  const acciones = (comedorId = 1) => listarNotificacionesComedor(db, comedorId).map((n) => n.accion);

  it('el mínimo es fijo: 10 de la unidad de cada producto', () => {
    assert.equal(STOCK_MINIMO, 10);
    entrada('Arroz', 50, null);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.minimo, 10);
  });

  it('registra una entrada con su lote y su aviso', () => {
    const lote = entrada('Arroz', 50, 24 * 200);
    assert.equal(lote.cantidad, 50);
    assert.equal(lote.cantidadInicial, 50);
    const inv = obtenerInventario(db, 1, AHORA);
    assert.equal(inv.productos.length, 1);
    assert.equal(inv.productos[0]!.total, 50);
    assert.ok(acciones().includes('Entró al inventario'));
  });

  it('suma los lotes del mismo producto sin distinguir mayúsculas', () => {
    entrada('Arroz', 30, 24 * 100);
    entrada('arroz', 20, 24 * 200);
    const inv = obtenerInventario(db, 1, AHORA);
    assert.equal(inv.productos.length, 1);
    assert.equal(inv.productos[0]!.total, 50);
    assert.equal(inv.productos[0]!.lotes, 2);
  });

  it('al registrar lo consumido el stock se resta solo, empezando por el lote que vence antes (PEPS)', () => {
    const tarde = entrada('Verduras surtidas', 10, 24 * 6);
    const pronto = entrada('Verduras surtidas', 10, 24 * 1);
    const r = consumir('Verduras surtidas', 14);
    assert.deepEqual(r.descontado, [
      { loteId: pronto.id, cantidad: 10 },
      { loteId: tarde.id, cantidad: 4 },
    ]);
    assert.equal(r.quedan, 6);
    const lotes = obtenerInventario(db, 1, AHORA).lotes;
    assert.equal(lotes.length, 1);
    assert.equal(lotes[0]!.id, tarde.id);
    assert.equal(lotes[0]!.cantidad, 6);
  });

  it('no deja consumir más de lo que hay ni un producto inexistente', () => {
    entrada('Arroz', 5, null);
    assert.throws(() => consumir('Arroz', 6), /Solo hay 5/);
    assert.throws(() => consumir('Fideos', 1, 1, 'unidades'), /No hay/);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.total, 5);
  });

  it('cada comedor tiene su propio inventario', () => {
    entrada('Arroz', 50, null, 1);
    entrada('Arroz', 8, null, 2);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.total, 50);
    assert.equal(obtenerInventario(db, 2, AHORA).productos[0]!.total, 8);
    assert.throws(() => consumir('Arroz', 20, 2), /Solo hay 8/);
  });

  it('marca la alerta con menos de 10 y avisa solo al cruzar el mínimo', () => {
    entrada('Lentejas', 12, null);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.bajoMinimo, false);

    consumir('Lentejas', 1); // quedan 11: sigue sobre el mínimo
    assert.ok(!acciones().includes('Stock bajo'));

    consumir('Lentejas', 2); // quedan 9: cruza el mínimo
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.bajoMinimo, true);
    assert.equal(acciones().filter((a) => a === 'Stock bajo').length, 1);

    consumir('Lentejas', 1); // quedan 8: ya estaba bajo, no repite el aviso
    assert.equal(acciones().filter((a) => a === 'Stock bajo').length, 1);
  });

  it('con exactamente 10 todavía no hay alerta', () => {
    entrada('Lentejas', 10, null);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.bajoMinimo, false);
  });

  it('al agotarse deja el aviso y el producto sigue apareciendo con stock 0', () => {
    entrada('Lentejas', 12, null);
    consumir('Lentejas', 12);
    const p = obtenerInventario(db, 1, AHORA).productos[0]!;
    assert.equal(p.total, 0);
    assert.equal(p.bajoMinimo, true);
    assert.ok(acciones().includes('Producto agotado'));
    assert.ok(productosFaltantes(db, 1, AHORA).has('lentejas'));
  });

  it('el resumen cuenta lotes por vencer, vencidos y productos bajo el mínimo', () => {
    entrada('Pan francés', 40, 5, 1, 'unidades');
    entrada('Yogures', 4, -3, 1, 'unidades');
    entrada('Arroz', 50, 24 * 200);
    const r = obtenerInventario(db, 1, AHORA).resumen;
    assert.equal(r.lotes, 3);
    assert.equal(r.lotesPorVencer, 1);
    assert.equal(r.lotesVencidos, 1);
    assert.equal(r.productosBajoMinimo, 1); // los yogures: 4 < 10
    // 40 panes de 0,1 kg + 50 kg de arroz; los yogures vencidos no cuentan.
    assert.equal(r.stockKg, 54);
  });

  it('una donación recogida entra sola al inventario y deja su aviso', () => {
    const d = crearDonacion(
      db,
      { comercioId: 1, producto: 'Pan francés', categoria: 'panaderia', cantidad: 60, unidad: 'unidades', caducaEn: enHoras(6), ventanaDesde: enHoras(0), ventanaHasta: enHoras(5), requiereFrio: false },
      AHORA,
    );
    reservarDonacion(db, d.id, { comedorId: 2, reservadoPor: 'Rosa M.' }, AHORA);
    recogerDonacion(db, d.id, { comedorId: 2, recogidoPor: 'Rosa M.', cantidadRecibida: 55, estadoOk: true }, AHORA);
    const inv = obtenerInventario(db, 2, AHORA);
    assert.equal(inv.productos[0]!.producto, 'Pan francés');
    assert.equal(inv.productos[0]!.total, 55);
    assert.equal(inv.lotes[0]!.origen, 'donacion');
    assert.equal(inv.lotes[0]!.donacionId, d.id);
    assert.equal(obtenerInventario(db, 1, AHORA).lotes.length, 0);
    const n = listarNotificacionesComedor(db, 2).find((x) => x.accion === 'Entró al inventario')!;
    assert.match(n.detalle, /\+55 .* de Pan francés/);
  });

  it('las notificaciones de un comedor reúnen reserva, recogida, inventario y alertas, y no las de otro', () => {
    const d = crearDonacion(
      db,
      { comercioId: 1, producto: 'Arroz', categoria: 'abarrotes', cantidad: 12, unidad: 'kg', caducaEn: enHoras(6), ventanaDesde: enHoras(0), ventanaHasta: enHoras(5), requiereFrio: false },
      AHORA,
    );
    reservarDonacion(db, d.id, { comedorId: 1, reservadoPor: 'Rosa M.' }, AHORA);
    recogerDonacion(db, d.id, { comedorId: 1, recogidoPor: 'Rosa M.', cantidadRecibida: 12, estadoOk: true }, AHORA);
    consumir('Arroz', 5);
    const del1 = acciones(1);
    for (const esperada of ['Reservada', 'Recogida confirmada', 'Entró al inventario', 'Consumo de inventario', 'Stock bajo']) {
      assert.ok(del1.includes(esperada), `falta "${esperada}"`);
    }
    assert.deepEqual(acciones(2), []);
    assert.throws(() => listarNotificacionesComedor(db, 99), /no existe/);
  });

  it('el inventario central reúne toda la red', () => {
    entrada('Arroz', 50, 24 * 200, 1);
    entrada('Pan francés', 8, 5, 2, 'unidades');
    const c = inventarioCentral(db, AHORA);
    assert.equal(c.comedores.length, 2);
    assert.equal(c.porVencer.length, 1);
    assert.equal(c.porVencer[0]!.comedor, 'Comedor 2');
    assert.equal(c.bajoMinimo.length, 1);
    assert.equal(c.bajoMinimo[0]!.producto, 'Pan francés');
    assert.equal(c.bajoMinimo[0]!.minimo, 10);
  });

  it('con los datos sintéticos cada comedor tiene inventario y algunas alertas', () => {
    sembrar(db, AHORA);
    const central = inventarioCentral(db, AHORA);
    assert.equal(central.comedores.length, 8);
    assert.ok(central.comedores.every((c) => c.lotes >= 6));
    assert.ok(central.totales.productosBajoMinimo > 0);
  });
});
