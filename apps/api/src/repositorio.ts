import type {
  Categoria,
  Comedor,
  ComedorInput,
  ComedorPerfil,
  Comercio,
  ComercioInput,
  Donacion,
  DonacionInput,
  EstadoDonacion,
  EventoRegistro,
  RecogerInput,
  ReservarInput,
  TipoComercio,
  Unidad,
} from '@ayni/shared';
import type { BD } from './bd.ts';
import { ErrorDeNegocio, exigirTransicion, generarCodigoEntrega } from './estados.ts';
import { registrarEvento } from './eventos.ts';
import { registrarEntrada } from './inventario.ts';

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
    codigoEntrega: f.codigo_entrega === null ? null : String(f.codigo_entrega),
    reservadaPor: f.reservada_por === null ? null : String(f.reservada_por),
    reservadaEn: f.reservada_en === null ? null : String(f.reservada_en),
    recogidaPor: f.recogida_por === null ? null : String(f.recogida_por),
    recogidaEn: f.recogida_en === null ? null : String(f.recogida_en),
    cantidadRecibida: f.cantidad_recibida === null ? null : Number(f.cantidad_recibida),
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

export { registrarEvento };

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

/** Pasa a "vencida" toda donación publicada o reservada cuya fecha de caducidad ya pasó. */
export function marcarVencidas(db: BD, ahora: Date): number {
  const filas = db
    .prepare("SELECT * FROM donaciones WHERE estado IN ('publicada','reservada') AND caduca_en <= ?")
    .all(ahora.toISOString()) as Fila[];
  for (const f of filas) {
    const d = donacionDe(f);
    db.prepare("UPDATE donaciones SET estado = 'vencida' WHERE id = ?").run(d.id);
    registrarEvento(db, {
      rol: 'sistema',
      actor: 'Caducidad',
      accion: 'Marcada como vencida',
      entidad: d.codigo,
      detalle: `${d.producto} · ${d.cantidad} ${d.unidad}`,
      fecha: ahora.toISOString(),
    });
  }
  return filas.length;
}

/** Un comedor reserva una donación publicada. */
export function reservarDonacion(db: BD, id: number, d: ReservarInput, ahora: Date = new Date()): Donacion {
  marcarVencidas(db, ahora);
  const donacion = obtenerDonacion(db, id);
  if (!donacion) throw new ErrorDeNegocio('La donación no existe.', 404);
  const comedor = obtenerComedor(db, d.comedorId);
  if (!comedor || !comedor.activo) throw new ErrorDeNegocio('El comedor no existe o no está activo.', 404);
  exigirTransicion(donacion.estado, 'reservada');
  if (donacion.requiereFrio && !comedor.refrigeracion) {
    throw new ErrorDeNegocio('Este producto requiere refrigeración y el comedor no la tiene.', 422);
  }
  const codigoEntrega = generarCodigoEntrega();
  db.prepare(
    "UPDATE donaciones SET estado = 'reservada', comedor_id = ?, codigo_entrega = ?, reservada_por = ?, reservada_en = ? WHERE id = ?",
  ).run(comedor.id, codigoEntrega, d.reservadoPor, ahora.toISOString(), id);
  registrarEvento(db, {
    rol: 'comedor',
    actor: comedor.nombre,
    accion: 'Reservada',
    entidad: donacion.codigo,
    detalle: `${donacion.producto} · ${donacion.cantidad} ${donacion.unidad} · por ${d.reservadoPor}`,
    fecha: ahora.toISOString(),
  });
  return obtenerDonacion(db, id)!;
}

/** El comedor que reservó confirma la recogida. */
export function recogerDonacion(db: BD, id: number, d: RecogerInput, ahora: Date = new Date()): Donacion {
  marcarVencidas(db, ahora);
  const donacion = obtenerDonacion(db, id);
  if (!donacion) throw new ErrorDeNegocio('La donación no existe.', 404);
  exigirTransicion(donacion.estado, 'recogida');
  if (donacion.comedorId !== d.comedorId) {
    throw new ErrorDeNegocio('Solo el comedor que reservó puede confirmar la recogida.', 403);
  }
  if (d.cantidadRecibida > donacion.cantidad) {
    throw new ErrorDeNegocio('La cantidad recibida no puede superar la cantidad publicada.', 422);
  }
  const comedor = obtenerComedor(db, d.comedorId)!;
  db.prepare(
    "UPDATE donaciones SET estado = 'recogida', recogida_por = ?, recogida_en = ?, cantidad_recibida = ? WHERE id = ?",
  ).run(d.recogidoPor, ahora.toISOString(), d.cantidadRecibida, id);
  registrarEvento(db, {
    rol: 'comedor',
    actor: comedor.nombre,
    accion: 'Recogida confirmada',
    entidad: donacion.codigo,
    detalle: `${donacion.producto} · ${d.cantidadRecibida} ${donacion.unidad} recibidos · por ${d.recogidoPor}`,
    fecha: ahora.toISOString(),
  });
  // Lo recogido entra automáticamente al inventario del comedor.
  registrarEntrada(
    db,
    comedor.id,
    { producto: donacion.producto, categoria: donacion.categoria, unidad: donacion.unidad, cantidad: d.cantidadRecibida, caducaEn: donacion.caducaEn },
    { origen: 'donacion', donacionId: id, motivo: `Donación ${donacion.codigo}`, actor: comedor.nombre, ahora },
  );
  return obtenerDonacion(db, id)!;
}

/** Actualiza lo que el comedor declara: necesidades, raciones, refrigeración y horario. */
export function actualizarPerfilComedor(db: BD, id: number, p: ComedorPerfil, ahora: Date = new Date()): Comedor {
  const comedor = obtenerComedor(db, id);
  if (!comedor) throw new ErrorDeNegocio('El comedor no existe.', 404);
  db.prepare('UPDATE comedores SET necesidades = ?, raciones_dia = ?, refrigeracion = ?, horario_recojo = ? WHERE id = ?').run(
    JSON.stringify(p.necesidades),
    p.racionesDia,
    p.refrigeracion ? 1 : 0,
    p.horarioRecojo,
    id,
  );
  registrarEvento(db, {
    rol: 'comedor',
    actor: comedor.nombre,
    accion: 'Perfil actualizado',
    entidad: `KIT-${String(id).padStart(4, '0')}`,
    detalle: `${p.racionesDia} raciones/día · ${p.necesidades.length} categorías prioritarias`,
    fecha: ahora.toISOString(),
  });
  return obtenerComedor(db, id)!;
}

/** Un administrador asigna una donación publicada a un comedor concreto (reasignación manual). */
export function reasignarDonacion(db: BD, id: number, comedorId: number, ahora: Date = new Date()): Donacion {
  const d = reservarDonacion(db, id, { comedorId, reservadoPor: 'Administración' }, ahora);
  const comedor = obtenerComedor(db, comedorId)!;
  registrarEvento(db, {
    rol: 'admin',
    actor: 'Administración',
    accion: 'Reasignada',
    entidad: d.codigo,
    detalle: `Asignada a ${comedor.nombre}`,
    fecha: ahora.toISOString(),
  });
  return d;
}

export interface FiltroEventos {
  limite?: number;
  rol?: string;
  accion?: string;
  entidad?: string;
  /** Texto a buscar en actor, entidad o detalle. */
  texto?: string;
}

export function listarEventos(db: BD, filtro: FiltroEventos = {}): EventoRegistro[] {
  const condiciones: string[] = [];
  const valores: (string | number)[] = [];
  if (filtro.rol) { condiciones.push('rol = ?'); valores.push(filtro.rol); }
  if (filtro.accion) { condiciones.push('accion = ?'); valores.push(filtro.accion); }
  if (filtro.entidad) { condiciones.push('entidad = ?'); valores.push(filtro.entidad); }
  if (filtro.texto) {
    condiciones.push('(actor LIKE ? OR entidad LIKE ? OR detalle LIKE ?)');
    const patron = `%${filtro.texto}%`;
    valores.push(patron, patron, patron);
  }
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const sql = `SELECT * FROM eventos ${donde} ORDER BY fecha DESC, id DESC LIMIT ?`;
  return (db.prepare(sql).all(...valores, filtro.limite ?? 100) as Fila[]).map(eventoDe);
}

/**
 * Notificaciones de un comedor: lo que reservó o recogió, lo que entró a su inventario, lo que consumió
 * y las alertas de stock bajo. Salen del registro de eventos, de lo más nuevo a lo más viejo.
 */
export function listarNotificacionesComedor(db: BD, comedorId: number, limite = 60): EventoRegistro[] {
  const comedor = obtenerComedor(db, comedorId);
  if (!comedor) throw new ErrorDeNegocio('El comedor no existe.', 404);
  const codigo = `KIT-${String(comedorId).padStart(4, '0')}`;
  const sql = `SELECT * FROM eventos
               WHERE (entidad = ? AND accion IN ('Entró al inventario', 'Consumo de inventario', 'Stock bajo', 'Producto agotado'))
                  OR (rol = 'comedor' AND actor = ? AND accion IN ('Reservada', 'Recogida confirmada'))
               ORDER BY fecha DESC, id DESC LIMIT ?`;
  return (db.prepare(sql).all(codigo, comedor.nombre, limite) as Fila[]).map(eventoDe);
}

/** Acciones distintas que existen en el registro (para el filtro de la web de administración). */
export function listarAccionesEventos(db: BD): string[] {
  return (db.prepare('SELECT DISTINCT accion FROM eventos ORDER BY accion').all() as { accion: string }[]).map((f) => f.accion);
}

/** Activa o desactiva un comedor o un comercio y deja constancia en el registro de eventos. */
export function cambiarActivo(db: BD, tabla: 'comedores' | 'comercios', id: number, activo: boolean, ahora: Date = new Date()): Comedor | Comercio {
  const actual = tabla === 'comedores' ? obtenerComedor(db, id) : obtenerComercio(db, id);
  if (!actual) throw new ErrorDeNegocio('No existe.', 404);
  db.prepare(`UPDATE ${tabla} SET activo = ? WHERE id = ?`).run(activo ? 1 : 0, id);
  registrarEvento(db, {
    rol: 'admin',
    actor: 'Administración',
    accion: activo ? 'Activación' : 'Desactivación',
    entidad: `${tabla === 'comedores' ? 'KIT' : 'COM'}-${String(id).padStart(4, '0')}`,
    detalle: actual.nombre,
    fecha: ahora.toISOString(),
  });
  return (tabla === 'comedores' ? obtenerComedor(db, id) : obtenerComercio(db, id))!;
}
