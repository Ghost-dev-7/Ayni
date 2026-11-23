import type {
  BorradorDonacion,
  Comedor,
  ComedorPerfil,
  Comercio,
  ConsumoInventario,
  Donacion,
  DonacionInput,
  EntregaInfo,
  EventoRegistro,
  InventarioComedor,
  RecogerInput,
  ReservarInput,
  Sugerencia,
} from '@ayni/shared';

export type NivelCaducidad = 'vencido' | 'rojo' | 'amarillo' | 'verde';
export type DonacionN = Donacion & { nivelCaducidad: NivelCaducidad };

/** Una donación publicada vista desde un comedor: con el comercio y el puntaje explicado. */
export interface OfertaN {
  donacion: DonacionN;
  comercio: Comercio;
  sugerencia: Sugerencia;
}

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
  borrador: (texto: string) => pedir<BorradorDonacion>('/donaciones/borrador', { metodo: 'POST', cuerpo: { texto } }),
  publicar: (d: DonacionInput) => pedir<Donacion>('/donaciones', { metodo: 'POST', cuerpo: d }),
  reservar: (id: number, d: ReservarInput) => pedir<Donacion>(`/donaciones/${id}/reservar`, { metodo: 'POST', cuerpo: d }),
  recoger: (id: number, d: RecogerInput) => pedir<Donacion>(`/donaciones/${id}/recoger`, { metodo: 'POST', cuerpo: d }),
  entrega: (id: number, comercioId: number) => pedir<EntregaInfo>(`/donaciones/${id}/entrega?comercioId=${comercioId}`),
  ofertas: (comedorId: number) => pedir<OfertaN[]>(`/comedores/${comedorId}/ofertas`),
  sugerencias: (donacionId: number) => pedir<Sugerencia[]>(`/donaciones/${donacionId}/sugerencias`),
  perfil: (comedorId: number, d: ComedorPerfil) => pedir<Comedor>(`/comedores/${comedorId}/perfil`, { metodo: 'PUT', cuerpo: d }),
  inventario: (comedorId: number) => pedir<InventarioComedor>(`/comedores/${comedorId}/inventario`),
  consumo: (comedorId: number, d: ConsumoInventario) =>
    pedir<{ descontado: { loteId: number; cantidad: number }[]; quedan: number }>(`/comedores/${comedorId}/inventario/consumos`, { metodo: 'POST', cuerpo: d }),
  notificaciones: (comedorId: number) => pedir<EventoRegistro[]>(`/comedores/${comedorId}/notificaciones`),
};
