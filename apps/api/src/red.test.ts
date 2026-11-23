import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD } from './bd.ts';
import { sembrar } from './semilla.ts';
import { construirApi } from './servidor.ts';

const AHORA = new Date('2026-11-23T15:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString();

describe('API de emparejamiento e inventario', () => {
  let app: ReturnType<typeof construirApi>;

  beforeEach(() => {
    const db = abrirBD(':memory:');
    sembrar(db, AHORA);
    app = construirApi(db, () => AHORA);
  });

  const publicar = async (extra: Record<string, unknown> = {}) =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/donaciones',
        payload: { comercioId: 1, producto: 'Pan francés', categoria: 'panaderia', cantidad: 20, unidad: 'kg', caducaEn: enHoras(4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(3), requiereFrio: false, ...extra },
      })
    ).json() as { id: number; codigo: string };

  it('devuelve el ranking de comedores con el puntaje explicado, de mayor a menor', async () => {
    const { id } = await publicar();
    const r = await app.inject({ url: `/api/donaciones/${id}/sugerencias` });
    assert.equal(r.statusCode, 200);
    const lista = r.json() as { puntaje: number; elegible: boolean; razones: string[] }[];
    assert.equal(lista.length, 8);
    const elegibles = lista.filter((s) => s.elegible);
    assert.ok(elegibles.every((s, i) => i === 0 || (elegibles[i - 1]?.puntaje ?? 0) >= s.puntaje));
    assert.equal(lista[0]!.razones.length, 4);
  });

  it('al publicar queda registrado a quién sugirió el sistema primero', async () => {
    const { codigo } = await publicar();
    const eventos = (await app.inject({ url: `/api/eventos?entidad=${codigo}` })).json() as { accion: string; detalle: string; rol: string }[];
    const e = eventos.find((x) => x.accion === 'Emparejamiento calculado');
    assert.ok(e);
    assert.equal(e.rol, 'sistema');
    assert.match(e.detalle, /Sugerido: .+ \(\d+\/100\)/);
  });

  it('un producto que requiere frío deja sin elegir a los comedores sin refrigeración', async () => {
    const { id } = await publicar({ producto: 'Yogures', categoria: 'lacteos', unidad: 'unidades', cantidad: 40, requiereFrio: true });
    const lista = (await app.inject({ url: `/api/donaciones/${id}/sugerencias` })).json() as { nombre: string; elegible: boolean }[];
    const sin = lista.find((s) => s.nombre === 'Comedor Santa Rosa de Lima')!;
    assert.equal(sin.elegible, false);
  });

  it('las ofertas de un comedor llegan ordenadas por puntaje', async () => {
    await publicar();
    const r = await app.inject({ url: '/api/comedores/1/ofertas' });
    assert.equal(r.statusCode, 200);
    const ofertas = r.json() as { donacion: { estado: string }; sugerencia: { puntaje: number; elegible: boolean } }[];
    assert.ok(ofertas.length > 1);
    assert.ok(ofertas.every((o) => o.donacion.estado === 'publicada'));
    const elegibles = ofertas.filter((o) => o.sugerencia.elegible);
    assert.ok(elegibles.every((o, i) => i === 0 || (elegibles[i - 1]?.sugerencia.puntaje ?? 0) >= o.sugerencia.puntaje));
  });

  it('cambiar las necesidades del comedor cambia el puntaje de sus ofertas', async () => {
    const { id } = await publicar();
    const puntaje = async () => {
      const ofertas = (await app.inject({ url: '/api/comedores/4/ofertas' })).json() as { donacion: { id: number }; sugerencia: { puntaje: number } }[];
      return ofertas.find((o) => o.donacion.id === id)!.sugerencia.puntaje;
    };
    const perfil = { racionesDia: 80, refrigeracion: false, horarioRecojo: 'Lun-Sáb · 14:00 a 19:00' };
    await app.inject({ method: 'PUT', url: '/api/comedores/4/perfil', payload: { ...perfil, necesidades: ['carnes'] } });
    const sin = await puntaje();
    const r = await app.inject({ method: 'PUT', url: '/api/comedores/4/perfil', payload: { ...perfil, necesidades: ['panaderia'] } });
    assert.equal(r.statusCode, 200);
    assert.ok((await puntaje()) > sin);
  });

  it('el administrador puede reasignar una donación a un comedor', async () => {
    const { id, codigo } = await publicar();
    const r = await app.inject({ method: 'POST', url: `/api/donaciones/${id}/reasignar`, payload: { comedorId: 2 } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().estado, 'reservada');
    assert.equal(r.json().comedorId, 2);
    const acciones = ((await app.inject({ url: `/api/eventos?entidad=${codigo}` })).json() as { accion: string }[]).map((e) => e.accion);
    assert.ok(acciones.includes('Reasignada'));
  });

  it('recoger una donación suma al inventario y consumir lo descuenta', async () => {
    const { id } = await publicar({ producto: 'Pan de prueba' });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/reservar`, payload: { comedorId: 1, reservadoPor: 'Rosa M.' } });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/recoger`, payload: { comedorId: 1, recogidoPor: 'Rosa M.', cantidadRecibida: 20, estadoOk: true } });
    let inv = (await app.inject({ url: '/api/comedores/1/inventario' })).json() as { productos: { producto: string; total: number }[] };
    assert.equal(inv.productos.find((p) => p.producto === 'Pan de prueba')?.total, 20);

    const salida = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/salidas', payload: { producto: 'Pan de prueba', unidad: 'kg', tipo: 'consumo', cantidad: 8, motivo: 'Almuerzo' } });
    assert.equal(salida.statusCode, 200);
    inv = (await app.inject({ url: '/api/comedores/1/inventario' })).json();
    assert.equal(inv.productos.find((p) => p.producto === 'Pan de prueba')?.total, 12);
  });

  it('valida las entradas y salidas manuales del inventario', async () => {
    const vencida = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/entradas', payload: { producto: 'Leche', categoria: 'lacteos', unidad: 'litros', cantidad: 5, caducaEn: enHoras(-2) } });
    assert.equal(vencida.statusCode, 422);
    const ok = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/entradas', payload: { producto: 'Aceite', categoria: 'abarrotes', unidad: 'litros', cantidad: 5 } });
    assert.equal(ok.statusCode, 201);
    const demas = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/salidas', payload: { producto: 'Aceite', unidad: 'litros', tipo: 'merma', cantidad: 50 } });
    assert.equal(demas.statusCode, 422);
    const malo = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/salidas', payload: { producto: 'Aceite', unidad: 'litros', tipo: 'regalo', cantidad: 1 } });
    assert.equal(malo.statusCode, 400);
  });

  it('el inventario central responde con totales, vencimientos y faltantes', async () => {
    const r = await app.inject({ url: '/api/inventario' });
    assert.equal(r.statusCode, 200);
    const c = r.json() as { comedores: unknown[]; totales: { stockKg: number } };
    assert.equal(c.comedores.length, 8);
    assert.ok(c.totales.stockKg > 0);
  });
});
