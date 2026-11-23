import { useState } from 'react';
import { api } from '../api.ts';
import { Estado, Marco } from '../componentes.tsx';
import { guardarSesion, ir, useCarga } from '../sesion.ts';

/** Pantalla inicial: elige si entras como comercio o como comedor (sesión simulada). */
export function Rol() {
  const comercios = useCarga(api.comercios);
  const comedores = useCarga(api.comedores);
  const [rol, setRol] = useState<'comercio' | 'comedor'>('comercio');
  const [idComercio, setIdComercio] = useState(1);
  const [idComedor, setIdComedor] = useState(1);

  const entrar = () => {
    if (rol === 'comercio') {
      guardarSesion({ rol, id: idComercio });
      ir('/comercio');
    } else {
      guardarSesion({ rol, id: idComedor });
      ir('/comedor');
    }
  };

  return (
    <Marco>
      <div style={{ paddingTop: 12 }}>
        <img src="/logo.svg" alt="Ayni" className="logo-rol" />
        <h1 style={{ fontSize: 28, marginTop: 20 }}>Lo que sobra hoy, alimenta a alguien hoy.</h1>
        <p className="muted" style={{ marginTop: 10 }}>
          Conectamos comercios con alimentos por vencer y comedores populares de Villa El Salvador.
        </p>
      </div>

      <div className="stack" style={{ marginTop: 26 }}>
        <p className="small" style={{ fontWeight: 700 }}>¿Cómo vas a usar la app?</p>
        <div className="seg" role="radiogroup" aria-label="Tipo de cuenta">
          <button type="button" role="radio" aria-checked={rol === 'comercio'} className={rol === 'comercio' ? 'on' : ''} onClick={() => setRol('comercio')}>
            🏪 Comercio
          </button>
          <button type="button" role="radio" aria-checked={rol === 'comedor'} className={rol === 'comedor' ? 'on' : ''} onClick={() => setRol('comedor')}>
            🍽️ Comedor
          </button>
        </div>

        {rol === 'comercio' ? (
          <Estado carga={comercios}>
            {(lista) => (
              <label className="field">
                <span>Elige tu comercio</span>
                <select className="input" value={idComercio} onChange={(e) => setIdComercio(Number(e.target.value))}>
                  {lista.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
            )}
          </Estado>
        ) : (
          <Estado carga={comedores}>
            {(lista) => (
              <label className="field">
                <span>Elige tu comedor</span>
                <select className="input" value={idComedor} onChange={(e) => setIdComedor(Number(e.target.value))}>
                  {lista.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </label>
            )}
          </Estado>
        )}
        <button type="button" className="btn block amber" style={{ minHeight: 50 }} onClick={entrar}>
          Entrar
        </button>
        <p className="tiny muted" style={{ textAlign: 'center' }}>Selector de rol simulado: el prototipo no tiene autenticación real.</p>
      </div>
    </Marco>
  );
}
