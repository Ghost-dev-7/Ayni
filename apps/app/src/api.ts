import type { Comedor, Comercio, Donacion, DonacionInput, RecogerInput, ReservarInput } from '@ayni/shared';

export type NivelCaducidad = 'vencido' | 'rojo' | 'amarillo' | 'verde';
export type DonacionN = Donacion & { nivelCaducidad: NivelCaducidad };

async function pedir<T>(ruta: string, opciones?: { metodo?: string; cuerpo?: unknown }): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    method: opciones?.metodo ?? 'GET',
    headers: opciones?.cuerpo ? { 'content-type': 'application/json' } : undefined,
    body: opciones?.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });
  const cuerpo = (await r.json().catch(() => null)) as
    | { error?: string; detalles?: { campo: string; mensaje: string }[] }
    | T
    | null;
  if (!r.ok) {
    const e = cuerpo as { error?: string; detalles?: { campo: string; mensaje: string }[] } | null;
    const detalle = e?.detalles?.map((d) => d.mensaje).join(' ');
    throw new Error(detalle || e?.error || 'No se pudo completar la acción.');
  }
  return cuerpo as T;
}

export const api = {
  comercios: () => pedir<Comercio[]>('/comercios'),
  comedores: () => pedir<Comedor[]>('/comedores'),
  donaciones: (estado?: string) => pedir<DonacionN[]>(`/donaciones${estado ? `?estado=${estado}` : ''}`),
  donacion: (id: number) => pedir<DonacionN>(`/donaciones/${id}`),
  publicar: (d: DonacionInput) => pedir<Donacion>('/donaciones', { metodo: 'POST', cuerpo: d }),
  reservar: (id: number, d: ReservarInput) => pedir<Donacion>(`/donaciones/${id}/reservar`, { metodo: 'POST', cuerpo: d }),
  recoger: (id: number, d: RecogerInput) => pedir<Donacion>(`/donaciones/${id}/recoger`, { metodo: 'POST', cuerpo: d }),
};
