import { CATEGORIAS, TIPOS_SALIDA, UNIDADES, type Categoria, type ProductoInventario, type TipoSalida, type Unidad } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Chip, Estado, Marco } from '../componentes.tsx';
import { ICONO, NOMBRE_CATEGORIA, aInputLocal, cantidadTexto, claseSemaforo, fechaHora, textoVence } from '../formato.ts';
import { useCarga, type Sesion } from '../sesion.ts';
import { PESTANAS_COMEDOR as PESTANAS } from './pestanas.ts';

const NOMBRE_TIPO: Record<TipoSalida, string> = { consumo: 'Consumo (se cocinó o sirvió)', merma: 'Merma (se echó a perder)', salida: 'Salida (se entregó a otro lugar)' };

type Nivel = 'vencido' | 'rojo' | 'amarillo' | 'verde' | 'sin-fecha';
const semaforo = (n: Nivel) => (n === 'sin-fecha' ? null : claseSemaforo(n));

export function ComedorInventario({ sesion }: { sesion: Sesion }) {
  const inv = useCarga(() => api.inventario(sesion.id), [sesion.id]);
  const [panel, setPanel] = useState<'entrada' | 'salida' | null>(null);
  const [vista, setVista] = useState<'productos' | 'lotes'>('productos');
  const [aviso, setAviso] = useState<string | null>(null);
  const ahora = new Date();

  const listo = (mensaje: string) => {
    setPanel(null);
    setAviso(mensaje);
    inv.recargar();
  };

  return (
    <Marco pestanas={PESTANAS} activa="/comedor/inventario">
      <div className="top">
        <b style={{ fontSize: 20, fontFamily: 'var(--serif)' }}>Inventario</b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" type="button" onClick={() => setPanel(panel === 'entrada' ? null : 'entrada')}>＋ Entrada</button>
          <button className="btn sm soft" type="button" onClick={() => setPanel(panel === 'salida' ? null : 'salida')}>− Salida</button>
        </div>
      </div>
      {aviso && <div className="aviso ok" role="status" style={{ marginBottom: 12 }}>✓ {aviso}</div>}

      <Estado carga={inv}>
        {(d) => (
          <>
            {panel === 'entrada' && <FormEntrada comedorId={sesion.id} alGuardar={listo} />}
            {panel === 'salida' && <FormSalida comedorId={sesion.id} productos={d.productos.filter((p) => p.total > 0)} alGuardar={listo} />}

            <div className="stat-grid">
              <div className="stat"><b>{Math.round(d.resumen.stockKg)} kg</b><span>Stock (sin contar lo vencido)</span></div>
              <div className="stat"><b style={{ color: d.resumen.lotesPorVencer + d.resumen.lotesVencidos > 0 ? 'var(--red)' : undefined }}>{d.resumen.lotesPorVencer + d.resumen.lotesVencidos}</b><span>Lotes por vencer o vencidos</span></div>
              <div className="stat"><b style={{ color: d.resumen.productosBajoMinimo > 0 ? 'var(--red)' : undefined }}>{d.resumen.productosBajoMinimo}</b><span>Productos bajo el mínimo</span></div>
              <div className="stat"><b>{d.productos.filter((p) => p.total > 0).length}</b><span>Productos en stock</span></div>
            </div>

            <div className="seg" role="tablist" style={{ marginTop: 14 }}>
              <button type="button" role="tab" aria-selected={vista === 'productos'} className={vista === 'productos' ? 'on' : ''} onClick={() => setVista('productos')}>Productos</button>
              <button type="button" role="tab" aria-selected={vista === 'lotes'} className={vista === 'lotes' ? 'on' : ''} onClick={() => setVista('lotes')}>Lotes (usar primero)</button>
            </div>

            {vista === 'productos' ? (
              <div className="stack" style={{ marginTop: 12 }}>
                {d.productos.length === 0 && <p className="muted small">Todavía no hay productos. Registra una entrada o recoge una donación.</p>}
                {d.productos.map((p) => (
                  <FilaProducto key={`${p.producto}|${p.unidad}`} p={p} comedorId={sesion.id} ahora={ahora} alCambiar={inv.recargar} />
                ))}
              </div>
            ) : (
              <div className="stack" style={{ marginTop: 12 }}>
                <p className="small muted">Al registrar un consumo se descuenta primero lo que vence antes (PEPS).</p>
                {d.lotes.map((l) => {
                  const s = semaforo(l.nivelCaducidad);
                  return (
                    <div className="list-item" key={l.id}>
                      <div className="thumb" aria-hidden="true">{ICONO[l.categoria]}</div>
                      <div className="grow">
                        <b>{l.producto}</b>
                        <div className="small muted">{cantidadTexto(l.cantidad, l.unidad)} · {l.origen === 'donacion' ? 'donación' : 'carga manual'} · entró {fechaHora(l.creadoEn)}</div>
                      </div>
                      {s ? <span className={`sem ${s}`}>{l.caducaEn ? textoVence(l.caducaEn, ahora) : ''}</span> : <Chip tono="gray">Sin fecha</Chip>}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Estado>
    </Marco>
  );
}

function FilaProducto({ p, comedorId, ahora, alCambiar }: { p: ProductoInventario; comedorId: number; ahora: Date; alCambiar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [minimo, setMinimo] = useState(String(p.minimo ?? ''));
  const [error, setError] = useState<string | null>(null);
  const s = semaforo(p.nivelCaducidad);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.minimo(comedorId, { producto: p.producto, unidad: p.unidad, minimo: Number(minimo || 0) });
      setEditando(false);
      alCambiar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  };

  return (
    <div className="card" style={{ padding: 12, borderColor: p.bajoMinimo ? 'var(--red)' : undefined }}>
      <div className="row">
        <div className="thumb" aria-hidden="true">{ICONO[p.categoria]}</div>
        <div className="grow">
          <b>{p.producto}</b>
          <div className="small muted">{cantidadTexto(p.total, p.unidad)} · {p.lotes} {p.lotes === 1 ? 'lote' : 'lotes'}{p.minimo !== null ? ` · mínimo ${p.minimo}` : ''}</div>
          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap' }}>
            {p.bajoMinimo && <Chip tono="red">{p.total === 0 ? 'Agotado' : 'Stock bajo'}</Chip>}
            {s && p.proximaCaducidad && <span className={`sem ${s}`}>{textoVence(p.proximaCaducidad, ahora)}</span>}
          </div>
        </div>
        <button className="btn sm ghost" type="button" onClick={() => setEditando(!editando)} aria-label={`Cambiar el mínimo de ${p.producto}`}>Mínimo</button>
      </div>
      {editando && (
        <form className="row" style={{ marginTop: 10 }} onSubmit={guardar}>
          <label className="grow">
            <span className="sr-only">Stock mínimo</span>
            <input className="input" type="number" min="0" step="0.1" value={minimo} onChange={(e) => setMinimo(e.target.value)} placeholder="Mínimo (0 = sin alerta)" />
          </label>
          <button className="btn sm" type="submit">Guardar</button>
        </form>
      )}
      {error && <div className="aviso error" role="alert" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function FormEntrada({ comedorId, alGuardar }: { comedorId: number; alGuardar: (m: string) => void }) {
  const [producto, setProducto] = useState('');
  const [categoria, setCategoria] = useState<Categoria>('abarrotes');
  const [unidad, setUnidad] = useState<Unidad>('kg');
  const [cantidad, setCantidad] = useState('10');
  const [caduca, setCaduca] = useState(aInputLocal(new Date(Date.now() + 30 * 24 * 3_600_000)));
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.entrada(comedorId, { producto, categoria, unidad, cantidad: Number(cantidad), caducaEn: caduca ? new Date(caduca).toISOString() : null });
      alGuardar(`Entrada registrada: ${producto}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="card stack" style={{ marginBottom: 14 }} onSubmit={enviar}>
      <b>Nueva entrada al inventario</b>
      <label className="field"><span>Producto</span><input className="input" value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Ej.: Arroz" required minLength={2} /></label>
      <div className="row">
        <label className="field grow"><span>Categoría</span>
          <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA[c]}</option>)}
          </select>
        </label>
        <label className="field grow"><span>Unidad</span>
          <select className="input" value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
      </div>
      <label className="field"><span>Cantidad</span><input className="input" type="number" min="0.1" step="0.1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required /></label>
      <label className="field"><span>Caducidad (déjala vacía si no tiene)</span><input className="input" type="datetime-local" value={caduca} onChange={(e) => setCaduca(e.target.value)} /></label>
      {error && <div className="aviso error" role="alert">{error}</div>}
      <button className="btn block" disabled={enviando} type="submit">{enviando ? 'Guardando…' : 'Registrar entrada'}</button>
    </form>
  );
}

function FormSalida({ comedorId, productos, alGuardar }: { comedorId: number; productos: ProductoInventario[]; alGuardar: (m: string) => void }) {
  const [clave, setClave] = useState(productos[0] ? `${productos[0].producto}|${productos[0].unidad}` : '');
  const [tipo, setTipo] = useState<TipoSalida>('consumo');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const elegido = productos.find((p) => `${p.producto}|${p.unidad}` === clave);

  if (productos.length === 0) return <div className="aviso" style={{ marginBottom: 14 }}>No hay productos en stock para registrar una salida.</div>;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!elegido) return;
    setError(null);
    setEnviando(true);
    try {
      await api.salida(comedorId, { producto: elegido.producto, unidad: elegido.unidad, tipo, cantidad: Number(cantidad), motivo: motivo || undefined });
      alGuardar(`${tipo === 'consumo' ? 'Consumo' : tipo === 'merma' ? 'Merma' : 'Salida'} registrado: ${elegido.producto}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="card stack" style={{ marginBottom: 14 }} onSubmit={enviar}>
      <b>Registrar salida</b>
      <label className="field"><span>Producto</span>
        <select className="input" value={clave} onChange={(e) => setClave(e.target.value)}>
          {productos.map((p) => <option key={`${p.producto}|${p.unidad}`} value={`${p.producto}|${p.unidad}`}>{p.producto} ({cantidadTexto(p.total, p.unidad)})</option>)}
        </select>
      </label>
      <label className="field"><span>Tipo</span>
        <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoSalida)}>
          {TIPOS_SALIDA.map((t) => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}
        </select>
      </label>
      <label className="field"><span>Cantidad ({elegido?.unidad})</span><input className="input" type="number" min="0.1" step="0.1" max={elegido?.total} value={cantidad} onChange={(e) => setCantidad(e.target.value)} required /></label>
      <label className="field"><span>Motivo (opcional)</span><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: almuerzo del martes" /></label>
      <p className="hint">Se descuenta primero el lote que vence antes (PEPS).</p>
      {error && <div className="aviso error" role="alert">{error}</div>}
      <button className="btn block" disabled={enviando} type="submit">{enviando ? 'Guardando…' : 'Registrar salida'}</button>
    </form>
  );
}
