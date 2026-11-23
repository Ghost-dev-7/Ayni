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

/** Texto libre del comercio ("20 kg de pan de ayer, recojo hasta las 6pm"). */
export const borradorInputSchema = z.object({ texto: z.string().trim().min(3).max(400) });

/** Borrador de donación creado a partir de una frase. El comercio lo revisa antes de publicar. */
export interface BorradorDonacion {
  producto: string;
  categoria: Categoria;
  cantidad: number | null;
  unidad: Unidad;
  caducaEn: string;
  ventanaHasta: string;
  requiereFrio: boolean;
  /** Cosas que el analizador no entendió o tuvo que suponer. */
  advertencias: string[];
  entendido: { producto: boolean; cantidad: boolean; caducidad: boolean; ventana: boolean };
}

/** Un comedor reserva una donación publicada. */
export const reservarInputSchema = z.object({
  comedorId: z.number().int().positive(),
  reservadoPor: z.string().trim().min(2).max(80),
});
export type ReservarInput = z.infer<typeof reservarInputSchema>;

/** El comedor confirma que recogió la donación y declara la cantidad recibida. */
export const recogerInputSchema = z.object({
  comedorId: z.number().int().positive(),
  recogidoPor: z.string().trim().min(2).max(80),
  cantidadRecibida: z.number().positive().max(100000),
  estadoOk: z.literal(true, { errorMap: () => ({ message: 'Debes confirmar que el producto está en buen estado.' }) }),
});
export type RecogerInput = z.infer<typeof recogerInputSchema>;

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
  /** Código corto que identifica la entrega en el mostrador (se genera al reservar). */
  codigoEntrega: string | null;
  reservadaPor: string | null;
  reservadaEn: string | null;
  recogidaPor: string | null;
  recogidaEn: string | null;
  cantidadRecibida: number | null;
}

/** Perfil editable de un comedor: lo que declara y condiciona el emparejamiento. */
export const comedorPerfilSchema = z.object({
  necesidades: z.array(categoriaSchema).max(CATEGORIAS.length),
  racionesDia: z.number().int().min(1).max(5000),
  refrigeracion: z.boolean(),
  horarioRecojo: z.string().trim().min(3).max(80),
});
export type ComedorPerfil = z.infer<typeof comedorPerfilSchema>;

/** Una persona del equipo administrador asigna una donación a un comedor concreto. */
export const reasignarInputSchema = z.object({ comedorId: z.number().int().positive() });

export const TIPOS_SALIDA = ['consumo', 'merma', 'salida'] as const;
export const tipoSalidaSchema = z.enum(TIPOS_SALIDA);
export type TipoSalida = z.infer<typeof tipoSalidaSchema>;

/** Entrada manual de un lote al inventario de un comedor. */
export const entradaInventarioSchema = z.object({
  producto: z.string().trim().min(2).max(80),
  categoria: categoriaSchema,
  unidad: unidadSchema,
  cantidad: z.number().positive().max(100000),
  caducaEn: z.string().datetime({ offset: true }).nullable().optional(),
  motivo: z.string().trim().max(120).optional(),
});
export type EntradaInventario = z.infer<typeof entradaInventarioSchema>;

/** Consumo, merma o salida de un producto: se descuenta primero lo que vence antes (PEPS). */
export const salidaInventarioSchema = z.object({
  producto: z.string().trim().min(2).max(80),
  unidad: unidadSchema,
  tipo: tipoSalidaSchema,
  cantidad: z.number().positive().max(100000),
  motivo: z.string().trim().max(120).optional(),
});
export type SalidaInventario = z.infer<typeof salidaInventarioSchema>;

export const minimoInventarioSchema = z.object({
  producto: z.string().trim().min(2).max(80),
  unidad: unidadSchema,
  minimo: z.number().min(0).max(100000),
});
export type MinimoInventario = z.infer<typeof minimoInventarioSchema>;

export interface LoteInventario {
  id: number;
  comedorId: number;
  producto: string;
  categoria: Categoria;
  unidad: Unidad;
  cantidad: number;
  cantidadInicial: number;
  caducaEn: string | null;
  origen: 'donacion' | 'manual';
  donacionId: number | null;
  creadoEn: string;
  nivelCaducidad: 'vencido' | 'rojo' | 'amarillo' | 'verde' | 'sin-fecha';
}

export interface ProductoInventario {
  producto: string;
  categoria: Categoria;
  unidad: Unidad;
  total: number;
  minimo: number | null;
  bajoMinimo: boolean;
  proximaCaducidad: string | null;
  nivelCaducidad: LoteInventario['nivelCaducidad'];
  lotes: number;
}

export interface InventarioComedor {
  comedorId: number;
  resumen: {
    stockKg: number;
    lotes: number;
    lotesPorVencer: number;
    lotesVencidos: number;
    productosBajoMinimo: number;
  };
  productos: ProductoInventario[];
  lotes: LoteInventario[];
}

export interface InventarioCentral {
  totales: { stockKg: number; lotesPorVencer: number; lotesVencidos: number; productosBajoMinimo: number; comedores: number };
  comedores: { comedorId: number; nombre: string; activo: boolean; stockKg: number; lotes: number; lotesPorVencer: number; lotesVencidos: number; productosBajoMinimo: number }[];
  /** Lotes que vencen pronto o ya vencieron, de toda la red. */
  porVencer: (LoteInventario & { comedor: string })[];
  bajoMinimo: { comedorId: number; comedor: string; producto: string; unidad: Unidad; total: number; minimo: number }[];
}

/** Componentes del puntaje de emparejamiento (cada uno de 0 a 100). */
export interface ComponentesPuntaje {
  urgencia: number;
  cercania: number;
  necesidad: number;
  capacidad: number;
}

export interface Sugerencia {
  comedorId: number;
  nombre: string;
  zona: string;
  /** Puntaje de 0 a 100. 0 si el comedor no es elegible. */
  puntaje: number;
  componentes: ComponentesPuntaje;
  distanciaKm: number;
  elegible: boolean;
  motivoNoElegible: string | null;
  /** Frases que explican, en lenguaje claro, por qué obtuvo ese puntaje. */
  razones: string[];
}

export const PESOS_PUNTAJE = { urgencia: 0.35, cercania: 0.25, necesidad: 0.25, capacidad: 0.15 } as const;

/** Cuántos kg equivalen a una ración. Supuesto de demostración, ajustable. */
export const KG_POR_RACION = 0.5;

/** Activa o desactiva un comedor o un comercio. */
export const activoInputSchema = z.object({ activo: z.boolean() });

export interface ImpactoComedor {
  comedorId: number;
  nombre: string;
  zona: string;
  activo: boolean;
  kgRecibidos: number;
  donacionesRecogidas: number;
  diasSinActividad: number | null;
}

export interface ImpactoComercio {
  comercioId: number;
  nombre: string;
  tipo: TipoComercio;
  activo: boolean;
  kgDonados: number;
  donacionesRecogidas: number;
  vencidasSinDonar: number;
  donacionesTotales: number;
}

/** Cifras del panel de impacto y monitoreo (últimos 28 días). Todas calculadas con datos sintéticos en la demostración. */
export interface Impacto {
  generadoEn: string;
  ventanaDias: number;
  kgRescatados: number;
  racionesEquivalentes: number;
  kgPorRacion: number;
  comedoresAtendidos: number;
  comerciosDonantes: number;
  comerciosActivos: number;
  comedoresActivos: number;
  donacionesPublicadas: number;
  /** % de donaciones cerradas que se recogieron antes de vencer; null si todavía no hay ninguna cerrada. */
  porcentajeAntesDeVencer: number | null;
  /** Minutos promedio entre publicar y recoger; null si no hay recogidas. */
  tiempoMedioMin: number | null;
  /** Kg recogidos por semana, de la más antigua a la más reciente (4 semanas). */
  kgPorSemana: number[];
  porEstado: Record<EstadoDonacion, number>;
  alertas: {
    vencenPronto: number;
    vencenProntoSinComedor: number;
    comedoresSinActividad: { comedorId: number; nombre: string; dias: number | null }[];
  };
  comedores: ImpactoComedor[];
  comercios: ImpactoComercio[];
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
