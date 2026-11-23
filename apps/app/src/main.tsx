import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './estilos.css';
import './extra.css';

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// La app instalable guarda lo necesario para abrirse sin conexión (solo en la versión compilada).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* sin service worker la app funciona igual, solo que sin modo sin conexión */
    });
  });
}
