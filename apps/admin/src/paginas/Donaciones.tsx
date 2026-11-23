import { Fragment, useState } from 'react';
import { api } from '../api.ts';
import { Chip, Encabezado, Estado, nombreEstado, tonoEstado } from '../componentes.tsx';
import { useCarga } from '../carga.ts';
import { ICONO, cantidadTexto, claseSemaforo, fechaHora, textoVence } from '../formato.ts';

const FILTROS = [
  { id: '', etiqueta: 'Todas' },
  { id: 'publicada', etiqueta: 'Publicadas' },
  { id: 'reservada', etiqueta: 'Reservadas' },
  { id: 'recogida', etiqueta: 'Recogidas' },
  { id: 'vencida', etiqueta: 'Vencidas' },
];

const COMPONENTES = [
  { clave: 'urgencia', etiqueta: 'Urgencia' },
  { clave: 'cercania', etiqueta: 'Cercanía' },
  { clave: 'necesidad', etiqueta: 'Necesidad' },
  { clave: 'capacidad', etiqueta: 'Capacidad' },
] as const;

/** Ranking de comedores para una donación, con el puntaje explicado y la opción de asignarla a mano. */
function Sugerencias({ donacionId, alAsignar }: { donacionId: number; alAsignar: () => void }) {
  const sugerencias = useCarga(() => api.sugerencias(donacionId), [donacionId]);
  const [error, setError] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<number | null>(null);

  const asignar = async (comedorId: number) => {
    setError(null);
    setAsignando(comedorId);
    try {
      await api.reasignar(donacionId, comedorId);
      alAsignar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo asignar.');
    } finally {
      setAsignando(null);
    }
  };

  return (
    <Estado carga={sugerencias}>
      {(lista) => (
        <div style={{ padding: '6px 4px' }}>
          <div className="small muted" style={{ marginBottom: 8 }}>
            puntaje = 0,35·urgencia + 0,25·cercanía + 0,25·necesidad + 0,15·capacidad. Los comedores no elegibles aparecen al final.
          </div>
          {error && <div className="card" role="alert" style={{ background: 'var(--red-100)', marginBottom: 8 }}>{error}</div>}
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {lista.slice(0, 6).map((s, n) => (
              <div className="card" key={s.comedorId} style={{ padding: 12, opacity: s.elegible ? 1 : 0.6 }}>
                <div className="row between">
                  <b>{n + 1}. {s.nombre.replace('Comedor ', '')}</b>
                  {s.elegible ? <Chip tono="green">{s.puntaje} / 100</Chip> : <Chip tono="red">No elegible</Chip>}
                </div>
                <div className="tiny muted">{s.zona} · {String(s.distanciaKm).replace('.', ',')} km</div>
                {COMPONENTES.map((c) => (
                  <div className="bar-row" key={c.clave} style={{ gridTemplateColumns: '70px 1fr 28px' }}>
                    <span>{c.etiqueta}</span>
                    <div className="progress"><i style={{ width: `${s.componentes[c.clave]}%` }} /></div>
                    <b>{s.componentes[c.clave]}</b>
                  </div>
                ))}
                {s.motivoNoElegible ? (
                  <p className="tiny" style={{ color: 'var(--red)', marginTop: 6 }}>{s.motivoNoElegible}</p>
                ) : (
                  <button className="btn amber sm" type="button" style={{ marginTop: 10 }} disabled={asignando !== null} onClick={() => asignar(s.comedorId)}>
                    {asignando === s.comedorId ? 'Asignando…' : 'Asignar a este comedor'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Estado>
  );
}

export function Donaciones() {
  const [estado, setEstado] = useState('');
  const [abierta, setAbierta] = useState<number | null>(null);
  const donaciones = useCarga(api.donaciones, [], 10_000);
  const comercios = useCarga(api.comercios);
  const comedores = useCarga(api.comedores);
  const ahora = new Date();

  return (
    <>
      <Encabezado supra="Operación" titulo="Donaciones" />
      <Estado carga={donaciones}>
        {(todas) => {
          const cuenta = (id: string) => (id ? todas.filter((d) => d.estado === id).length : todas.length);
          const lista = todas.filter((d) => !estado || d.estado === estado);
          return (
            <>
              <div className="seg" role="tablist" style={{ maxWidth: 560, marginBottom: 16 }}>
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={estado === f.id} className={estado === f.id ? 'on' : ''} onClick={() => setEstado(f.id)}>
                    {f.etiqueta} ({cuenta(f.id)})
                  </button>
                ))}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Código</th><th>Producto</th><th>Comercio</th><th>Caducidad</th><th>Estado</th><th>Comedor</th><th>Recogida</th><th /></tr></thead>
                  <tbody>
                    {lista.length === 0 && <tr><td colSpan={8} className="muted">No hay donaciones en este estado.</td></tr>}
                    {lista.map((d) => {
                      const abierto = d.estado === 'publicada' || d.estado === 'reservada';
                      const sinComedor = d.estado === 'publicada';
                      return (
                        <Fragment key={d.id}>
                          <tr>
                            <td>{d.codigo}</td>
                            <td>{ICONO[d.categoria]} {d.producto} · {cantidadTexto(d.cantidad, d.unidad)}</td>
                            <td>{comercios.datos?.find((c) => c.id === d.comercioId)?.nombre ?? '—'}</td>
                            <td>{abierto ? <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span> : fechaHora(d.caducaEn)}</td>
                            <td><Chip tono={tonoEstado(d.estado)}>{nombreEstado(d.estado)}</Chip>{sinComedor && d.nivelCaducidad === 'rojo' && <> <Chip tono="red">Sin comedor</Chip></>}</td>
                            <td>{comedores.datos?.find((c) => c.id === d.comedorId)?.nombre ?? '—'}</td>
                            <td>{d.recogidaEn ? `${fechaHora(d.recogidaEn)} · ${d.cantidadRecibida !== null ? cantidadTexto(d.cantidadRecibida, d.unidad) : ''}` : '—'}</td>
                            <td>
                              {sinComedor && (
                                <button className="btn ghost sm" type="button" aria-expanded={abierta === d.id} onClick={() => setAbierta(abierta === d.id ? null : d.id)}>
                                  {abierta === d.id ? 'Ocultar' : 'Sugerencias'}
                                </button>
                              )}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {abierta !== null && lista.some((d) => d.id === abierta && d.estado === 'publicada') && (
                <section className="why" style={{ marginTop: 16 }} aria-live="polite">
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <h2 style={{ fontSize: 18 }}>Sugerencias para {todas.find((d) => d.id === abierta)?.codigo}</h2>
                    <button className="btn ghost sm" type="button" onClick={() => setAbierta(null)}>Cerrar</button>
                  </div>
                  <Sugerencias donacionId={abierta} alAsignar={() => { setAbierta(null); donaciones.recargar(); }} />
                </section>
              )}
            </>
          );
        }}
      </Estado>
    </>
  );
}
