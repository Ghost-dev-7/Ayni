# Ayni

Plataforma que conecta comercios con alimentos próximos a vencer y comedores populares de Villa El Salvador, para reducir el desperdicio y llevar esos alimentos a quienes los necesitan.

Proyecto desarrollado durante el hackatón **HackODS UA 2026** (23 de noviembre de 2026), Universidad Autónoma del Perú.

## ODS abordado

**ODS 2 · Hambre cero** — reto "Alimentación solidaria".

## Equipo

**Nombre del equipo:** Ayni

**Integrantes:**

- Fernandez Chuse, Abel
- Guevara Cardenas, Jarol
- Chavez Huashua, Nicolas

## Qué incluye

**App para comercios y comedores** (móvil primero, instalable como PWA):

- **Comercio:** publica un producto por vencer, con el formulario o escribiéndolo con sus palabras ("20 panes que vencen en 4 días"). Solo se publican productos que vencen en 3 días o más.
- **Comedor:** ve las donaciones ordenadas por un puntaje de 0 a 100 que explica el porqué (urgencia, cercanía, necesidad y capacidad) y las reserva.
- **Entrega verificada con QR:** el comercio muestra el QR de la entrega, el comedor lo escanea y aparece **Aprobado**. La recogida queda registrada y lo recibido entra al inventario del comedor. Si la cámara falla, sirve el código de 4 dígitos que aparece bajo el QR.
- **Inventario del comedor:** sube con lo recogido y baja con lo consumido; avisa en rojo cuando un producto queda por debajo de 10.

**Web de administración** (escritorio): panel de impacto, registro de eventos con la trazabilidad de cada donación, asignación manual de donaciones, inventario central, mapa de la red y alta de comedores y comercios.

## Tecnologías

- **API:** Node.js, TypeScript y Fastify, con validación Zod.
- **Base de datos:** SQLite (`node:sqlite`, incluido en Node).
- **App y administración:** React, Vite y TypeScript.
- **Mapa:** Leaflet con OpenStreetMap. **QR:** `qrcode` y `jsqr`.
- **Pruebas:** `node:test` (120 pruebas).
- **Monorepo** (npm workspaces): `apps/api`, `apps/app`, `apps/admin` y `packages/shared`.

## Instalación y uso

Requisitos: **Node.js 24 o superior** (probado con Node 26). Hace falta internet para `npm install` y para el plano del mapa.

```bash
npm install
npm run api      # API en http://127.0.0.1:3001 (carga sola los datos de ejemplo si la base está vacía)
npm run app      # app en http://localhost:5173 (en otra terminal)
npm run admin    # administración en http://localhost:5174 (en otra terminal)
```

Abre `http://localhost:5173` y entra como comercio o como comedor. Para probar el QR, el comercio abre el seguimiento de una donación reservada y el comedor la escanea desde Notificaciones con la cámara del teléfono (el navegador solo da acceso a la cámara en `localhost` o con HTTPS).

- `npm run seed` vuelve a cargar los datos de demostración originales.
- `npm test` y `npm run typecheck` ejecutan las pruebas y la verificación de tipos.
- Modo sin conexión de la app: `npm run build:app` y `npm run preview -w @ayni/app` (http://localhost:4173).
- En Windows PowerShell, si los scripts están bloqueados, usa `npm.cmd` en lugar de `npm`.

## Alcance y supuestos

Es un prototipo: todos los datos son **ficticios**, no hay autenticación real (se elige un rol y una cuenta), ni pagos, ni logística de transporte.

Supuestos de la demostración, ajustables en el código: 1 kg ≈ 2 raciones, un peso aproximado por unidad de cada producto (solo para las cifras del panel), stock mínimo de 10 y capacidad de almacenar 7 días de consumo.
