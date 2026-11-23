import { PREFIJO_QR, type Comedor, type Comercio, type Donacion } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api, type DonacionN } from '../api.ts';
import { Escaner } from '../Escaner.tsx';
import { ICONO, cantidadTexto, claseSemaforo, distanciaKm, hora, km, textoVence } from '../formato.ts';

/**
 * Una reserva pendiente. Al llegar, el comercio muestra su QR: el comedor lo escanea y, si es el de
 * esa entrega, queda "Aprobado" y se registra. Si la cámara falla, puede escribir el código de 4 dígitos.
 */
export function TarjetaReserva({
  d,
  comedor,
  comercio,
  ahora,
  alCambiar,
  alAprobar,
}: {
  d: DonacionN;
  comedor?: Comedor;
  comercio?: Comercio;
  ahora: Date;
  alCambiar: () => void;
  alAprobar: (recogida: Donacion) => void;
}) {
  const [estadoOk, setEstadoOk] = useState(false);
  const [cantidad, setCantidad] = useState(String(d.cantidad));
  const [quien, setQuien] = useState(d.reservadaPor ?? '');
  const [modo, setModo] = useState<'formulario' | 'escaneando'>('formulario');
  const [conCodigo, setConCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (verificacion: { token: string } | { codigo: string }) => {
    setError(null);
    setEnviando(true);
    try {
      const recogida = await api.recoger(d.id, {
        comedorId: comedor?.id ?? 0,
        recogidoPor: quien,
        cantidadRecibida: Number(cantidad),
        estadoOk: estadoOk as true,
        ...verificacion,
      });
      alAprobar(recogida);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo confirmar.');
      setModo('formulario');
      alCambiar();
    } finally {
      setEnviando(false);
    }
  };

  const alLeer = (texto: string) => {
    if (!texto.startsWith(PREFIJO_QR)) {
      setModo('formulario');
      setError('Ese QR no es de Ayni. Escanea el que te muestra el comercio.');
      return;
    }
    void enviar({ token: texto });
  };

  const alEnviarFormulario = (e: FormEvent) => {
    e.preventDefault();
    if (conCodigo) void enviar({ codigo });
    else setModo('escaneando');
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
      {comercio && <div className="small muted">📍 {comercio.direccion}</div>}

      {modo === 'escaneando' ? (
        enviando ? (
          <p className="small muted" role="status">Verificando la entrega…</p>
        ) : (
          <Escaner alLeer={alLeer} alCancelar={() => setModo('formulario')} />
        )
      ) : (
        <form className="stack" onSubmit={alEnviarFormulario}>
          <div className="small" style={{ fontWeight: 700 }}>Al llegar</div>
          <p className="small muted" style={{ marginTop: -6 }}>El comercio te mostrará un QR. Escanéalo para aprobar la entrega.</p>
          <div className="checks">
            <label><input type="checkbox" checked={estadoOk} onChange={(e) => setEstadoOk(e.target.checked)} /> El producto está en buen estado</label>
          </div>
          <label className="field">
            <span>Cantidad recibida ({d.unidad === 'unidades' ? 'unidades' : d.unidad})</span>
            <input className="input" type="number" min="1" max={d.cantidad} step="1" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
          </label>
          <label className="field">
            <span>Recibido por</span>
            <input className="input" value={quien} onChange={(e) => setQuien(e.target.value)} required minLength={2} />
          </label>
          {conCodigo && (
            <label className="field">
              <span>Código que te dicta el comercio</span>
              <input className="input" value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" placeholder="00-00" required minLength={4} maxLength={5} autoComplete="off" />
            </label>
          )}
          {error && <div className="aviso error" role="alert">{error}</div>}
          <button className="btn block" style={{ minHeight: 52, fontSize: 16 }} disabled={enviando || !estadoOk} type="submit">
            {enviando ? 'Verificando…' : conCodigo ? 'Confirmar con el código' : '📷 Escanear QR para confirmar'}
          </button>
          <button type="button" className="btn soft block" onClick={() => { setConCodigo((v) => !v); setError(null); }}>
            {conCodigo ? 'Prefiero escanear el QR' : 'No puedo escanear: escribir el código'}
          </button>
          <p className="hint">Al aprobarse, queda registrado quién recibió el alimento y pasa solo a tu inventario.</p>
        </form>
      )}
    </section>
  );
}
