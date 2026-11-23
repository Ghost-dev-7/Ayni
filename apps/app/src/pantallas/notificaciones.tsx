import { STOCK_MINIMO, type Donacion, type EventoRegistro } from '@ayni/shared';
import { useState } from 'react';
import { api } from '../api.ts';
import { Estado, Marco } from '../componentes.tsx';
import { cantidadTexto, haceTiempo, textoVence } from '../formato.ts';
import { ir, useCarga, type Sesion } from '../sesion.ts';
import { PESTANAS_COMEDOR as PESTANAS } from './pestanas.ts';
import { TarjetaReserva } from './recogida.tsx';

interface Aspecto {
  icono: string;
  titulo: string;
  alerta: boolean;
}

/** Cómo se muestra cada tipo de aviso. */
function aspecto(e: EventoRegistro): Aspecto {
  switch (e.accion) {
    case 'Reservada': return { icono: '🛒', titulo: 'Reservaste un producto', alerta: false };
    case 'Recogida confirmada': return { icono: '✅', titulo: 'Recogiste un producto', alerta: false };
    case 'Entró al inventario': return { icono: '📦', titulo: 'Entró al inventario', alerta: false };
    case 'Consumo de inventario': return { icono: '🍽️', titulo: 'Consumo registrado', alerta: false };
    case 'Stock bajo': return { icono: '⚠️', titulo: 'Stock bajo', alerta: true };
    case 'Producto agotado': return { icono: '⛔', titulo: 'Producto agotado', alerta: true };
    default: return { icono: '🔔', titulo: e.accion, alerta: false };
  }
}

/**
 * Notificaciones del comedor: lo que tiene por recoger, las alertas de su inventario y el historial
 * de lo reservado, recogido y consumido. Se actualiza sola cada pocos segundos.
 */
export function ComedorNotificaciones({ sesion }: { sesion: Sesion }) {
  const comedores = useCarga(api.comedores);
  const comercios = useCarga(api.comercios);
  const donaciones = useCarga(() => api.donaciones(), [], 8_000);
  const eventos = useCarga(() => api.notificaciones(sesion.id), [sesion.id], 8_000);
  const inventario = useCarga(() => api.inventario(sesion.id), [sesion.id], 8_000);
  const comedor = comedores.datos?.find((c) => c.id === sesion.id);
  const ahora = new Date();

  // La última entrega aprobada se queda a la vista hasta que el comedor la cierre.
  const [aprobada, setAprobada] = useState<Donacion | null>(null);

  const alCambiar = () => {
    donaciones.recargar();
    eventos.recargar();
    inventario.recargar();
  };
  const alAprobar = (recogida: Donacion) => {
    setAprobada(recogida);
    alCambiar();
  };

  const pendientes = (donaciones.datos ?? [])
    .filter((d) => d.comedorId === sesion.id && d.estado === 'reservada')
    .sort((a, b) => a.caducaEn.localeCompare(b.caducaEn));
  const bajos = inventario.datos?.productos.filter((p) => p.bajoMinimo) ?? [];
  const vencen = inventario.datos?.lotes.filter((l) => l.nivelCaducidad === 'vencido' || l.nivelCaducidad === 'rojo') ?? [];
  const hayAlertas = bajos.length > 0 || vencen.length > 0;

  return (
    <Marco pestanas={PESTANAS} activa="/comedor/notificaciones">
      <div className="top"><b style={{ fontSize: 20, fontFamily: 'var(--serif)' }}>Notificaciones</b></div>
      <p className="small muted" style={{ marginTop: -6 }}>Se actualizan solas. Aquí ves lo que debes recoger, las alertas del inventario y todo lo que va pasando.</p>

      {aprobada && (
        <section className="aprobado" role="status" aria-live="polite" style={{ marginTop: 12 }}>
          <div className="aprobado-icono" aria-hidden="true">✓</div>
          <h2>Aprobado</h2>
          <b>{aprobada.producto} · {cantidadTexto(aprobada.cantidadRecibida ?? aprobada.cantidad, aprobada.unidad, aprobada.producto)}</b>
          <p className="small" style={{ margin: '6px 0 12px' }}>Entrega verificada con el comercio. Quedó registrada y ya está en tu inventario.</p>
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn" type="button" onClick={() => ir('/comedor/inventario')}>Ver inventario</button>
            <button className="btn ghost" type="button" onClick={() => setAprobada(null)}>Cerrar</button>
          </div>
        </section>
      )}

      {pendientes.length > 0 && (
        <>
          <div className="section-title"><h2>Por recoger ({pendientes.length})</h2></div>
          <div className="stack">
            {pendientes.map((d) => (
              <TarjetaReserva key={d.id} d={d} comedor={comedor} comercio={comercios.datos?.find((c) => c.id === d.comercioId)} ahora={ahora} alCambiar={alCambiar} alAprobar={alAprobar} />
            ))}
          </div>
        </>
      )}

      {hayAlertas && (
        <>
          <div className="section-title"><h2>Alertas del inventario</h2></div>
          <div className="stack">
            {bajos.map((p) => (
              <div className="aviso error" role="alert" key={`${p.producto}|${p.unidad}`}>
                <b>⚠️ Stock bajo: {p.producto}</b>
                <div className="small">{p.total === 0 ? 'Se agotó.' : `Quedan ${cantidadTexto(p.total, p.unidad, p.producto)}.`} El mínimo es {STOCK_MINIMO}.</div>
              </div>
            ))}
            {vencen.map((l) => (
              <div className="aviso" key={l.id} style={{ background: 'var(--yellow-100)' }}>
                <b>⏰ {l.nivelCaducidad === 'vencido' ? 'Vencido' : 'Por vencer'}: {l.producto}</b>
                <div className="small">{cantidadTexto(l.cantidad, l.unidad, l.producto)} · {l.caducaEn ? textoVence(l.caducaEn, ahora) : ''}. Consúmelo primero.</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title"><h2>Historial</h2></div>
      <Estado carga={eventos}>
        {(lista) =>
          lista.length === 0 ? (
            <p className="muted small">Todavía no hay movimientos. Aquí aparecerá lo que reserves, recojas y consumas.</p>
          ) : (
            <div className="stack">
              {lista.map((e) => {
                const a = aspecto(e);
                return (
                  <div className="list-item" key={e.id} style={a.alerta ? { borderColor: 'var(--red)', background: 'var(--red-100)' } : undefined}>
                    <div className="thumb" style={{ width: 44, height: 44, fontSize: 22 }} aria-hidden="true">{a.icono}</div>
                    <div className="grow">
                      <b>{a.titulo}</b>
                      <div className="small muted">{e.detalle}</div>
                      <div className="tiny muted">{haceTiempo(e.fecha, ahora)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </Estado>
    </Marco>
  );
}
