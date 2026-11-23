import { etiquetaUnidad, type Categoria, type Unidad } from '@ayni/shared';
import type { NivelCaducidad } from './api.ts';

export const ICONO: Record<Categoria, string> = {
  panaderia: '🥖',
  verduras: '🥬',
  frutas: '🍎',
  lacteos: '🥛',
  carnes: '🍗',
  menestras: '🫘',
  conservas: '🥫',
  abarrotes: '🍚',
  preparados: '🍲',
};

export const NOMBRE_CATEGORIA: Record<Categoria, string> = {
  panaderia: 'Panadería',
  verduras: 'Verduras',
  frutas: 'Frutas',
  lacteos: 'Lácteos',
  carnes: 'Carnes',
  menestras: 'Menestras',
  conservas: 'Conservas',
  abarrotes: 'Abarrotes',
  preparados: 'Preparados',
};

const MS_HORA = 3_600_000;

/** "Vence en 3 h", "Vence en 40 min", "Vencida"… */
export function textoVence(caducaEn: string, ahora: Date): string {
  const h = (new Date(caducaEn).getTime() - ahora.getTime()) / MS_HORA;
  if (h <= 0) return 'Vencida';
  if (h < 1) return `Vence en ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `Vence en ${Math.round(h)} h`;
  return `Vence en ${Math.round(h / 24)} d`;
}

/** Clase CSS del semáforo (r = rojo, y = amarillo, g = verde). */
export const claseSemaforo = (n: NivelCaducidad): 'r' | 'y' | 'g' => (n === 'verde' ? 'g' : n === 'amarillo' ? 'y' : 'r');

export const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
export const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Distancia en km entre dos puntos (fórmula de Haversine). */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const km = (n: number) => `${n.toFixed(1).replace('.', ',')} km`;

/** Fecha local en el formato que espera <input type="datetime-local">. */
export function aInputLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const cantidadTexto = (n: number, unidad: Unidad, producto?: string) =>
  `${Number.isInteger(n) ? n : n.toFixed(1)} ${producto ? etiquetaUnidad(producto, unidad) : unidad}`;
