import {
  STOCK_MINIMO,
  aKgProducto,
  buscarEnCatalogo,
  etiquetaUnidad,
  type Categoria,
  type ConsumoInventario,
  type EntradaInventario,
  type InventarioCentral,
  type InventarioComedor,
  type LoteInventario,
  type ProductoInventario,
  type Unidad,
} from '@ayni/shared';
import type { BD } from './bd.ts';
import { horasRestantes, nivelCaducidad } from './caducidad.ts';
import { ErrorDeNegocio } from './estados.ts';
import { registrarEvento } from './eventos.ts';
import { redondear3 } from './medidas.ts';

type Fila = Record<string, unknown>;

/** Un lote "por vencer" es el que caduca en las próximas 72 horas. */
const HORAS_POR_VENCER = 72;

const normal = (s: string) => s.trim().toLowerCase();
const claveProducto = (producto: string, unidad: string) => `${normal(producto)}|${unidad}`;
const codigoComedor = (id: number) => `KIT-${String(id).padStart(4, '0')}`;

function loteDe(f: Fila, ahora: Date): LoteInventario {
  const caducaEn = f.caduca_en === null ? null : String(f.caduca_en);
  return {
    id: Number(f.id),
    comedorId: Number(f.comedor_id),
    producto: String(f.producto),
    categoria: f.categoria as Categoria,
    unidad: f.unidad as Unidad,
    cantidad: redondear3(Number(f.cantidad)),
    cantidadInicial: redondear3(Number(f.cantidad_inicial)),
    caducaEn,
    origen: f.origen as 'donacion' | 'manual',
    donacionId: f.donacion_id === null ? null : Number(f.donacion_id),
    creadoEn: String(f.creado_en),
    nivelCaducidad: caducaEn === null ? 'sin-fecha' : nivelCaducidad(caducaEn, ahora),
  };
}

const nombreComedor = (db: BD, id: number): string => {
  const f = db.prepare('SELECT nombre FROM comedores WHERE id = ?').get(id) as { nombre: string } | undefined;
  if (!f) throw new ErrorDeNegocio('El comedor no existe.', 404);
  return f.nombre;
};

/** Unidades de un producto con el nombre que usa el comedor ("12 latas", "30 kg"). */
const textoCantidad = (n: number, unidad: Unidad, producto: string) => `${redondear3(n)} ${etiquetaUnidad(producto, unidad)}`;

export interface OpcionesEntrada {
  origen: 'donacion' | 'manual';
  donacionId?: number;
  motivo?: string;
  actor?: string;
  ahora?: Date;
  /** No deja constancia en el registro de eventos (se usa al cargar el inventario inicial). */
  sinEvento?: boolean;
}

/**
 * Registra la entrada de un lote al inventario de un comedor.
 * En la plataforma solo entra stock por una donación recogida; la carga manual se usa para el inventario inicial.
 */
export function registrarEntrada(db: BD, comedorId: number, e: EntradaInventario, op: OpcionesEntrada): LoteInventario {
  const ahora = op.ahora ?? new Date();
  const comedor = nombreComedor(db, comedorId);
  const producto = buscarEnCatalogo(e.producto)?.nombre ?? e.producto.trim();
  const r = db
    .prepare(
      `INSERT INTO inventario_lotes (comedor_id, producto, categoria, unidad, cantidad, cantidad_inicial, caduca_en, origen, donacion_id, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(comedorId, producto, e.categoria, e.unidad, e.cantidad, e.cantidad, e.caducaEn ?? null, op.origen, op.donacionId ?? null, ahora.toISOString());
  const id = Number(r.lastInsertRowid);
  db.prepare('INSERT INTO inventario_movimientos (lote_id, comedor_id, tipo, cantidad, fecha, motivo, actor) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    id,
    comedorId,
    'entrada',
    e.cantidad,
    ahora.toISOString(),
    op.motivo ?? e.motivo ?? '',
    op.actor ?? comedor,
  );
  if (!op.sinEvento) {
    registrarEvento(db, {
      rol: 'sistema',
      actor: 'Inventario',
      accion: 'Entró al inventario',
      entidad: codigoComedor(comedorId),
      detalle: `+${textoCantidad(e.cantidad, e.unidad, producto)} de ${producto}${op.motivo ? ` · ${op.motivo}` : ''}`,
      fecha: ahora.toISOString(),
    });
  }
  return loteDe(db.prepare('SELECT * FROM inventario_lotes WHERE id = ?').get(id) as Fila, ahora);
}

export interface ResultadoConsumo {
  /** Lotes de los que se descontó, en el orden en que se usaron (primero lo que vence antes). */
  descontado: { loteId: number; cantidad: number }[];
  /** Lo que queda del producto después del consumo. */
  quedan: number;
}

/** Cuánto hay en total de un producto (en su unidad) en el inventario de un comedor. */
function totalProducto(db: BD, comedorId: number, producto: string, unidad: string): number {
  const f = db
    .prepare('SELECT COALESCE(SUM(cantidad), 0) AS t FROM inventario_lotes WHERE comedor_id = ? AND LOWER(producto) = ? AND unidad = ?')
    .get(comedorId, normal(producto), unidad) as { t: number };
  return redondear3(Number(f.t));
}

/**
 * Registra lo consumido de un producto y lo resta solo del stock, descontando primero el lote que vence antes (PEPS).
 * Si el stock baja del mínimo (10) deja una notificación de alerta.
 */
export function registrarConsumo(db: BD, comedorId: number, c: ConsumoInventario, ahora: Date = new Date()): ResultadoConsumo {
  const comedor = nombreComedor(db, comedorId);
  const lotes = (
    db
      .prepare(
        `SELECT * FROM inventario_lotes
         WHERE comedor_id = ? AND LOWER(producto) = ? AND unidad = ? AND cantidad > 0
         ORDER BY (caduca_en IS NULL), caduca_en, id`,
      )
      .all(comedorId, normal(c.producto), c.unidad) as Fila[]
  ).map((f) => loteDe(f, ahora));

  if (lotes.length === 0) throw new ErrorDeNegocio(`No hay "${c.producto}" en el inventario.`, 404);
  const nombre = lotes[0]!.producto;
  const antes = redondear3(lotes.reduce((suma, l) => suma + l.cantidad, 0));
  if (c.cantidad > antes) throw new ErrorDeNegocio(`Solo hay ${textoCantidad(antes, c.unidad, nombre)} de "${nombre}" en el inventario.`, 422);

  const descontado: ResultadoConsumo['descontado'] = [];
  let restante = c.cantidad;
  for (const lote of lotes) {
    if (restante <= 0) break;
    const tomar = redondear3(Math.min(lote.cantidad, restante));
    db.prepare('UPDATE inventario_lotes SET cantidad = ? WHERE id = ?').run(redondear3(lote.cantidad - tomar), lote.id);
    db.prepare('INSERT INTO inventario_movimientos (lote_id, comedor_id, tipo, cantidad, fecha, motivo, actor) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      lote.id,
      comedorId,
      'consumo',
      tomar,
      ahora.toISOString(),
      c.motivo ?? '',
      comedor,
    );
    descontado.push({ loteId: lote.id, cantidad: tomar });
    restante = redondear3(restante - tomar);
  }

  const quedan = totalProducto(db, comedorId, nombre, c.unidad);
  registrarEvento(db, {
    rol: 'comedor',
    actor: comedor,
    accion: 'Consumo de inventario',
    entidad: codigoComedor(comedorId),
    detalle: `−${textoCantidad(c.cantidad, c.unidad, nombre)} de ${nombre} · quedan ${textoCantidad(quedan, c.unidad, nombre)}${c.motivo ? ` · ${c.motivo}` : ''}`,
    fecha: ahora.toISOString(),
  });

  // Alerta automática al cruzar el mínimo hacia abajo.
  if (antes >= STOCK_MINIMO && quedan < STOCK_MINIMO) {
    registrarEvento(db, {
      rol: 'sistema',
      actor: 'Inventario',
      accion: quedan === 0 ? 'Producto agotado' : 'Stock bajo',
      entidad: codigoComedor(comedorId),
      detalle: quedan === 0 ? `${nombre} se agotó (mínimo ${STOCK_MINIMO})` : `${nombre}: quedan ${textoCantidad(quedan, c.unidad, nombre)}, menos del mínimo de ${STOCK_MINIMO}`,
      fecha: ahora.toISOString(),
    });
  }
  return { descontado, quedan };
}

/** Inventario de un comedor: lotes (primero los que vencen antes), productos agregados y resumen. */
export function obtenerInventario(db: BD, comedorId: number, ahora: Date = new Date()): InventarioComedor {
  nombreComedor(db, comedorId);
  const todos = (
    db.prepare('SELECT * FROM inventario_lotes WHERE comedor_id = ? ORDER BY (caduca_en IS NULL), caduca_en, id').all(comedorId) as Fila[]
  ).map((f) => loteDe(f, ahora));
  const activos = todos.filter((l) => l.cantidad > 0);

  // Los productos se agrupan sobre todos los lotes, para que uno agotado siga apareciendo con stock 0.
  const grupos = new Map<string, LoteInventario[]>();
  for (const l of todos) {
    const k = claveProducto(l.producto, l.unidad);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const productos: ProductoInventario[] = [...grupos.values()].map((lotes) => {
    const conStock = lotes.filter((l) => l.cantidad > 0);
    const conFecha = conStock.filter((l) => l.caducaEn !== null).sort((a, b) => a.caducaEn!.localeCompare(b.caducaEn!));
    const total = redondear3(conStock.reduce((s, l) => s + l.cantidad, 0));
    return {
      producto: lotes[0]!.producto,
      categoria: lotes[0]!.categoria,
      unidad: lotes[0]!.unidad,
      total,
      minimo: STOCK_MINIMO,
      bajoMinimo: total < STOCK_MINIMO,
      proximaCaducidad: conFecha[0]?.caducaEn ?? null,
      nivelCaducidad: conFecha[0]?.nivelCaducidad ?? 'sin-fecha',
      lotes: conStock.length,
    };
  });
  // Primero lo que falta, luego lo que vence antes y por último el resto.
  productos.sort(
    (a, b) =>
      Number(b.bajoMinimo) - Number(a.bajoMinimo) ||
      (a.proximaCaducidad ?? '9999').localeCompare(b.proximaCaducidad ?? '9999') ||
      a.producto.localeCompare(b.producto),
  );

  const horas = (l: LoteInventario) => (l.caducaEn ? horasRestantes(l.caducaEn, ahora) : Infinity);
  return {
    comedorId,
    resumen: {
      stockKg: redondear3(activos.filter((l) => l.nivelCaducidad !== 'vencido').reduce((s, l) => s + aKgProducto(l.cantidad, l.unidad, l.producto), 0)),
      lotes: activos.length,
      lotesPorVencer: activos.filter((l) => horas(l) > 0 && horas(l) <= HORAS_POR_VENCER).length,
      lotesVencidos: activos.filter((l) => l.nivelCaducidad === 'vencido').length,
      productosBajoMinimo: productos.filter((p) => p.bajoMinimo).length,
    },
    productos,
    lotes: activos,
  };
}

/** Kilos equivalentes en el inventario (sin contar lo vencido). Sirve para estimar la capacidad de recibir más. */
export function stockKg(db: BD, comedorId: number, ahora: Date): number {
  return obtenerInventario(db, comedorId, ahora).resumen.stockKg;
}

/** Productos (en minúscula) que el comedor tiene por debajo del mínimo. */
export function productosFaltantes(db: BD, comedorId: number, ahora: Date): Set<string> {
  return new Set(
    obtenerInventario(db, comedorId, ahora)
      .productos.filter((p) => p.bajoMinimo)
      .map((p) => normal(p.producto)),
  );
}

/** Vista de toda la red para la web de administración: vencimientos y faltantes. */
export function inventarioCentral(db: BD, ahora: Date = new Date()): InventarioCentral {
  const comedores = db.prepare('SELECT id, nombre, activo FROM comedores ORDER BY id').all() as { id: number; nombre: string; activo: number }[];
  const porVencer: InventarioCentral['porVencer'] = [];
  const bajoMinimo: InventarioCentral['bajoMinimo'] = [];
  const filas: InventarioCentral['comedores'] = [];

  for (const c of comedores) {
    const inv = obtenerInventario(db, c.id, ahora);
    filas.push({ comedorId: c.id, nombre: c.nombre, activo: Number(c.activo) === 1, ...inv.resumen });
    for (const l of inv.lotes) {
      if (l.caducaEn && horasRestantes(l.caducaEn, ahora) <= HORAS_POR_VENCER) porVencer.push({ ...l, comedor: c.nombre });
    }
    for (const p of inv.productos) {
      if (p.bajoMinimo) bajoMinimo.push({ comedorId: c.id, comedor: c.nombre, producto: p.producto, unidad: p.unidad, total: p.total, minimo: p.minimo });
    }
  }
  porVencer.sort((a, b) => (a.caducaEn ?? '').localeCompare(b.caducaEn ?? ''));

  return {
    totales: {
      stockKg: redondear3(filas.reduce((s, f) => s + f.stockKg, 0)),
      lotesPorVencer: filas.reduce((s, f) => s + f.lotesPorVencer, 0),
      lotesVencidos: filas.reduce((s, f) => s + f.lotesVencidos, 0),
      productosBajoMinimo: filas.reduce((s, f) => s + f.productosBajoMinimo, 0),
      comedores: filas.length,
    },
    comedores: filas,
    porVencer: porVencer.slice(0, 40),
    bajoMinimo,
  };
}
