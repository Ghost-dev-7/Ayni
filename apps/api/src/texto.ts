/**
 * Convierte una frase libre del comercio en un borrador de donación, SIN inteligencia artificial
 * externa: usa expresiones regulares y un diccionario de productos. Siempre está disponible.
 *
 *   "20 kg de pan de ayer, recojo hasta las 6pm"
 *     → Pan francés · 20 kg · vence hoy a las 23:59 · recojo hasta las 18:00
 *
 * El borrador nunca se publica solo: el comercio lo revisa y lo confirma.
 */
import { buscarEnCatalogo, type BorradorDonacion, type Categoria, type Unidad } from '@ayni/shared';

interface EntradaDiccionario {
  claves: string[];
  producto: string;
  categoria: Categoria;
  unidad: Unidad;
  frio?: boolean;
}

const DICCIONARIO: EntradaDiccionario[] = [
  { claves: ['pan de molde'], producto: 'Pan de molde', categoria: 'panaderia', unidad: 'kg' },
  { claves: ['pan frances', 'pan', 'panes', 'pan del dia', 'bizcocho', 'bizcochos'], producto: 'Pan francés', categoria: 'panaderia', unidad: 'kg' },
  { claves: ['queque', 'queques', 'keke', 'kekes', 'torta', 'tortas', 'pastel', 'pasteles'], producto: 'Queques surtidos', categoria: 'panaderia', unidad: 'kg' },
  { claves: ['verduras', 'verdura', 'hortalizas'], producto: 'Verduras surtidas', categoria: 'verduras', unidad: 'kg' },
  { claves: ['tomate', 'tomates'], producto: 'Tomates', categoria: 'verduras', unidad: 'kg' },
  { claves: ['papa', 'papas', 'patata', 'patatas'], producto: 'Papas', categoria: 'verduras', unidad: 'kg' },
  { claves: ['cebolla', 'cebollas'], producto: 'Cebollas', categoria: 'verduras', unidad: 'kg' },
  { claves: ['zanahoria', 'zanahorias'], producto: 'Zanahorias', categoria: 'verduras', unidad: 'kg' },
  { claves: ['lechuga', 'lechugas'], producto: 'Lechugas', categoria: 'verduras', unidad: 'unidades' },
  { claves: ['platano', 'platanos', 'banana', 'bananas'], producto: 'Plátanos', categoria: 'frutas', unidad: 'kg' },
  { claves: ['manzana', 'manzanas'], producto: 'Manzanas', categoria: 'frutas', unidad: 'kg' },
  { claves: ['naranja', 'naranjas', 'mandarina', 'mandarinas', 'fruta', 'frutas'], producto: 'Frutas surtidas', categoria: 'frutas', unidad: 'kg' },
  { claves: ['yogur', 'yogures', 'yogurt', 'yogurts'], producto: 'Yogures', categoria: 'lacteos', unidad: 'unidades', frio: true },
  { claves: ['leche evaporada'], producto: 'Leche evaporada', categoria: 'conservas', unidad: 'unidades' },
  { claves: ['leche fresca', 'leche'], producto: 'Leche fresca', categoria: 'lacteos', unidad: 'litros', frio: true },
  { claves: ['queso', 'quesos'], producto: 'Queso', categoria: 'lacteos', unidad: 'kg', frio: true },
  { claves: ['pollo'], producto: 'Pollo', categoria: 'carnes', unidad: 'kg', frio: true },
  { claves: ['carne', 'carnes', 'res'], producto: 'Carne', categoria: 'carnes', unidad: 'kg', frio: true },
  { claves: ['pescado', 'pescados'], producto: 'Pescado', categoria: 'carnes', unidad: 'kg', frio: true },
  { claves: ['lenteja', 'lentejas'], producto: 'Lentejas', categoria: 'menestras', unidad: 'kg' },
  { claves: ['frejol', 'frejoles', 'frijol', 'frijoles'], producto: 'Frejoles', categoria: 'menestras', unidad: 'kg' },
  { claves: ['garbanzo', 'garbanzos'], producto: 'Garbanzos', categoria: 'menestras', unidad: 'kg' },
  { claves: ['atun', 'conserva', 'conservas', 'lata', 'latas'], producto: 'Atún en lata', categoria: 'conservas', unidad: 'unidades' },
  { claves: ['arroz'], producto: 'Arroz', categoria: 'abarrotes', unidad: 'kg' },
  { claves: ['fideo', 'fideos', 'pasta', 'tallarin', 'tallarines'], producto: 'Fideos', categoria: 'abarrotes', unidad: 'kg' },
  { claves: ['azucar'], producto: 'Azúcar', categoria: 'abarrotes', unidad: 'kg' },
  { claves: ['harina'], producto: 'Harina', categoria: 'abarrotes', unidad: 'kg' },
  { claves: ['aceite'], producto: 'Aceite', categoria: 'abarrotes', unidad: 'litros' },
  { claves: ['menu', 'menus', 'almuerzo', 'almuerzos', 'comida preparada', 'comida'], producto: 'Menú del día', categoria: 'preparados', unidad: 'unidades' },
];

const NUMEROS_EN_PALABRAS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};

const DIAS_SEMANA: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

const H = 3_600_000;

/** Minúsculas, sin tildes y con espacios simples. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[;¡!¿?]/g, ' ')
    .replace(/(?<!\d),|,(?!\d)/g, ' ') // se conserva la coma decimal (2,5)
    .replace(/\s+/g, ' ')
    .trim();
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function unidadDe(palabra: string): Unidad {
  if (/^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/.test(palabra)) return 'kg';
  if (/^(l|lt|lts|litro|litros)$/.test(palabra)) return 'litros';
  return 'unidades';
}

/** Palabras que son solo una medida (no un producto). */
const PALABRAS_UNIDAD = 'kilogramos?|kilos?|kgs?|litros?|lts?|lt|l|unidades?|unid|und|u|latas?|bolsas?|cajas?|paquetes?|botellas?|raciones';

const aNumero = (crudo: string) => NUMEROS_EN_PALABRAS[crudo] ?? Number(crudo.replace(',', '.'));
const quitar = (t: string, desde: number, largo: number) => (t.slice(0, desde) + ' ' + t.slice(desde + largo)).replace(/\s+/g, ' ').trim();

/** Cantidad con medida ("20 kg") o, si no la hay, un número seguido de un producto ("40 yogures"). */
function leerCantidad(t: string): { cantidad: number; unidad: Unidad | null; resto: string } | null {
  const numero = '(\\d+(?:[.,]\\d+)?|' + Object.keys(NUMEROS_EN_PALABRAS).join('|') + ')';

  const conMedida = new RegExp(`(?:^|\\s)${numero}\\s*(${PALABRAS_UNIDAD})(?=\\s|$)`).exec(t);
  if (conMedida) {
    const cantidad = aNumero(conMedida[1]!);
    if (Number.isFinite(cantidad) && cantidad > 0) {
      return { cantidad, unidad: unidadDe(conMedida[2]!), resto: quitar(t, conMedida.index, conMedida[0].length) };
    }
  }

  const claves = DICCIONARIO.flatMap((e) => e.claves).sort((a, b) => b.length - a.length).map(escapar).join('|');
  const conProducto = new RegExp(`(?:^|\\s)${numero}\\s+(?=(?:${claves})(?:\\s|$))`).exec(t);
  if (conProducto) {
    const cantidad = aNumero(conProducto[1]!);
    if (Number.isFinite(cantidad) && cantidad > 0) return { cantidad, unidad: null, resto: quitar(t, conProducto.index, conProducto[0].length) };
  }
  return null;
}

function buscarProducto(t: string): EntradaDiccionario | null {
  const candidatas = DICCIONARIO.flatMap((e) => e.claves.map((c) => ({ e, c }))).sort((a, b) => b.c.length - a.c.length);
  for (const { e, c } of candidatas) {
    if (new RegExp(`(?:^|\\s)${escapar(c)}(?=\\s|$)`).test(t)) return e;
  }
  return null;
}

function finDelDia(base: Date, diasMas: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + diasMas);
  d.setHours(23, 59, 0, 0);
  return d;
}

interface Caducidad {
  fecha: Date;
  entendida: boolean;
}

function leerCaducidad(t: string, ahora: Date): Caducidad {
  let m: RegExpExecArray | null;
  if (/\b(de ayer|del dia anterior|de la vispera|de antes de ayer)\b/.test(t)) return { fecha: finDelDia(ahora, 0), entendida: true };
  if (/\b(vence|caduca|vencen|caducan)\s+(hoy|esta noche)\b/.test(t) || /\bpara hoy\b/.test(t)) return { fecha: finDelDia(ahora, 0), entendida: true };
  if (/\b(vence|caduca|vencen|caducan)\s+pasado manana\b/.test(t)) return { fecha: finDelDia(ahora, 2), entendida: true };
  if (/\b(vence|caduca|vencen|caducan)\s+manana\b/.test(t)) return { fecha: finDelDia(ahora, 1), entendida: true };
  if ((m = /\ben (\d+)\s*(horas?|hrs?|h)\b/.exec(t))) return { fecha: new Date(ahora.getTime() + Number(m[1]) * H), entendida: true };
  if ((m = /\ben (\d+)\s*dias?\b/.exec(t))) return { fecha: finDelDia(ahora, Number(m[1])), entendida: true };
  if ((m = /\b(?:vence|caduca|vencen|caducan)(?: el)? (domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(t))) {
    const objetivo = DIAS_SEMANA[m[1]!]!;
    let dif = (objetivo - ahora.getDay() + 7) % 7;
    if (dif === 0) dif = 7;
    return { fecha: finDelDia(ahora, dif), entendida: true };
  }
  if (/\b(del dia|de hoy|fresco|recien horneado)\b/.test(t)) return { fecha: finDelDia(ahora, 1), entendida: true };
  return { fecha: new Date(ahora.getTime() + 24 * H), entendida: false };
}

interface Ventana {
  fecha: Date;
  entendida: boolean;
  supuestoPm: boolean;
}

function leerVentana(t: string, ahora: Date): Ventana | null {
  const m = /\b(?:hasta|antes de|maximo|como maximo|a mas tardar)(?: a)?(?: las?)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a m|p m|de la manana|de la tarde|de la noche|hrs|horas|h)?(?=\s|$)/.exec(t);
  if (!m) return null;
  let hora = Number(m[1]);
  const minutos = m[2] ? Number(m[2]) : 0;
  if (hora > 23 || minutos > 59) return null;
  const sufijo = m[3] ?? '';
  const esPm = /^(pm|p m|de la tarde|de la noche)$/.test(sufijo);
  const esAm = /^(am|a m|de la manana)$/.test(sufijo);
  let supuestoPm = false;
  if (esPm && hora < 12) hora += 12;
  else if (esAm && hora === 12) hora = 0;
  else if (!esPm && !esAm && hora >= 1 && hora <= 7 && !m[2]) {
    hora += 12; // "hasta las 6" suele ser la tarde
    supuestoPm = true;
  }
  const fecha = new Date(ahora);
  fecha.setHours(hora, minutos, 0, 0);
  if (fecha.getTime() <= ahora.getTime()) fecha.setDate(fecha.getDate() + 1);
  return { fecha, entendida: true, supuestoPm };
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Interpreta la frase del comercio. Nunca falla: lo que no entiende queda marcado en `advertencias`. */
export function interpretarTexto(texto: string, ahora: Date = new Date()): BorradorDonacion {
  const t = normalizar(texto);
  const advertencias: string[] = [];

  const cant = leerCantidad(t);
  const entradaProducto = buscarProducto(cant ? cant.resto : t);

  let producto: string;
  let categoria: Categoria;
  let unidad: Unidad;
  let requiereFrio = /\b(refrigerado|refrigerada|frio|fria|congelado|congelada|cadena de frio)\b/.test(t);

  if (entradaProducto) {
    // El catálogo manda: cada producto tiene una sola unidad en todo el sistema.
    const ref = buscarEnCatalogo(entradaProducto.producto);
    producto = ref?.nombre ?? entradaProducto.producto;
    categoria = ref?.categoria ?? entradaProducto.categoria;
    unidad = ref?.unidad ?? entradaProducto.unidad;
    requiereFrio = requiereFrio || Boolean(ref?.requiereFrio ?? entradaProducto.frio);
    if (cant?.unidad && cant.unidad !== unidad) {
      const como = unidad === 'unidades' ? (ref?.etiqueta ?? 'unidades') : unidad;
      advertencias.push(`${producto} se registra por ${como}: puse ${cant.cantidad} ${como}. Revisa la cantidad.`);
    }
  } else {
    // Producto desconocido: se toma lo que sigue a la cantidad como nombre y se avisa.
    const sobrante = (cant?.resto ?? t).replace(/\b(de|del|la|el|los|las|un|una|unos|unas|tengo|hay|quiero|donar|recojo|hasta|vence|caduca|manana|hoy|ayer)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const nombre = sobrante.split(' ').slice(0, 3).join(' ');
    producto = nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : '';
    categoria = 'abarrotes';
    unidad = cant?.unidad ?? 'unidades';
    advertencias.push(producto ? `No reconocí el producto: puse "${producto}" en la categoría Abarrotes. Revísalo.` : 'No pude identificar el producto. Escríbelo a mano.');
  }

  if (!cant) advertencias.push('No encontré la cantidad. Indícala (por ejemplo "20 kg").');

  const caducidad = leerCaducidad(t, ahora);
  if (!caducidad.entendida) advertencias.push('No indicaste cuándo vence: estimé 24 horas. Corrige la fecha si no es así.');

  const ventana = leerVentana(t, ahora);
  let ventanaHasta: Date;
  if (ventana) {
    ventanaHasta = ventana.fecha;
    if (ventana.supuestoPm) advertencias.push(`Entendí que recojan hasta las ${hhmm(ventanaHasta)}. Revísalo.`);
  } else {
    ventanaHasta = new Date(Math.min(ahora.getTime() + 4 * H, caducidad.fecha.getTime() - 30 * 60_000));
    advertencias.push(`No indicaste hasta qué hora recoger: puse las ${hhmm(ventanaHasta)}.`);
  }

  // La ventana de recojo no puede pasar de la caducidad ni empezar después de terminar.
  if (ventanaHasta.getTime() > caducidad.fecha.getTime()) {
    ventanaHasta = new Date(caducidad.fecha.getTime() - 30 * 60_000);
    advertencias.push('La hora de recojo pasaba de la caducidad: la ajusté para que sea antes.');
  }
  if (ventanaHasta.getTime() <= ahora.getTime()) {
    ventanaHasta = new Date(Math.min(caducidad.fecha.getTime(), ahora.getTime() + 30 * 60_000));
  }

  return {
    producto,
    categoria,
    cantidad: cant?.cantidad ?? null,
    unidad,
    caducaEn: caducidad.fecha.toISOString(),
    ventanaHasta: ventanaHasta.toISOString(),
    requiereFrio,
    advertencias,
    entendido: {
      producto: entradaProducto !== null,
      cantidad: cant !== null,
      caducidad: caducidad.entendida,
      ventana: ventana !== null,
    },
  };
}
