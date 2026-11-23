import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interpretarTexto, normalizar } from './texto.ts';

// 23-nov-2026 (lunes) a las 10:00, hora local.
const AHORA = new Date(2026, 10, 23, 10, 0, 0);
const hora = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

describe('interpretarTexto', () => {
  it('avisa que un producto que vence en menos de 3 días no se puede publicar', () => {
    const b = interpretarTexto('20 panes de ayer, recojo hasta las 6pm', AHORA);
    assert.equal(b.producto, 'Pan francés');
    assert.equal(hora(b.caducaEn), '23/11 23:59'); // pan de ayer: vence hoy
    assert.ok(b.advertencias.some((a) => a.includes('3 días o más')));
  });

  it('entiende el ejemplo "20 panes que vencen en 4 días, recojo hasta las 6pm"', () => {
    const b = interpretarTexto('20 panes que vencen en 4 días, recojo hasta las 6pm', AHORA);
    assert.equal(b.producto, 'Pan francés');
    assert.equal(b.categoria, 'panaderia');
    assert.equal(b.cantidad, 20);
    assert.equal(b.unidad, 'unidades');
    assert.equal(hora(b.caducaEn), '27/11 23:59');
    assert.equal(hora(b.ventanaHasta), '23/11 18:00');
    assert.equal(b.requiereFrio, false);
    assert.deepEqual(b.advertencias, []);
    assert.deepEqual(b.entendido, { producto: true, cantidad: true, caducidad: true, ventana: true });
  });

  it('reconoce unidades y marca el frío en los lácteos', () => {
    const b = interpretarTexto('Tengo 40 yogures que vencen mañana, recojo hasta las 17:30', AHORA);
    assert.equal(b.producto, 'Yogures');
    assert.equal(b.categoria, 'lacteos');
    assert.equal(b.cantidad, 40);
    assert.equal(b.unidad, 'unidades');
    assert.equal(b.requiereFrio, true);
    assert.equal(hora(b.caducaEn), '24/11 23:59');
    assert.equal(hora(b.ventanaHasta), '23/11 17:30');
  });

  it('entiende cantidades escritas con palabras y litros', () => {
    const b = interpretarTexto('veinte litros de leche fresca, vence hoy', AHORA);
    assert.equal(b.cantidad, 20);
    assert.equal(b.unidad, 'litros');
    assert.equal(b.producto, 'Leche fresca');
  });

  it('respeta la unidad del catálogo y avisa si el comercio usó otra: el pan va por unidades, no por kg', () => {
    const b = interpretarTexto('20 kg de pan de ayer, recojo hasta las 6pm', AHORA);
    assert.equal(b.producto, 'Pan francés');
    assert.equal(b.unidad, 'unidades');
    assert.equal(b.cantidad, 20);
    assert.ok(b.advertencias.some((a) => a.includes('se registra por unidades')));
  });

  it('fideos van por paquetes, el atún por latas y el arroz por kg', () => {
    assert.equal(interpretarTexto('30 paquetes de fideos', AHORA).unidad, 'unidades');
    assert.equal(interpretarTexto('48 latas de atún', AHORA).producto, 'Atún en lata');
    assert.equal(interpretarTexto('48 latas de atún', AHORA).unidad, 'unidades');
    const arroz = interpretarTexto('25 kg de arroz', AHORA);
    assert.equal(arroz.unidad, 'kg');
    assert.deepEqual(arroz.advertencias.filter((a) => a.includes('se registra por')), []);
  });

  it('distingue "pan de molde" de "pan" y "leche evaporada" de "leche"', () => {
    assert.equal(interpretarTexto('8 bolsas de pan de molde', AHORA).producto, 'Pan de molde');
    assert.equal(interpretarTexto('30 latas de leche evaporada', AHORA).producto, 'Leche evaporada');
    assert.equal(interpretarTexto('30 latas de leche evaporada', AHORA).requiereFrio, false);
  });

  it('solo trabaja con enteros: redondea un decimal (con coma o con punto) y lo avisa', () => {
    for (const frase of ['2,5 kg de tomates', '2.5 kg de tomates']) {
      const b = interpretarTexto(frase, AHORA);
      assert.equal(b.cantidad, 3, frase);
      assert.ok(b.advertencias.some((a) => a.includes('números enteros') && a.includes('2,5')), frase);
    }
    assert.equal(interpretarTexto('0,3 kg de tomates', AHORA).cantidad, 1); // nunca queda en cero
    assert.deepEqual(interpretarTexto('12 kg de tomates', AHORA).advertencias.filter((a) => a.includes('enteros')), []);
  });

  it('entiende vencimientos relativos: en N horas y en N días', () => {
    const horas = interpretarTexto('10 kg de verduras, vencen en 5 horas', AHORA);
    assert.equal(hora(horas.caducaEn), '23/11 15:00');
    const dias = interpretarTexto('10 kg de papas, vencen en 3 días', AHORA);
    assert.equal(hora(dias.caducaEn), '26/11 23:59');
  });

  it('entiende un día de la semana', () => {
    const b = interpretarTexto('12 kg de manzanas, vencen el viernes', AHORA);
    assert.equal(hora(b.caducaEn), '27/11 23:59');
  });

  it('"hasta las 6" sin más se entiende como las 18:00 y lo avisa', () => {
    const b = interpretarTexto('20 kg de pan, hasta las 6', AHORA);
    assert.equal(hora(b.ventanaHasta), '23/11 18:00');
    assert.ok(b.advertencias.some((a) => a.includes('18:00')));
  });

  it('si la hora de recojo ya pasó, la pasa al día siguiente', () => {
    const b = interpretarTexto('5 kg de pan, vence mañana, hasta las 8am', AHORA);
    assert.equal(hora(b.ventanaHasta), '24/11 08:00');
  });

  it('la ventana de recojo nunca pasa de la caducidad', () => {
    const b = interpretarTexto('10 kg de verduras, vencen en 2 horas, recojo hasta las 8pm', AHORA);
    assert.ok(new Date(b.ventanaHasta).getTime() < new Date(b.caducaEn).getTime());
    assert.ok(b.advertencias.some((a) => a.includes('ajusté')));
  });

  it('avisa de lo que no entiende en vez de inventarlo', () => {
    const b = interpretarTexto('pan', AHORA);
    assert.equal(b.cantidad, null);
    assert.equal(b.entendido.cantidad, false);
    assert.equal(b.entendido.caducidad, false);
    assert.ok(b.advertencias.length >= 3);
    assert.ok(new Date(b.caducaEn).getTime() > AHORA.getTime());
    assert.ok(new Date(b.ventanaHasta).getTime() > AHORA.getTime());
  });

  it('con un producto desconocido lo conserva como nombre y avisa', () => {
    const b = interpretarTexto('15 kg de quinua, vence mañana', AHORA);
    assert.equal(b.entendido.producto, false);
    assert.match(b.producto, /Quinua/i);
    assert.equal(b.cantidad, 15);
    assert.ok(b.advertencias.some((a) => a.includes('No reconocí')));
  });

  it('si no dice cuándo vence, pone 3 días (el mínimo para publicar) y lo avisa', () => {
    const b = interpretarTexto('20 panes, recojo hasta las 6pm', AHORA);
    assert.equal(hora(b.caducaEn), '26/11 23:59');
    assert.equal(b.entendido.caducidad, false);
    assert.ok(b.advertencias.some((a) => a.includes('dentro de 3 días')));
  });

  it('una caducidad siempre queda en el futuro', () => {
    for (const frase of ['10 kg de pan de ayer', '5 kg de papas vence hoy', '3 kg de queso en 1 hora', '2 kg de carne']) {
      assert.ok(new Date(interpretarTexto(frase, AHORA).caducaEn).getTime() > AHORA.getTime(), frase);
    }
  });

  it('normaliza tildes, mayúsculas y signos', () => {
    assert.equal(normalizar('  ¡Pan, DE Ayér! '), 'pan de ayer');
  });
});
