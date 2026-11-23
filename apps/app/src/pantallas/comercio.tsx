import { CATEGORIAS, UNIDADES, type Categoria, type Unidad } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api, type DonacionN } from '../api.ts';
import { Cabecera, Chip, Estado, Marco, nombreEstado, tonoEstado, type Pestana } from '../componentes.tsx';
import { ICONO, NOMBRE_CATEGORIA, aInputLocal, cantidadTexto, claseSemaforo, fechaHora, hora, textoVence } from '../formato.ts';
import { ir, useCarga, type Sesion } from '../sesion.ts';

const PESTANAS: Pestana[] = [
  { etiqueta: 'Inicio', icono: '⌂', ruta: '/comercio' },
  { etiqueta: 'Publicar', icono: '＋', ruta: '/comercio/publicar' },
  { etiqueta: 'Salir', icono: '⇄', ruta: '/' },
];

const DIAS_28 = 28 * 24 * 3_600_000;

export function ComercioInicio({ sesion }: { sesion: Sesion }) {
  const comercios = useCarga(api.comercios);
  const donaciones = useCarga(() => api.donaciones());
  const ahora = new Date();

  return (
    <Marco pestanas={PESTANAS} activa="/comercio">
      <Estado carga={comercios}>
        {(lista) => {
          const comercio = lista.find((c) => c.id === sesion.id);
          return (
            <div className="top">
              <div className="row">
                <div className="avatar" aria-hidden="true">{comercio?.nombre.charAt(0) ?? '?'}</div>
                <div>
                  <div className="tiny muted">Comercio</div>
                  <b>{comercio?.nombre ?? 'Comercio'}</b>
                </div>
              </div>
            </div>
          );
        }}
      </Estado>

      <Estado carga={donaciones}>
        {(todas) => {
          const mias = todas.filter((d) => d.comercioId === sesion.id);
          const recogidas = mias.filter((d) => d.estado === 'recogida' && ahora.getTime() - new Date(d.creadaEn).getTime() <= DIAS_28);
          const kg = recogidas.filter((d) => d.unidad === 'kg').reduce((s, d) => s + (d.cantidadRecibida ?? 0), 0);
          const activas = mias.filter((d) => d.estado === 'publicada' || d.estado === 'reservada').sort((a, b) => a.caducaEn.localeCompare(b.caducaEn));
          const cerradas = mias.filter((d) => d.estado === 'recogida' || d.estado === 'vencida').slice(0, 6);
          const sinDonar = mias.filter((d) => d.estado === 'vencida').length;

          return (
            <>
              <section className="hero">
                <div className="small muted">Lo que has rescatado en 4 semanas</div>
                <div className="big">{Math.round(kg)} kg</div>
                <div className="small">{recogidas.length} donaciones recogidas · {sinDonar} vencidas sin recoger</div>
              </section>
              <a href="#/comercio/publicar" className="btn amber block" style={{ marginTop: 14, minHeight: 52, fontSize: 16 }}>
                ＋ Publicar un producto por vencer
              </a>

              <div className="section-title"><h2>Tus donaciones activas</h2></div>
              <div className="stack">
                {activas.length === 0 && <p className="muted small">No tienes donaciones activas. ¡Publica la primera!</p>}
                {activas.map((d) => <FilaDonacion key={d.id} d={d} ahora={ahora} />)}
              </div>

              {cerradas.length > 0 && (
                <>
                  <div className="section-title"><h2>Historial reciente</h2></div>
                  <div className="stack">
                    {cerradas.map((d) => <FilaDonacion key={d.id} d={d} ahora={ahora} />)}
                  </div>
                </>
              )}
            </>
          );
        }}
      </Estado>
    </Marco>
  );
}

function FilaDonacion({ d, ahora }: { d: DonacionN; ahora: Date }) {
  const abierta = d.estado === 'publicada' || d.estado === 'reservada';
  return (
    <a href={`#/comercio/donacion/${d.id}`} className="list-item">
      <div className="thumb" aria-hidden="true">{ICONO[d.categoria]}</div>
      <div className="grow">
        <b>{d.producto}</b>
        <div className="small muted">{cantidadTexto(d.cantidad, d.unidad)} · {d.codigo}</div>
        <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
          {abierta && <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span>}
          <Chip tono={tonoEstado(d.estado)}>{nombreEstado(d.estado)}</Chip>
        </div>
      </div>
    </a>
  );
}

export function ComercioPublicar({ sesion }: { sesion: Sesion }) {
  const inicio = new Date();
  const [producto, setProducto] = useState('');
  const [categoria, setCategoria] = useState<Categoria>('panaderia');
  const [cantidad, setCantidad] = useState('10');
  const [unidad, setUnidad] = useState<Unidad>('kg');
  const [caduca, setCaduca] = useState(aInputLocal(new Date(inicio.getTime() + 6 * 3_600_000)));
  const [hasta, setHasta] = useState(aInputLocal(new Date(inicio.getTime() + 5 * 3_600_000)));
  const [frio, setFrio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [frase, setFrase] = useState('');
  const [creando, setCreando] = useState(false);
  const [avisos, setAvisos] = useState<string[] | null>(null);

  /** Convierte la frase en un borrador que rellena el formulario; el comercio lo revisa antes de publicar. */
  const crearBorrador = async () => {
    setError(null);
    setCreando(true);
    try {
      const b = await api.borrador(frase);
      setProducto(b.producto);
      setCategoria(b.categoria);
      setCantidad(b.cantidad === null ? '' : String(b.cantidad));
      setUnidad(b.unidad);
      setCaduca(aInputLocal(new Date(b.caducaEn)));
      setHasta(aInputLocal(new Date(b.ventanaHasta)));
      setFrio(b.requiereFrio);
      setAvisos(b.advertencias);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el borrador.');
    } finally {
      setCreando(false);
    }
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const creada = await api.publicar({
        comercioId: sesion.id,
        producto,
        categoria,
        cantidad: Number(cantidad),
        unidad,
        caducaEn: new Date(caduca).toISOString(),
        ventanaDesde: new Date().toISOString(),
        ventanaHasta: new Date(hasta).toISOString(),
        requiereFrio: frio,
      });
      ir(`/comercio/donacion/${creada.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Marco pestanas={PESTANAS} activa="/comercio/publicar">
      <Cabecera titulo="Nueva donación" atras="/comercio" />

      <section className="card" style={{ background: 'var(--amber-100)', borderColor: '#f0cfa3' }}>
        <div className="row">
          <span style={{ fontSize: 22 }} aria-hidden="true">✨</span>
          <b>Cuéntalo con tus palabras</b>
        </div>
        <label className="field" style={{ marginTop: 8 }}>
          <span className="sr-only">Describe la donación</span>
          <textarea className="input" value={frase} onChange={(e) => setFrase(e.target.value)} placeholder="Ej.: 20 kg de pan de ayer, recojo hasta las 6pm" />
        </label>
        <button type="button" className="btn amber block" style={{ marginTop: 10 }} disabled={creando || frase.trim().length < 3} onClick={crearBorrador}>
          {creando ? 'Leyendo…' : 'Crear borrador'}
        </button>
        <p className="hint">Rellena el formulario por ti. Siempre lo revisas antes de publicar.</p>
        {avisos && (
          <div className="aviso ok" role="status" style={{ marginTop: 10 }}>
            <b>Borrador creado: revísalo abajo.</b>
            {avisos.length > 0 && (
              <ul className="small" style={{ paddingLeft: 18, marginTop: 4 }}>
                {avisos.map((a) => <li key={a}>{a}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      <p className="small muted" style={{ textAlign: 'center', margin: '14px 0 4px' }}>— o llena el formulario —</p>
      <form className="stack" onSubmit={enviar}>
        <label className="field">
          <span>Producto</span>
          <input className="input" value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej.: Pan francés" required minLength={2} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{ICONO[c]} {NOMBRE_CATEGORIA[c]}</option>)}
          </select>
        </label>
        <div className="row">
          <label className="field grow">
            <span>Cantidad</span>
            <input className="input" type="number" min="0.1" step="0.1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
          </label>
          <label className="field grow">
            <span>Unidad</span>
            <select className="input" value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Fecha y hora de caducidad</span>
          <input className="input" type="datetime-local" value={caduca} onChange={(e) => setCaduca(e.target.value)} required />
        </label>
        <label className="field">
          <span>Recojo hasta</span>
          <input className="input" type="datetime-local" value={hasta} onChange={(e) => setHasta(e.target.value)} required />
        </label>
        <div className="checks">
          <label><input type="checkbox" checked={frio} onChange={(e) => setFrio(e.target.checked)} /> Requiere refrigeración</label>
        </div>
        <div className="why">
          <b className="small">🛡️ Seguridad alimentaria</b>
          <div className="small muted">No se pueden publicar productos ya vencidos. Al publicar aceptas la responsabilidad del estado del alimento.</div>
        </div>
        {error && <div className="aviso error err-form" role="alert">{error}</div>}
        <button className="btn block" style={{ minHeight: 50 }} disabled={enviando} type="submit">
          {enviando ? 'Publicando…' : 'Publicar donación'}
        </button>
      </form>
    </Marco>
  );
}

export function ComercioDonacion({ id }: { id: number }) {
  const donacion = useCarga(() => api.donacion(id), [id]);
  const comedores = useCarga(api.comedores);
  const ahora = new Date();

  return (
    <Marco pestanas={PESTANAS} activa="/comercio">
      <Cabecera titulo="Seguimiento" atras="/comercio" />
      <Estado carga={donacion}>
        {(d) => {
          const comedor = comedores.datos?.find((c) => c.id === d.comedorId);
          const abierta = d.estado === 'publicada' || d.estado === 'reservada';
          return (
            <>
              <div className="card row">
                <div className="thumb" aria-hidden="true">{ICONO[d.categoria]}</div>
                <div className="grow">
                  <h2 style={{ fontSize: 19 }}>{d.producto} · {cantidadTexto(d.cantidad, d.unidad)}</h2>
                  <div className="small muted">{d.codigo}</div>
                  {abierta && <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)} · {hora(d.caducaEn)}</span>}
                </div>
              </div>

              <div className="section-title"><h2>Estado</h2><Chip tono={tonoEstado(d.estado)}>{nombreEstado(d.estado)}</Chip></div>
              <ul className="timeline">
                <li><b>Publicada</b><div className="small muted">{fechaHora(d.creadaEn)}</div></li>
                {d.estado === 'vencida' && !d.reservadaEn ? (
                  <li><b>Venció sin comedor</b><div className="small muted">{fechaHora(d.caducaEn)}</div></li>
                ) : (
                  <li className={d.reservadaEn ? '' : 'todo'}>
                    <b className={d.reservadaEn ? '' : 'muted'}>Reservada{comedor ? ` por ${comedor.nombre}` : ''}</b>
                    <div className="small muted">{d.reservadaEn ? `${fechaHora(d.reservadaEn)} · ${d.reservadaPor ?? ''}` : 'Esperando un comedor…'}</div>
                  </li>
                )}
                {d.estado === 'vencida' && d.reservadaEn ? (
                  <li><b>Venció antes de recogerse</b><div className="small muted">{fechaHora(d.caducaEn)}</div></li>
                ) : d.estado !== 'vencida' || d.reservadaEn ? (
                  <li className={d.recogidaEn ? '' : 'todo'}>
                    <b className={d.recogidaEn ? '' : 'muted'}>Recogida</b>
                    <div className="small muted">
                      {d.recogidaEn && d.cantidadRecibida !== null ? `${fechaHora(d.recogidaEn)} · ${cantidadTexto(d.cantidadRecibida, d.unidad)} recibidos` : `Pendiente · hasta las ${hora(d.ventanaHasta)}`}
                    </div>
                  </li>
                ) : null}
              </ul>

              {d.codigoEntrega && d.estado === 'reservada' && (
                <div className="card" style={{ marginTop: 6 }}>
                  <div className="small muted">Código de entrega</div>
                  <div className="codigo">{d.codigoEntrega}</div>
                  <p className="hint">El comedor te lo mostrará al recoger. Queda registrado en la trazabilidad.</p>
                </div>
              )}
            </>
          );
        }}
      </Estado>
    </Marco>
  );
}
