import { useEffect } from 'react';
import { ComedorDonacion, ComedorOfertas, ComedorReservas } from './pantallas/comedor.tsx';
import { ComercioDonacion, ComercioInicio, ComercioPublicar } from './pantallas/comercio.tsx';
import { ComedorInventario } from './pantallas/inventario.tsx';
import { ComedorPerfil } from './pantallas/perfil.tsx';
import { Rol } from './pantallas/Rol.tsx';
import { ir, leerSesion, useRuta } from './sesion.ts';

export function App() {
  const ruta = useRuta();
  const sesion = leerSesion();
  const partes = ruta.split('/').filter(Boolean);
  const [zona, seccion, param] = partes;

  // Sin sesión, cualquier ruta protegida vuelve a la pantalla de rol.
  const protegida = zona === 'comercio' || zona === 'comedor';
  const rolIncorrecto = sesion && protegida && sesion.rol !== zona;
  const redirigir = protegida && (!sesion || rolIncorrecto);

  useEffect(() => {
    if (redirigir) ir(sesion ? `/${sesion.rol}` : '/');
  }, [redirigir, sesion]);

  if (redirigir || !sesion) return <Rol />;

  if (zona === 'comercio') {
    if (seccion === 'publicar') return <ComercioPublicar sesion={sesion} />;
    if (seccion === 'donacion' && param) return <ComercioDonacion id={Number(param)} />;
    return <ComercioInicio sesion={sesion} />;
  }

  if (zona === 'comedor') {
    if (seccion === 'reservas') return <ComedorReservas sesion={sesion} />;
    if (seccion === 'inventario') return <ComedorInventario sesion={sesion} />;
    if (seccion === 'perfil') return <ComedorPerfil sesion={sesion} />;
    if (seccion === 'donacion' && param) return <ComedorDonacion sesion={sesion} id={Number(param)} />;
    return <ComedorOfertas sesion={sesion} />;
  }

  return <Rol />;
}
