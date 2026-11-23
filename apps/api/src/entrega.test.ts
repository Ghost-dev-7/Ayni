import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD, type BD } from './bd.ts';
import { sembrar } from './semilla.ts';
import { construirApi } from './servidor.ts';

const AHORA = new Date('2026-11-23T15:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString();

describe('entrega verificada con QR', () => {
  let db: BD;
  let app: ReturnType<typeof construirApi>;

  beforeEach(() => {
    db = abrirBD(':memory:');
    sembrar(db, AHORA);
    app = construirApi(db, () => AHORA);
  });

  const publicar = async () =>
    (
      await app.inject({
        method: 'POST',
        url: '/api/donaciones',
        payload: { comercioId: 1, producto: 'Atún en lata', categoria: 'conservas', cantidad: 15, unidad: 'unidades', caducaEn: enHoras(24 * 4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(6), requiereFrio: false },
      })
    ).json() as { id: number; codigo: string };
  const reservar = (id: number, comedorId = 1) =>
    app.inject({ method: 'POST', url: `/api/donaciones/${id}/reservar`, payload: { comedorId, reservadoPor: 'Rosa M.' } });
  const entrega = (id: number, comercioId = 1) => app.inject({ url: `/api/donaciones/${id}/entrega?comercioId=${comercioId}` });
  const recoger = (id: number, extra: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/api/donaciones/${id}/recoger`, payload: { comedorId: 1, recogidoPor: 'Rosa M.', cantidadRecibida: 15, estadoOk: true, ...extra } });
  const estado = async (id: number) => ((await app.inject({ url: `/api/donaciones/${id}` })).json() as { estado: string }).estado;

  it('el comercio ve el QR y el código; la donación pública no los trae', async () => {
    const { id } = await publicar();
    await reservar(id);
    const r = await entrega(id);
    assert.equal(r.statusCode, 200);
    assert.match(r.json().token, /^[0-9a-f]{32}$/);
    assert.match(r.json().codigo, /^\d{2}-\d{2}$/);
    const publica = JSON.stringify((await app.inject({ url: `/api/donaciones/${id}` })).json());
    assert.ok(!publica.includes(r.json().token), 'el token no debe salir en la donación pública');
    const lista = JSON.stringify((await app.inject({ url: '/api/donaciones' })).json());
    assert.ok(!lista.includes(r.json().token), 'el token no debe salir en el listado');
  });

  it('solo el comercio dueño la ve, y solo mientras está reservada', async () => {
    const { id } = await publicar();
    assert.equal((await entrega(id)).statusCode, 409, 'sin reservar todavía');
    await reservar(id);
    assert.equal((await entrega(id, 2)).statusCode, 403, 'otro comercio');
    assert.equal((await entrega(9999)).statusCode, 404);
    const { token } = (await entrega(id)).json() as { token: string };
    assert.equal((await recoger(id, { token })).statusCode, 200);
    assert.equal((await entrega(id)).statusCode, 409, 'ya recogida');
  });

  it('sin QR ni código no se puede confirmar la recogida', async () => {
    const { id } = await publicar();
    await reservar(id);
    const r = await recoger(id, {});
    assert.equal(r.statusCode, 400);
    assert.match(r.json().detalles[0].mensaje, /Escanea el QR/);
    assert.equal(await estado(id), 'reservada');
  });

  it('un QR equivocado o de otra donación se rechaza y la entrega sigue reservada', async () => {
    const a = await publicar();
    const b = await publicar();
    await reservar(a.id);
    await reservar(b.id);
    const tokenB = ((await entrega(b.id)).json() as { token: string }).token;
    const r1 = await recoger(a.id, { token: tokenB });
    assert.equal(r1.statusCode, 403);
    assert.match(r1.json().error, /no corresponde a esta entrega/);
    assert.equal((await recoger(a.id, { token: 'ayni:' + '0'.repeat(32) })).statusCode, 403);
    assert.equal(await estado(a.id), 'reservada');
  });

  it('con el QR correcto queda aprobada, se registra con su verificación y entra al inventario', async () => {
    const { id, codigo } = await publicar();
    await reservar(id);
    const { token } = (await entrega(id)).json() as { token: string };
    const r = await recoger(id, { token: `ayni:${token}` }); // el QR trae el prefijo
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().estado, 'recogida');
    assert.equal(r.json().cantidadRecibida, 15);

    const eventos = (await app.inject({ url: `/api/eventos?entidad=${codigo}` })).json() as { accion: string; detalle: string }[];
    assert.match(eventos.find((e) => e.accion === 'Recogida confirmada')!.detalle, /entrega verificada con QR/);

    const inv = (await app.inject({ url: '/api/comedores/1/inventario' })).json() as { productos: { producto: string; total: number }[] };
    assert.ok((inv.productos.find((p) => p.producto === 'Atún en lata')?.total ?? 0) >= 15);
  });

  it('si no se puede escanear sirve el código de 4 dígitos, con o sin guion', async () => {
    const a = await publicar();
    const b = await publicar();
    await reservar(a.id);
    await reservar(b.id);
    const ca = ((await entrega(a.id)).json() as { codigo: string }).codigo;
    const cb = ((await entrega(b.id)).json() as { codigo: string }).codigo;
    assert.equal((await recoger(a.id, { codigo: ca })).statusCode, 200);
    assert.equal((await recoger(b.id, { codigo: cb.replace('-', '') })).statusCode, 200);
    const eventos = (await app.inject({ url: `/api/eventos?entidad=${a.codigo}` })).json() as { accion: string; detalle: string }[];
    assert.match(eventos.find((e) => e.accion === 'Recogida confirmada')!.detalle, /verificada con código/);
  });

  it('un código incompleto o equivocado no sirve', async () => {
    const { id } = await publicar();
    await reservar(id);
    const real = ((await entrega(id)).json() as { codigo: string }).codigo;
    const otro = real === '00-00' ? '11-11' : '00-00';
    assert.equal((await recoger(id, { codigo: otro })).statusCode, 403);
    assert.equal((await recoger(id, { codigo: real.slice(0, 2) + '-' })).statusCode, 400);
    assert.equal(await estado(id), 'reservada');
  });

  it('otro comedor no puede usar el QR de una reserva ajena', async () => {
    const { id } = await publicar();
    await reservar(id, 1);
    const { token } = (await entrega(id)).json() as { token: string };
    const r = await app.inject({ method: 'POST', url: `/api/donaciones/${id}/recoger`, payload: { comedorId: 2, recogidoPor: 'Otra persona', cantidadRecibida: 15, estadoOk: true, token } });
    assert.equal(r.statusCode, 403);
    assert.equal(await estado(id), 'reservada');
  });

  it('el QR no se puede usar dos veces', async () => {
    const { id } = await publicar();
    await reservar(id);
    const { token } = (await entrega(id)).json() as { token: string };
    assert.equal((await recoger(id, { token })).statusCode, 200);
    assert.equal((await recoger(id, { token })).statusCode, 409);
  });

  it('las entregas ya reservadas en los datos de ejemplo también tienen QR', async () => {
    const reservadas = ((await app.inject({ url: '/api/donaciones?estado=reservada' })).json() as { id: number; comercioId: number }[]);
    assert.ok(reservadas.length > 0, 'la semilla debe traer reservas');
    for (const d of reservadas) {
      const r = await entrega(d.id, d.comercioId);
      assert.equal(r.statusCode, 200);
      assert.match(r.json().token, /^[0-9a-f]{32}$/);
    }
  });
});
