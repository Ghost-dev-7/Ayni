/**
 * Emparejamiento: puntúa de 0 a 100 qué tan adecuado es cada comedor para recibir una donación.
 *
 *   puntaje = 0,35·urgencia + 0,25·cercanía + 0,25·necesidad + 0,15·capacidad
 *
 * Cada componente va de 0 a 100 y se explica en lenguaje claro (campo `razones`), para que
 * quien opera la plataforma sepa por qué se sugirió un comedor y no otro.
 */
import {
  KG_POR_RACION,
  PESOS_PUNTAJE,
  aKgProducto,
  type Comedor,
  type Comercio,
  type ComponentesPuntaje,
  type Donacion,
  type Sugerencia,
} from '@ayni/shared';
import type { BD } from './bd.ts';
import { horasRestantes, urgencia } from './caducidad.ts';
import { productosFaltantes, stockKg } from './inventario.ts';
import { listarComedores, obtenerComercio } from './repositorio.ts';

/** A partir de esta distancia, la cercanía vale 0. */
export const KM_MAXIMO = 5;
/** Días de consumo que un comedor puede tener almacenados como máximo (supuesto de demostración, ajustable). */
export const DIAS_DE_CAPACIDAD = 7;

export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 100 si está pegado al comercio, 0 a partir de KM_MAXIMO km. */
export function cercania(km: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - km / KM_MAXIMO))));
}

/** Espacio en kg que le queda al comedor según su consumo y lo que ya tiene almacenado. */
export function espacioDisponibleKg(c: Pick<Comedor, 'racionesDia'>, stockActualKg: number): number {
  return Math.max(0, c.racionesDia * KG_POR_RACION * DIAS_DE_CAPACIDAD - stockActualKg);
}

/** 100 si cabe toda la donación; proporcional si solo cabe una parte. */
export function capacidad(kgDonacion: number, espacioKg: number): number {
  if (kgDonacion <= 0) return 100;
  return Math.round(Math.max(0, Math.min(100, (100 * espacioKg) / kgDonacion)));
}

export interface EntradaPuntaje {
  donacion: Donacion;
  comercio: Pick<Comercio, 'lat' | 'lng'>;
  comedor: Comedor;
  /** Kilos equivalentes que el comedor ya tiene en su inventario. */
  stockActualKg: number;
  /** El comedor tiene este producto por debajo de su mínimo. */
  leFaltaElProducto: boolean;
  ahora: Date;
}

const nombreKm = (km: number) => `${km.toFixed(1).replace('.', ',')} km`;

export function puntuar(e: EntradaPuntaje): Sugerencia {
  const { donacion: d, comedor: c, ahora } = e;
  const km = distanciaKm(c, e.comercio);
  const kg = aKgProducto(d.cantidad, d.unidad, d.producto);
  const espacio = espacioDisponibleKg(c, e.stockActualKg);
  const declarada = c.necesidades.includes(d.categoria);

  const componentes: ComponentesPuntaje = {
    urgencia: urgencia(d.caducaEn, ahora),
    cercania: cercania(km),
    necesidad: declarada ? 100 : e.leFaltaElProducto ? 70 : 0,
    capacidad: capacidad(kg, espacio),
  };

  const horas = Math.max(0, horasRestantes(d.caducaEn, ahora));
  const razones = [
    `Urgencia ${componentes.urgencia}: vence en ${horas < 1 ? `${Math.round(horas * 60)} min` : horas < 48 ? `${Math.round(horas)} h` : `${Math.round(horas / 24)} días`}.`,
    `Cercanía ${componentes.cercania}: está a ${nombreKm(km)} del comercio.`,
    declarada
      ? 'Necesidad 100: es una categoría prioritaria para el comedor.'
      : e.leFaltaElProducto
        ? 'Necesidad 70: al comedor le queda poco de este producto (menos de 10).'
        : 'Necesidad 0: no es una categoría que el comedor haya declarado como prioritaria.',
    espacio >= kg
      ? `Capacidad ${componentes.capacidad}: tiene espacio para ${Math.round(espacio)} kg y la donación pesa ${Math.round(kg)} kg.`
      : `Capacidad ${componentes.capacidad}: solo tiene espacio para ${Math.round(espacio)} kg de los ${Math.round(kg)} kg.`,
  ];

  let motivoNoElegible: string | null = null;
  if (!c.activo) motivoNoElegible = 'El comedor está desactivado.';
  else if (d.requiereFrio && !c.refrigeracion) motivoNoElegible = 'El producto requiere refrigeración y el comedor no la tiene.';

  const bruto =
    PESOS_PUNTAJE.urgencia * componentes.urgencia +
    PESOS_PUNTAJE.cercania * componentes.cercania +
    PESOS_PUNTAJE.necesidad * componentes.necesidad +
    PESOS_PUNTAJE.capacidad * componentes.capacidad;

  return {
    comedorId: c.id,
    nombre: c.nombre,
    zona: c.zona,
    puntaje: motivoNoElegible ? 0 : Math.round(bruto),
    componentes,
    distanciaKm: Math.round(km * 10) / 10,
    elegible: motivoNoElegible === null,
    motivoNoElegible,
    razones,
  };
}

/** Ordena las sugerencias: primero los elegibles, de mayor a menor puntaje; ante empate, el más cercano. */
export function ordenar(sugerencias: Sugerencia[]): Sugerencia[] {
  return [...sugerencias].sort((a, b) => Number(b.elegible) - Number(a.elegible) || b.puntaje - a.puntaje || a.distanciaKm - b.distanciaKm);
}

/** Puntúa una donación frente a todos los comedores de la red y devuelve el ranking. */
export function sugerirComedores(db: BD, donacion: Donacion, ahora: Date): Sugerencia[] {
  const comercio = obtenerComercio(db, donacion.comercioId);
  if (!comercio) return [];
  return ordenar(
    listarComedores(db).map((comedor) =>
      puntuar({
        donacion,
        comercio,
        comedor,
        stockActualKg: stockKg(db, comedor.id, ahora),
        leFaltaElProducto: productosFaltantes(db, comedor.id, ahora).has(donacion.producto.trim().toLowerCase()),
        ahora,
      }),
    ),
  );
}

export interface OfertaComedor {
  donacion: Donacion;
  comercio: Comercio;
  sugerencia: Sugerencia;
}

/** Ofertas para un comedor: las donaciones publicadas, ordenadas de mayor a menor puntaje. */
export function ofertasParaComedor(db: BD, comedor: Comedor, donaciones: Donacion[], ahora: Date): OfertaComedor[] {
  const stockActualKg = stockKg(db, comedor.id, ahora);
  const faltantes = productosFaltantes(db, comedor.id, ahora);
  const ofertas: OfertaComedor[] = [];
  for (const donacion of donaciones) {
    const comercio = obtenerComercio(db, donacion.comercioId);
    if (!comercio) continue;
    const sugerencia = puntuar({ donacion, comercio, comedor, stockActualKg, leFaltaElProducto: faltantes.has(donacion.producto.trim().toLowerCase()), ahora });
    ofertas.push({ donacion, comercio, sugerencia });
  }
  return ofertas.sort(
    (a, b) =>
      Number(b.sugerencia.elegible) - Number(a.sugerencia.elegible) ||
      b.sugerencia.puntaje - a.sugerencia.puntaje ||
      a.donacion.caducaEn.localeCompare(b.donacion.caducaEn),
  );
}
