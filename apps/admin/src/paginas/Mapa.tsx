import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.ts';
import { Chip, Encabezado, Estado } from '../componentes.tsx';
import { useCarga } from '../carga.ts';
import { distanciaKm, km } from '../formato.ts';

/** Un comercio sin ningún comedor activo a menos de esta distancia queda "sin cobertura". */
const KM_COBERTURA = 3;

function icono(emoji: string, clase: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="marcador ${clase}" aria-hidden="true">${emoji}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}

/** Contenido del popup creado con nodos de texto (nunca HTML en bruto). */
function popup(titulo: string, lineas: string[]): HTMLElement {
  const caja = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = titulo;
  caja.appendChild(b);
  for (const l of lineas) {
    const p = document.createElement('div');
    p.textContent = l;
    p.style.fontSize = '12px';
    caja.appendChild(p);
  }
  return caja;
}

/** Mapa de la red: dónde están los comercios y los comedores, y qué zonas quedan sin cobertura. */
export function Mapa() {
  const comercios = useCarga(api.comercios);
  const comedores = useCarga(api.comedores);
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capa = useRef<L.LayerGroup | null>(null);
  const [sinPlano, setSinPlano] = useState(false);
  const [verComercios, setVerComercios] = useState(true);
  const [verComedores, setVerComedores] = useState(true);

  // Se crea el mapa una sola vez.
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, { scrollWheelZoom: false }).setView([-12.218, -76.935], 14);
    const teselas = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    });
    teselas.on('tileerror', () => setSinPlano(true));
    teselas.on('tileload', () => setSinPlano(false));
    teselas.addTo(m);
    capa.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
      capa.current = null;
    };
  }, []);

  const analisis = useMemo(() => {
    if (!comercios.datos || !comedores.datos) return null;
    const activos = comedores.datos.filter((c) => c.activo);
    const filas = comercios.datos
      .filter((c) => c.activo)
      .map((c) => {
        const mas = activos.map((k) => ({ k, d: distanciaKm(c, k) })).sort((a, b) => a.d - b.d)[0];
        return { comercio: c, cercano: mas?.k ?? null, distancia: mas?.d ?? null };
      });
    const distancias = filas.map((f) => f.distancia).filter((d): d is number => d !== null);
    return {
      promedio: distancias.length ? distancias.reduce((s, d) => s + d, 0) / distancias.length : null,
      sinCobertura: filas.filter((f) => f.distancia === null || f.distancia > KM_COBERTURA),
      filas,
    };
  }, [comercios.datos, comedores.datos]);

  // Se dibujan (o redibujan) los marcadores cuando cambian los datos o los filtros.
  useEffect(() => {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g || !comercios.datos || !comedores.datos) return;
    g.clearLayers();
    const puntos: L.LatLngExpression[] = [];
    if (verComercios) {
      for (const c of comercios.datos) {
        L.marker([c.lat, c.lng], { icon: icono('🏪', c.activo ? 'comercio' : 'apagado'), title: c.nombre })
          .bindPopup(popup(c.nombre, [c.tipo, c.direccion, c.activo ? 'Activo' : 'Desactivado']))
          .addTo(g);
        puntos.push([c.lat, c.lng]);
      }
    }
    if (verComedores) {
      for (const c of comedores.datos) {
        L.marker([c.lat, c.lng], { icon: icono('🍽️', c.activo ? 'comedor' : 'apagado'), title: c.nombre })
          .bindPopup(popup(c.nombre, [c.zona, `${c.racionesDia} raciones al día`, c.activo ? 'Activo' : 'Desactivado']))
          .addTo(g);
        puntos.push([c.lat, c.lng]);
      }
    }
    if (puntos.length > 1) m.fitBounds(L.latLngBounds(puntos), { padding: [30, 30] });
    setTimeout(() => m.invalidateSize(), 50);
  }, [comercios.datos, comedores.datos, verComercios, verComedores]);

  return (
    <>
      <Encabezado supra="Red" titulo="Mapa de la red">
        <label className="row small"><input type="checkbox" checked={verComercios} onChange={(e) => setVerComercios(e.target.checked)} /> 🏪 Comercios</label>
        <label className="row small"><input type="checkbox" checked={verComedores} onChange={(e) => setVerComedores(e.target.checked)} /> 🍽️ Comedores</label>
      </Encabezado>

      <div className="grid-mapa">
        <div>
          <div ref={contenedor} className="mapa" role="region" aria-label="Mapa de comercios y comedores" />
          {sinPlano && (
            <div className="card" role="status" style={{ background: 'var(--yellow-100)', marginTop: 10 }}>
              No se pudo cargar el plano (¿sin internet?). Los puntos siguen en la lista de abajo.
            </div>
          )}
          <p className="hint">Plano de OpenStreetMap; necesita conexión a internet. Las coordenadas son aproximadas y ficticias.</p>
        </div>

        <div className="stack">
          <Estado carga={comercios}>
            {() => (
              <>
                <div className="card">
                  <h2 style={{ fontSize: 18 }}>Cobertura</h2>
                  <p className="small muted" style={{ margin: '6px 0 8px' }}>Distancia media de cada comercio a su comedor activo más cercano</p>
                  <b style={{ fontFamily: 'var(--serif)', fontSize: 30 }}>{analisis?.promedio != null ? km(analisis.promedio) : '—'}</b>
                </div>
                <div className="card">
                  <h2 style={{ fontSize: 18 }}>Zonas sin cobertura</h2>
                  {analisis && analisis.sinCobertura.length === 0 ? (
                    <p className="small muted" style={{ marginTop: 6 }}>Todos los comercios activos tienen un comedor a menos de {KM_COBERTURA} km. 🎉</p>
                  ) : (
                    <>
                      <p className="small muted" style={{ margin: '6px 0 8px' }}>Comercios sin un comedor activo a menos de {KM_COBERTURA} km:</p>
                      <ul className="small" style={{ paddingLeft: 18 }}>
                        {analisis?.sinCobertura.map((f) => (
                          <li key={f.comercio.id}><b>{f.comercio.nombre}</b>{f.distancia !== null ? ` · ${km(f.distancia)} del más cercano` : ''}</li>
                        ))}
                      </ul>
                      <a className="btn amber sm" href="#/comedores/nuevo" style={{ marginTop: 10 }}>＋ Agregar comedor</a>
                    </>
                  )}
                </div>
              </>
            )}
          </Estado>
        </div>
      </div>

      <h2 style={{ fontSize: 20, margin: '22px 0 10px' }}>Ubicaciones</h2>
      <Estado carga={comedores}>
        {(lista) => (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nombre</th><th>Tipo</th><th>Dirección o zona</th><th>Más cercano</th><th>Estado</th></tr></thead>
              <tbody>
                {analisis?.filas.map((f) => (
                  <tr key={`c${f.comercio.id}`}>
                    <td className="wrap">🏪 <b>{f.comercio.nombre}</b></td>
                    <td>Comercio</td>
                    <td className="wrap">{f.comercio.direccion}</td>
                    <td>{f.cercano && f.distancia !== null ? `${f.cercano.nombre.replace('Comedor ', '')} · ${km(f.distancia)}` : '—'}</td>
                    <td><Chip tono="green">Activo</Chip></td>
                  </tr>
                ))}
                {lista.map((c) => (
                  <tr key={`k${c.id}`} style={{ opacity: c.activo ? 1 : 0.6 }}>
                    <td className="wrap">🍽️ <b>{c.nombre}</b></td>
                    <td>Comedor</td>
                    <td className="wrap">{c.zona} · {c.direccion}</td>
                    <td>—</td>
                    <td>{c.activo ? <Chip tono="green">Activo</Chip> : <Chip tono="gray">Desactivado</Chip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Estado>
    </>
  );
}
