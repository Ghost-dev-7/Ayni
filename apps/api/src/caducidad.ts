/** Reglas de caducidad. Funciones puras: reciben la hora actual como parámetro. */

export type NivelCaducidad = 'vencido' | 'rojo' | 'amarillo' | 'verde';

export const HORAS_ROJO = 12;
export const HORAS_AMARILLO = 48;

const MS_HORA = 3_600_000;

export function horasRestantes(caducaEn: string | Date, ahora: Date): number {
  return (new Date(caducaEn).getTime() - ahora.getTime()) / MS_HORA;
}

/** Semáforo de caducidad: rojo ≤ 12 h, amarillo ≤ 48 h, verde en otro caso. */
export function nivelCaducidad(caducaEn: string | Date, ahora: Date): NivelCaducidad {
  const h = horasRestantes(caducaEn, ahora);
  if (h <= 0) return 'vencido';
  if (h <= HORAS_ROJO) return 'rojo';
  if (h <= HORAS_AMARILLO) return 'amarillo';
  return 'verde';
}

/** No se puede publicar un producto que ya venció. */
export function puedePublicar(caducaEn: string | Date, ahora: Date): boolean {
  return horasRestantes(caducaEn, ahora) > 0;
}

/**
 * Urgencia entre 0 y 100: crece cuanto menos tiempo queda.
 * 0 h → 100; 72 h o más → 0 (descenso lineal).
 */
export function urgencia(caducaEn: string | Date, ahora: Date): number {
  const h = horasRestantes(caducaEn, ahora);
  if (h <= 0) return 100;
  const ventana = 72;
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - h / ventana))));
}
