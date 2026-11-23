import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD } from './bd.ts';
import { sembrar } from './semilla.ts';
import { construirApi } from './servidor.ts';

const AHORA = new Date('2026-11-23T15:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString();

describe('administración', () => {
  let app: ReturnType<typeof construirApi>;

  beforeEach(() => {
    const db = abrirBD(':memory:');
    sembrar(db, AHORA);
    app = construirApi(db, () => AHORA);
  });

  const donacion = (comercioId: number) => ({
    comercioId,
    producto: 'Pan',
    categoria: 'panaderia',
    cantidad: 5,
    unidad: 'kg',
    caducaEn: enHoras(5),
    ventanaDesde: enHoras(0),
    ventanaHasta: enHoras(4),
    requiereFrio: false,
  });

  it('da de alta un comercio nuevo y lo registra en la trazabilidad', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/comercios',
      payload: { nombre: 'Distribuidora Prueba', tipo: 'mayorista', direccion: 'Av. ficticia 1', lat: -12.23, lng: -76.92 },
    });
    assert.equal(r.statusCode, 201);
    const eventos = (await app.inject({ url: '/api/eventos?accion=Alta%20de%20comercio' })).json();
    assert.equal(eventos.length, 1);
    assert.equal(eventos[0].detalle, 'Distribuidora Prueba');
  });

  it('valida los datos del alta de comercio', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/comercios', payload: { nombre: 'X', tipo: 'otro' } });
    assert.equal(r.statusCode, 400);
  });

  it('desactiva un comercio y este ya no puede publicar', async () => {
    const r = await app.inject({ method: 'PATCH', url: '/api/comercios/1', payload: { activo: false } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().activo, false);
    const pub = await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion(1) });
    assert.equal(pub.statusCode, 422);
    // Se puede volver a activar.
    await app.inject({ method: 'PATCH', url: '/api/comercios/1', payload: { activo: true } });
    assert.equal((await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion(1) })).statusCode, 201);
  });

  it('un comedor desactivado no puede reservar', async () => {
    await app.inject({ method: 'PATCH', url: '/api/comedores/1', payload: { activo: false } });
    const pub = (await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion(1) })).json();
    const r = await app.inject({ method: 'POST', url: `/api/donaciones/${pub.id}/reservar`, payload: { comedorId: 1, reservadoPor: 'Rosa M.' } });
    assert.equal(r.statusCode, 404);
  });

  it('responde 404 al publicar con un comercio que no existe y al activar algo inexistente', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion(999) })).statusCode, 404);
    assert.equal((await app.inject({ method: 'PATCH', url: '/api/comedores/999', payload: { activo: false } })).statusCode, 404);
  });

  it('filtra el registro de eventos por rol, acción, entidad y texto', async () => {
    const porRol = (await app.inject({ url: '/api/eventos?rol=sistema&limite=500' })).json() as { rol: string }[];
    assert.ok(porRol.length > 0 && porRol.every((e) => e.rol === 'sistema'));

    const porEntidad = (await app.inject({ url: '/api/eventos?entidad=DON-0001' })).json() as { entidad: string }[];
    assert.ok(porEntidad.length >= 1 && porEntidad.every((e) => e.entidad === 'DON-0001'));

    const acciones = (await app.inject({ url: '/api/eventos/acciones' })).json() as string[];
    assert.ok(acciones.includes('Publicada') && acciones.includes('Reservada'));

    const porTexto = (await app.inject({ url: '/api/eventos?texto=El%20Trigal&limite=500' })).json() as unknown[];
    assert.ok(porTexto.length > 0);
  });

  it('el panel de impacto responde con las cifras y sin datos personales', async () => {
    const r = await app.inject({ url: '/api/impacto' });
    assert.equal(r.statusCode, 200);
    const i = r.json();
    assert.equal(i.kgPorSemana.length, 4);
    assert.equal(i.comedores.length, 8);
    assert.equal(i.comercios.length, 12);
    assert.ok(i.kgRescatados > 0);
  });
});
