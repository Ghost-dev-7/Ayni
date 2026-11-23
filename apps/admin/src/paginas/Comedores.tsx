import { CATEGORIAS, type Categoria } from '@ayni/shared';
import { useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Chip, Encabezado, Estado } from '../componentes.tsx';
import { ir, useCarga } from '../carga.ts';
import { ICONO, NOMBRE_CATEGORIA } from '../formato.ts';

export function Comedores() {
  const comedores = useCarga(api.comedores);
  const impacto = useCarga(api.impacto, [], 15_000);
  const [error, setError] = useState<string | null>(null);

  const cambiar = async (id: number, activo: boolean) => {
    setError(null);
    try {
      await api.activarComedor(id, activo);
      comedores.recargar();
      impacto.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    }
  };

  return (
    <>
      <Encabezado supra="Red" titulo="Comedores populares">
        <a className="btn sm" href="#/comedores/nuevo">＋ Agregar comedor</a>
      </Encabezado>
      <div className="why" style={{ marginBottom: 16 }}>
        <b className="small">Cada comedor es independiente.</b>{' '}
        <span className="small muted">Al darlo de alta, accede desde la app a las donaciones por vencer que los demás no alcanzan a consumir.</span>
      </div>
      {error && <div className="card" role="alert" style={{ background: 'var(--red-100)', marginBottom: 12 }}>{error}</div>}
      <Estado carga={comedores}>
        {(lista) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Comedor</th><th>Zona</th><th>Raciones/día</th><th>Necesidades</th><th>Recibidos (28 d)</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const m = impacto.datos?.comedores.find((x) => x.comedorId === c.id);
                  return (
                    <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.6 }}>
                      <td className="wrap"><b>{c.nombre}</b><div className="tiny muted">{c.horarioRecojo}{c.refrigeracion ? ' · con frío' : ''}</div></td>
                      <td>{c.zona}</td>
                      <td>{c.racionesDia}</td>
                      <td>{c.necesidades.map((n) => ICONO[n]).join(' ') || '—'}</td>
                      <td>{m ? `${Math.round(m.kgRecibidos)} kg` : '…'}</td>
                      <td>
                        {!c.activo ? <Chip tono="gray">Desactivado</Chip> : m && (m.diasSinActividad === null || m.diasSinActividad >= 7) ? <Chip tono="yellow">{m.diasSinActividad === null ? 'Sin actividad' : `Inactivo ${m.diasSinActividad} d`}</Chip> : <Chip tono="green">Activo</Chip>}
                      </td>
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

export function ComedorNuevo() {
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState('Sector 6');
  const [direccion, setDireccion] = useState('');
  const [raciones, setRaciones] = useState('60');
  const [lat, setLat] = useState('-12.2200');
  const [lng, setLng] = useState('-76.9300');
  const [necesidades, setNecesidades] = useState<Categoria[]>([]);
  const [frio, setFrio] = useState(false);
  const [horario, setHorario] = useState('Lun-Sáb · 14:00 a 19:00');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const alternar = (c: Categoria) => setNecesidades((n) => (n.includes(c) ? n.filter((x) => x !== c) : [...n, c]));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api.crearComedor({ nombre, zona, direccion, racionesDia: Number(raciones), lat: Number(lat), lng: Number(lng), necesidades, refrigeracion: frio, horarioRecojo: horario });
      ir('/comedores');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <Encabezado supra="Red · Comedores" titulo="Agregar un comedor">
        <a className="btn ghost sm" href="#/comedores">← Comedores</a>
      </Encabezado>
      <form className="card" onSubmit={guardar}>
        <div className="form-grid">
          <label className="field full"><span>Nombre del comedor</span><input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Comedor Santa Rosa (ficticio)" required minLength={2} /></label>
          <label className="field"><span>Zona / sector</span><input className="input" value={zona} onChange={(e) => setZona(e.target.value)} required /></label>
          <label className="field"><span>Raciones por día</span><input className="input" type="number" min="1" value={raciones} onChange={(e) => setRaciones(e.target.value)} required /></label>
          <label className="field full"><span>Dirección aproximada</span><input className="input" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección ficticia, Villa El Salvador" required minLength={3} /></label>
          <label className="field"><span>Latitud</span><input className="input" type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} required /></label>
          <label className="field"><span>Longitud</span><input className="input" type="number" step="0.0001" value={lng} onChange={(e) => setLng(e.target.value)} required /></label>
          <fieldset className="field full" style={{ border: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>Necesidades prioritarias</span>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {CATEGORIAS.map((c) => (
                <button key={c} type="button" aria-pressed={necesidades.includes(c)} className={`chip ${necesidades.includes(c) ? 'green' : 'gray'}`} style={{ border: 0, cursor: 'pointer', padding: '6px 12px' }} onClick={() => alternar(c)}>
                  {ICONO[c]} {NOMBRE_CATEGORIA[c]}{necesidades.includes(c) ? ' ✓' : ''}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field"><span>Refrigeración</span><select className="input" value={frio ? 'si' : 'no'} onChange={(e) => setFrio(e.target.value === 'si')}><option value="no">No</option><option value="si">Sí</option></select></label>
          <label className="field"><span>Horario de recojo</span><input className="input" value={horario} onChange={(e) => setHorario(e.target.value)} required minLength={3} /></label>
        </div>
        <div className="why" style={{ marginTop: 16 }}>
          <b className="small">Qué ocurre al guardar</b>
          <ul className="small muted" style={{ paddingLeft: 18, marginTop: 4 }}>
            <li>El comedor aparece en la app y puede reservar donaciones.</li>
            <li>Queda registrado en el registro de eventos.</li>
          </ul>
        </div>
        {error && <div className="card" role="alert" style={{ background: 'var(--red-100)', marginTop: 12 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <a className="btn ghost" href="#/comedores">Cancelar</a>
          <button className="btn" disabled={enviando} type="submit">{enviando ? 'Guardando…' : 'Guardar comedor'}</button>
        </div>
      </form>
    </div>
  );
}
