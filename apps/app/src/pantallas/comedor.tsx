import type { Comedor, Comercio } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api, type DonacionN } from '../api.ts';
import { Cabecera, Chip, Estado, Marco, type Pestana } from '../componentes.tsx';
import { ICONO, NOMBRE_CATEGORIA, cantidadTexto, claseSemaforo, distanciaKm, fechaHora, hora, km, textoVence } from '../formato.ts';
import { ir, useCarga, type Sesion } from '../sesion.ts';

const PESTANAS: Pestana[] = [
  { etiqueta: 'Ofertas', icono: '◎', ruta: '/comedor' },
  { etiqueta: 'Reservas', icono: '✓', ruta: '/comedor/reservas' },
  { etiqueta: 'Salir', icono: '⇄', ruta: '/' },
];

function useDatosComedor(sesion: Sesion, id?: number) {
  const comedores = useCarga(api.comedores);
  const comercios = useCarga(api.comercios);
  const donaciones = useCarga(() => api.donaciones(), [id]);
  return { comedores, comercios, donaciones, comedor: comedores.datos?.find((c) => c.id === sesion.id) };
}

export function ComedorOfertas({ sesion }: { sesion: Sesion }) {
  const { comedor, comercios, donaciones } = useDatosComedor(sesion);
  const ahora = new Date();

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

      <div className="section-title"><h2>Disponibles, lo más urgente primero</h2></div>
      <Estado carga={donaciones}>
        {(todas) => {
          const publicadas = todas.filter((d) => d.estado === 'publicada').sort((a, b) => a.caducaEn.localeCompare(b.caducaEn));
          if (publicadas.length === 0) return <p className="muted">No hay donaciones disponibles por ahora.</p>;
          return (
            <div className="stack">
              {publicadas.map((d) => {
                const comercio = comercios.datos?.find((c) => c.id === d.comercioId);
                const incompatible = d.requiereFrio && comedor && !comedor.refrigeracion;
                return (
                  <a key={d.id} href={`#/comedor/donacion/${d.id}`} className="card" style={{ display: 'block', opacity: incompatible ? 0.6 : 1 }}>
                    <div className="row">
                      <div className="thumb" aria-hidden="true">{ICONO[d.categoria]}</div>
                      <div className="grow">
                        <b>{d.producto} · {cantidadTexto(d.cantidad, d.unidad)}</b>
                        <div className="small muted">
                          {comercio?.nombre ?? 'Comercio'}{comercio && comedor ? ` · ${km(distanciaKm(comedor, comercio))}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                      <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span>
                      {comedor?.necesidades.includes(d.categoria) && <Chip tono="green">Necesidad prioritaria</Chip>}
                      {d.requiereFrio && <Chip tono={incompatible ? 'red' : 'blue'}>{incompatible ? 'Requiere frío (no disponible)' : 'Requiere frío'}</Chip>}
                      <Chip tono="gray">Recojo hasta {hora(d.ventanaHasta)}</Chip>
                    </div>
                  </a>
                );
              })}
            </div>
          );
        }}
      </Estado>
    </Marco>
  );
}

export function ComedorDonacion({ sesion, id }: { sesion: Sesion; id: number }) {
  const { comedor, comercios } = useDatosComedor(sesion, id);
  const donacion = useCarga(() => api.donacion(id), [id]);
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
      ir('/comedor/reservas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reservar.');
      donacion.recargar();
    } finally {
      setEnviando(false);
    }
  };

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
              <div className="row between" style={{ marginTop: 14 }}>
                <h1 style={{ fontSize: 24 }}>{d.producto} · {cantidadTexto(d.cantidad, d.unidad)}</h1>
              </div>
              <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span>
                <Chip tono="gray">{NOMBRE_CATEGORIA[d.categoria]}</Chip>
                {d.requiereFrio && <Chip tono="blue">Requiere frío</Chip>}
              </div>
              <div className="small muted" style={{ marginTop: 8 }}>
                {comercio?.nombre ?? 'Comercio'}{comercio && comedor ? ` · ${km(distanciaKm(comedor, comercio))}` : ''} · recojo hasta {hora(d.ventanaHasta)}
              </div>
              {comercio && <div className="small muted">{comercio.direccion}</div>}

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

export function ComedorReservas({ sesion }: { sesion: Sesion }) {
  const { comedor, comercios, donaciones } = useDatosComedor(sesion);
  const ahora = new Date();

  return (
    <Marco pestanas={PESTANAS} activa="/comedor/reservas">
      <div className="top"><b style={{ fontSize: 20, fontFamily: 'var(--serif)' }}>Mis reservas</b></div>
      <Estado carga={donaciones}>
        {(todas) => {
          const mias = todas.filter((d) => d.comedorId === sesion.id);
          const porRecoger = mias.filter((d) => d.estado === 'reservada').sort((a, b) => a.caducaEn.localeCompare(b.caducaEn));
          const anteriores = mias.filter((d) => d.estado === 'recogida').sort((a, b) => (b.recogidaEn ?? '').localeCompare(a.recogidaEn ?? '')).slice(0, 6);
          return (
            <>
              {porRecoger.length === 0 && <p className="muted small">No tienes reservas pendientes. Mira las ofertas disponibles.</p>}
              <div className="stack">
                {porRecoger.map((d) => (
                  <TarjetaReserva key={d.id} d={d} comedor={comedor} comercio={comercios.datos?.find((c) => c.id === d.comercioId)} ahora={ahora} alCambiar={donaciones.recargar} />
                ))}
              </div>
              {anteriores.length > 0 && (
                <>
                  <div className="section-title"><h2>Anteriores</h2></div>
                  <div className="stack">
                    {anteriores.map((d) => (
                      <div className="list-item" key={d.id}>
                        <div className="thumb" aria-hidden="true">{ICONO[d.categoria]}</div>
                        <div className="grow">
                          <b>{d.producto} · {cantidadTexto(d.cantidadRecibida ?? d.cantidad, d.unidad)}</b>
                          <div className="small muted">{d.recogidaEn ? fechaHora(d.recogidaEn) : ''}</div>
                        </div>
                        <Chip tono="green">✓ Recogida</Chip>
                      </div>
                    ))}
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

function TarjetaReserva({ d, comedor, comercio, ahora, alCambiar }: { d: DonacionN; comedor?: Comedor; comercio?: Comercio; ahora: Date; alCambiar: () => void }) {
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
          <b>{d.producto} · {cantidadTexto(d.cantidad, d.unidad)}</b>
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
          <span>Cantidad recibida ({d.unidad})</span>
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
        <p className="hint">Se registrará quién recibió el alimento y la hora, para la trazabilidad.</p>
      </form>
    </section>
  );
}
