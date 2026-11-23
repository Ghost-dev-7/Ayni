import { toDataURL } from 'qrcode';
import { useEffect, useState } from 'react';

/** Dibuja un código QR con el texto dado. Se genera en el navegador, sin enviar nada a ningún servicio. */
export function CodigoQR({ texto, lado = 232, descripcion }: { texto: string; lado?: number; descripcion: string }) {
  const [imagen, setImagen] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    // Se dibuja al doble de tamaño para que se vea nítido en pantallas de alta densidad.
    toDataURL(texto, { width: lado * 2, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#14261c', light: '#ffffff' } }).then(
      (url) => vigente && setImagen(url),
      () => vigente && setImagen(null),
    );
    return () => {
      vigente = false;
    };
  }, [texto, lado]);

  if (!imagen) return <div className="qr qr-cargando" style={{ width: lado, height: lado }} aria-busy="true" />;
  return <img className="qr" src={imagen} width={lado} height={lado} alt={descripcion} />;
}
