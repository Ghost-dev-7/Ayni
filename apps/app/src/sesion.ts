import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Sesión simulada: el prototipo no tiene autenticación real, solo elige un rol y una cuenta. */
export interface Sesion {
  rol: 'comercio' | 'comedor';
  id: number;
}

const CLAVE = 'ayni.sesion';

export function leerSesion(): Sesion | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t ? (JSON.parse(t) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(s: Sesion | null): void {
  try {
    if (s) localStorage.setItem(CLAVE, JSON.stringify(s));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: la sesión solo dura mientras la pestaña esté abierta */
  }
}

const suscribir = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const rutaActual = () => window.location.hash.replace(/^#/, '') || '/';

/** Ruta actual basada en el hash de la URL (#/comercio/publicar). */
export function useRuta(): string {
  return useSyncExternalStore(suscribir, rutaActual);
}

export const ir = (ruta: string) => {
  window.location.hash = ruta;
};

export interface Carga<T> {
  datos: T | null;
  error: string | null;
  cargando: boolean;
  recargar: () => void;
}

/**
 * Carga datos asíncronos y permite recargarlos. Con `cadaMs` los refresca solos cada tanto,
 * sin parpadeo: se muestran los datos anteriores hasta que llegan los nuevos.
 */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[] = [], cadaMs?: number): Carga<T> {
  const [estado, setEstado] = useState<{ datos: T | null; error: string | null; cargando: boolean }>({
    datos: null,
    error: null,
    cargando: true,
  });
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    const cargar = (inicial: boolean) => {
      if (inicial) setEstado((e) => ({ ...e, cargando: true, error: null }));
      fn().then(
        (datos) => vigente && setEstado({ datos, error: null, cargando: false }),
        (err: unknown) =>
          vigente && setEstado((e) => ({ datos: inicial ? null : e.datos, error: inicial ? (err instanceof Error ? err.message : 'Error') : e.error, cargando: false })),
      );
    };
    cargar(true);
    const t = cadaMs ? setInterval(() => cargar(false), cadaMs) : undefined;
    return () => {
      vigente = false;
      if (t) clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, cadaMs, ...deps]);

  return { ...estado, recargar };
}
