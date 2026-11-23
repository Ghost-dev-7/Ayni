import type {
  Categoria,
  Comedor,
  ComedorInput,
  Comercio,
  ComercioInput,
  Donacion,
  DonacionInput,
  EstadoDonacion,
  EventoRegistro,
  TipoComercio,
  Unidad,
} from '@ayni/shared';
import type { BD } from './bd.ts';

type Fila = Record<string, unknown>;

const bool = (v: unknown) => Number(v) === 1;

function comercioDe(f: Fila): Comercio {
  return {
    id: Number(f.id),
    nombre: String(f.nombre),
    tipo: f.tipo as TipoComercio,
    direccion: String(f.direccion),
    lat: Number(f.lat),
    lng: Number(f.lng),
    activo: bool(f.activo),
  };
}

function comedorDe(f: Fila): Comedor {
  return {
    id: Number(f.id),
    nombre: String(f.nombre),
    zona: String(f.zona),
    direccion: String(f.direccion),
    lat: Number(f.lat),
    lng: Number(f.lng),
    racionesDia: Number(f.raciones_dia),
    necesidades: JSON.parse(String(f.necesidades)) as Categoria[],
    refrigeracion: bool(f.refrigeracion),
    horarioRecojo: String(f.horario_recojo),
    activo: bool(f.activo),
  };
}

function donacionDe(f: Fila): Donacion {
  return {
    id: Number(f.id),
    codigo: String(f.codigo),
    comercioId: Number(f.comercio_id),
    producto: String(f.producto),
    categoria: f.categoria as Categoria,
    cantidad: Number(f.cantidad),
    unidad: f.unidad as Unidad,
    caducaEn: String(f.caduca_en),
    ventanaDesde: String(f.ventana_desde),
    ventanaHasta: String(f.ventana_hasta),
    requiereFrio: bool(f.requiere_frio),
    estado: f.estado as EstadoDonacion,
    comedorId: f.comedor_id === null ? null : Number(f.comedor_id),
    creadaEn: String(f.creada_en),
  };
}

function eventoDe(f: Fila): EventoRegistro {
  return {
    id: Number(f.id),
    fecha: String(f.fecha),
    rol: f.rol as EventoRegistro['rol'],
    actor: String(f.actor),
    accion: String(f.accion),
    entidad: String(f.entidad),
    detalle: String(f.detalle),
  };
}

export interface NuevoEvento {
  rol: EventoRegistro['rol'];
  actor: string;
  accion: string;
  entidad: string;
  detalle?: string;
  fecha?: string;
}

/** Registra un evento de trazabilidad. */
export function registrarEvento(db: BD, e: NuevoEvento): void {
  db.prepare('INSERT INTO eventos (fecha, rol, actor, accion, entidad, detalle) VALUES (?, ?, ?, ?, ?, ?)').run(
    e.fecha ?? new Date().toISOString(),
    e.rol,
    e.actor,
    e.accion,
    e.entidad,
    e.detalle ?? '',
  );
}

export function listarComercios(db: BD): Comercio[] {
  return (db.prepare('SELECT * FROM comercios ORDER BY id').all() as Fila[]).map(comercioDe);
}

export function obtenerComercio(db: BD, id: number): Comercio | undefined {
  const f = db.prepare('SELECT * FROM comercios WHERE id = ?').get(id) as Fila | undefined;
  return f ? comercioDe(f) : undefined;
}

export function crearComercio(db: BD, d: ComercioInput): Comercio {
  const r = db
    .prepare('INSERT INTO comercios (nombre, tipo, direccion, lat, lng) VALUES (?, ?, ?, ?, ?)')
    .run(d.nombre, d.tipo, d.direccion, d.lat, d.lng);
  const creado = obtenerComercio(db, Number(r.lastInsertRowid))!;
  registrarEvento(db, {
    rol: 'admin',
    actor: 'Administración',
    accion: 'Alta de comercio',
    entidad: `COM-${String(creado.id).padStart(4, '0')}`,
    detalle: creado.nombre,
  });
  return creado;
}

export function listarComedores(db: BD): Comedor[] {
  return (db.prepare('SELECT * FROM comedores ORDER BY id').all() as Fila[]).map(comedorDe);
}

export function obtenerComedor(db: BD, id: number): Comedor | undefined {
  const f = db.prepare('SELECT * FROM comedores WHERE id = ?').get(id) as Fila | undefined;
  return f ? comedorDe(f) : undefined;
}

export function crearComedor(db: BD, d: ComedorInput): Comedor {
  const r = db
    .prepare(
      `INSERT INTO comedores (nombre, zona, direccion, lat, lng, raciones_dia, necesidades, refrigeracion, horario_recojo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.nombre, d.zona, d.direccion, d.lat, d.lng, d.racionesDia, JSON.stringify(d.necesidades), d.refrigeracion ? 1 : 0, d.horarioRecojo);
  const creado = obtenerComedor(db, Number(r.lastInsertRowid))!;
  registrarEvento(db, {
    rol: 'admin',
    actor: 'Administración',
    accion: 'Alta de comedor',
    entidad: `KIT-${String(creado.id).padStart(4, '0')}`,
    detalle: creado.nombre,
  });
  return creado;
}

export function listarDonaciones(db: BD, estado?: EstadoDonacion): Donacion[] {
  const filas = estado
    ? (db.prepare('SELECT * FROM donaciones WHERE estado = ? ORDER BY caduca_en').all(estado) as Fila[])
    : (db.prepare('SELECT * FROM donaciones ORDER BY id DESC').all() as Fila[]);
  return filas.map(donacionDe);
}

export function obtenerDonacion(db: BD, id: number): Donacion | undefined {
  const f = db.prepare('SELECT * FROM donaciones WHERE id = ?').get(id) as Fila | undefined;
  return f ? donacionDe(f) : undefined;
}

export const codigoDonacion = (id: number) => `DON-${String(id).padStart(4, '0')}`;

/** Inserta una donación en estado "publicada" y registra el evento. */
export function crearDonacion(db: BD, d: DonacionInput, ahora: Date = new Date()): Donacion {
  const comercio = obtenerComercio(db, d.comercioId);
  const siguiente = (db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM donaciones').get() as { n: number }).n;
  db.prepare(
    `INSERT INTO donaciones
      (id, codigo, comercio_id, producto, categoria, cantidad, unidad, caduca_en, ventana_desde, ventana_hasta, requiere_frio, estado, creada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publicada', ?)`,
  ).run(
    siguiente,
    codigoDonacion(siguiente),
    d.comercioId,
    d.producto,
    d.categoria,
    d.cantidad,
    d.unidad,
    d.caducaEn,
    d.ventanaDesde,
    d.ventanaHasta,
    d.requiereFrio ? 1 : 0,
    ahora.toISOString(),
  );
  registrarEvento(db, {
    rol: 'comercio',
    actor: comercio?.nombre ?? `Comercio ${d.comercioId}`,
    accion: 'Publicada',
    entidad: codigoDonacion(siguiente),
    detalle: `${d.producto} · ${d.cantidad} ${d.unidad}`,
    fecha: ahora.toISOString(),
  });
  return obtenerDonacion(db, siguiente)!;
}

export function listarEventos(db: BD, limite = 100): EventoRegistro[] {
  return (db.prepare('SELECT * FROM eventos ORDER BY fecha DESC, id DESC LIMIT ?').all(limite) as Fila[]).map(eventoDe);
}
