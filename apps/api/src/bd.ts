import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type BD = DatabaseSync;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS comercios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  direccion TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS comedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  zona TEXT NOT NULL,
  direccion TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  raciones_dia INTEGER NOT NULL,
  necesidades TEXT NOT NULL DEFAULT '[]',
  refrigeracion INTEGER NOT NULL DEFAULT 0,
  horario_recojo TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS donaciones (
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  comercio_id INTEGER NOT NULL REFERENCES comercios(id),
  producto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  cantidad REAL NOT NULL CHECK (cantidad > 0),
  unidad TEXT NOT NULL,
  caduca_en TEXT NOT NULL,
  ventana_desde TEXT NOT NULL,
  ventana_hasta TEXT NOT NULL,
  requiere_frio INTEGER NOT NULL DEFAULT 0,
  estado TEXT NOT NULL CHECK (estado IN ('publicada','reservada','recogida','vencida')),
  comedor_id INTEGER REFERENCES comedores(id),
  creada_en TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_donaciones_estado ON donaciones(estado);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  rol TEXT NOT NULL,
  actor TEXT NOT NULL,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_eventos_fecha ON eventos(fecha);
`;

const TABLAS = ['eventos', 'donaciones', 'comedores', 'comercios'];

/** Abre la base de datos SQLite (archivo, o ":memory:" para pruebas) y crea el esquema. */
export function abrirBD(ruta: string = process.env.DB_PATH ?? resolve(import.meta.dirname, '../data/ayni.db')): BD {
  if (ruta !== ':memory:') mkdirSync(dirname(ruta), { recursive: true });
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON;');
  if (ruta !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(ESQUEMA);
  return db;
}

/** Vacía todas las tablas y reinicia los contadores. */
export function vaciarBD(db: BD): void {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const t of TABLAS) db.exec(`DELETE FROM ${t};`);
  db.exec(`DELETE FROM sqlite_sequence WHERE name IN (${TABLAS.map((t) => `'${t}'`).join(',')});`);
  db.exec('PRAGMA foreign_keys = ON;');
}
