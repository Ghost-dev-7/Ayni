import { useState } from 'react';
import { api } from '../api.ts';
import { Chip, Encabezado, Estado, nombreEstado, tonoEstado } from '../componentes.tsx';
import { useCarga } from '../carga.ts';
import { ICONO, cantidadTexto, claseSemaforo, fechaHora, textoVence } from '../formato.ts';

const FILTROS = [
  { id: '', etiqueta: 'Todas' },
  { id: 'publicada', etiqueta: 'Publicadas' },
  { id: 'reservada', etiqueta: 'Reservadas' },
  { id: 'recogida', etiqueta: 'Recogidas' },
  { id: 'vencida', etiqueta: 'Vencidas' },
];

export function Donaciones() {
  const [estado, setEstado] = useState('');
  const donaciones = useCarga(api.donaciones, [], 10_000);
  const comercios = useCarga(api.comercios);
  const comedores = useCarga(api.comedores);
  const ahora = new Date();

  return (
    <>
      <Encabezado supra="Operación" titulo="Donaciones" />
      <Estado carga={donaciones}>
        {(todas) => {
          const cuenta = (id: string) => (id ? todas.filter((d) => d.estado === id).length : todas.length);
          const lista = todas.filter((d) => !estado || d.estado === estado);
          return (
            <>
              <div className="seg" role="tablist" style={{ maxWidth: 560, marginBottom: 16 }}>
                {FILTROS.map((f) => (
                  <button key={f.id} type="button" role="tab" aria-selected={estado === f.id} className={estado === f.id ? 'on' : ''} onClick={() => setEstado(f.id)}>
                    {f.etiqueta} ({cuenta(f.id)})
                  </button>
                ))}
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Código</th><th>Producto</th><th>Comercio</th><th>Caducidad</th><th>Estado</th><th>Comedor</th><th>Recogida</th></tr></thead>
                  <tbody>
                    {lista.length === 0 && <tr><td colSpan={7} className="muted">No hay donaciones en este estado.</td></tr>}
                    {lista.map((d) => {
                      const abierta = d.estado === 'publicada' || d.estado === 'reservada';
                      return (
                        <tr key={d.id}>
                          <td>{d.codigo}</td>
                          <td>{ICONO[d.categoria]} {d.producto} · {cantidadTexto(d.cantidad, d.unidad)}</td>
                          <td>{comercios.datos?.find((c) => c.id === d.comercioId)?.nombre ?? '—'}</td>
                          <td>{abierta ? <span className={`sem ${claseSemaforo(d.nivelCaducidad)}`}>{textoVence(d.caducaEn, ahora)}</span> : fechaHora(d.caducaEn)}</td>
                          <td><Chip tono={tonoEstado(d.estado)}>{nombreEstado(d.estado)}</Chip>{abierta && d.estado === 'publicada' && d.nivelCaducidad === 'rojo' && <> <Chip tono="red">Sin comedor</Chip></>}</td>
                          <td>{comedores.datos?.find((c) => c.id === d.comedorId)?.nombre ?? '—'}</td>
                          <td>{d.recogidaEn ? `${fechaHora(d.recogidaEn)} · ${d.cantidadRecibida !== null ? cantidadTexto(d.cantidadRecibida, d.unidad) : ''}` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </Estado>
    </>
  );
}
