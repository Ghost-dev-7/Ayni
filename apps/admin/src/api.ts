import type { Comedor, ComedorInput, Comercio, ComercioInput, Donacion, EventoRegistro, Impacto } from '@ayni/shared';

export type NivelCaducidad = 'vencido' | 'rojo' | 'amarillo' | 'verde';
export type DonacionN = Donacion & { nivelCaducidad: NivelCaducidad };

interface CuerpoError {
  error?: string;
  detalles?: { campo: string; mensaje: string }[];
}

async function pedir<T>(ruta: string, opciones?: { metodo?: string; cuerpo?: unknown }): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    method: opciones?.metodo ?? 'GET',
    headers: opciones?.cuerpo ? { 'content-type': 'application/json' } : undefined,
    body: opciones?.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const cuerpo = (await r.json().catch(() => null)) as T | CuerpoError | null;
  if (!r.ok) {
    const e = cuerpo as CuerpoError | null;
    const detalle = e?.detalles?.map((d) => `${d.campo}: ${d.mensaje}`).join('. ');
    throw new Error(detalle || e?.error || 'No se pudo completar la acción.');
  }
  return cuerpo as T;
}

export interface FiltroEventos {
  rol?: string;
  accion?: string;
  entidad?: string;
  texto?: string;
  limite?: number;
}

const consulta = (f: FiltroEventos) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  impacto: () => pedir<Impacto>('/impacto'),
  comercios: () => pedir<Comercio[]>('/comercios'),
  comedores: () => pedir<Comedor[]>('/comedores'),
  donaciones: () => pedir<DonacionN[]>('/donaciones'),
  eventos: (f: FiltroEventos = {}) => pedir<EventoRegistro[]>(`/eventos${consulta(f)}`),
  acciones: () => pedir<string[]>('/eventos/acciones'),
  crearComedor: (d: ComedorInput) => pedir<Comedor>('/comedores', { metodo: 'POST', cuerpo: d }),
  crearComercio: (d: ComercioInput) => pedir<Comercio>('/comercios', { metodo: 'POST', cuerpo: d }),
  activarComedor: (id: number, activo: boolean) => pedir<Comedor>(`/comedores/${id}`, { metodo: 'PATCH', cuerpo: { activo } }),
  activarComercio: (id: number, activo: boolean) => pedir<Comercio>(`/comercios/${id}`, { metodo: 'PATCH', cuerpo: { activo } }),
};
