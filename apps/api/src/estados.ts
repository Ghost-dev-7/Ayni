import type { EstadoDonacion } from '@ayni/shared';

/**
 * Máquina de estados de una donación:
 *   publicada → reservada → recogida
 *   publicada | reservada → vencida (si pasa la fecha de caducidad)
 * "recogida" y "vencida" son estados finales.
 */
const TRANSICIONES: Record<EstadoDonacion, readonly EstadoDonacion[]> = {
  publicada: ['reservada', 'vencida'],
  reservada: ['recogida', 'vencida'],
  recogida: [],
  vencida: [],
};

export function puedeTransicionar(desde: EstadoDonacion, hacia: EstadoDonacion): boolean {
  return TRANSICIONES[desde].includes(hacia);
}

export class ErrorDeNegocio extends Error {
  readonly statusCode: number;
  constructor(mensaje: string, statusCode = 409) {
    super(mensaje);
    this.statusCode = statusCode;
  }
}

/** Lanza un error de negocio si la transición no está permitida. */
export function exigirTransicion(desde: EstadoDonacion, hacia: EstadoDonacion): void {
  if (!puedeTransicionar(desde, hacia)) {
    throw new ErrorDeNegocio(`No se puede pasar de "${desde}" a "${hacia}".`);
  }
}

/** Código de entrega de 4 dígitos con formato "NN-NN". */
export function generarCodigoEntrega(azar: () => number = Math.random): string {
  const n = Math.floor(azar() * 10000);
  const s = String(n).padStart(4, '0');
  return `${s.slice(0, 2)}-${s.slice(2)}`;
}
