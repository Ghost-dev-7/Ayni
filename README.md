# Ayni

Plataforma que conecta comercios con alimentos próximos a vencer y comedores populares de Villa El Salvador, para reducir el desperdicio y llevar esos alimentos a quienes los necesitan.

Proyecto desarrollado durante el hackatón **HackODS UA 2026** (23 de noviembre de 2026), Universidad Autónoma del Perú.

## ODS abordado

**ODS 2 · Hambre cero** — reto "Alimentación solidaria".

## Equipo

- Abel Fernandez

## Qué hace hoy

- **App web (móvil primero, instalable como PWA)** para comercios y comedores:
  - El **comercio** publica un producto por vencer (producto, cantidad, caducidad, ventana de recojo) y sigue su estado.
  - El **comedor** ve las donaciones disponibles ordenadas por urgencia, con distancia y semáforo de caducidad, y las **reserva**.
  - El comedor **confirma la recogida** (estado del producto y cantidad recibida).
- **Estados** de una donación: `publicada → reservada → recogida` (o `vencida` si pasa la fecha).
- **Reglas de seguridad alimentaria:** no se publica un producto vencido, no se reserva uno vencido y los productos que requieren frío solo se reservan en comedores con refrigeración.
- **Trazabilidad:** cada paso queda en un registro de eventos.
- Todos los datos de la demostración son **sintéticos** (ficticios).

## Tecnologías

- **API:** Node.js, TypeScript y Fastify, con validación Zod.
- **Base de datos:** SQLite (`node:sqlite`, incluido en Node).
- **App:** React, Vite y TypeScript.
- **Pruebas:** `node:test` (24 pruebas de la API y las reglas del negocio).
- **Monorepo** con npm workspaces: `apps/api`, `apps/app` y `packages/shared` (tipos y esquemas compartidos).

## Instalación y uso

Requisitos: **Node.js 24 o superior**.

```bash
npm install
npm run seed     # carga los datos sintéticos (opcional: la API los carga sola si la base está vacía)
npm run api      # API en http://127.0.0.1:3001
npm run app      # app en http://localhost:5173 (en otra terminal)
```

Abre `http://localhost:5173`, elige si entras como comercio o como comedor y prueba el flujo: publicar, reservar y recoger.

Pruebas y verificación de tipos:

```bash
npm test
npm run typecheck
```

> En Windows PowerShell, si los scripts están bloqueados, usa `npm.cmd` en lugar de `npm`.

## Estructura

```
apps/api        API REST (Fastify) y base de datos
apps/app        App web de comercios y comedores
packages/shared Tipos y esquemas de validación compartidos
data/synthetic  Datos ficticios de demostración
```

## Estado

En desarrollo durante el evento. Próximamente: web de administración, emparejamiento por puntaje explicable, inventario de comedores y panel de impacto.
