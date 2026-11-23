import { CATEGORIAS, type Categoria, type Comedor, type ComedorPerfil, type Comercio, type Sugerencia } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api, type DonacionN } from '../api.ts';
import { Cabecera, Chip, Estado, Marco } from '../componentes.tsx';
import { ICONO, NOMBRE_CATEGORIA, cantidadTexto, claseSemaforo, distanciaKm, fechaHora, hora, km, textoVence } from '../formato.ts';
import { ir, useCarga, type Sesion } from '../sesion.ts';
import { PESTANAS_COMEDOR as PESTANAS } from './pestanas.ts';

const COMPONENTES: { clave: keyof Sugerencia['componentes']; etiqueta: string }[] = [
  { clave: 'urgencia', etiqueta: 'Urgencia' },
  { clave: 'cercania', etiqueta: 'Cercanía' },
  { clave: 'necesidad', etiqueta: 'Necesidad' },
  { clave: 'capacidad', etiqueta: 'Capacidad' },
];

function Puntaje({ valor, elegible }: { valor: number; elegible: boolean }) {
  return (
    <div className="score" style={{ ['--p' as string]: elegible ? valor : 0 }} aria-label={elegible ? `Puntaje ${valor} de 100` : 'No disponible para tu comedor'}>
      <span>{elegible ? valor : '—'}</span>
    </div>
  );
}

/** Lo que el comedor declara sobre sí mismo (raciones, frío y horario). El emparejamiento lo usa para calcular la capacidad. */
function DatosComedor({ comedor, alGuardar }: { comedor: Comedor; alGuardar: (cambios: Partial<ComedorPerfil>) => Promise<void> }) {
  const [raciones, setRaciones] = useState(String(comedor.racionesDia));
  const [frio, setFrio] = useState(comedor.refrigeracion);
  const [horario, setHorario] = useState(comedor.horarioRecojo);
  const [listo, setListo] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setListo(false);
    await alGuardar({ racionesDia: Number(raciones), refrigeracion: frio, horarioRecojo: horario });
    setListo(true);
  };

  return (
    <form className="stack" style={{ marginTop: 10 }} onSubmit={guardar}>
      <label className="field"><span>Raciones por día</span><input className="input" type="number" min="1" value={raciones} onChange={(e) => { setRaciones(e.target.value); setListo(false); }} required /></label>
      <div className="checks"><label><input type="checkbox" checked={frio} onChange={(e) => { setFrio(e.target.checked); setListo(false); }} /> Tenemos refrigeración</label></div>
      <label className="field"><span>Horario de recojo</span><input className="input" value={horario} onChange={(e) => { setHorario(e.target.value); setListo(false); }} required minLength={3} /></label>
      <button className="btn sm" type="submit">Guardar datos</button>
      {listo && <div className="aviso ok" role="status">✓ Datos guardados. Tus ofertas ya los usan.</div>}
    </form>
  );
}

export function ComedorOfertas({ sesion }: { sesion: Sesion }) {
  const comedores = useCarga(api.comedores);
  const ofertas = useCarga(() => api.ofertas(sesion.id), [sesion.id], 10_000);
  const comedor = comedores.datos?.find((c) => c.id === sesion.id);
  const [soloLoMio, setSoloLoMio] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorPref, setErrorPref] = useState<string | null>(null);
  const ahora = new Date();

  /** Guarda lo que el comedor busca (y sus datos) y vuelve a ordenar las ofertas con el puntaje nuevo. */
  const guardarPerfil = async (cambios: Partial<ComedorPerfil>) => {
    if (!comedor) return;
    setGuardando(true);
    setErrorPref(null);
    try {
      await api.perfil(sesion.id, {
        necesidades: comedor.necesidades,
        racionesDia: comedor.racionesDia,
        refrigeracion: comedor.refrigeracion,
        horarioRecojo: comedor.horarioRecojo,
        ...cambios,
      });
      comedores.recargar();
      ofertas.recargar();
    } catch (e) {
      setErrorPref(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const alternar = (c: Categoria) => {
    if (!comedor) return;
    const n = comedor.necesidades.includes(c) ? comedor.necesidades.filter((x) => x !== c) : [...comedor.necesidades, c];
    void guardarPerfil({ necesidades: n });
  };

  return (
    <Marco pestanas={PESTANAS} activa="/comedor">
      <div className="top">
        <div className="row">
          <div className="avatar" style={{ background: 'var(--amber)', color: '#2b1604' }} aria-hidden="true">{comedor?.nombre.replace('Comedor ', '').charAt(0) ?? '?'}</div>
          <div>
            <div className="tiny muted">Comedor popular</div>
            <b>{comedor?.nombre ?? 'Comedor'}</b>
          </div>
        </div>
      </div>

      <section className="card" aria-labelledby="busco">
        <h2 id="busco" style={{ fontSize: 17 }}>¿Qué buscas?</h2>
        <p className="small muted" style={{ margin: '4px 0 10px' }}>Toca lo que necesitas: tus ofertas se ordenan según lo que elijas.</p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIAS.map((c) => {
            const activa = comedor?.necesidades.includes(c) ?? false;
            return (
              <button key={c} type="button" aria-pressed={activa} disabled={!comedor || guardando} className={`chip ${activa ? 'green' : 'gray'}`} style={{ border: 0, cursor: 'pointer', padding: '7px 12px' }} onClick={() => alternar(c)}>
                {ICONO[c]} {NOMBRE_CATEGORIA[c]}{activa ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
        <div className="checks" style={{ marginTop: 10 }}>
          <label><input type="checkbox" checked={soloLoMio} onChange={(e) => setSoloLoMio(e.target.checked)} /> Mostrar solo lo que busco</label>
        </div>
        {errorPref && <div className="aviso error" role="alert" style={{ marginTop: 8 }}>{errorPref}</div>}
        {comedor && (
          <details style={{ marginTop: 12 }}>
            <summary className="small" style={{ fontWeight: 700, cursor: 'pointer' }}>Datos de mi comedor</summary>
            <DatosComedor key={comedor.id} comedor={comedor} alGuardar={guardarPerfil} />
          </details>
        )}
      </section>

      <div className="section-title"><h2>Ofertas para ti</h2></div>
      <p className="small muted" style={{ marginTop: -4, marginBottom: 10 }}>Ordenadas por puntaje: urgencia, cercanía, necesidad y capacidad de tu comedor.</p>
      <Estado carga={ofertas}>
        {(lista) => {
          const filtradas = soloLoMio && comedor && comedor.necesidades.length > 0 ? lista.filter((o) => comedor.necesidades.includes(o.donacion.categoria)) : lista;
          if (filtradas.length === 0) {
            return <p className="muted">{lista.length > 0 ? 'Ninguna oferta coincide con lo que buscas ahora. Desmarca "solo lo que busco" para ver todas.' : 'No hay donaciones disponibles por ahora.'}</p>;
          }
          return (
            <div className="stack">
              {filtradas.map(({ donacion: d, comercio, sugerencia: s }) => (
                <a key={d.id} href={`#/comedor/donacion/${d.id}`} className="card" style={{ display: 'block', opacity: s.elegible ? 1 : 0.6 }}>
                  <div className="row">
                    <div className="thumb" aria-hidden="true">{ICONO[d.categoria]}</div>
                    <div className="grow">
                      <b>{d.producto} · {cantidadTexto(d.cantidad, d.unidad, d.producto)}</b>
                      <div className="small muted">{comercio.nombre} · {km(s.distanciaKm)}</div>
                    </div>
                    <Puntaje valor={s.puntaje} elegible={s.elegible} />
                  </div>
                  <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                    <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span>
                    {s.componentes.necesidad >= 70 && <Chip tono="green">{s.componentes.necesidad === 100 ? 'Lo que buscas' : 'Te queda poco'}</Chip>}
                    {d.requiereFrio && <Chip tono={s.elegible ? 'blue' : 'red'}>{s.elegible ? 'Requiere frío' : 'Requiere frío (no disponible)'}</Chip>}
                    <Chip tono="gray">Recojo hasta {hora(d.ventanaHasta)}</Chip>
                  </div>
                </a>
              ))}
            </div>
          );
        }}
      </Estado>
    </Marco>
  );
}

export function ComedorDonacion({ sesion, id }: { sesion: Sesion; id: number }) {
  const comedores = useCarga(api.comedores);
  const comercios = useCarga(api.comercios);
  const donacion = useCarga(() => api.donacion(id), [id]);
  const sugerencias = useCarga(() => api.sugerencias(id), [id]);
  const comedor = comedores.datos?.find((c) => c.id === sesion.id);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ahora = new Date();

  const reservar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.reservar(id, { comedorId: sesion.id, reservadoPor: nombre });
      ir('/comedor/notificaciones');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar.');
      donacion.recargar();
    } finally {
      setEnviando(false);
    }
  };

  const ranking = sugerencias.datos ?? [];
  const mia = ranking.find((s) => s.comedorId === sesion.id);
  const posicion = mia?.elegible ? ranking.filter((s) => s.elegible).findIndex((s) => s.comedorId === sesion.id) + 1 : 0;

  return (
    <Marco pestanas={PESTANAS} activa="/comedor">
      <Cabecera titulo="Detalle" atras="/comedor" />
      <Estado carga={donacion}>
        {(d) => {
          const comercio = comercios.datos?.find((c) => c.id === d.comercioId);
          const incompatible = d.requiereFrio && comedor && !comedor.refrigeracion;
          return (
            <>
              <div style={{ height: 130, borderRadius: 20, background: 'linear-gradient(135deg,#f4d9a8,#e8913a)', display: 'grid', placeItems: 'center', fontSize: 72 }} aria-hidden="true">
                {ICONO[d.categoria]}
              </div>
              <h1 style={{ fontSize: 24, marginTop: 14 }}>{d.producto} · {cantidadTexto(d.cantidad, d.unidad, d.producto)}</h1>
              <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span>
                <Chip tono="gray">{NOMBRE_CATEGORIA[d.categoria]}</Chip>
                {d.requiereFrio && <Chip tono="blue">Requiere frío</Chip>}
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {comercio?.nombre ?? 'Comercio'}{comercio && comedor ? ` · ${km(distanciaKm(comedor, comercio))}` : ''} · recojo hasta {hora(d.ventanaHasta)}
              </div>
              {comercio && <div className="small muted">{comercio.direccion}</div>}

              {mia && (
                <>
                  <div className="section-title">
                    <h2>¿Por qué te lo sugerimos?</h2>
                    <Chip tono={mia.elegible ? 'green' : 'red'}>{mia.elegible ? `${mia.puntaje} / 100` : 'No disponible'}</Chip>
                  </div>
                  <div className="why">
                    {COMPONENTES.map((c) => (
                      <div className="bar-row" key={c.clave}>
                        <span>{c.etiqueta}</span>
                        <div className="progress"><i style={{ width: `${mia.componentes[c.clave]}%` }} /></div>
                        <b>{mia.componentes[c.clave]}</b>
                      </div>
                    ))}
                    <ul className="small muted" style={{ paddingLeft: 18, marginTop: 10 }}>
                      {mia.razones.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    {mia.motivoNoElegible && <p className="small" style={{ color: 'var(--red)', marginTop: 6 }}>{mia.motivoNoElegible}</p>}
                  </div>
                  {posicion > 0 && (
                    <p className="small muted" style={{ marginTop: 8 }}>
                      Tu comedor es el n.º {posicion} de {ranking.filter((s) => s.elegible).length} comedores de la red para esta donación.
                    </p>
                  )}
                </>
              )}

              <div className="card" style={{ marginTop: 14 }}>
                <div className="row">
                  <span style={{ fontSize: 20 }} aria-hidden="true">🛡️</span>
                  <div className="small"><b>Seguridad alimentaria</b><br />Caduca el {fechaHora(d.caducaEn)}. Al recoger confirmas el estado del producto.</div>
                </div>
              </div>

              {d.estado === 'publicada' && !incompatible && (
                <form className="stack" style={{ marginTop: 16 }} onSubmit={reservar}>
                  <label className="field">
                    <span>¿Quién recogerá?</span>
                    <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la persona encargada" required minLength={2} />
                  </label>
                  {error && <div className="aviso error" role="alert">{error}</div>}
                  <button className="btn amber block" style={{ minHeight: 52, fontSize: 16 }} disabled={enviando} type="submit">
                    {enviando ? 'Reservando…' : 'Reservar para mi comedor'}
                  </button>
                </form>
              )}
              {incompatible && <div className="aviso error" style={{ marginTop: 16 }}>Este producto requiere refrigeración y tu comedor no la tiene.</div>}
              {d.estado !== 'publicada' && <div className="aviso" style={{ marginTop: 16 }}>Esta donación ya no está disponible ({d.estado}).</div>}
            </>
          );
        }}
      </Estado>
    </Marco>
  );
}

/** Una reserva pendiente: el comedor confirma la recogida cuando retira el producto. */
export function TarjetaReserva({ d, comedor, comercio, ahora, alCambiar }: { d: DonacionN; comedor?: Comedor; comercio?: Comercio; ahora: Date; alCambiar: () => void }) {
  const [estadoOk, setEstadoOk] = useState(false);
  const [cantidad, setCantidad] = useState(String(d.cantidad));
  const [quien, setQuien] = useState(d.reservadaPor ?? '');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.recoger(d.id, { comedorId: comedor?.id ?? 0, recogidoPor: quien, cantidadRecibida: Number(cantidad), estadoOk: estadoOk as true });
      alCambiar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar.');
      alCambiar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="card stack">
      <div className="row">
        <div className="thumb" aria-hidden="true">{ICONO[d.categoria]}</div>
        <div className="grow">
          <b>{d.producto} · {cantidadTexto(d.cantidad, d.unidad, d.producto)}</b>
          <div className="small muted">{comercio?.nombre ?? 'Comercio'}{comercio && comedor ? ` · ${km(distanciaKm(comedor, comercio))}` : ''}</div>
          <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)} · recoger hasta {hora(d.ventanaHasta)}</span>
        </div>
      </div>
      {d.codigoEntrega && (
        <div>
          <div className="small muted">Muestra este código al comercio</div>
          <div className="codigo">{d.codigoEntrega}</div>
          {comercio && <div className="small muted">📍 {comercio.direccion}</div>}
        </div>
      )}
      <form className="stack" onSubmit={confirmar}>
        <div className="small" style={{ fontWeight: 700 }}>Al recoger</div>
        <div className="checks">
          <label><input type="checkbox" checked={estadoOk} onChange={(e) => setEstadoOk(e.target.checked)} /> El producto está en buen estado</label>
        </div>
        <label className="field">
          <span>Cantidad recibida ({d.unidad === 'unidades' ? 'unidades' : d.unidad})</span>
          <input className="input" type="number" min="0.1" max={d.cantidad} step="0.1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
        </label>
        <label className="field">
          <span>Recibido por</span>
          <input className="input" value={quien} onChange={(e) => setQuien(e.target.value)} required minLength={2} />
        </label>
        {error && <div className="aviso error" role="alert">{error}</div>}
        <button className="btn block" style={{ minHeight: 48 }} disabled={enviando || !estadoOk} type="submit">
          {enviando ? 'Confirmando…' : 'Confirmar recogida'}
        </button>
        <p className="hint">Se registrará quién recibió el alimento y pasará solo a tu inventario.</p>
      </form>
    </section>
  );
}
