import cors from '@fastify/cors';
import {
  comedorInputSchema,
  comercioInputSchema,
  donacionInputSchema,
  estadoDonacionSchema,
} from '@ayni/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { abrirBD, type BD } from './bd.ts';
import { nivelCaducidad, puedePublicar } from './caducidad.ts';
import {
  crearComedor,
  crearComercio,
  crearDonacion,
  listarComedores,
  listarComercios,
  listarDonaciones,
  listarEventos,
} from './repositorio.ts';

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
    return listarDonaciones(db, filtro).map((d) => ({ ...d, nivelCaducidad: nivelCaducidad(d.caducaEn, ahora) }));
  });

  app.post('/api/donaciones', async (req, reply) => {
    const datos = donacionInputSchema.parse(req.body);
    const ahora = reloj();
    // Regla de seguridad alimentaria: no se publica un producto vencido.
    if (!puedePublicar(datos.caducaEn, ahora)) {
      return reply.status(422).send({ error: 'No se puede publicar un producto ya vencido.' });
    }
    return reply.status(201).send(crearDonacion(db, datos, ahora));
  });

  app.get('/api/eventos', async (req) => {
    const { limite } = req.query as { limite?: string };
    const n = Math.min(Math.max(Number(limite) || 100, 1), 500);
    return listarEventos(db, n);
  });

  return app;
}

// Ejecución directa: `npm run dev`
if (process.argv[1] && import.meta.filename.replaceAll('\\', '/') === process.argv[1].replaceAll('\\', '/')) {
  const puerto = Number(process.env.PORT ?? 3001);
  const app = construirApi(abrirBD());
  await app.listen({ port: puerto, host: '127.0.0.1' });
  console.log(`API de Ayni escuchando en http://127.0.0.1:${puerto}`);
}
