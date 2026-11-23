import { STOCK_MINIMO, type ProductoInventario } from '@ayni/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Chip, Estado, Marco } from '../componentes.tsx';
import { ICONO, cantidadTexto, claseSemaforo, fechaHora, textoVence } from '../formato.ts';
import { useCarga, type Sesion } from '../sesion.ts';
import { PESTANAS_COMEDOR as PESTANAS } from './pestanas.ts';

type Nivel = 'vencido' | 'rojo' | 'amarillo' | 'verde' | 'sin-fecha';
const semaforo = (n: Nivel) => (n === 'sin-fecha' ? null : claseSemaforo(n));
const clave = (p: Pick<ProductoInventario, 'producto' | 'unidad'>) => `${p.producto}|${p.unidad}`;

/**
 * Inventario del comedor. El stock no se escribe a mano: sube solo cuando se recoge una donación
 * y baja solo cuando se registra lo consumido. Por debajo de 10 se marca en rojo.
 */
export function ComedorInventario({ sesion }: { sesion: Sesion }) {
  const inv = useCarga(() => api.inventario(sesion.id), [sesion.id], 8_000);
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [vista, setVista] = useState<'stock' | 'bajo'>('stock');
  const [aviso, setAviso] = useState<{ texto: string; alerta: boolean } | null>(null);
  const ahora = new Date();

  const consumir = (k: string | null) => {
    setElegido(k);
    setAbierto(true);
  };

  const listo = (texto: string, alerta: boolean) => {
    setAbierto(false);
    setAviso({ texto, alerta });
    inv.recargar();
  };

  return (
    <Marco pestanas={PESTANAS} activa="/comedor/inventario">
      <div className="top">
        <b style={{ fontSize: 20, fontFamily: 'var(--serif)' }}>Inventario</b>
      </div>
      <p className="small muted" style={{ marginTop: -6, marginBottom: 12 }}>
        El stock sube solo cuando recoges una donación y baja solo cuando registras lo que consumes. Mínimo: <b>{STOCK_MINIMO}</b>; por debajo se marca en rojo.
      </p>

      <button className="btn red block grande" type="button" aria-expanded={abierto} onClick={() => (abierto ? setAbierto(false) : consumir(null))}>
        − Registrar consumo
      </button>

      {aviso && <div className={`aviso ${aviso.alerta ? 'error' : 'ok'}`} role="status" style={{ marginTop: 12 }}>{aviso.alerta ? '⚠️' : '✓'} {aviso.texto}</div>}

      <Estado carga={inv}>
        {(d) => {
          const enStock = d.productos.filter((p) => p.total > 0);
          const bajos = d.productos.filter((p) => p.bajoMinimo);
          const lista = vista === 'bajo' ? bajos : enStock;
          return (
            <>
              {abierto && <FormConsumo key={elegido ?? 'ninguno'} comedorId={sesion.id} productos={enStock} inicial={elegido} alGuardar={listo} />}

              <div className="stat-grid" style={{ marginTop: 14 }} role="group" aria-label="Qué productos ver">
                <button type="button" className={`stat-btn ${vista === 'bajo' ? 'on' : ''}`} aria-pressed={vista === 'bajo'} onClick={() => setVista('bajo')}>
                  <b style={{ color: bajos.length > 0 ? 'var(--red)' : undefined }}>{bajos.length}</b>
                  <span>Productos bajo {STOCK_MINIMO}</span>
                </button>
                <button type="button" className={`stat-btn ${vista === 'stock' ? 'on' : ''}`} aria-pressed={vista === 'stock'} onClick={() => setVista('stock')}>
                  <b>{enStock.length}</b>
                  <span>Productos en stock</span>
                </button>
              </div>

              <div className="section-title">
                <h2>{vista === 'bajo' ? `Productos bajo ${STOCK_MINIMO}` : 'Productos en stock'} ({lista.length})</h2>
              </div>
              <div className="stack" aria-live="polite">
                {lista.length === 0 && (
                  <p className="muted small">
                    {vista === 'bajo' ? `Ningún producto está por debajo de ${STOCK_MINIMO}. ¡Todo en orden!` : 'Todavía no hay productos. Aparecerán cuando recojas una donación.'}
                  </p>
                )}
                {lista.map((p) => {
                  const s = semaforo(p.nivelCaducidad);
                  const lotes = d.lotes.filter((l) => clave(l) === clave(p));
                  return (
                    <div className="card" key={clave(p)} style={{ padding: 12, borderColor: p.bajoMinimo ? 'var(--red)' : undefined, background: p.bajoMinimo ? 'var(--red-100)' : undefined }}>
                      <div className="row">
                        <div className="thumb" aria-hidden="true">{ICONO[p.categoria]}</div>
                        <div className="grow">
                          <b>{p.producto}</b>
                          <div className="small" style={{ color: p.bajoMinimo ? 'var(--red)' : 'var(--muted)', fontWeight: p.bajoMinimo ? 700 : 400 }}>
                            {cantidadTexto(p.total, p.unidad, p.producto)}{p.lotes > 1 ? ` · ${p.lotes} lotes` : ''}
                          </div>
                          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
                            {p.bajoMinimo && <Chip tono="red">{p.total === 0 ? 'Agotado' : `Stock bajo: menos de ${STOCK_MINIMO}`}</Chip>}
                            {s && p.proximaCaducidad && <span className={`sem ${s}`}>{textoVence(p.proximaCaducidad, ahora)}</span>}
                          </div>
                        </div>
                        {p.total > 0 && <button className="btn sm ghost" type="button" onClick={() => consumir(clave(p))} aria-label={`Registrar consumo de ${p.producto}`}>Consumir</button>}
                      </div>
                      {lotes.length > 1 && (
                        <details style={{ marginTop: 8 }}>
                          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Ver los {lotes.length} lotes (se usa primero el que vence antes)</summary>
                          <div className="stack" style={{ marginTop: 8 }}>
                            {lotes.map((l) => {
                              const sl = semaforo(l.nivelCaducidad);
                              return (
                                <div className="row between small" key={l.id}>
                                  <span>{cantidadTexto(l.cantidad, l.unidad, l.producto)} · {l.origen === 'donacion' ? 'de una donación' : 'inventario inicial'} · entró {fechaHora(l.creadoEn)}</span>
                                  {sl ? <span className={`sem ${sl}`}>{l.caducaEn ? textoVence(l.caducaEn, ahora) : ''}</span> : <Chip tono="gray">Sin fecha</Chip>}
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          );
        }}
      </Estado>
    </Marco>
  );
}

function FormConsumo({ comedorId, productos, inicial, alGuardar }: { comedorId: number; productos: ProductoInventario[]; inicial: string | null; alGuardar: (texto: string, alerta: boolean) => void }) {
  const [k, setK] = useState(inicial && productos.some((p) => clave(p) === inicial) ? inicial : productos[0] ? clave(productos[0]) : '');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const p = productos.find((x) => clave(x) === k);
  const formulario = useRef<HTMLFormElement>(null);

  // Al abrirse, el formulario se muestra solo aunque se haya tocado "Consumir" al final de la lista.
  useEffect(() => {
    formulario.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, []);

  if (productos.length === 0) return <div className="aviso" style={{ margin: '14px 0' }}>No hay productos en stock para registrar un consumo.</div>;

  const n = Number(cantidad);
  const quedaria = p && Number.isFinite(n) ? Math.round((p.total - n) * 1000) / 1000 : null;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!p) return;
    setError(null);
    setEnviando(true);
    try {
      const r = await api.consumo(comedorId, { producto: p.producto, unidad: p.unidad, cantidad: n, motivo: motivo || undefined });
      const bajo = r.quedan < STOCK_MINIMO;
      alGuardar(`Consumo registrado: ${cantidadTexto(n, p.unidad, p.producto)} de ${p.producto}. ${r.quedan === 0 ? 'Se agotó.' : `Quedan ${cantidadTexto(r.quedan, p.unidad, p.producto)}.`}${bajo ? ' Stock bajo.' : ''}`, bajo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form ref={formulario} className="card stack" style={{ margin: '14px 0', scrollMarginTop: 8 }} onSubmit={enviar}>
      <b>Registrar lo que consumiste</b>
      <label className="field">
        <span>Producto</span>
        <select className="input" value={k} onChange={(e) => setK(e.target.value)}>
          {productos.map((x) => <option key={clave(x)} value={clave(x)}>{x.producto} (hay {cantidadTexto(x.total, x.unidad, x.producto)})</option>)}
        </select>
      </label>
      <label className="field">
        <span>Cantidad consumida ({p ? (p.unidad === 'unidades' ? 'unidades' : p.unidad) : ''})</span>
        <input className="input" type="number" min="1" step="1" inputMode="numeric" max={p?.total} value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
      </label>
      {p && quedaria !== null && quedaria >= 0 && (
        <div className="small" style={{ color: quedaria < STOCK_MINIMO ? 'var(--red)' : 'var(--muted)', fontWeight: quedaria < STOCK_MINIMO ? 700 : 400 }}>
          Quedarán {cantidadTexto(quedaria, p.unidad, p.producto)}{quedaria < STOCK_MINIMO ? `: por debajo del mínimo de ${STOCK_MINIMO}` : ''}.
        </div>
      )}
      <label className="field"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: almuerzo del martes" /></label>
      <p className="hint">El stock se resta solo; no escribes cuánto queda. Se descuenta primero lo que vence antes.</p>
      {error && <div className="aviso error" role="alert">{error}</div>}
      <button className="btn block" disabled={enviando || !p} type="submit">{enviando ? 'Guardando…' : 'Registrar consumo'}</button>
    </form>
  );
}
