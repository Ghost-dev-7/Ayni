import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { abrirBD, type BD } from './bd.ts';
import { sembrar } from './semilla.ts';
import { construirApi } from './servidor.ts';

const AHORA = new Date('2026-11-23T15:00:00Z');
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000).toISOString();

describe('API', () => {
  let db: BD;
  let app: ReturnType<typeof construirApi>;

  beforeEach(() => {
    db = abrirBD(':memory:');
    sembrar(db, AHORA);
    app = construirApi(db, () => AHORA);
  });

  const donacion = (extra: Record<string, unknown> = {}) => ({
    comercioId: 1,
    producto: 'Pan francés',
    categoria: 'panaderia',
    cantidad: 20,
    unidad: 'unidades',
    caducaEn: enHoras(24 * 4),
    ventanaDesde: enHoras(0),
    ventanaHasta: enHoras(4),
    requiereFrio: false,
    ...extra,
  });

  it('la semilla carga comercios, comedores y donaciones sintéticas', async () => {
    const comercios = (await app.inject({ url: '/api/comercios' })).json();
    const comedores = (await app.inject({ url: '/api/comedores' })).json();
    const donaciones = (await app.inject({ url: '/api/donaciones' })).json();
    assert.equal(comercios.length, 12);
    assert.equal(comedores.length, 8);
    assert.equal(donaciones.length, 40);
  });

  it('publica una donación válida, queda "publicada" y se registra el evento', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion() });
    assert.equal(r.statusCode, 201);
    const creada = r.json();
    assert.equal(creada.estado, 'publicada');
    assert.equal(creada.codigo, 'DON-0041');
    const eventos = (await app.inject({ url: '/api/eventos?entidad=DON-0041' })).json();
    assert.deepEqual(eventos.map((e: { accion: string }) => e.accion).reverse(), ['Publicada', 'Emparejamiento calculado']);
  });

  it('rechaza publicar un producto ya vencido', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/donaciones',
      payload: donacion({ caducaEn: enHoras(-1), ventanaDesde: enHoras(-3), ventanaHasta: enHoras(-2) }),
    });
    assert.equal(r.statusCode, 422);
  });

  it('no se publica un producto que venza en menos de 3 días, pero sí uno que dure más', async () => {
    const corto = await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion({ caducaEn: enHoras(24 * 2), ventanaHasta: enHoras(24) }) });
    assert.equal(corto.statusCode, 422);
    assert.match(corto.json().error, /3 días o más/);
    const justo = await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion({ caducaEn: enHoras(24 * 3), ventanaHasta: enHoras(24 * 2) }) });
    assert.equal(justo.statusCode, 201);
    const largo = await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion({ caducaEn: enHoras(24 * 40), ventanaHasta: enHoras(24 * 30) }) });
    assert.equal(largo.statusCode, 201);
  });

  it('los datos de ejemplo publicados hoy vencen entre 3 y 5 días', async () => {
    const abiertas = (await app.inject({ url: '/api/donaciones?estado=publicada' })).json() as { caducaEn: string }[];
    assert.ok(abiertas.length > 0);
    for (const d of abiertas) {
      const dias = (new Date(d.caducaEn).getTime() - AHORA.getTime()) / (24 * 3_600_000);
      assert.ok(dias >= 3 && dias <= 5, `vence en ${dias.toFixed(2)} días`);
    }
  });

  it('rechaza datos mal formados con detalle del campo', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/donaciones', payload: donacion({ cantidad: -5 }) });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().detalles[0].campo, 'cantidad');
  });

  it('da de alta un comedor nuevo y queda en el registro de eventos', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/comedores',
      payload: {
        nombre: 'Comedor Prueba',
        zona: 'Sector 6',
        direccion: 'Calle ficticia 1',
        lat: -12.22,
        lng: -76.93,
        racionesDia: 50,
        necesidades: ['panaderia'],
        refrigeracion: false,
        horarioRecojo: 'Lun-Vie · 10:00 a 16:00',
      },
    });
    assert.equal(r.statusCode, 201);
    assert.equal((await app.inject({ url: '/api/comedores' })).json().length, 9);
    const eventos = (await app.inject({ url: '/api/eventos?limite=1' })).json();
    assert.equal(eventos[0].accion, 'Alta de comedor');
  });

  it('filtra las donaciones por estado e incluye el semáforo de caducidad', async () => {
    const lista = (await app.inject({ url: '/api/donaciones?estado=publicada' })).json();
    assert.ok(lista.length > 0);
    assert.ok(lista.every((d: { estado: string }) => d.estado === 'publicada'));
    assert.ok(lista.every((d: { nivelCaducidad: string }) => ['rojo', 'amarillo', 'verde'].includes(d.nivelCaducidad)));
  });
});
