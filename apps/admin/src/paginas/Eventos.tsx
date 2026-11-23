import { useState } from 'react';
import { api } from '../api.ts';
import { Chip, Encabezado, Estado, tonoAccion } from '../componentes.tsx';
import { useCarga } from '../carga.ts';
import { fechaHora } from '../formato.ts';

const ROLES = ['comercio', 'comedor', 'admin', 'sistema'];

/** Registro de eventos: trazabilidad de todo lo que pasa en la plataforma. */
export function Eventos() {
  const [rol, setRol] = useState('');
  const [accion, setAccion] = useState('');
  const [texto, setTexto] = useState('');
  const [entidad, setEntidad] = useState<string | null>(null);

  const acciones = useCarga(api.acciones);
  const lista = useCarga(() => api.eventos({ rol, accion, texto, limite: 200 }), [rol, accion, texto], 10_000);
  const detalle = useCarga(() => (entidad ? api.eventos({ entidad, limite: 50 }) : Promise.resolve([])), [entidad]);

  const limpiar = () => {
    setRol('');
    setAccion('');
    setTexto('');
    setEntidad(null);
  };

  return (
    <>
      <Encabezado supra="Trazabilidad" titulo="Registro de eventos" />
      <div className="filters">
        <input className="input" type="search" placeholder="Buscar por código, actor o producto…" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" style={{ minWidth: 260 }} />
        <select className="input" value={rol} onChange={(e) => setRol(e.target.value)} aria-label="Rol">
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="input" value={accion} onChange={(e) => setAccion(e.target.value)} aria-label="Acción">
          <option value="">Todas las acciones</option>
          {(acciones.datos ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn soft sm" type="button" onClick={limpiar} style={{ alignSelf: 'center' }}>Limpiar filtros</button>
      </div>

      <div className="grid-eventos">
        <Estado carga={lista}>
          {(eventos) => (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Fecha y hora</th><th>Rol</th><th>Actor</th><th>Acción</th><th>Entidad</th></tr></thead>
                <tbody>
                  {eventos.length === 0 && <tr><td colSpan={5} className="muted">No hay eventos con esos filtros.</td></tr>}
                  {eventos.map((e) => (
                    <tr key={e.id} className="fila-click" onClick={() => setEntidad(e.entidad)} style={{ background: e.entidad === entidad ? 'var(--g050)' : undefined }}>
                      <td>{fechaHora(e.fecha)}</td>
                      <td>{e.rol}</td>
                      <td className="wrap">{e.actor}</td>
                      <td><Chip tono={tonoAccion(e.accion)}>{e.accion}</Chip></td>
                      <td><b>{e.entidad}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Estado>

        <aside className="card" aria-live="polite">
          <h2 style={{ fontSize: 18 }}>Detalle de trazabilidad</h2>
          {!entidad ? (
            <p className="muted small" style={{ marginTop: 8 }}>Elige un evento para ver todo el recorrido de su donación, comedor o comercio.</p>
          ) : detalle.cargando ? (
            <p className="muted small" style={{ marginTop: 8 }}>Cargando…</p>
          ) : (
            <Estado carga={detalle}>
              {(eventos) => (
                <>
                  <p className="muted small" style={{ margin: '6px 0 12px' }}>{entidad} · {eventos.length} eventos</p>
                  <ul className="timeline">
                    {[...eventos].reverse().map((e) => (
                      <li key={e.id}>
                        <b>{e.accion}</b>
                        <div className="tiny muted">{fechaHora(e.fecha)} · {e.actor}</div>
                        {e.detalle && <div className="tiny muted">{e.detalle}</div>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Estado>
          )}
        </aside>
      </div>
    </>
  );
}
