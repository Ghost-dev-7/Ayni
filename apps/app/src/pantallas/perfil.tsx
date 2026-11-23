import { CATEGORIAS, type Categoria } from '@ayni/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api.ts';
import { Estado, Marco } from '../componentes.tsx';
import { ICONO, NOMBRE_CATEGORIA } from '../formato.ts';
import { useCarga, type Sesion } from '../sesion.ts';
import { PESTANAS_COMEDOR as PESTANAS } from './pestanas.ts';

/** Lo que el comedor declara sobre sí mismo. Cambiarlo cambia el puntaje de sus ofertas. */
export function ComedorPerfil({ sesion }: { sesion: Sesion }) {
  const comedores = useCarga(api.comedores, [sesion.id]);
  const comedor = comedores.datos?.find((c) => c.id === sesion.id);
  const [necesidades, setNecesidades] = useState<Categoria[]>([]);
  const [raciones, setRaciones] = useState('');
  const [frio, setFrio] = useState(false);
  const [horario, setHorario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!comedor) return;
    setNecesidades(comedor.necesidades);
    setRaciones(String(comedor.racionesDia));
    setFrio(comedor.refrigeracion);
    setHorario(comedor.horarioRecojo);
  }, [comedor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (c: Categoria) => {
    setGuardado(false);
    setNecesidades((n) => (n.includes(c) ? n.filter((x) => x !== c) : [...n, c]));
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    setEnviando(true);
    try {
      await api.perfil(sesion.id, { necesidades, racionesDia: Number(raciones), refrigeracion: frio, horarioRecojo: horario });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Marco pestanas={PESTANAS} activa="/comedor/perfil">
      <div className="top">
        <b style={{ fontSize: 20, fontFamily: 'var(--serif)' }}>Mis necesidades</b>
        <span className="avatar" style={{ background: 'var(--amber)', color: '#2b1604' }} aria-hidden="true">{comedor?.nombre.replace('Comedor ', '').charAt(0) ?? '?'}</span>
      </div>
      <p className="muted small">Esto mejora las sugerencias: el sistema prioriza las donaciones que más necesitas.</p>
      <Estado carga={comedores}>
        {() => (
          <form className="stack" style={{ marginTop: 12 }} onSubmit={guardar}>
            <div className="section-title" style={{ margin: '4px 0' }}><h2>Categorías prioritarias</h2></div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIAS.map((c) => (
                <button key={c} type="button" aria-pressed={necesidades.includes(c)} className={`chip ${necesidades.includes(c) ? 'green' : 'gray'}`} style={{ border: 0, cursor: 'pointer', padding: '7px 12px' }} onClick={() => alternar(c)}>
                  {ICONO[c]} {NOMBRE_CATEGORIA[c]}{necesidades.includes(c) ? ' ✓' : ''}
                </button>
              ))}
            </div>
            <div className="card stack">
              <label className="field"><span>Raciones por día</span><input className="input" type="number" min="1" value={raciones} onChange={(e) => { setRaciones(e.target.value); setGuardado(false); }} required /></label>
              <div className="checks"><label><input type="checkbox" checked={frio} onChange={(e) => { setFrio(e.target.checked); setGuardado(false); }} /> Tenemos refrigeración</label></div>
              <label className="field"><span>Horario de recojo</span><input className="input" value={horario} onChange={(e) => { setHorario(e.target.value); setGuardado(false); }} required minLength={3} /></label>
            </div>
            {error && <div className="aviso error" role="alert">{error}</div>}
            {guardado && <div className="aviso ok" role="status">✓ Cambios guardados. Tus ofertas ya usan este perfil.</div>}
            <button className="btn block" disabled={enviando} type="submit">{enviando ? 'Guardando…' : 'Guardar cambios'}</button>
          </form>
        )}
      </Estado>
    </Marco>
  );
}
