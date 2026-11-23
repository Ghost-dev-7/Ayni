import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ESTADOS_DONACION } from '@ayni/shared';
import { ErrorDeNegocio, exigirTransicion, generarCodigoEntrega, puedeTransicionar } from './estados.ts';

describe('estados de una donación', () => {
  it('permite el flujo publicada → reservada → recogida', () => {
    assert.equal(puedeTransicionar('publicada', 'reservada'), true);
    assert.equal(puedeTransicionar('reservada', 'recogida'), true);
  });

  it('permite vencer una donación publicada o reservada', () => {
    assert.equal(puedeTransicionar('publicada', 'vencida'), true);
    assert.equal(puedeTransicionar('reservada', 'vencida'), true);
  });

  it('no permite saltarse pasos ni salir de un estado final', () => {
    assert.equal(puedeTransicionar('publicada', 'recogida'), false);
    for (const final of ['recogida', 'vencida'] as const) {
      for (const otro of ESTADOS_DONACION) assert.equal(puedeTransicionar(final, otro), false);
    }
  });

  it('exigirTransicion lanza un error de negocio 409 si no es válida', () => {
    assert.throws(
      () => exigirTransicion('recogida', 'reservada'),
      (e) => e instanceof ErrorDeNegocio && e.statusCode === 409,
    );
  });

  it('genera códigos de entrega con formato NN-NN', () => {
    assert.match(generarCodigoEntrega(), /^\d{2}-\d{2}$/);
    assert.equal(generarCodigoEntrega(() => 0), '00-00');
    assert.equal(generarCodigoEntrega(() => 0.4827), '48-27');
  });
});
