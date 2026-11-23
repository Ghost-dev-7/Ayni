import jsQRModulo from 'jsqr';
import { useEffect, useRef, useState } from 'react';

type LectorQR = (datos: Uint8ClampedArray, ancho: number, alto: number, opciones?: { inversionAttempts?: 'dontInvert' }) => { data: string } | null;
// jsqr se publica como CommonJS: sus tipos declaran un "default" que TypeScript toma por el módulo entero.
const jsQR = jsQRModulo as unknown as LectorQR;

/**
 * Abre la cámara y busca un código QR. Cuando lo lee, apaga la cámara y entrega el texto.
 * Todo ocurre en el navegador: las imágenes de la cámara no se guardan ni se envían.
 * La cámara solo está disponible en páginas seguras (HTTPS o localhost).
 */
export function Escaner({ alLeer, alCancelar }: { alLeer: (texto: string) => void; alCancelar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  // Siempre se llama a la versión más reciente de alLeer, sin reiniciar la cámara.
  const llamar = useRef(alLeer);
  llamar.current = alLeer;

  useEffect(() => {
    let activo = true;
    let flujo: MediaStream | undefined;
    let cuadro = 0;
    let ultimo = 0;
    const lienzo = document.createElement('canvas');
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });

    const detener = () => {
      activo = false;
      cancelAnimationFrame(cuadro);
      flujo?.getTracks().forEach((t) => t.stop());
    };

    const mirar = (t: number) => {
      if (!activo) return;
      cuadro = requestAnimationFrame(mirar);
      const v = video.current;
      if (!v || !ctx || v.readyState < v.HAVE_ENOUGH_DATA || t - ultimo < 120) return;
      ultimo = t;
      // Se analiza una imagen reducida: es más rápido y alcanza para leer un QR.
      const escala = Math.min(1, 480 / v.videoWidth);
      lienzo.width = Math.round(v.videoWidth * escala);
      lienzo.height = Math.round(v.videoHeight * escala);
      ctx.drawImage(v, 0, 0, lienzo.width, lienzo.height);
      const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (r?.data) {
        detener();
        llamar.current(r.data);
      }
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador no permite usar la cámara en esta página (hace falta HTTPS). Escribe el código del comercio.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(
      (s) => {
        if (!activo) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        flujo = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => undefined);
        }
        setListo(true);
        cuadro = requestAnimationFrame(mirar);
      },
      (e: unknown) => {
        if (!activo) return;
        const nombre = e instanceof DOMException ? e.name : '';
        setError(
          nombre === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara. Actívalo en el navegador o escribe el código del comercio.'
            : 'No se pudo abrir la cámara. Escribe el código del comercio.',
        );
      },
    );
    return detener;
  }, []);

  return (
    <div className="stack">
      {error ? (
        <div className="aviso error" role="alert">{error}</div>
      ) : (
        <div className="escaner">
          <video ref={video} muted playsInline aria-label="Vista de la cámara" />
          <div className="escaner-marco" aria-hidden="true" />
          {!listo && <div className="escaner-espera">Abriendo la cámara…</div>}
        </div>
      )}
      {!error && <p className="hint" style={{ textAlign: 'center' }}>Apunta al QR que muestra el comercio. Se lee solo.</p>}
      <button type="button" className="btn ghost block" onClick={alCancelar}>
        {error ? 'Volver' : 'Cancelar'}
      </button>
    </div>
  );
}
