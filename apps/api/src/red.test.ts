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
        payload: { comercioId: 1, producto: 'Pan francés', categoria: 'panaderia', cantidad: 20, unidad: 'unidades', caducaEn: enHoras(24 * 4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(3), requiereFrio: false, ...extra },
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

  it('recoger una donación suma al inventario solo y registrar lo consumido lo resta solo', async () => {
    const { id } = await publicar({ producto: 'Pan de prueba', unidad: 'kg' });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/reservar`, payload: { comedorId: 1, reservadoPor: 'Rosa M.' } });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/recoger`, payload: { comedorId: 1, recogidoPor: 'Rosa M.', cantidadRecibida: 20, estadoOk: true } });
    let inv = (await app.inject({ url: '/api/comedores/1/inventario' })).json() as { productos: { producto: string; total: number; minimo: number }[] };
    assert.equal(inv.productos.find((p) => p.producto === 'Pan de prueba')?.total, 20);
    assert.equal(inv.productos.find((p) => p.producto === 'Pan de prueba')?.minimo, 10);

    const consumo = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/consumos', payload: { producto: 'Pan de prueba', unidad: 'kg', cantidad: 8, motivo: 'Almuerzo' } });
    assert.equal(consumo.statusCode, 200);
    assert.equal(consumo.json().quedan, 12);
    inv = (await app.inject({ url: '/api/comedores/1/inventario' })).json();
    assert.equal(inv.productos.find((p) => p.producto === 'Pan de prueba')?.total, 12);
  });

  it('el inventario ya no admite cargas manuales ni cambiar el mínimo', async () => {
    const entrada = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/entradas', payload: { producto: 'Aceite', categoria: 'abarrotes', unidad: 'litros', cantidad: 5 } });
    assert.equal(entrada.statusCode, 404);
    const minimo = await app.inject({ method: 'PUT', url: '/api/comedores/1/inventario/minimos', payload: { producto: 'Arroz', unidad: 'kg', minimo: 3 } });
    assert.equal(minimo.statusCode, 404);
  });

  it('valida el consumo: no se puede consumir más de lo que hay ni sin datos', async () => {
    const inv = (await app.inject({ url: '/api/comedores/1/inventario' })).json() as { productos: { producto: string; unidad: string; total: number }[] };
    const p = inv.productos.find((x) => x.total > 0)!;
    const demas = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/consumos', payload: { producto: p.producto, unidad: p.unidad, cantidad: p.total + 1 } });
    assert.equal(demas.statusCode, 422);
    const sinCantidad = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/consumos', payload: { producto: p.producto, unidad: p.unidad } });
    assert.equal(sinCantidad.statusCode, 400);
    const noExiste = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/consumos', payload: { producto: 'Producto inexistente', unidad: 'kg', cantidad: 1 } });
    assert.equal(noExiste.statusCode, 404);
  });

  it('las notificaciones del comedor reúnen reserva, recogida, inventario y alertas de stock bajo', async () => {
    const { id } = await publicar({ producto: 'Arroz', categoria: 'abarrotes', cantidad: 12, unidad: 'kg' });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/reservar`, payload: { comedorId: 3, reservadoPor: 'Rosa M.' } });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/recoger`, payload: { comedorId: 3, recogidoPor: 'Rosa M.', cantidadRecibida: 12, estadoOk: true } });
    await app.inject({ method: 'POST', url: '/api/comedores/3/inventario/consumos', payload: { producto: 'Arroz', unidad: 'kg', cantidad: 12 } });
    const r = await app.inject({ url: '/api/comedores/3/notificaciones' });
    assert.equal(r.statusCode, 200);
    const acciones = (r.json() as { accion: string }[]).map((n) => n.accion);
    for (const esperada of ['Reservada', 'Recogida confirmada', 'Entró al inventario', 'Consumo de inventario']) {
      assert.ok(acciones.includes(esperada), `falta "${esperada}"`);
    }
    assert.equal((await app.inject({ url: '/api/comedores/999/notificaciones' })).statusCode, 404);
  });

  it('cada producto del catálogo se publica en su unidad: pan por unidades, no por kg', async () => {
    const mal = await app.inject({
      method: 'POST',
      url: '/api/donaciones',
      payload: { comercioId: 1, producto: 'Pan francés', categoria: 'panaderia', cantidad: 20, unidad: 'kg', caducaEn: enHoras(24 * 4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(3), requiereFrio: false },
    });
    assert.equal(mal.statusCode, 422);
    assert.match(mal.json().error, /se registra por unidades/);
    const fideos = await app.inject({
      method: 'POST',
      url: '/api/donaciones',
      payload: { comercioId: 1, producto: 'fideos', categoria: 'abarrotes', cantidad: 30, unidad: 'unidades', caducaEn: enHoras(24 * 4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(3), requiereFrio: false },
    });
    assert.equal(fideos.statusCode, 201);
    assert.equal(fideos.json().producto, 'Fideos'); // se guarda con el nombre del catálogo
  });

  it('un producto que requiere frío en el catálogo queda marcado aunque el comercio no lo marque', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/donaciones',
      payload: { comercioId: 1, producto: 'Yogures', categoria: 'lacteos', cantidad: 40, unidad: 'unidades', caducaEn: enHoras(24 * 4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(8), requiereFrio: false },
    });
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().requiereFrio, true);
  });

  it('todas las cantidades son enteros: se rechazan los decimales con un mensaje claro', async () => {
    const decimal = await app.inject({
      method: 'POST',
      url: '/api/donaciones',
      payload: { comercioId: 1, producto: 'Arroz', categoria: 'abarrotes', cantidad: 2.5, unidad: 'kg', caducaEn: enHoras(24 * 4), ventanaDesde: enHoras(0), ventanaHasta: enHoras(3), requiereFrio: false },
    });
    assert.equal(decimal.statusCode, 400);
    assert.match(decimal.json().detalles[0].mensaje, /números enteros/);

    const { id } = await publicar({ producto: 'Arroz', categoria: 'abarrotes', cantidad: 20, unidad: 'kg' });
    await app.inject({ method: 'POST', url: `/api/donaciones/${id}/reservar`, payload: { comedorId: 1, reservadoPor: 'Rosa M.' } });
    const recogida = await app.inject({ method: 'POST', url: `/api/donaciones/${id}/recoger`, payload: { comedorId: 1, recogidoPor: 'Rosa M.', cantidadRecibida: 7.5, estadoOk: true } });
    assert.equal(recogida.statusCode, 400);

    const consumo = await app.inject({ method: 'POST', url: '/api/comedores/1/inventario/consumos', payload: { producto: 'Cebollas', unidad: 'kg', cantidad: 1.5 } });
    assert.equal(consumo.statusCode, 400);
    assert.match(consumo.json().detalles[0].mensaje, /números enteros/);
  });

  it('el emparejamiento explica las distancias sin decimales', async () => {
    const { id } = await publicar();
    const lista = (await app.inject({ url: `/api/donaciones/${id}/sugerencias` })).json() as { razones: string[] }[];
    for (const s of lista) {
      const frase = s.razones.find((r) => r.startsWith('Cercanía'))!;
      assert.match(frase, /\d+ (m|km) del comercio/);
      assert.ok(!/\d,\d/.test(frase), frase);
    }
  });

  it('crea un borrador desde texto libre sin publicar nada', async () => {
    const antes = ((await app.inject({ url: '/api/donaciones' })).json() as unknown[]).length;
    const r = await app.inject({ method: 'POST', url: '/api/donaciones/borrador', payload: { texto: '20 panes de ayer, recojo hasta las 6pm' } });
    assert.equal(r.statusCode, 200);
    const b = r.json();
    assert.equal(b.producto, 'Pan francés');
    assert.equal(b.cantidad, 20);
    assert.equal(b.unidad, 'unidades');
    assert.equal(((await app.inject({ url: '/api/donaciones' })).json() as unknown[]).length, antes);
    assert.equal((await app.inject({ method: 'POST', url: '/api/donaciones/borrador', payload: { texto: ' ' } })).statusCode, 400);
  });

  it('el inventario central responde con totales, vencimientos y faltantes', async () => {
    const r = await app.inject({ url: '/api/inventario' });
    assert.equal(r.statusCode, 200);
    const c = r.json() as { comedores: unknown[]; totales: { stockKg: number } };
    assert.equal(c.comedores.length, 8);
    assert.ok(c.totales.stockKg > 0);
  });
});
