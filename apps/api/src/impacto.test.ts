import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD, type BD } from './bd.ts';
import { calcularImpacto } from './impacto.ts';
import { crearComedor, crearComercio, crearDonacion, marcarVencidas, recogerDonacion, reservarDonacion } from './repositorio.ts';
import { sembrar } from './semilla.ts';

const INICIO = new Date('2026-11-23T08:00:00Z');
const mas = (d: Date, horas: number) => new Date(d.getTime() + horas * 3_600_000);

describe('impacto', () => {
  let db: BD;

  beforeEach(() => {
    db = abrirBD(':memory:');
  });

  /** Publica, reserva y recoge una donación con tiempos controlados. */
  function donar(cantidad: number, comercioId: number, comedorId: number, publicadaEn: Date, minutosHastaRecoger = 60) {
    const d = crearDonacion(
      db,
      {
        comercioId,
        producto: 'Pan',
        categoria: 'panaderia',
        cantidad,
        unidad: 'kg',
        caducaEn: mas(publicadaEn, 20).toISOString(),
        ventanaDesde: publicadaEn.toISOString(),
        ventanaHasta: mas(publicadaEn, 19).toISOString(),
        requiereFrio: false,
      },
      publicadaEn,
    );
    reservarDonacion(db, d.id, { comedorId, reservadoPor: 'Encargada' }, mas(publicadaEn, 0.1));
    recogerDonacion(db, d.id, { comedorId, recogidoPor: 'Encargada', cantidadRecibida: cantidad, estadoOk: true }, new Date(publicadaEn.getTime() + minutosHastaRecoger * 60_000));
    return d;
  }

  function preparar() {
    crearComercio(db, { nombre: 'Comercio A', tipo: 'panaderia', direccion: 'Dir A', lat: -12.2, lng: -76.9 });
    crearComercio(db, { nombre: 'Comercio B', tipo: 'bodega', direccion: 'Dir B', lat: -12.21, lng: -76.91 });
    const base = { zona: 'Z', direccion: 'Dir', lat: -12.2, lng: -76.9, racionesDia: 50, necesidades: [] as [], refrigeracion: true, horarioRecojo: 'Todo el día' };
    crearComedor(db, { ...base, nombre: 'Comedor 1' });
    crearComedor(db, { ...base, nombre: 'Comedor 2' });
  }

  it('sin donaciones devuelve ceros y valores nulos, sin romper', () => {
    preparar();
    const r = calcularImpacto(db, INICIO);
    assert.equal(r.kgRescatados, 0);
    assert.equal(r.racionesEquivalentes, 0);
    assert.equal(r.porcentajeAntesDeVencer, null);
    assert.equal(r.tiempoMedioMin, null);
    assert.deepEqual(r.kgPorSemana, [0, 0, 0, 0]);
  });

  it('suma kg, raciones, comedores atendidos y tiempo medio', () => {
    preparar();
    const hoy = mas(INICIO, -48);
    donar(20, 1, 1, hoy, 60);
    donar(10, 2, 2, mas(hoy, 1), 120);
    const ahora = mas(INICIO, 0);
    const r = calcularImpacto(db, ahora);
    assert.equal(r.kgRescatados, 30);
    assert.equal(r.racionesEquivalentes, 60); // 30 kg / 0,5 kg por ración
    assert.equal(r.comedoresAtendidos, 2);
    assert.equal(r.comerciosDonantes, 2);
    assert.equal(r.tiempoMedioMin, 90);
    assert.equal(r.porcentajeAntesDeVencer, 100);
    assert.equal(r.kgPorSemana.reduce((s, k) => s + k, 0), 30);
  });

  it('el porcentaje antes de vencer cuenta también las donaciones vencidas', () => {
    preparar();
    const hace = mas(INICIO, -72);
    donar(20, 1, 1, hace);
    donar(10, 1, 1, mas(hace, 1));
    // Una publicada que nadie recoge y vence.
    crearDonacion(db, { comercioId: 2, producto: 'Leche', categoria: 'lacteos', cantidad: 5, unidad: 'litros', caducaEn: mas(hace, 3).toISOString(), ventanaDesde: hace.toISOString(), ventanaHasta: mas(hace, 2).toISOString(), requiereFrio: false }, hace);
    marcarVencidas(db, INICIO);
    const r = calcularImpacto(db, INICIO);
    assert.equal(r.porcentajeAntesDeVencer, 67); // 2 de 3
    assert.equal(r.porEstado.vencida, 1);
    const b = r.comercios.find((c) => c.comercioId === 2)!;
    assert.equal(b.vencidasSinDonar, 1);
  });

  it('desglosa por comedor y por comercio', () => {
    preparar();
    const hace = mas(INICIO, -30);
    donar(20, 1, 1, hace);
    donar(5, 1, 2, mas(hace, 1));
    const r = calcularImpacto(db, INICIO);
    assert.equal(r.comedores.find((c) => c.comedorId === 1)!.kgRecibidos, 20);
    assert.equal(r.comedores.find((c) => c.comedorId === 2)!.kgRecibidos, 5);
    assert.equal(r.comercios.find((c) => c.comercioId === 1)!.kgDonados, 25);
  });

  it('avisa de comedores sin actividad y de lo que vence pronto', () => {
    preparar();
    donar(20, 1, 1, mas(INICIO, -48));
    crearDonacion(db, { comercioId: 1, producto: 'Pan', categoria: 'panaderia', cantidad: 4, unidad: 'kg', caducaEn: mas(INICIO, 3).toISOString(), ventanaDesde: INICIO.toISOString(), ventanaHasta: mas(INICIO, 2).toISOString(), requiereFrio: false }, INICIO);
    const r = calcularImpacto(db, INICIO);
    assert.equal(r.alertas.vencenPronto, 1);
    assert.equal(r.alertas.vencenProntoSinComedor, 1);
    assert.deepEqual(r.alertas.comedoresSinActividad.map((c) => c.nombre), ['Comedor 2']);
  });

  it('con los datos sintéticos entrega cifras coherentes', () => {
    sembrar(db, INICIO);
    const r = calcularImpacto(db, INICIO);
    assert.ok(r.kgRescatados > 0);
    assert.ok(r.porcentajeAntesDeVencer !== null && r.porcentajeAntesDeVencer > 0 && r.porcentajeAntesDeVencer <= 100);
    assert.equal(Math.round(r.kgPorSemana.reduce((s, k) => s + k, 0)), Math.round(r.kgRescatados));
    assert.equal(Object.values(r.porEstado).reduce((s, n) => s + n, 0), r.donacionesPublicadas);
  });
});
