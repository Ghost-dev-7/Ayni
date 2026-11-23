import type { Unidad } from '@ayni/shared';

/** Peso aproximado de una unidad suelta (lata, yogur…). Supuesto de demostración, ajustable. */
export const KG_POR_UNIDAD = 0.25;

/** Convierte una cantidad a kilos equivalentes para poder comparar y sumar. 1 litro ≈ 1 kg. */
export function aKg(cantidad: number, unidad: Unidad): number {
  return unidad === 'unidades' ? cantidad * KG_POR_UNIDAD : cantidad;
}

export const redondear3 = (n: number) => Math.round(n * 1000) / 1000;
