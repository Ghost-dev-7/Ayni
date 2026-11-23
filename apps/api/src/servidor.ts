import cors from '@fastify/cors';
import {
  activoInputSchema,
  buscarEnCatalogo,
  borradorInputSchema,
  comedorInputSchema,
  comedorPerfilSchema,
  consumoInventarioSchema,
  reasignarInputSchema,
  comercioInputSchema,
  donacionInputSchema,
  estadoDonacionSchema,
  recogerInputSchema,
  reservarInputSchema,
} from '@ayni/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { abrirBD, type BD } from './bd.ts';
import { nivelCaducidad, puedePublicar } from './caducidad.ts';
import { interpretarTexto } from './texto.ts';
import { ofertasParaComedor, sugerirComedores } from './emparejamiento.ts';
import { registrarEvento } from './eventos.ts';
import { calcularImpacto } from './impacto.ts';
import { inventarioCentral, obtenerInventario, registrarConsumo } from './inventario.ts';
import {
  actualizarPerfilComedor,
  obtenerComedor,
  reasignarDonacion,
  cambiarActivo,
  crearComedor,
  crearComercio,
  crearDonacion,
  listarAccionesEventos,
  obtenerComercio,
  listarComedores,
  listarComercios,
  listarDonaciones,
  listarEventos,
  listarNotificacionesComedor,
  marcarVencidas,
  obtenerDonacion,
  recogerDonacion,
  reservarDonacion,
} from './repositorio.ts';
import { sembrar } from './semilla.ts';

/** Construye la API. Recibe la base de datos y un reloj para poder probarla. */
export function construirApi(db: BD, reloj: () => Date = () => new Date()): FastifyInstance {
  const app = Fastify({ logger: false });
  void app.register(cors, { origin: true });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'Datos no válidos',
        detalles: error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      });
    }
    const err = error as { statusCode?: number; message?: string };
    return reply.status(err.statusCode ?? 500).send({ error: err.message ?? 'Error interno' });
  });

  app.get('/api/salud', async () => ({ estado: 'ok', hora: reloj().toISOString() }));

  app.get('/api/comercios', async () => listarComercios(db));
  app.post('/api/comercios', async (req, reply) => {
    const datos = comercioInputSchema.parse(req.body);
    return reply.status(201).send(crearComercio(db, datos));
  });

  app.get('/api/comedores', async () => listarComedores(db));
  app.post('/api/comedores', async (req, reply) => {
    const datos = comedorInputSchema.parse(req.body);
    return reply.status(201).send(crearComedor(db, datos));
  });

  app.get('/api/donaciones', async (req) => {
    const { estado } = req.query as { estado?: string };
    const filtro = estado ? estadoDonacionSchema.parse(estado) : undefined;
    const ahora = reloj();
    marcarVencidas(db, ahora);
    return listarDonaciones(db, filtro).map((d) => ({ ...d, nivelCaducidad: nivelCaducidad(d.caducaEn, ahora) }));
  });

  app.get('/api/donaciones/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const ahora = reloj();
    marcarVencidas(db, ahora);
    const d = obtenerDonacion(db, id);
    if (!d) return reply.status(404).send({ error: 'La donación no existe.' });
    return { ...d, nivelCaducidad: nivelCaducidad(d.caducaEn, ahora) };
  });

  app.post('/api/donaciones/:id/reservar', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return reservarDonacion(db, id, reservarInputSchema.parse(req.body), reloj());
  });

  app.post('/api/donaciones/:id/recoger', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return recogerDonacion(db, id, recogerInputSchema.parse(req.body), reloj());
  });

  app.post('/api/donaciones', async (req, reply) => {
    const datos = donacionInputSchema.parse(req.body);
    const ahora = reloj();
    const comercio = obtenerComercio(db, datos.comercioId);
    if (!comercio) return reply.status(404).send({ error: 'El comercio no existe.' });
    if (!comercio.activo) return reply.status(422).send({ error: 'El comercio está desactivado y no puede publicar.' });
    // Regla de seguridad alimentaria: no se publica un producto vencido.
    if (!puedePublicar(datos.caducaEn, ahora)) {
      return reply.status(422).send({ error: 'No se puede publicar un producto ya vencido.' });
    }
    // Cada producto del catálogo tiene una sola unidad en todo el sistema.
    const ref = buscarEnCatalogo(datos.producto);
    if (ref) {
      if (ref.unidad !== datos.unidad) {
        const como = ref.unidad === 'unidades' ? (ref.etiqueta ?? 'unidades') : ref.unidad;
        return reply.status(422).send({ error: `${ref.nombre} se registra por ${como}, no por ${datos.unidad}.` });
      }
      datos.producto = ref.nombre;
      datos.categoria = ref.categoria;
      datos.requiereFrio = datos.requiereFrio || Boolean(ref.requiereFrio);
    }
    const creada = crearDonacion(db, datos, ahora);
    // El sistema puntúa a los comedores y deja constancia de a quién sugiere primero.
    const mejor = sugerirComedores(db, creada, ahora).find((s) => s.elegible);
    registrarEvento(db, {
      rol: 'sistema',
      actor: 'Emparejamiento',
      accion: 'Emparejamiento calculado',
      entidad: creada.codigo,
      detalle: mejor ? `Sugerido: ${mejor.nombre} (${mejor.puntaje}/100)` : 'Ningún comedor elegible por ahora',
      fecha: ahora.toISOString(),
    });
    return reply.status(201).send(creada);
  });

  // Texto libre → borrador de donación (analizador por reglas; el comercio lo confirma antes de publicar).
  app.post('/api/donaciones/borrador', async (req) => interpretarTexto(borradorInputSchema.parse(req.body).texto, reloj()));

  app.get('/api/donaciones/:id/sugerencias', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const ahora = reloj();
    marcarVencidas(db, ahora);
    const d = obtenerDonacion(db, id);
    if (!d) return reply.status(404).send({ error: 'La donación no existe.' });
    return sugerirComedores(db, d, ahora);
  });

  app.post('/api/donaciones/:id/reasignar', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return reasignarDonacion(db, id, reasignarInputSchema.parse(req.body).comedorId, reloj());
  });

  app.get('/api/comedores/:id/ofertas', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const ahora = reloj();
    marcarVencidas(db, ahora);
    const comedor = obtenerComedor(db, id);
    if (!comedor) return reply.status(404).send({ error: 'El comedor no existe.' });
    return ofertasParaComedor(db, comedor, listarDonaciones(db, 'publicada'), ahora).map((o) => ({
      donacion: { ...o.donacion, nivelCaducidad: nivelCaducidad(o.donacion.caducaEn, ahora) },
      comercio: o.comercio,
      sugerencia: o.sugerencia,
    }));
  });

  app.put('/api/comedores/:id/perfil', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return actualizarPerfilComedor(db, id, comedorPerfilSchema.parse(req.body), reloj());
  });

  app.get('/api/comedores/:id/inventario', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return obtenerInventario(db, id, reloj());
  });

  // El stock solo sube por una donación recogida y solo baja registrando lo consumido (se resta solo).
  app.post('/api/comedores/:id/inventario/consumos', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return registrarConsumo(db, id, consumoInventarioSchema.parse(req.body), reloj());
  });

  app.get('/api/comedores/:id/notificaciones', async (req) => {
    const id = Number((req.params as { id: string }).id);
    marcarVencidas(db, reloj());
    return listarNotificacionesComedor(db, id);
  });

  app.get('/api/inventario', async () => inventarioCentral(db, reloj()));

  app.get('/api/eventos', async (req) => {
    const q = req.query as { limite?: string; rol?: string; accion?: string; entidad?: string; texto?: string };
    const limite = Math.min(Math.max(Number(q.limite) || 100, 1), 500);
    return listarEventos(db, { limite, rol: q.rol, accion: q.accion, entidad: q.entidad, texto: q.texto });
  });

  app.get('/api/eventos/acciones', async () => listarAccionesEventos(db));

  app.get('/api/impacto', async () => {
    const ahora = reloj();
    marcarVencidas(db, ahora);
    return calcularImpacto(db, ahora);
  });

  app.patch('/api/comedores/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return cambiarActivo(db, 'comedores', id, activoInputSchema.parse(req.body).activo, reloj());
  });

  app.patch('/api/comercios/:id', async (req) => {
    const id = Number((req.params as { id: string }).id);
    return cambiarActivo(db, 'comercios', id, activoInputSchema.parse(req.body).activo, reloj());
  });

  return app;
}

// Ejecución directa: `npm run dev`
if (process.argv[1] && import.meta.filename.replaceAll('\\', '/') === process.argv[1].replaceAll('\\', '/')) {
  const puerto = Number(process.env.PORT ?? 3001);
  const db = abrirBD();
  // Primera ejecución: si la base está vacía, carga los datos sintéticos de demostración.
  if (listarComercios(db).length === 0) console.log('Base vacía: cargando datos sintéticos', sembrar(db));
  const app = construirApi(db);
  await app.listen({ port: puerto, host: '127.0.0.1' });
  console.log(`API de Ayni escuchando en http://127.0.0.1:${puerto}`);
}
