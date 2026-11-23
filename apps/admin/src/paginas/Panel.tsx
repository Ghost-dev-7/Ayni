import { api } from '../api.ts';
import { Chip, Encabezado, Estado, tonoAccion } from '../componentes.tsx';
import { useCarga } from '../carga.ts';
import { fechaHora } from '../formato.ts';

const duracion = (min: number | null) => {
  if (min === null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
};

/** Panel de monitoreo e impacto. Se actualiza solo cada 10 segundos. */
export function Panel() {
  const impacto = useCarga(api.impacto, [], 10_000);
  const eventos = useCarga(() => api.eventos({ limite: 6 }), [], 10_000);

  return (
    <>
      <Encabezado supra="Últimos 28 días · se actualiza solo" titulo="Panel de monitoreo">
        <a className="btn sm" href="#/comedores/nuevo">＋ Agregar comedor</a>
      </Encabezado>
      <Estado carga={impacto}>
        {(i) => {
          const maxSemana = Math.max(1, ...i.kgPorSemana);
          const hoy = i.alertas;
          return (
            <>
              <section className="kpis">
                <div className="kpi"><small>Kilos rescatados</small><b>{Math.round(i.kgRescatados).toLocaleString('es-PE')}</b><span className="delta">{i.comedoresAtendidos} comedores atendidos</span></div>
                <div className="kpi"><small>Raciones equivalentes*</small><b>{i.racionesEquivalentes.toLocaleString('es-PE')}</b><span className="delta">1 ración ≈ {String(i.kgPorRacion).replace('.', ',')} kg</span></div>
                <div className="kpi"><small>Recogidas antes de vencer</small><b>{i.porcentajeAntesDeVencer === null ? '—' : `${i.porcentajeAntesDeVencer} %`}</b><span className="delta">{i.porEstado.recogida} recogidas · {i.porEstado.vencida} vencidas</span></div>
                <div className="kpi"><small>Tiempo medio publicar → recoger</small><b>{duracion(i.tiempoMedioMin)}</b><span className="delta">en las recogidas del período</span></div>
              </section>

              <section className="grid2" style={{ marginTop: 16 }}>
                <div className="card">
                  <div className="row between">
                    <h2 style={{ fontSize: 19 }}>Kilos rescatados por semana</h2>
                    <div className="legend"><span><i className="dot" style={{ color: 'var(--g500)' }} /> Rescatado</span><span><i className="dot" style={{ color: 'var(--amber)' }} /> Semana actual</span></div>
                  </div>
                  <div className="bars" role="img" aria-label={`Kilos por semana: ${i.kgPorSemana.join(', ')}`}>
                    {i.kgPorSemana.map((k, n) => (
                      <div key={n}>
                        <span>{Math.round(k)}</span>
                        <i className={n === 3 ? 'hi' : ''} style={{ height: `${Math.max(3, (k / maxSemana) * 100)}%` }} />
                        S{n + 1}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <h2 style={{ fontSize: 19 }}>Alertas</h2>
                  <div className="stack" style={{ marginTop: 12 }}>
                    <div className="row"><span className={`sem ${hoy.vencenPronto > 0 ? 'r' : 'g'}`} /><div className="small grow"><b>{hoy.vencenPronto} donaciones vencen en 3 días o menos</b><br />{hoy.vencenProntoSinComedor} aún sin comedor asignado</div></div>
                    {hoy.comedoresSinActividad.length === 0 ? (
                      <div className="row"><span className="sem g" /><div className="small grow"><b>Todos los comedores activos</b><br />tienen actividad reciente</div></div>
                    ) : (
                      hoy.comedoresSinActividad.slice(0, 3).map((c) => (
                        <div className="row" key={c.comedorId}><span className="sem y" /><div className="small grow"><b>{c.nombre}</b><br />{c.dias === null ? 'sin actividad registrada' : `sin actividad hace ${c.dias} días`}</div></div>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <section className="grid3" style={{ marginTop: 16 }}>
                <div className="card"><div className="muted small">Comedores activos</div><b style={{ fontFamily: 'var(--serif)', fontSize: 30 }}>{i.comedoresActivos}</b></div>
                <div className="card"><div className="muted small">Comercios activos</div><b style={{ fontFamily: 'var(--serif)', fontSize: 30 }}>{i.comerciosActivos}</b> <Chip tono="gray">{i.comerciosDonantes} donaron en el período</Chip></div>
                <div className="card"><div className="muted small">Donaciones publicadas</div><b style={{ fontFamily: 'var(--serif)', fontSize: 30 }}>{i.donacionesPublicadas}</b> <Chip tono="gray">{i.porEstado.publicada + i.porEstado.reservada} abiertas</Chip></div>
              </section>
            </>
          );
        }}
      </Estado>

      <div className="row between" style={{ margin: '22px 0 10px' }}>
        <h2 style={{ fontSize: 20 }}>Actividad reciente</h2>
        <a href="#/eventos" style={{ color: 'var(--g700)', fontWeight: 600 }}>Ver registro completo →</a>
      </div>
      <Estado carga={eventos}>
        {(lista) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fecha y hora</th><th>Actor</th><th>Acción</th><th>Detalle</th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}><td>{fechaHora(e.fecha)}</td><td>{e.actor}</td><td><Chip tono={tonoAccion(e.accion)}>{e.accion}</Chip></td><td>{e.detalle}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Estado>
      <p className="hint">* Equivalencia de raciones: supuesto de demostración (1 ración ≈ 0,5 kg). Todas las cifras salen de datos sintéticos.</p>
    </>
  );
}
