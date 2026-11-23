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
  - El **comedor** ve las donaciones disponibles ordenadas por un **puntaje de 0 a 100** y puede ver **por qué** se le sugiere cada una. Las **reserva**.
  - El comedor **confirma la recogida** (estado del producto y cantidad recibida) y lo recogido **entra solo a su inventario**.
  - El comedor gestiona su **inventario**: lotes con caducidad, entradas, consumo, mermas y stock mínimo con alertas. Al consumir se descuenta primero lo que vence antes (PEPS).
  - El comedor declara sus **necesidades** (categorías prioritarias, raciones, refrigeración), y eso cambia el puntaje de sus ofertas.
- **Web de administración** (escritorio) para el equipo que opera la plataforma:
  - **Panel de monitoreo e impacto** en vivo: kg rescatados, raciones equivalentes, comedores atendidos, % recogido antes de vencer, tiempo medio y alertas.
  - **Registro de eventos** con filtros y el recorrido completo (trazabilidad) de cada donación.
  - **Donaciones** por estado. Para las que nadie reservó, el ranking de comedores con el puntaje explicado y la opción de **asignarla a mano**.
  - **Inventario central** de toda la red: stock, lotes que vencen pronto y productos que faltan en cada comedor.
  - Alta, activación y desactivación de **comedores** y **comercios**, de modo que la red crece sin tocar código.
- **Emparejamiento explicable:** `puntaje = 0,35·urgencia + 0,25·cercanía + 0,25·necesidad + 0,15·capacidad`.
  - *Urgencia:* crece cuanto menos tiempo queda para vencer.
  - *Cercanía:* distancia (Haversine) entre comercio y comedor; 0 a partir de 5 km.
  - *Necesidad:* categoría prioritaria del comedor, o producto que le falta en su inventario.
  - *Capacidad:* espacio que le queda según sus raciones diarias y lo que ya tiene almacenado.
  - Un comedor desactivado o sin refrigeración (si el producto la requiere) no es elegible.
- **Estados** de una donación: `publicada → reservada → recogida` (o `vencida` si pasa la fecha).
- **Reglas de seguridad alimentaria:** no se publica un producto vencido, no se reserva uno vencido y los productos que requieren frío solo se reservan en comedores con refrigeración.
- **Trazabilidad:** cada paso queda en un registro de eventos.
- Todos los datos de la demostración son **sintéticos** (ficticios).

## Tecnologías

- **API:** Node.js, TypeScript y Fastify, con validación Zod.
- **Base de datos:** SQLite (`node:sqlite`, incluido en Node).
- **App y web de administración:** React, Vite y TypeScript.
- **Pruebas:** `node:test` (más de 70 pruebas de la API y las reglas del negocio).
- **Monorepo** con npm workspaces: `apps/api`, `apps/app`, `apps/admin` y `packages/shared` (tipos y esquemas compartidos).

## Instalación y uso

Requisitos: **Node.js 24 o superior**.

```bash
npm install
npm run seed     # carga los datos sintéticos (opcional: la API los carga sola si la base está vacía)
npm run api      # API en http://127.0.0.1:3001
npm run app      # app en http://localhost:5173 (en otra terminal)
npm run admin    # web de administración en http://localhost:5174 (en otra terminal)
```

Abre `http://localhost:5173`, elige si entras como comercio o como comedor y prueba el flujo: publicar, reservar y recoger. Abre `http://localhost:5174` para ver el panel, el registro de eventos y gestionar comedores y comercios.

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
apps/admin      Web de administración (monitoreo, trazabilidad y gestión de la red)
packages/shared Tipos y esquemas de validación compartidos
data/synthetic  Datos ficticios de demostración
```

## Estado

En desarrollo durante el evento. Próximamente: mapa de la red, creación de donaciones a partir de texto libre y pulido final de la app instalable.

Los supuestos de la demostración (1 ración ≈ 0,5 kg, 1 unidad suelta ≈ 0,25 kg, capacidad de almacenar 7 días de consumo) son ajustables y están definidos en un solo lugar del código.
