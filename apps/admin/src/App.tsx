import { Estructura } from './componentes.tsx';
import { useRuta } from './carga.ts';
import { ComedorNuevo, Comedores } from './paginas/Comedores.tsx';
import { ComercioNuevo, Comercios } from './paginas/Comercios.tsx';
import { Donaciones } from './paginas/Donaciones.tsx';
import { Eventos } from './paginas/Eventos.tsx';
import { Inventario } from './paginas/Inventario.tsx';
import { Panel } from './paginas/Panel.tsx';

export function App() {
  const ruta = useRuta();

  const pagina = (() => {
    switch (ruta) {
      case '/eventos': return { activa: '/eventos', vista: <Eventos /> };
      case '/donaciones': return { activa: '/donaciones', vista: <Donaciones /> };
      case '/comedores': return { activa: '/comedores', vista: <Comedores /> };
      case '/comedores/nuevo': return { activa: '/comedores', vista: <ComedorNuevo /> };
      case '/comercios': return { activa: '/comercios', vista: <Comercios /> };
      case '/comercios/nuevo': return { activa: '/comercios', vista: <ComercioNuevo /> };
      case '/inventario': return { activa: '/inventario', vista: <Inventario /> };
      default: return { activa: '/', vista: <Panel /> };
    }
  })();

  return <Estructura activa={pagina.activa}>{pagina.vista}</Estructura>;
}
