/** Redondea a 3 decimales para evitar restos de coma flotante al sumar y restar cantidades. */
export const redondear3 = (n: number) => Math.round(n * 1000) / 1000;
