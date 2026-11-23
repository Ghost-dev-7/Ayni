import { TIPOS_COMERCIO, type TipoComercio } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Chip, Encabezado, Estado } from '../componentes.tsx';
import { ir, useCarga } from '../carga.ts';

const NOMBRE_TIPO: Record<TipoComercio, string> = {
  panaderia: 'Panadería',
  bodega: 'Bodega',
  mercado: 'Mercado',
  restaurante: 'Restaurante',
  minimarket: 'Minimarket',
  mayorista: 'Mayorista',
};

export function Comercios() {
  const comercios = useCarga(api.comercios);
  const impacto = useCarga(api.impacto, [], 15_000);
  const [error, setError] = useState<string | null>(null);

  const cambiar = async (id: number, activo: boolean) => {
    setError(null);
    try {
      await api.activarComercio(id, activo);
      comercios.recargar();
      impacto.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    }
  };

  return (
    <>
      <Encabezado supra="Red" titulo="Comercios y empresas donantes">
        <a className="btn sm" href="#/comercios/nuevo">＋ Agregar comercio</a>
      </Encabezado>
      {error && <div className="card" role="alert" style={{ background: 'var(--red-100)', marginBottom: 12 }}>{error}</div>}
      <Estado carga={comercios}>
        {(lista) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Comercio</th><th>Tipo</th><th>Donaciones (28 d)</th><th>Kg donados</th><th>Vencidas sin donar</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const m = impacto.datos?.comercios.find((x) => x.comercioId === c.id);
                  return (
                    <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.6 }}>
                      <td className="wrap"><b>{c.nombre}</b><div className="tiny muted">{c.direccion}</div></td>
                      <td>{NOMBRE_TIPO[c.tipo]}</td>
                      <td>{m ? m.donacionesTotales : '…'}</td>
                      <td>{m ? `${Math.round(m.kgDonados)} kg` : '…'}</td>
                      <td>{m ? m.vencidasSinDonar : '…'}</td>
                      <td>{c.activo ? <Chip tono="green">Activo</Chip> : <Chip tono="gray">Desactivado</Chip>}</td>
                      <td><button className="btn ghost sm" type="button" onClick={() => cambiar(c.id, !c.activo)}>{c.activo ? 'Desactivar' : 'Activar'}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Estado>
    </>
  );
}

export function ComercioNuevo() {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoComercio>('mayorista');
  const [direccion, setDireccion] = useState('');
  const [lat, setLat] = useState('-12.2200');
  const [lng, setLng] = useState('-76.9300');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.crearComercio({ nombre, tipo, direccion, lat: Number(lat), lng: Number(lng) });
      ir('/comercios');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <Encabezado supra="Red · Comercios" titulo="Agregar comercio o empresa">
        <a className="btn ghost sm" href="#/comercios">← Comercios</a>
      </Encabezado>
      <form className="card" onSubmit={guardar}>
        <div className="form-grid">
          <label className="field full"><span>Nombre comercial</span><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Distribuidora Andina (ficticia)" required minLength={2} /></label>
          <label className="field"><span>Tipo</span>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoComercio)}>
              {TIPOS_COMERCIO.map((t) => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}
            </select>
          </label>
          <label className="field"><span>Dirección aproximada</span><input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección ficticia, Villa El Salvador" required minLength={3} /></label>
          <label className="field"><span>Latitud</span><input className="input" type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} required /></label>
          <label className="field"><span>Longitud</span><input className="input" type="number" step="0.0001" value={lng} onChange={(e) => setLng(e.target.value)} required /></label>
        </div>
        <div className="why" style={{ marginTop: 16 }}>
          <b className="small">Responsabilidad</b>
          <div className="small muted">El comercio es responsable del estado de los alimentos que publica. El sistema bloquea productos ya vencidos.</div>
        </div>
        {error && <div className="card" role="alert" style={{ background: 'var(--red-100)', marginTop: 12 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <a className="btn ghost" href="#/comercios">Cancelar</a>
          <button className="btn" disabled={enviando} type="submit">{enviando ? 'Guardando…' : 'Guardar y activar'}</button>
        </div>
      </form>
    </div>
  );
}
