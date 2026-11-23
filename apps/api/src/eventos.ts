import type { EventoRegistro } from '@ayni/shared';
import type { BD } from './bd.ts';

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
