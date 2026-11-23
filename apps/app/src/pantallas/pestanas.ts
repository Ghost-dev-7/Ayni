import type { Pestana } from '../componentes.tsx';

export const PESTANAS_COMEDOR: Pestana[] = [
  { etiqueta: 'Ofertas', icono: '◎', ruta: '/comedor' },
  { etiqueta: 'Reservas', icono: '✓', ruta: '/comedor/reservas' },
  { etiqueta: 'Inventario', icono: '▦', ruta: '/comedor/inventario' },
  { etiqueta: 'Perfil', icono: '♡', ruta: '/comedor/perfil' },
  { etiqueta: 'Salir', icono: '⇄', ruta: '/' },
];
