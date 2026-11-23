/** Reglas de caducidad. Funciones puras: reciben la hora actual como parámetro. */
import { DIAS_MINIMOS_PARA_PUBLICAR } from '@ayni/shared';

export type NivelCaducidad = 'vencido' | 'rojo' | 'amarillo' | 'verde';

/** Semáforo: rojo si quedan 3 días o menos, amarillo si quedan hasta 5, verde si quedan más. */
export const HORAS_ROJO = 72;
export const HORAS_AMARILLO = 120;

/** Con cuántas horas de vida (días × 24) como mínimo se puede publicar un producto. */
export const HORAS_MINIMAS_PARA_PUBLICAR = DIAS_MINIMOS_PARA_PUBLICAR * 24;

/** Ventana de la urgencia: un producto que vence en esto o más tiene urgencia 0. */
const VENTANA_URGENCIA_HORAS = 168; // 7 días

const MS_HORA = 3_600_000;

export function horasRestantes(caducaEn: string | Date, ahora: Date): number {
  return (new Date(caducaEn).getTime() - ahora.getTime()) / MS_HORA;
}

/** Semáforo de caducidad: rojo ≤ 72 h, amarillo ≤ 120 h, verde en otro caso. */
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

/** Regla de seguridad: solo se publican productos que venzan en 3 días o más (los que vencen después son bienvenidos). */
export function cumpleVidaMinima(caducaEn: string | Date, ahora: Date): boolean {
  return horasRestantes(caducaEn, ahora) >= HORAS_MINIMAS_PARA_PUBLICAR;
}

/**
 * Urgencia entre 0 y 100: crece cuanto menos tiempo queda.
 * 0 h → 100; 7 días o más → 0 (descenso lineal).
 */
export function urgencia(caducaEn: string | Date, ahora: Date): number {
  const h = horasRestantes(caducaEn, ahora);
  if (h <= 0) return 100;
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - h / VENTANA_URGENCIA_HORAS))));
}
