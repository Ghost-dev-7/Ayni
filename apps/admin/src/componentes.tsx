import type { ReactNode } from 'react';
import type { Carga } from './carga.ts';

const MENU = [
  { ruta: '/', etiqueta: 'Panel', icono: '▣' },
  { ruta: '/eventos', etiqueta: 'Registro de eventos', icono: '☰' },
  { ruta: '/donaciones', etiqueta: 'Donaciones', icono: '♡' },
  { grupo: 'Red' },
  { ruta: '/comedores', etiqueta: 'Comedores', icono: '🍽️' },
  { ruta: '/comercios', etiqueta: 'Comercios', icono: '🏪' },
] as const;

/** Estructura de la web de administración: menú lateral, barra superior y contenido. */
export function Estructura({ activa, children }: { activa: string; children: ReactNode }) {
  return (
    <>
      <aside className="side">
        <div className="brand">
          <img src="/simbolo.svg" alt="" width={36} height={36} style={{ background: '#fff', borderRadius: 11, padding: 3 }} />
          <div>
            <b>Ayni</b>
            <small>Administración</small>
          </div>
        </div>
        <nav aria-label="Principal">
          {MENU.map((m, i) =>
            'grupo' in m ? (
              <div className="grp" key={i}>{m.grupo}</div>
            ) : (
              <a key={m.ruta} href={`#${m.ruta}`} className={m.ruta === activa ? 'on' : undefined} aria-current={m.ruta === activa ? 'page' : undefined}>
                <span aria-hidden="true">{m.icono}</span> {m.etiqueta}
              </a>
            ),
          )}
        </nav>
        <div className="me">
          <b>Equipo administrador</b>
          <div className="tiny" style={{ color: '#9fc2ae' }}>Sesión simulada</div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <span className="chip yellow">Datos de demostración (sintéticos)</span>
        </div>
        <div className="page">{children}</div>
      </div>
    </>
  );
}

export function Encabezado({ supra, titulo, children }: { supra: string; titulo: string; children?: ReactNode }) {
  return (
    <header>
      <div>
        <div className="muted small">{supra}</div>
        <h1>{titulo}</h1>
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

/** Muestra "Cargando…" o el error mientras llegan los datos. */
export function Estado<T>({ carga, children }: { carga: Carga<T>; children: (datos: T) => ReactNode }) {
  if (carga.error && !carga.datos)
    return (
      <div className="card" role="alert" style={{ background: 'var(--red-100)', color: '#7a2418' }}>
        <b>No pudimos cargar los datos.</b>
        <div className="small">{carga.error}</div>
        <div className="small">¿Está encendida la API? (npm run api)</div>
        <button className="btn sm soft" style={{ marginTop: 8 }} onClick={carga.recargar} type="button">Reintentar</button>
      </div>
    );
  if (!carga.datos) return <p className="muted" aria-live="polite">Cargando…</p>;
  return <>{children(carga.datos)}</>;
}

export const Chip = ({ children, tono = '' }: { children: ReactNode; tono?: 'red' | 'yellow' | 'green' | 'blue' | 'gray' | '' }) => (
  <span className={`chip ${tono}`}>{children}</span>
);

export const tonoEstado = (e: string): 'green' | 'blue' | 'gray' | 'red' => (e === 'recogida' ? 'green' : e === 'reservada' ? 'blue' : e === 'vencida' ? 'red' : 'gray');
export const nombreEstado = (e: string) => (e === 'publicada' ? 'Publicada' : e === 'reservada' ? 'Reservada' : e === 'recogida' ? 'Recogida' : 'Vencida');

export const tonoAccion = (a: string): 'green' | 'blue' | 'gray' | 'red' | 'yellow' =>
  a.startsWith('Recogida') ? 'green' : a === 'Reservada' ? 'blue' : a.includes('vencida') ? 'red' : a.startsWith('Alta') || a.includes('ctivación') ? 'yellow' : 'gray';
