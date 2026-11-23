/**
 * Carga datos SINTÉTICOS (ficticios) en la base de datos.
 * Comercios y comedores salen de data/synthetic/*.json; los productos, del catálogo compartido.
 * Las donaciones y el historial se generan de forma determinista a partir de la hora actual,
 * de modo que la demostración siempre muestra urgencias distintas.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CATALOGO, type Categoria, type Comedor, type Comercio, type EstadoDonacion, type TipoComercio, type Unidad } from '@ayni/shared';
import { abrirBD, vaciarBD, type BD } from './bd.ts';
import { registrarEntrada } from './inventario.ts';
import { codigoDonacion, registrarEvento } from './repositorio.ts';

const DIR_DATOS = resolve(import.meta.dirname, '../../../data/synthetic');
const leer = <T>(archivo: string): T => JSON.parse(readFileSync(resolve(DIR_DATOS, archivo), 'utf8')) as T;

interface ProductoBase {
  nombre: string;
  categoria: Categoria;
  unidad: Unidad;
  frio: boolean;
}

/** Qué categorías suele tener cada tipo de comercio. */
const CATEGORIAS_POR_TIPO: Record<TipoComercio, Categoria[]> = {
  panaderia: ['panaderia'],
  bodega: ['abarrotes', 'conservas', 'menestras', 'lacteos'],
  mercado: ['verduras', 'frutas'],
  minimarket: ['lacteos', 'conservas', 'abarrotes'],
  restaurante: ['preparados', 'carnes'],
  mayorista: ['abarrotes', 'conservas', 'lacteos'],
};

/** Generador pseudoaleatorio con semilla fija (mulberry32), para datos reproducibles. */
function crearAzar(semilla: number) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    siguiente,
    entero: (min: number, max: number) => Math.floor(siguiente() * (max - min + 1)) + min,
    elegir: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)]!,
  };
}

const H = 3_600_000;
const DIA = 24 * H;

export interface ResumenSemilla {
  comercios: number;
  comedores: number;
  donaciones: number;
  eventos: number;
}

export function sembrar(db: BD, ahora: Date = new Date()): ResumenSemilla {
  vaciarBD(db);
  const azar = crearAzar(2026);
  const iso = (ms: number) => new Date(ms).toISOString();
  const t0 = ahora.getTime();

  const comerciosBase = leer<Omit<Comercio, 'id' | 'activo'>[]>('comercios.json');
  const comedoresBase = leer<Omit<Comedor, 'id'>[]>('comedores.json');
  const productos: ProductoBase[] = CATALOGO.map((p) => ({ nombre: p.nombre, categoria: p.categoria, unidad: p.unidad, frio: p.requiereFrio ?? false }));

  const insComercio = db.prepare('INSERT INTO comercios (nombre, tipo, direccion, lat, lng) VALUES (?, ?, ?, ?, ?)');
  for (const c of comerciosBase) insComercio.run(c.nombre, c.tipo, c.direccion, c.lat, c.lng);

  const insComedor = db.prepare(
    `INSERT INTO comedores (nombre, zona, direccion, lat, lng, raciones_dia, necesidades, refrigeracion, horario_recojo, activo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const c of comedoresBase) {
    insComedor.run(c.nombre, c.zona, c.direccion, c.lat, c.lng, c.racionesDia, JSON.stringify(c.necesidades), c.refrigeracion ? 1 : 0, c.horarioRecojo, c.activo ? 1 : 0);
  }

  const comercios: Comercio[] = comerciosBase.map((c, i) => ({ ...c, id: i + 1, activo: true }));
  const comedores: Comedor[] = comedoresBase.map((c, i) => ({ ...c, id: i + 1 }));

  const insDonacion = db.prepare(
    `INSERT INTO donaciones
      (id, codigo, comercio_id, producto, categoria, cantidad, unidad, caduca_en, ventana_desde, ventana_hasta, requiere_frio, estado, comedor_id, creada_en,
       codigo_entrega, reservada_por, reservada_en, recogida_por, recogida_en, cantidad_recibida)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let id = 0;
  let eventos = 0;
  const evento = (fechaMs: number, rol: 'comercio' | 'comedor' | 'sistema', actor: string, accion: string, entidad: string, detalle: string) => {
    registrarEvento(db, { fecha: iso(fechaMs), rol, actor, accion, entidad, detalle });
    eventos++;
  };

  interface Plan {
    creadaMs: number;
    caducaMs: number;
    estado: EstadoDonacion;
  }

  const crear = (plan: Plan) => {
    id++;
    const comercio = azar.elegir(comercios);
    const candidatos = productos.filter((p) => CATEGORIAS_POR_TIPO[comercio.tipo].includes(p.categoria));
    const producto = azar.elegir(candidatos);
    const cantidad = producto.unidad === 'kg' ? azar.entero(3, 30) : producto.unidad === 'litros' ? azar.entero(5, 40) : azar.entero(20, 80);
    const ventanaHasta = Math.max(plan.caducaMs - 30 * 60_000, plan.creadaMs + 60 * 60_000);
    const aptos = comedores.filter((k) => k.activo && (!producto.frio || k.refrigeracion));
    const comedor = plan.estado === 'publicada' || plan.estado === 'vencida' ? null : azar.elegir(aptos);
    const codigo = codigoDonacion(id);
    const reservaMs = comedor ? plan.creadaMs + azar.entero(5, 40) * 60_000 : null;
    const recogidaMs = plan.estado === 'recogida' && reservaMs !== null ? Math.min(reservaMs + azar.entero(30, 150) * 60_000, t0 - 60_000) : null;
    const encargado = comedor ? `Encargado de ${comedor.zona}` : null;
    const codigoEntrega = comedor ? `${String(azar.entero(0, 99)).padStart(2, '0')}-${String(azar.entero(0, 99)).padStart(2, '0')}` : null;
    insDonacion.run(
      id, codigo, comercio.id, producto.nombre, producto.categoria, cantidad, producto.unidad,
      iso(plan.caducaMs), iso(plan.creadaMs), iso(ventanaHasta), producto.frio ? 1 : 0,
      plan.estado, comedor?.id ?? null, iso(plan.creadaMs),
      codigoEntrega, encargado, reservaMs === null ? null : iso(reservaMs),
      recogidaMs === null ? null : encargado, recogidaMs === null ? null : iso(recogidaMs), recogidaMs === null ? null : cantidad,
    );
    const det = `${producto.nombre} · ${cantidad} ${producto.unidad}`;
    evento(plan.creadaMs, 'comercio', comercio.nombre, 'Publicada', codigo, det);
    if (comedor && reservaMs !== null) {
      evento(reservaMs, 'comedor', comedor.nombre, 'Reservada', codigo, det);
      if (recogidaMs !== null) evento(recogidaMs, 'comedor', comedor.nombre, 'Recogida confirmada', codigo, det);
    }
    if (plan.estado === 'vencida') evento(plan.caducaMs, 'sistema', 'Caducidad', 'Marcada como vencida', codigo, det);
  };

  // Historial de 4 semanas: 30 donaciones ya cerradas (recogidas o vencidas).
  for (let i = 0; i < 30; i++) {
    const creadaMs = t0 - azar.entero(1, 27) * DIA - azar.entero(0, 10) * H;
    const caducaMs = creadaMs + azar.entero(6, 40) * H;
    crear({ creadaMs, caducaMs, estado: azar.siguiente() < 0.88 ? 'recogida' : 'vencida' });
  }

  // Donaciones de hoy, con urgencias distintas: 7 publicadas, 3 reservadas.
  const horasRestantes = [2, 4, 9, 20, 30, 52, 70, 3, 14, 26];
  horasRestantes.forEach((h, i) => {
    crear({
      creadaMs: t0 - azar.entero(10, 120) * 60_000,
      caducaMs: t0 + h * H,
      estado: i < 7 ? 'publicada' : 'reservada',
    });
  });

  // Inventario inicial de cada comedor: 6 productos con lotes de distinta caducidad.
  // Alrededor de un tercio queda por debajo del mínimo (10), para que se vean las alertas.
  const DIAS_SECOS: Categoria[] = ['abarrotes', 'menestras', 'conservas'];
  for (const k of comedores) {
    const candidatos = productos.filter((p) => !p.frio || k.refrigeracion);
    const elegidos = new Set<ProductoBase>();
    while (elegidos.size < 6) elegidos.add(azar.elegir(candidatos));
    for (const p of elegidos) {
      const secos = DIAS_SECOS.includes(p.categoria);
      const horas = secos ? azar.entero(90, 300) * 24 : p.categoria === 'panaderia' ? azar.entero(6, 40) : azar.entero(24, 8 * 24);
      const cantidad = azar.siguiente() < 0.3 ? azar.entero(3, 9) : p.unidad === 'unidades' ? azar.entero(14, 120) : azar.entero(12, 70);
      registrarEntrada(
        db,
        k.id,
        { producto: p.nombre, categoria: p.categoria, unidad: p.unidad, cantidad, caducaEn: iso(t0 + horas * H) },
        { origen: 'manual', motivo: 'Inventario inicial', actor: k.nombre, ahora: new Date(t0 - azar.entero(1, 5) * DIA), sinEvento: true },
      );
    }
  }

  return { comercios: comercios.length, comedores: comedores.length, donaciones: id, eventos };
}

// Ejecución directa: `npm run seed`
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const db = abrirBD();
  const r = sembrar(db);
  console.log('Datos sintéticos cargados:', r);
  db.close();
}
