import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CATALOGO, aKgProducto, buscarEnCatalogo, etiquetaUnidad } from '@ayni/shared';

const unidadDe = (n: string) => buscarEnCatalogo(n)?.unidad;

describe('catálogo de productos', () => {
  it('azúcar, arroz, frejoles, lentejas, harina, papas, tomates, verduras y carnes van por kg', () => {
    for (const n of ['Azúcar', 'Arroz', 'Frejoles', 'Lentejas', 'Harina', 'Papas', 'Tomates', 'Verduras surtidas', 'Pollo', 'Carne', 'Pescado']) {
      assert.equal(unidadDe(n), 'kg', n);
    }
  });

  it('el resto va por unidades, con fideos por paquete y el atún por lata', () => {
    for (const n of ['Pan francés', 'Pan de molde', 'Queques surtidos', 'Plátanos', 'Manzanas', 'Yogures', 'Fideos', 'Atún en lata', 'Leche evaporada', 'Menú del día']) {
      assert.equal(unidadDe(n), 'unidades', n);
    }
    assert.equal(etiquetaUnidad('Fideos', 'unidades'), 'paquetes');
    assert.equal(etiquetaUnidad('Atún en lata', 'unidades'), 'latas');
    assert.equal(etiquetaUnidad('Pan de molde', 'unidades'), 'bolsas');
  });

  it('la leche fresca va por litros', () => {
    assert.equal(unidadDe('Leche fresca'), 'litros');
    assert.equal(etiquetaUnidad('Leche fresca', 'litros'), 'litros');
  });

  it('busca sin distinguir mayúsculas ni tildes', () => {
    assert.equal(buscarEnCatalogo('  PAN FRANCES ')?.nombre, 'Pan francés');
    assert.equal(buscarEnCatalogo('azucar')?.nombre, 'Azúcar');
    assert.equal(buscarEnCatalogo('quinua'), undefined);
  });

  it('no repite nombres y los refrigerados son los lácteos y las carnes', () => {
    const nombres = CATALOGO.map((p) => p.nombre.toLowerCase());
    assert.equal(new Set(nombres).size, nombres.length);
    for (const p of CATALOGO.filter((x) => x.requiereFrio)) assert.ok(['lacteos', 'carnes'].includes(p.categoria), p.nombre);
  });

  it('convierte a kilos: kg y litros tal cual, unidades con el peso del producto', () => {
    assert.equal(aKgProducto(20, 'kg', 'Arroz'), 20);
    assert.equal(aKgProducto(5, 'litros', 'Leche fresca'), 5);
    assert.equal(aKgProducto(100, 'unidades', 'Pan francés'), 10);
    assert.equal(aKgProducto(10, 'unidades', 'Producto desconocido'), 2.5);
  });
});
