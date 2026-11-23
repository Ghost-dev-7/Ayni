import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

const suscribir = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const rutaActual = () => window.location.hash.replace(/^#/, '') || '/';

/** Ruta actual basada en el hash de la URL (#/eventos). */
export const useRuta = () => useSyncExternalStore(suscribir, rutaActual);
export const ir = (ruta: string) => {
  window.location.hash = ruta;
};

export interface Carga<T> {
  datos: T | null;
  error: string | null;
  cargando: boolean;
  recargar: () => void;
}

/** Carga datos asíncronos; con `cadaMs` los refresca solos (para el panel en vivo). */
export function useCarga<T>(fn: () => Promise<T>, deps: unknown[] = [], cadaMs?: number): Carga<T> {
  const [estado, setEstado] = useState<{ datos: T | null; error: string | null; cargando: boolean }>({ datos: null, error: null, cargando: true });
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    const cargar = (inicial: boolean) => {
      if (inicial) setEstado((e) => ({ ...e, cargando: true, error: null }));
      fn().then(
        (datos) => vigente && setEstado({ datos, error: null, cargando: false }),
        (err: unknown) => vigente && setEstado((e) => ({ datos: inicial ? null : e.datos, error: err instanceof Error ? err.message : 'Error', cargando: false })),
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
