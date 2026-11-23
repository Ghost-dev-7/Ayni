import { z } from 'zod';

export const CATEGORIAS = [
  'panaderia',
  'verduras',
  'frutas',
  'lacteos',
  'carnes',
  'menestras',
  'conservas',
  'abarrotes',
  'preparados',
] as const;
export const categoriaSchema = z.enum(CATEGORIAS);
export type Categoria = z.infer<typeof categoriaSchema>;

export const UNIDADES = ['kg', 'unidades', 'litros'] as const;
export const unidadSchema = z.enum(UNIDADES);
export type Unidad = z.infer<typeof unidadSchema>;

export const ESTADOS_DONACION = ['publicada', 'reservada', 'recogida', 'vencida'] as const;
export const estadoDonacionSchema = z.enum(ESTADOS_DONACION);
export type EstadoDonacion = z.infer<typeof estadoDonacionSchema>;

export const TIPOS_COMERCIO = [
  'panaderia',
  'bodega',
  'mercado',
  'restaurante',
  'minimarket',
  'mayorista',
] as const;
export const tipoComercioSchema = z.enum(TIPOS_COMERCIO);
export type TipoComercio = z.infer<typeof tipoComercioSchema>;

export const coordSchema = {
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
};

export const comercioInputSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  tipo: tipoComercioSchema,
  direccion: z.string().trim().min(3).max(160),
  ...coordSchema,
});
export type ComercioInput = z.infer<typeof comercioInputSchema>;

export const comedorInputSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  zona: z.string().trim().min(1).max(40),
  direccion: z.string().trim().min(3).max(160),
  racionesDia: z.number().int().min(1).max(5000),
  necesidades: z.array(categoriaSchema).max(CATEGORIAS.length),
  refrigeracion: z.boolean(),
  horarioRecojo: z.string().trim().min(3).max(80),
  ...coordSchema,
});
export type ComedorInput = z.infer<typeof comedorInputSchema>;

/** Datos que envía un comercio al publicar una donación. */
export const donacionInputSchema = z
  .object({
    comercioId: z.number().int().positive(),
    producto: z.string().trim().min(2).max(80),
    categoria: categoriaSchema,
    cantidad: z.number().positive().max(100000),
    unidad: unidadSchema,
    /** Fecha y hora de caducidad (ISO 8601). */
    caducaEn: z.string().datetime({ offset: true }),
    ventanaDesde: z.string().datetime({ offset: true }),
    ventanaHasta: z.string().datetime({ offset: true }),
    requiereFrio: z.boolean().default(false),
  })
  .refine((d) => new Date(d.ventanaDesde) < new Date(d.ventanaHasta), {
    message: 'La ventana de recojo debe terminar después de empezar.',
    path: ['ventanaHasta'],
  });
export type DonacionInput = z.infer<typeof donacionInputSchema>;

export interface Comercio {
  id: number;
  nombre: string;
  tipo: TipoComercio;
  direccion: string;
  lat: number;
  lng: number;
  activo: boolean;
}

export interface Comedor {
  id: number;
  nombre: string;
  zona: string;
  direccion: string;
  lat: number;
  lng: number;
  racionesDia: number;
  necesidades: Categoria[];
  refrigeracion: boolean;
  horarioRecojo: string;
  activo: boolean;
}

export interface Donacion {
  id: number;
  codigo: string;
  comercioId: number;
  producto: string;
  categoria: Categoria;
  cantidad: number;
  unidad: Unidad;
  caducaEn: string;
  ventanaDesde: string;
  ventanaHasta: string;
  requiereFrio: boolean;
  estado: EstadoDonacion;
  comedorId: number | null;
  creadaEn: string;
}

export interface EventoRegistro {
  id: number;
  fecha: string;
  rol: 'comercio' | 'comedor' | 'admin' | 'sistema';
  actor: string;
  accion: string;
  entidad: string;
  detalle: string;
}
