import { api } from '../api.ts';
import { Chip, Encabezado, Estado } from '../componentes.tsx';
import { useCarga } from '../carga.ts';
import { ICONO, cantidadTexto, claseSemaforo, textoVence } from '../formato.ts';

/** Inventario de toda la red: qué tiene cada comedor, qué vence pronto y qué le falta. */
export function Inventario() {
  const inv = useCarga(api.inventario, [], 15_000);
  const ahora = new Date();

  return (
    <>
      <Encabezado supra="Operación" titulo="Inventario central de comedores" />
      <Estado carga={inv}>
        {(d) => (
          <>
            <section className="kpis">
              <div className="kpi"><small>Stock total de la red</small><b>{Math.round(d.totales.stockKg).toLocaleString('es-PE')} kg</b><span className="delta">{d.totales.comedores} comedores</span></div>
              <div className="kpi"><small>Lotes por vencer (72 h)</small><b style={{ color: d.totales.lotesPorVencer > 0 ? 'var(--red)' : undefined }}>{d.totales.lotesPorVencer}</b><span className="delta" style={{ color: 'var(--red)' }}>{d.totales.lotesVencidos} ya vencidos</span></div>
              <div className="kpi"><small>Productos bajo el mínimo</small><b>{d.totales.productosBajoMinimo}</b><span className="delta">en {d.comedores.filter((c) => c.productosBajoMinimo > 0).length} comedores</span></div>
              <div className="kpi"><small>Comedores con alertas</small><b>{d.comedores.filter((c) => c.lotesPorVencer + c.lotesVencidos + c.productosBajoMinimo > 0).length}</b><span className="delta">de {d.totales.comedores}</span></div>
            </section>

            <h2 style={{ fontSize: 20, margin: '22px 0 10px' }}>Por comedor</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Comedor</th><th>Stock</th><th>Lotes</th><th>Por vencer</th><th>Vencidos</th><th>Bajo mínimo</th><th>Estado</th></tr></thead>
                <tbody>
                  {d.comedores.map((c) => (
                    <tr key={c.comedorId} style={{ opacity: c.activo ? 1 : 0.6 }}>
                      <td className="wrap"><b>{c.nombre}</b></td>
                      <td>{Math.round(c.stockKg)} kg</td>
                      <td>{c.lotes}</td>
                      <td>{c.lotesPorVencer}</td>
                      <td>{c.lotesVencidos}</td>
                      <td>{c.productosBajoMinimo}</td>
                      <td>{c.lotesPorVencer + c.lotesVencidos + c.productosBajoMinimo === 0 ? <Chip tono="green">Sin alertas</Chip> : <Chip tono="yellow">Con alertas</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid2" style={{ marginTop: 22, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <section>
                <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>Vencen pronto</h2>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Producto</th><th>Comedor</th><th>Cantidad</th><th>Caducidad</th></tr></thead>
                    <tbody>
                      {d.porVencer.length === 0 && <tr><td colSpan={4} className="muted">Ningún lote vence en las próximas 72 horas.</td></tr>}
                      {d.porVencer.map((l) => (
                        <tr key={l.id}>
                          <td className="wrap">{ICONO[l.categoria]} {l.producto}</td>
                          <td className="wrap">{l.comedor.replace('Comedor ', '')}</td>
                          <td>{cantidadTexto(l.cantidad, l.unidad, l.producto)}</td>
                          <td>{l.caducaEn && l.nivelCaducidad !== 'sin-fecha' ? <span className={`sem ${claseSemaforo(l.nivelCaducidad)}`}>{textoVence(l.caducaEn, ahora)}</span> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section>
                <h2 style={{ fontSize: 20, margin: '0 0 10px' }}>Les falta</h2>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Producto</th><th>Comedor</th><th>Tiene</th><th>Mínimo</th></tr></thead>
                    <tbody>
                      {d.bajoMinimo.length === 0 && <tr><td colSpan={4} className="muted">Ningún producto está por debajo de su mínimo.</td></tr>}
                      {d.bajoMinimo.map((b) => (
                        <tr key={`${b.comedorId}-${b.producto}-${b.unidad}`}>
                          <td className="wrap">{b.producto}</td>
                          <td className="wrap">{b.comedor.replace('Comedor ', '')}</td>
                          <td style={{ color: 'var(--red)', fontWeight: 700 }}>{cantidadTexto(b.total, b.unidad, b.producto)}</td>
                          <td>{cantidadTexto(b.minimo, b.unidad, b.producto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <p className="hint">Cada comedor gestiona su inventario desde la app. Aquí se centraliza para detectar vencimientos y faltantes en toda la red.</p>
          </>
        )}
      </Estado>
    </>
  );
}
