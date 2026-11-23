import type {
  Categoria,
  EntradaInventario,
  InventarioCentral,
  InventarioComedor,
  LoteInventario,
  MinimoInventario,
  ProductoInventario,
  SalidaInventario,
  Unidad,
} from '@ayni/shared';
import type { BD } from './bd.ts';
import { horasRestantes, nivelCaducidad } from './caducidad.ts';
import { ErrorDeNegocio } from './estados.ts';
import { registrarEvento } from './eventos.ts';
import { aKg, redondear3 } from './medidas.ts';

type Fila = Record<string, unknown>;

/** Un lote "por vencer" es el que caduca en las próximas 72 horas. */
const HORAS_POR_VENCER = 72;

const normal = (s: string) => s.trim().toLowerCase();
const claveProducto = (producto: string, unidad: string) => `${normal(producto)}|${unidad}`;

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

export interface OpcionesEntrada {
  origen: 'donacion' | 'manual';
  donacionId?: number;
  motivo?: string;
  actor?: string;
  ahora?: Date;
  /** No deja constancia en el registro de eventos (se usa al cargar el inventario inicial). */
  sinEvento?: boolean;
}

/** Registra la entrada de un lote al inventario de un comedor (por donación recogida o carga manual). */
export function registrarEntrada(db: BD, comedorId: number, e: EntradaInventario, op: OpcionesEntrada): LoteInventario {
  const ahora = op.ahora ?? new Date();
  const comedor = nombreComedor(db, comedorId);
  const r = db
    .prepare(
      `INSERT INTO inventario_lotes (comedor_id, producto, categoria, unidad, cantidad, cantidad_inicial, caduca_en, origen, donacion_id, creado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(comedorId, e.producto.trim(), e.categoria, e.unidad, e.cantidad, e.cantidad, e.caducaEn ?? null, op.origen, op.donacionId ?? null, ahora.toISOString());
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
  if (op.origen === 'manual' && !op.sinEvento) {
    registrarEvento(db, {
      rol: 'comedor',
      actor: comedor,
      accion: 'Entrada de inventario',
      entidad: `LOT-${String(id).padStart(4, '0')}`,
      detalle: `${e.producto.trim()} · ${e.cantidad} ${e.unidad}`,
      fecha: ahora.toISOString(),
    });
  }
  return loteDe(db.prepare('SELECT * FROM inventario_lotes WHERE id = ?').get(id) as Fila, ahora);
}

export interface ResultadoSalida {
  /** Lotes de los que se descontó, en el orden en que se usaron (primero lo que vence antes). */
  descontado: { loteId: number; cantidad: number }[];
}

/** Registra consumo, merma o salida de un producto, descontando primero lo que vence antes (PEPS). */
export function registrarSalida(db: BD, comedorId: number, s: SalidaInventario, ahora: Date = new Date()): ResultadoSalida {
  const comedor = nombreComedor(db, comedorId);
  const lotes = (
    db
      .prepare(
        `SELECT * FROM inventario_lotes
         WHERE comedor_id = ? AND LOWER(producto) = ? AND unidad = ? AND cantidad > 0
         ORDER BY (caduca_en IS NULL), caduca_en, id`,
      )
      .all(comedorId, normal(s.producto), s.unidad) as Fila[]
  ).map((f) => loteDe(f, ahora));

  if (lotes.length === 0) throw new ErrorDeNegocio(`No hay "${s.producto}" en el inventario.`, 404);
  const total = redondear3(lotes.reduce((suma, l) => suma + l.cantidad, 0));
  if (s.cantidad > total) throw new ErrorDeNegocio(`Solo hay ${total} ${s.unidad} de "${s.producto}" en el inventario.`, 422);

  const descontado: ResultadoSalida['descontado'] = [];
  let restante = s.cantidad;
  for (const lote of lotes) {
    if (restante <= 0) break;
    const tomar = redondear3(Math.min(lote.cantidad, restante));
    db.prepare('UPDATE inventario_lotes SET cantidad = ? WHERE id = ?').run(redondear3(lote.cantidad - tomar), lote.id);
    db.prepare('INSERT INTO inventario_movimientos (lote_id, comedor_id, tipo, cantidad, fecha, motivo, actor) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      lote.id,
      comedorId,
      s.tipo,
      tomar,
      ahora.toISOString(),
      s.motivo ?? '',
      comedor,
    );
    descontado.push({ loteId: lote.id, cantidad: tomar });
    restante = redondear3(restante - tomar);
  }

  registrarEvento(db, {
    rol: 'comedor',
    actor: comedor,
    accion: s.tipo === 'consumo' ? 'Consumo de inventario' : s.tipo === 'merma' ? 'Merma registrada' : 'Salida de inventario',
    entidad: `KIT-${String(comedorId).padStart(4, '0')}`,
    detalle: `${lotes[0]!.producto} · ${s.cantidad} ${s.unidad}${s.motivo ? ` · ${s.motivo}` : ''}`,
    fecha: ahora.toISOString(),
  });
  return { descontado };
}

/** Define el stock mínimo de un producto; con 0 se elimina la alerta. */
export function fijarMinimo(db: BD, comedorId: number, m: MinimoInventario): void {
  nombreComedor(db, comedorId);
  const producto = normal(m.producto);
  if (m.minimo === 0) {
    db.prepare('DELETE FROM inventario_minimos WHERE comedor_id = ? AND producto = ? AND unidad = ?').run(comedorId, producto, m.unidad);
    return;
  }
  db.prepare(
    `INSERT INTO inventario_minimos (comedor_id, producto, unidad, minimo) VALUES (?, ?, ?, ?)
     ON CONFLICT (comedor_id, producto, unidad) DO UPDATE SET minimo = excluded.minimo`,
  ).run(comedorId, producto, m.unidad, m.minimo);
}

/** Inventario de un comedor: lotes (primero los que vencen antes), productos agregados y resumen. */
export function obtenerInventario(db: BD, comedorId: number, ahora: Date = new Date()): InventarioComedor {
  nombreComedor(db, comedorId);
  const todos = (
    db.prepare('SELECT * FROM inventario_lotes WHERE comedor_id = ? ORDER BY (caduca_en IS NULL), caduca_en, id').all(comedorId) as Fila[]
  ).map((f) => loteDe(f, ahora));
  const activos = todos.filter((l) => l.cantidad > 0);
  const minimos = new Map(
    (db.prepare('SELECT producto, unidad, minimo FROM inventario_minimos WHERE comedor_id = ?').all(comedorId) as { producto: string; unidad: string; minimo: number }[]).map(
      (m) => [claveProducto(m.producto, m.unidad), Number(m.minimo)],
    ),
  );

  // Los productos se agrupan sobre todos los lotes, para que uno agotado siga apareciendo con stock 0.
  const grupos = new Map<string, LoteInventario[]>();
  for (const l of todos) {
    const k = claveProducto(l.producto, l.unidad);
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const productos: ProductoInventario[] = [...grupos.entries()].map(([k, lotes]) => {
    const conStock = lotes.filter((l) => l.cantidad > 0);
    const conFecha = conStock.filter((l) => l.caducaEn !== null).sort((a, b) => a.caducaEn!.localeCompare(b.caducaEn!));
    const total = redondear3(conStock.reduce((s, l) => s + l.cantidad, 0));
    const minimo = minimos.get(k) ?? null;
    return {
      producto: lotes[0]!.producto,
      categoria: lotes[0]!.categoria,
      unidad: lotes[0]!.unidad,
      total,
      minimo,
      bajoMinimo: minimo !== null && total < minimo,
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
      stockKg: redondear3(activos.filter((l) => l.nivelCaducidad !== 'vencido').reduce((s, l) => s + aKg(l.cantidad, l.unidad), 0)),
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

/** Productos (en minúscula) que el comedor tiene por debajo de su mínimo. */
export function productosFaltantes(db: BD, comedorId: number, ahora: Date): Set<string> {
  return new Set(
    obtenerInventario(db, comedorId, ahora)
      .productos.filter((p) => p.bajoMinimo)
      .map((p) => normal(p.producto)),
  );
}

/** Vista de toda la red para la web de administración: excedentes, vencimientos y faltantes. */
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
      if (p.bajoMinimo && p.minimo !== null) bajoMinimo.push({ comedorId: c.id, comedor: c.nombre, producto: p.producto, unidad: p.unidad, total: p.total, minimo: p.minimo });
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
