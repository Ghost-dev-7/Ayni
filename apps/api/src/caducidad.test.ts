import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cumpleVidaMinima, horasRestantes, nivelCaducidad, puedePublicar, urgencia } from './caducidad.ts';

const ahora = new Date('2026-11-23T12:00:00Z');
const enHoras = (h: number) => new Date(ahora.getTime() + h * 3_600_000).toISOString();
const enDias = (d: number) => enHoras(d * 24);

describe('caducidad', () => {
  it('calcula las horas restantes', () => {
    assert.equal(horasRestantes(enHoras(5), ahora), 5);
    assert.equal(horasRestantes(enHoras(-2), ahora), -2);
  });

  it('asigna el semáforo: rojo hasta 3 días, amarillo hasta 5 días, verde si queda más', () => {
    assert.equal(nivelCaducidad(enHoras(-1), ahora), 'vencido');
    assert.equal(nivelCaducidad(enHoras(0), ahora), 'vencido');
    assert.equal(nivelCaducidad(enHoras(3), ahora), 'rojo');
    assert.equal(nivelCaducidad(enDias(3), ahora), 'rojo');
    assert.equal(nivelCaducidad(enHoras(73), ahora), 'amarillo');
    assert.equal(nivelCaducidad(enDias(5), ahora), 'amarillo');
    assert.equal(nivelCaducidad(enHoras(121), ahora), 'verde');
    assert.equal(nivelCaducidad(enDias(30), ahora), 'verde');
  });

  it('no permite publicar productos vencidos', () => {
    assert.equal(puedePublicar(enHoras(-0.5), ahora), false);
    assert.equal(puedePublicar(enHoras(0), ahora), false);
    assert.equal(puedePublicar(enHoras(1), ahora), true);
  });

  it('solo se publican productos que vencen en 3 días o más; los que duran más están bien', () => {
    assert.equal(cumpleVidaMinima(enHoras(-1), ahora), false);
    assert.equal(cumpleVidaMinima(enHoras(5), ahora), false);
    assert.equal(cumpleVidaMinima(enHoras(71), ahora), false);
    assert.equal(cumpleVidaMinima(enDias(3), ahora), true);
    assert.equal(cumpleVidaMinima(enDias(4), ahora), true);
    assert.equal(cumpleVidaMinima(enDias(5), ahora), true);
    assert.equal(cumpleVidaMinima(enDias(60), ahora), true);
  });

  it('la urgencia crece cuanto menos tiempo queda y distingue entre 3 y 5 días', () => {
    assert.equal(urgencia(enHoras(-1), ahora), 100);
    assert.equal(urgencia(enDias(7), ahora), 0);
    assert.equal(urgencia(enDias(30), ahora), 0);
    assert.ok(urgencia(enHoras(3), ahora) > urgencia(enHoras(24), ahora));
    assert.ok(urgencia(enDias(3), ahora) > urgencia(enDias(5), ahora));
    assert.ok(urgencia(enDias(5), ahora) > 0);
  });
});
