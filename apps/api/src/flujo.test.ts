import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD, type BD } from './bd.ts';
import { sembrar } from './semilla.ts';
import { construirApi } from './servidor.ts';

const INICIO = new Date('2026-11-23T15:00:00Z');

describe('flujo publicar → reservar → recoger', () => {
  let db: BD;
  let ahora: Date;
  let app: ReturnType<typeof construirApi>;

  const enHoras = (h: number) => new Date(ahora.getTime() + h * 3_600_000).toISOString();
  const publicar = async (extra: Record<string, unknown> = {}) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/donaciones',
      payload: {
        comercioId: 1,
        producto: 'Pan francés',
        categoria: 'panaderia',
        cantidad: 20,
        unidad: 'unidades',
        caducaEn: enHoras(24 * 4),
        ventanaDesde: enHoras(0),
        ventanaHasta: enHoras(5),
        requiereFrio: false,
        ...extra,
      },
    });
    return r.json() as { id: number; codigo: string };
  };
  const reservar = (id: number, comedorId = 1) =>
    app.inject({ method: 'POST', url: `/api/donaciones/${id}/reservar`, payload: { comedorId, reservadoPor: 'Rosa M.' } });
  const recoger = (id: number, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: `/api/donaciones/${id}/recoger`,
      payload: { comedorId: 1, recogidoPor: 'Rosa M.', cantidadRecibida: 20, estadoOk: true, ...extra },
    });

  beforeEach(() => {
    ahora = new Date(INICIO);
    db = abrirBD(':memory:');
    sembrar(db, ahora);
    app = construirApi(db, () => ahora);
  });

  it('recorre el flujo completo y deja el rastro en el registro de eventos', async () => {
    const { id, codigo } = await publicar();
    const r1 = await reservar(id);
    assert.equal(r1.statusCode, 200);
    assert.equal(r1.json().estado, 'reservada');
    assert.equal(r1.json().comedorId, 1);
    assert.match(r1.json().codigoEntrega, /^\d{2}-\d{2}$/);

    const r2 = await recoger(id);
    assert.equal(r2.statusCode, 200);
    assert.equal(r2.json().estado, 'recogida');
    assert.equal(r2.json().cantidadRecibida, 20);

    const eventos = (await app.inject({ url: '/api/eventos?limite=10' })).json() as { entidad: string; accion: string }[];
    const acciones = eventos.filter((e) => e.entidad === codigo).map((e) => e.accion).reverse();
    assert.deepEqual(acciones, ['Publicada', 'Emparejamiento calculado', 'Reservada', 'Recogida confirmada']);
  });

  it('no deja reservar dos veces la misma donación', async () => {
    const { id } = await publicar();
    assert.equal((await reservar(id)).statusCode, 200);
    assert.equal((await reservar(id, 2)).statusCode, 409);
  });

  it('no deja recoger algo que no está reservado', async () => {
    const { id } = await publicar();
    assert.equal((await recoger(id)).statusCode, 409);
  });

  it('solo el comedor que reservó puede confirmar la recogida', async () => {
    const { id } = await publicar();
    await reservar(id, 1);
    assert.equal((await recoger(id, { comedorId: 2 })).statusCode, 403);
  });

  it('rechaza una cantidad recibida mayor a la publicada', async () => {
    const { id } = await publicar();
    await reservar(id);
    assert.equal((await recoger(id, { cantidadRecibida: 25 })).statusCode, 422);
  });

  it('exige confirmar que el producto está en buen estado', async () => {
    const { id } = await publicar();
    await reservar(id);
    const r = await recoger(id, { estadoOk: false });
    assert.equal(r.statusCode, 400);
  });

  it('una donación cuya fecha pasó se marca vencida y ya no se puede reservar', async () => {
    const { id } = await publicar({ caducaEn: enHoras(24 * 3 + 1), ventanaHasta: enHoras(24 * 3) });
    ahora = new Date(ahora.getTime() + 4 * 24 * 3_600_000);
    const r = await reservar(id);
    assert.equal(r.statusCode, 409);
    const d = (await app.inject({ url: `/api/donaciones/${id}` })).json();
    assert.equal(d.estado, 'vencida');
  });

  it('un producto que requiere frío no se reserva en un comedor sin refrigeración', async () => {
    const { id } = await publicar({ producto: 'Yogures', categoria: 'lacteos', unidad: 'unidades', cantidad: 40, requiereFrio: true });
    // El comedor 4 (Santa Rosa de Lima) no tiene refrigeración.
    assert.equal((await reservar(id, 4)).statusCode, 422);
    assert.equal((await reservar(id, 1)).statusCode, 200);
  });

  it('responde 404 si la donación o el comedor no existen', async () => {
    assert.equal((await reservar(9999)).statusCode, 404);
    const { id } = await publicar();
    assert.equal((await reservar(id, 9999)).statusCode, 404);
  });
});
