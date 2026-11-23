import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Comedor, Donacion } from '@ayni/shared';
import { DIAS_DE_CAPACIDAD, KM_MAXIMO, capacidad, cercania, distanciaKm, espacioDisponibleKg, ordenar, puntuar } from './emparejamiento.ts';

const AHORA = new Date('2026-11-23T15:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString();

const comercio = { lat: -12.21, lng: -76.93 };

const donacion = (extra: Partial<Donacion> = {}): Donacion => ({
  id: 1,
  codigo: 'DON-0001',
  comercioId: 1,
  producto: 'Pan francés',
  categoria: 'panaderia',
  cantidad: 20,
  unidad: 'kg',
  caducaEn: enHoras(3),
  ventanaDesde: enHoras(0),
  ventanaHasta: enHoras(2),
  requiereFrio: false,
  estado: 'publicada',
  comedorId: null,
  creadaEn: enHoras(0),
  reservadaPor: null,
  reservadaEn: null,
  recogidaPor: null,
  recogidaEn: null,
  cantidadRecibida: null,
  ...extra,
});

const comedor = (extra: Partial<Comedor> = {}): Comedor => ({
  id: 1,
  nombre: 'Comedor A',
  zona: 'Sector 1',
  direccion: 'Dir',
  lat: -12.21,
  lng: -76.93,
  racionesDia: 120,
  necesidades: ['panaderia'],
  refrigeracion: true,
  horarioRecojo: 'Todo el día',
  activo: true,
  ...extra,
});

const entrada = (c: Comedor, d: Donacion, extra: { stockActualKg?: number; leFaltaElProducto?: boolean } = {}) =>
  puntuar({ donacion: d, comercio, comedor: c, stockActualKg: 0, leFaltaElProducto: false, ahora: AHORA, ...extra });

describe('componentes del puntaje', () => {
  it('la distancia entre dos puntos iguales es 0 y es simétrica', () => {
    assert.equal(distanciaKm(comercio, comercio), 0);
    const a = { lat: -12.21, lng: -76.93 };
    const b = { lat: -12.23, lng: -76.9 };
    assert.ok(Math.abs(distanciaKm(a, b) - distanciaKm(b, a)) < 1e-9);
    assert.ok(distanciaKm(a, b) > 3 && distanciaKm(a, b) < 5);
  });

  it('la cercanía vale 100 pegado al comercio y 0 a partir del máximo', () => {
    assert.equal(cercania(0), 100);
    assert.equal(cercania(KM_MAXIMO / 2), 50);
    assert.equal(cercania(KM_MAXIMO), 0);
    assert.equal(cercania(20), 0);
  });

  it('la capacidad es 100 si cabe todo y proporcional si cabe una parte', () => {
    assert.equal(capacidad(20, 50), 100);
    assert.equal(capacidad(20, 10), 50);
    assert.equal(capacidad(20, 0), 0);
    assert.equal(capacidad(0, 0), 100);
  });

  it('el espacio disponible descuenta lo que el comedor ya tiene almacenado', () => {
    const c = comedor({ racionesDia: 100 });
    assert.equal(espacioDisponibleKg(c, 0), 100 * 0.5 * DIAS_DE_CAPACIDAD);
    assert.equal(espacioDisponibleKg(c, 1000), 0);
  });
});

describe('puntuar', () => {
  it('combina los cuatro componentes con sus pesos', () => {
    const r = entrada(comedor(), donacion());
    const { urgencia, cercania: cer, necesidad, capacidad: cap } = r.componentes;
    assert.equal(r.puntaje, Math.round(0.35 * urgencia + 0.25 * cer + 0.25 * necesidad + 0.15 * cap));
    assert.equal(necesidad, 100);
    assert.equal(cer, 100);
    assert.equal(cap, 100);
    assert.ok(r.puntaje > 90);
  });

  it('una categoría prioritaria puntúa más que una que no lo es', () => {
    const conNecesidad = entrada(comedor({ necesidades: ['panaderia'] }), donacion());
    const sinNecesidad = entrada(comedor({ necesidades: ['carnes'] }), donacion());
    assert.ok(conNecesidad.puntaje > sinNecesidad.puntaje);
    assert.equal(sinNecesidad.componentes.necesidad, 0);
  });

  it('si al comedor le falta el producto, la necesidad vale 70 aunque no sea prioritaria', () => {
    const r = entrada(comedor({ necesidades: [] }), donacion(), { leFaltaElProducto: true });
    assert.equal(r.componentes.necesidad, 70);
  });

  it('lo que vence antes puntúa más urgencia', () => {
    const pronto = entrada(comedor(), donacion({ caducaEn: enHoras(2) }));
    const tarde = entrada(comedor(), donacion({ caducaEn: enHoras(48) }));
    assert.ok(pronto.componentes.urgencia > tarde.componentes.urgencia);
    assert.ok(pronto.puntaje > tarde.puntaje);
  });

  it('un comedor lejano puntúa menos que uno cercano', () => {
    const cerca = entrada(comedor(), donacion());
    const lejos = entrada(comedor({ lat: -12.27, lng: -76.88 }), donacion());
    assert.ok(cerca.componentes.cercania > lejos.componentes.cercania);
    assert.ok(lejos.distanciaKm > cerca.distanciaKm);
  });

  it('un comedor lleno puntúa menos capacidad', () => {
    const vacio = entrada(comedor({ racionesDia: 40 }), donacion({ cantidad: 30 }), { stockActualKg: 0 });
    // 40 raciones/día · 0,5 kg · 7 días = 140 kg de capacidad; con 120 kg almacenados solo quedan 20 kg.
    const lleno = entrada(comedor({ racionesDia: 40 }), donacion({ cantidad: 30 }), { stockActualKg: 120 });
    assert.ok(vacio.componentes.capacidad > lleno.componentes.capacidad);
  });

  it('un producto que requiere frío no es elegible en un comedor sin refrigeración', () => {
    const r = entrada(comedor({ refrigeracion: false }), donacion({ requiereFrio: true }));
    assert.equal(r.elegible, false);
    assert.equal(r.puntaje, 0);
    assert.match(r.motivoNoElegible ?? '', /refrigeración/);
  });

  it('un comedor desactivado no es elegible', () => {
    const r = entrada(comedor({ activo: false }), donacion());
    assert.equal(r.elegible, false);
    assert.equal(r.puntaje, 0);
  });

  it('explica cada componente con una frase', () => {
    const r = entrada(comedor(), donacion());
    assert.equal(r.razones.length, 4);
    assert.match(r.razones[0]!, /Urgencia/);
    assert.match(r.razones[1]!, /Cercanía/);
    assert.match(r.razones[2]!, /Necesidad/);
    assert.match(r.razones[3]!, /Capacidad/);
  });
});

describe('ordenar', () => {
  it('pone primero a los elegibles con mayor puntaje y al final a los que no lo son', () => {
    const bueno = entrada(comedor({ id: 1, nombre: 'Bueno' }), donacion());
    const regular = entrada(comedor({ id: 2, nombre: 'Regular', necesidades: [] }), donacion());
    const noElegible = entrada(comedor({ id: 3, nombre: 'Apagado', activo: false }), donacion());
    const r = ordenar([noElegible, regular, bueno]);
    assert.deepEqual(r.map((s) => s.nombre), ['Bueno', 'Regular', 'Apagado']);
  });

  it('ante igual puntaje gana el más cercano', () => {
    const a = { ...entrada(comedor({ id: 1 }), donacion()), puntaje: 80, distanciaKm: 2 };
    const b = { ...entrada(comedor({ id: 2 }), donacion()), puntaje: 80, distanciaKm: 1 };
    assert.deepEqual(ordenar([a, b]).map((s) => s.comedorId), [2, 1]);
  });
});
