import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD, type BD } from './bd.ts';
import { fijarMinimo, inventarioCentral, obtenerInventario, productosFaltantes, registrarEntrada, registrarSalida } from './inventario.ts';
import { crearComedor, crearComercio, crearDonacion, recogerDonacion, reservarDonacion } from './repositorio.ts';
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

  const entrada = (producto: string, cantidad: number, horasParaVencer: number | null, comedorId = 1) =>
    registrarEntrada(
      db,
      comedorId,
      { producto, categoria: 'abarrotes', unidad: 'kg', cantidad, caducaEn: horasParaVencer === null ? null : enHoras(horasParaVencer) },
      { origen: 'manual', ahora: AHORA },
    );

  it('registra una entrada con su lote, su movimiento y su evento', () => {
    const lote = entrada('Arroz', 50, 24 * 200);
    assert.equal(lote.cantidad, 50);
    assert.equal(lote.cantidadInicial, 50);
    assert.equal(lote.origen, 'manual');
    const inv = obtenerInventario(db, 1, AHORA);
    assert.equal(inv.productos.length, 1);
    assert.equal(inv.productos[0]!.total, 50);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM eventos WHERE accion = 'Entrada de inventario'").get() as { n: number }).n, 1);
  });

  it('suma los lotes del mismo producto sin distinguir mayúsculas', () => {
    entrada('Arroz', 30, 24 * 100);
    entrada('arroz', 20, 24 * 200);
    const inv = obtenerInventario(db, 1, AHORA);
    assert.equal(inv.productos.length, 1);
    assert.equal(inv.productos[0]!.total, 50);
    assert.equal(inv.productos[0]!.lotes, 2);
  });

  it('descuenta primero el lote que vence antes (PEPS)', () => {
    const tarde = entrada('Verduras', 10, 24 * 6);
    const pronto = entrada('Verduras', 10, 24 * 1);
    const r = registrarSalida(db, 1, { producto: 'Verduras', unidad: 'kg', tipo: 'consumo', cantidad: 14 }, AHORA);
    assert.deepEqual(r.descontado, [
      { loteId: pronto.id, cantidad: 10 },
      { loteId: tarde.id, cantidad: 4 },
    ]);
    const lotes = obtenerInventario(db, 1, AHORA).lotes;
    assert.equal(lotes.length, 1);
    assert.equal(lotes[0]!.id, tarde.id);
    assert.equal(lotes[0]!.cantidad, 6);
  });

  it('no deja sacar más de lo que hay ni un producto inexistente', () => {
    entrada('Arroz', 5, null);
    assert.throws(() => registrarSalida(db, 1, { producto: 'Arroz', unidad: 'kg', tipo: 'consumo', cantidad: 6 }, AHORA), /Solo hay 5/);
    assert.throws(() => registrarSalida(db, 1, { producto: 'Fideos', unidad: 'kg', tipo: 'merma', cantidad: 1 }, AHORA), /No hay/);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.total, 5);
  });

  it('cada comedor tiene su propio inventario', () => {
    entrada('Arroz', 50, null, 1);
    entrada('Arroz', 8, null, 2);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.total, 50);
    assert.equal(obtenerInventario(db, 2, AHORA).productos[0]!.total, 8);
    assert.throws(() => registrarSalida(db, 2, { producto: 'Arroz', unidad: 'kg', tipo: 'consumo', cantidad: 20 }, AHORA), /Solo hay 8/);
  });

  it('avisa cuando un producto baja del mínimo y cuando se agota sigue apareciendo con stock 0', () => {
    entrada('Lentejas', 12, null);
    fijarMinimo(db, 1, { producto: 'Lentejas', unidad: 'kg', minimo: 10 });
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.bajoMinimo, false);
    registrarSalida(db, 1, { producto: 'Lentejas', unidad: 'kg', tipo: 'consumo', cantidad: 4 }, AHORA);
    assert.equal(obtenerInventario(db, 1, AHORA).productos[0]!.bajoMinimo, true);
    registrarSalida(db, 1, { producto: 'Lentejas', unidad: 'kg', tipo: 'consumo', cantidad: 8 }, AHORA);
    const p = obtenerInventario(db, 1, AHORA).productos[0]!;
    assert.equal(p.total, 0);
    assert.equal(p.bajoMinimo, true);
    assert.ok(productosFaltantes(db, 1, AHORA).has('lentejas'));
  });

  it('con mínimo 0 se quita la alerta', () => {
    entrada('Lentejas', 2, null);
    fijarMinimo(db, 1, { producto: 'Lentejas', unidad: 'kg', minimo: 10 });
    assert.equal(obtenerInventario(db, 1, AHORA).resumen.productosBajoMinimo, 1);
    fijarMinimo(db, 1, { producto: 'Lentejas', unidad: 'kg', minimo: 0 });
    assert.equal(obtenerInventario(db, 1, AHORA).resumen.productosBajoMinimo, 0);
  });

  it('el resumen cuenta lotes por vencer y vencidos, y no suma lo vencido al stock', () => {
    entrada('Pan', 10, 5);
    entrada('Yogur', 4, -3);
    entrada('Arroz', 50, 24 * 200);
    const r = obtenerInventario(db, 1, AHORA).resumen;
    assert.equal(r.lotes, 3);
    assert.equal(r.lotesPorVencer, 1);
    assert.equal(r.lotesVencidos, 1);
    assert.equal(r.stockKg, 60);
  });

  it('una donación recogida entra sola al inventario del comedor', () => {
    const d = crearDonacion(
      db,
      { comercioId: 1, producto: 'Pan francés', categoria: 'panaderia', cantidad: 20, unidad: 'kg', caducaEn: enHoras(6), ventanaDesde: enHoras(0), ventanaHasta: enHoras(5), requiereFrio: false },
      AHORA,
    );
    reservarDonacion(db, d.id, { comedorId: 2, reservadoPor: 'Rosa M.' }, AHORA);
    recogerDonacion(db, d.id, { comedorId: 2, recogidoPor: 'Rosa M.', cantidadRecibida: 18, estadoOk: true }, AHORA);
    const inv = obtenerInventario(db, 2, AHORA);
    assert.equal(inv.productos[0]!.producto, 'Pan francés');
    assert.equal(inv.productos[0]!.total, 18);
    assert.equal(inv.lotes[0]!.origen, 'donacion');
    assert.equal(inv.lotes[0]!.donacionId, d.id);
    assert.equal(obtenerInventario(db, 1, AHORA).lotes.length, 0);
  });

  it('el inventario central reúne toda la red', () => {
    entrada('Arroz', 50, 24 * 200, 1);
    entrada('Pan', 10, 5, 2);
    fijarMinimo(db, 2, { producto: 'Pan', unidad: 'kg', minimo: 30 });
    const c = inventarioCentral(db, AHORA);
    assert.equal(c.comedores.length, 2);
    assert.equal(c.totales.stockKg, 60);
    assert.equal(c.porVencer.length, 1);
    assert.equal(c.porVencer[0]!.comedor, 'Comedor 2');
    assert.equal(c.bajoMinimo.length, 1);
    assert.equal(c.bajoMinimo[0]!.producto, 'Pan');
  });

  it('con los datos sintéticos cada comedor tiene inventario y algunas alertas', () => {
    sembrar(db, AHORA);
    const central = inventarioCentral(db, AHORA);
    assert.equal(central.comedores.length, 8);
    assert.ok(central.comedores.every((c) => c.lotes >= 6));
    assert.ok(central.totales.productosBajoMinimo > 0);
  });
});
