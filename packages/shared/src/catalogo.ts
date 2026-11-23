import type { Categoria, Unidad } from './index.ts';

/** Un comercio solo puede publicar productos que venzan en este número de días o más. */
export const DIAS_MINIMOS_PARA_PUBLICAR = 3;

/** Stock mínimo de cualquier producto, en su propia unidad. Por debajo de esto el inventario marca una alerta. */
export const STOCK_MINIMO = 10;

export interface ProductoCatalogo {
  nombre: string;
  categoria: Categoria;
  /** Una sola unidad por producto en todo el sistema, para que lo donado entre al inventario sin conversiones. */
  unidad: Unidad;
  /** Cómo se llama la unidad para este producto ("latas", "paquetes"…). Si falta se usa el nombre de la unidad. */
  etiqueta?: string;
  requiereFrio?: boolean;
  /** Peso aproximado de una unidad en kg. Es un supuesto de demostración, solo para las cifras del panel de impacto. */
  pesoKgPorUnidad?: number;
}

/**
 * Productos que maneja la plataforma. Van por kg o litros los que se compran a granel
 * (azúcar, arroz, frejoles, lentejas, harina, papas, tomates, verduras, carnes y la leche fresca);
 * el resto va por unidades (un pan, una lata, un paquete, una bolsa).
 */
export const CATALOGO: readonly ProductoCatalogo[] = [
  { nombre: 'Pan francés', categoria: 'panaderia', unidad: 'unidades', pesoKgPorUnidad: 0.1 },
  { nombre: 'Pan de molde', categoria: 'panaderia', unidad: 'unidades', etiqueta: 'bolsas', pesoKgPorUnidad: 0.5 },
  { nombre: 'Queques surtidos', categoria: 'panaderia', unidad: 'unidades', pesoKgPorUnidad: 0.3 },
  { nombre: 'Verduras surtidas', categoria: 'verduras', unidad: 'kg' },
  { nombre: 'Tomates', categoria: 'verduras', unidad: 'kg' },
  { nombre: 'Papas', categoria: 'verduras', unidad: 'kg' },
  { nombre: 'Cebollas', categoria: 'verduras', unidad: 'kg' },
  { nombre: 'Zanahorias', categoria: 'verduras', unidad: 'kg' },
  { nombre: 'Lechugas', categoria: 'verduras', unidad: 'unidades', pesoKgPorUnidad: 0.4 },
  { nombre: 'Plátanos', categoria: 'frutas', unidad: 'unidades', pesoKgPorUnidad: 0.15 },
  { nombre: 'Manzanas', categoria: 'frutas', unidad: 'unidades', pesoKgPorUnidad: 0.2 },
  { nombre: 'Frutas surtidas', categoria: 'frutas', unidad: 'unidades', pesoKgPorUnidad: 0.2 },
  { nombre: 'Yogures', categoria: 'lacteos', unidad: 'unidades', etiqueta: 'envases', requiereFrio: true, pesoKgPorUnidad: 0.15 },
  { nombre: 'Leche fresca', categoria: 'lacteos', unidad: 'litros', requiereFrio: true },
  { nombre: 'Queso', categoria: 'lacteos', unidad: 'unidades', requiereFrio: true, pesoKgPorUnidad: 0.5 },
  { nombre: 'Pollo', categoria: 'carnes', unidad: 'kg', requiereFrio: true },
  { nombre: 'Carne', categoria: 'carnes', unidad: 'kg', requiereFrio: true },
  { nombre: 'Pescado', categoria: 'carnes', unidad: 'kg', requiereFrio: true },
  { nombre: 'Lentejas', categoria: 'menestras', unidad: 'kg' },
  { nombre: 'Frejoles', categoria: 'menestras', unidad: 'kg' },
  { nombre: 'Garbanzos', categoria: 'menestras', unidad: 'kg' },
  { nombre: 'Atún en lata', categoria: 'conservas', unidad: 'unidades', etiqueta: 'latas', pesoKgPorUnidad: 0.17 },
  { nombre: 'Leche evaporada', categoria: 'conservas', unidad: 'unidades', etiqueta: 'latas', pesoKgPorUnidad: 0.4 },
  { nombre: 'Arroz', categoria: 'abarrotes', unidad: 'kg' },
  { nombre: 'Azúcar', categoria: 'abarrotes', unidad: 'kg' },
  { nombre: 'Harina', categoria: 'abarrotes', unidad: 'kg' },
  { nombre: 'Fideos', categoria: 'abarrotes', unidad: 'unidades', etiqueta: 'paquetes', pesoKgPorUnidad: 0.5 },
  { nombre: 'Aceite', categoria: 'abarrotes', unidad: 'litros', etiqueta: 'botellas (litros)' },
  { nombre: 'Menú del día', categoria: 'preparados', unidad: 'unidades', etiqueta: 'raciones', pesoKgPorUnidad: 0.4 },
];

const sinTildes = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** Busca un producto del catálogo sin distinguir mayúsculas ni tildes. */
export function buscarEnCatalogo(nombre: string): ProductoCatalogo | undefined {
  const k = sinTildes(nombre);
  return CATALOGO.find((p) => sinTildes(p.nombre) === k);
}

/** Cómo se escribe la unidad de un producto: "latas", "paquetes", "kg"… */
export function etiquetaUnidad(producto: string, unidad: Unidad): string {
  const p = buscarEnCatalogo(producto);
  if (p && p.unidad === unidad && p.etiqueta) return p.etiqueta;
  return unidad;
}

/** Kilos equivalentes de una cantidad, para sumar productos distintos en el panel de impacto. */
export function aKgProducto(cantidad: number, unidad: Unidad, producto?: string): number {
  if (unidad !== 'unidades') return cantidad; // kg tal cual; 1 litro ≈ 1 kg
  const peso = (producto ? buscarEnCatalogo(producto)?.pesoKgPorUnidad : undefined) ?? 0.25;
  return cantidad * peso;
}
