import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { horasRestantes, nivelCaducidad, puedePublicar, urgencia } from './caducidad.ts';

const ahora = new Date('2026-11-23T12:00:00Z');
const enHoras = (h: number) => new Date(ahora.getTime() + h * 3_600_000).toISOString();

describe('caducidad', () => {
  it('calcula las horas restantes', () => {
    assert.equal(horasRestantes(enHoras(5), ahora), 5);
    assert.equal(horasRestantes(enHoras(-2), ahora), -2);
  });

  it('asigna el semáforo según el tiempo que queda', () => {
    assert.equal(nivelCaducidad(enHoras(-1), ahora), 'vencido');
    assert.equal(nivelCaducidad(enHoras(0), ahora), 'vencido');
    assert.equal(nivelCaducidad(enHoras(3), ahora), 'rojo');
    assert.equal(nivelCaducidad(enHoras(12), ahora), 'rojo');
    assert.equal(nivelCaducidad(enHoras(24), ahora), 'amarillo');
    assert.equal(nivelCaducidad(enHoras(48), ahora), 'amarillo');
    assert.equal(nivelCaducidad(enHoras(49), ahora), 'verde');
  });

  it('no permite publicar productos vencidos', () => {
    assert.equal(puedePublicar(enHoras(-0.5), ahora), false);
    assert.equal(puedePublicar(enHoras(0), ahora), false);
    assert.equal(puedePublicar(enHoras(1), ahora), true);
  });

  it('la urgencia crece cuanto menos tiempo queda', () => {
    assert.equal(urgencia(enHoras(-1), ahora), 100);
    assert.equal(urgencia(enHoras(72), ahora), 0);
    assert.equal(urgencia(enHoras(200), ahora), 0);
    assert.ok(urgencia(enHoras(3), ahora) > urgencia(enHoras(24), ahora));
    assert.ok(urgencia(enHoras(24), ahora) > urgencia(enHoras(60), ahora));
  });
});
