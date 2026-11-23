import { useSyncExternalStore, type ReactNode } from 'react';
import type { Carga } from './sesion.ts';

export interface Pestana {
  etiqueta: string;
  icono: string;
  ruta: string;
}

const suscribirConexion = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** Marco de la app: aviso de datos de demostración, contenido y barra de pestañas inferior. */
export function Marco({ children, pestanas, activa }: { children: ReactNode; pestanas?: Pestana[]; activa?: string }) {
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine);
  return (
    <div className="device">
      <div className="demo-banner">Datos de demostración (sintéticos)</div>
      {!enLinea && (
        <div className="sin-conexion" role="status">
          Sin conexión: se muestra lo último guardado. Publicar y reservar necesitan internet.
        </div>
      )}
      <main className="screen">{children}</main>
      {pestanas && (
        <nav className="tabbar" aria-label="Principal">
          {pestanas.map((p) => (
            <a key={p.ruta} href={`#${p.ruta}`} className={p.ruta === activa ? 'on' : undefined} aria-current={p.ruta === activa ? 'page' : undefined}>
              <b aria-hidden="true">{p.icono}</b>
              {p.etiqueta}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

export function Cabecera({ titulo, atras }: { titulo: string; atras: string }) {
  return (
    <div className="top">
      <a href={`#${atras}`} className="back" aria-label="Volver">
        ←
      </a>
      <b>{titulo}</b>
      <span style={{ width: 40 }} />
    </div>
  );
}

/** Muestra "Cargando…" o el error mientras llegan los datos. */
export function Estado<T>({ carga, children }: { carga: Carga<T>; children: (datos: T) => ReactNode }) {
  if (carga.error)
    return (
      <div className="aviso error" role="alert">
        <b>No pudimos cargar los datos.</b>
        <div className="small">{carga.error}</div>
        <div className="small muted">¿Está encendida la API? (npm run api)</div>
        <button className="btn sm soft" onClick={carga.recargar} type="button">
          Reintentar
        </button>
      </div>
    );
  if (!carga.datos) return <p className="muted" aria-live="polite">Cargando…</p>;
  return <>{children(carga.datos)}</>;
}

export function Chip({ children, tono = '' }: { children: ReactNode; tono?: 'red' | 'yellow' | 'green' | 'blue' | 'gray' | '' }) {
  return <span className={`chip ${tono}`}>{children}</span>;
}

export const tonoEstado = (e: string): 'green' | 'blue' | 'gray' | 'red' =>
  e === 'recogida' ? 'green' : e === 'reservada' ? 'blue' : e === 'vencida' ? 'red' : 'gray';

export const nombreEstado = (e: string) => (e === 'publicada' ? 'Publicada' : e === 'reservada' ? 'Reservada' : e === 'recogida' ? 'Recogida' : 'Vencida');
