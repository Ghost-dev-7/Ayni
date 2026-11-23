import { KG_POR_RACION, aKgProducto, type EstadoDonacion, type Impacto, type ImpactoComedor, type ImpactoComercio } from '@ayni/shared';
import type { BD } from './bd.ts';
import { HORAS_ROJO, horasRestantes } from './caducidad.ts';
import { listarComedores, listarComercios, listarDonaciones } from './repositorio.ts';

const DIA = 24 * 3_600_000;
const VENTANA_DIAS = 28;
const DIAS_SIN_ACTIVIDAD = 7;

const redondear = (n: number, decimales = 1) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/** Calcula las cifras del panel de impacto y monitoreo a partir de las donaciones registradas. */
export function calcularImpacto(db: BD, ahora: Date): Impacto {
  const t0 = ahora.getTime();
  const desde = t0 - VENTANA_DIAS * DIA;
  const todas = listarDonaciones(db);
  const comedores = listarComedores(db);
  const comercios = listarComercios(db);

  const enVentana = todas.filter((d) => new Date(d.creadaEn).getTime() >= desde);
  const recogidas = enVentana.filter((d) => d.estado === 'recogida');
  const vencidas = enVentana.filter((d) => d.estado === 'vencida');
  // Todo se convierte a kilos equivalentes (con un peso aproximado por unidad) para poder sumar productos distintos.
  const kgDe = (lista: typeof recogidas) => lista.reduce((s, d) => s + aKgProducto(d.cantidadRecibida ?? 0, d.unidad, d.producto), 0);

  const kgRescatados = kgDe(recogidas);

  // Kg recogidos por semana (4 semanas, de la más antigua a la más reciente).
  const kgPorSemana = [0, 0, 0, 0];
  for (const d of recogidas) {
    if (!d.recogidaEn) continue;
    const semana = Math.min(3, Math.max(0, Math.floor((new Date(d.recogidaEn).getTime() - desde) / (7 * DIA))));
    kgPorSemana[semana] = (kgPorSemana[semana] ?? 0) + aKgProducto(d.cantidadRecibida ?? 0, d.unidad, d.producto);
  }

  const cerradas = recogidas.length + vencidas.length;
  const tiempos = recogidas
    .filter((d) => d.recogidaEn)
    .map((d) => (new Date(d.recogidaEn!).getTime() - new Date(d.creadaEn).getTime()) / 60_000);

  const porEstado: Record<EstadoDonacion, number> = { publicada: 0, reservada: 0, recogida: 0, vencida: 0 };
  for (const d of todas) porEstado[d.estado]++;

  const abiertas = todas.filter((d) => d.estado === 'publicada' || d.estado === 'reservada');
  const vencenPronto = abiertas.filter((d) => horasRestantes(d.caducaEn, ahora) <= HORAS_ROJO);

  // Última actividad (reserva o recogida) de cada comedor.
  const ultimaActividad = new Map<number, number>();
  for (const d of todas) {
    if (d.comedorId === null) continue;
    const marca = Math.max(d.reservadaEn ? new Date(d.reservadaEn).getTime() : 0, d.recogidaEn ? new Date(d.recogidaEn).getTime() : 0);
    ultimaActividad.set(d.comedorId, Math.max(ultimaActividad.get(d.comedorId) ?? 0, marca));
  }
  const diasSin = (id: number): number | null => {
    const ultima = ultimaActividad.get(id);
    return ultima ? Math.floor((t0 - ultima) / DIA) : null;
  };

  const porComedor: ImpactoComedor[] = comedores.map((c) => {
    const suyas = recogidas.filter((d) => d.comedorId === c.id);
    return {
      comedorId: c.id,
      nombre: c.nombre,
      zona: c.zona,
      activo: c.activo,
      kgRecibidos: redondear(kgDe(suyas)),
      donacionesRecogidas: suyas.length,
      diasSinActividad: diasSin(c.id),
    };
  });

  const porComercio: ImpactoComercio[] = comercios.map((c) => {
    const suyas = enVentana.filter((d) => d.comercioId === c.id);
    const suyasRecogidas = suyas.filter((d) => d.estado === 'recogida');
    return {
      comercioId: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      activo: c.activo,
      kgDonados: redondear(kgDe(suyasRecogidas)),
      donacionesRecogidas: suyasRecogidas.length,
      vencidasSinDonar: suyas.filter((d) => d.estado === 'vencida').length,
      donacionesTotales: suyas.length,
    };
  });

  return {
    generadoEn: ahora.toISOString(),
    ventanaDias: VENTANA_DIAS,
    kgRescatados: redondear(kgRescatados),
    racionesEquivalentes: Math.round(kgRescatados / KG_POR_RACION),
    kgPorRacion: KG_POR_RACION,
    comedoresAtendidos: new Set(recogidas.map((d) => d.comedorId)).size,
    comerciosDonantes: new Set(enVentana.map((d) => d.comercioId)).size,
    comerciosActivos: comercios.filter((c) => c.activo).length,
    comedoresActivos: comedores.filter((c) => c.activo).length,
    donacionesPublicadas: todas.length,
    porcentajeAntesDeVencer: cerradas === 0 ? null : Math.round((recogidas.length / cerradas) * 100),
    tiempoMedioMin: tiempos.length === 0 ? null : Math.round(tiempos.reduce((s, m) => s + m, 0) / tiempos.length),
    kgPorSemana: kgPorSemana.map((k) => redondear(k)),
    porEstado,
    alertas: {
      vencenPronto: vencenPronto.length,
      vencenProntoSinComedor: vencenPronto.filter((d) => d.estado === 'publicada').length,
      comedoresSinActividad: porComedor
        .filter((c) => c.activo && (c.diasSinActividad === null || c.diasSinActividad >= DIAS_SIN_ACTIVIDAD))
        .map((c) => ({ comedorId: c.comedorId, nombre: c.nombre, dias: c.diasSinActividad })),
    },
    comedores: porComedor,
    comercios: porComercio,
  };
}
