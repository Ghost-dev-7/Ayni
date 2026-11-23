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

## Qué hace hoy

- **App web (móvil primero, instalable como PWA)** para comercios y comedores:
  - El **comercio** publica un producto por vencer (producto, cantidad, caducidad, ventana de recojo) y sigue su estado.
  - El comercio también puede **escribirlo con sus palabras** ("20 panes de ayer, recojo hasta las 6pm"): un analizador por reglas, sin IA externa, rellena el formulario y avisa de lo que no entendió. Siempre se revisa antes de publicar.
  - **Una sola unidad por producto** en todo el sistema: el azúcar, el arroz, los frejoles, las lentejas, la harina, las papas, los tomates, las verduras y las carnes van por **kg**; la leche fresca y el aceite por **litros**; todo lo demás por **unidades** (panes, latas de atún, paquetes de fideos, bolsas de pan de molde). Así lo donado entra al inventario sin conversiones.
  - El **comedor** elige en **Ofertas** lo que busca (categorías) y ve las donaciones ordenadas por un **puntaje de 0 a 100**, con el **porqué** de cada una. Las **reserva**.
  - El comedor **confirma la recogida** desde **Notificaciones** (estado del producto y cantidad recibida) y lo recogido **entra solo a su inventario**.
  - **Notificaciones** reúne, y se actualiza sola: lo que hay por recoger, las alertas del inventario (stock bajo, productos por vencer) y el historial de lo reservado, recogido, ingresado y consumido.
  - **Inventario** del comedor: el stock no se escribe a mano. Sube solo al recoger una donación y baja solo al registrar lo **consumido**, descontando primero lo que vence antes (PEPS). El **mínimo es 10** de la unidad de cada producto y, por debajo, se marca en rojo y avisa.
- **Web de administración** (escritorio) para el equipo que opera la plataforma:
  - **Panel de monitoreo e impacto** en vivo: kg rescatados, raciones equivalentes, comedores atendidos, % recogido antes de vencer, tiempo medio y alertas.
  - **Registro de eventos** con filtros y el recorrido completo (trazabilidad) de cada donación.
  - **Donaciones** por estado. Para las que nadie reservó, el ranking de comedores con el puntaje explicado y la opción de **asignarla a mano**.
  - **Inventario central** de toda la red: stock, lotes que vencen pronto y productos que faltan en cada comedor.
  - **Mapa de la red** (Leaflet y OpenStreetMap, requiere internet) con comercios y comedores, distancia media de cobertura y las zonas que aún no tienen un comedor cerca. Hay una lista de respaldo si no carga el plano.
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
- **Instalable y con modo sin conexión:** la app se puede instalar en el teléfono y, sin internet, abre y muestra lo último que vio. Publicar, reservar y recoger sí necesitan conexión.
- Todos los datos de la demostración son **sintéticos** (ficticios).

## Tecnologías

- **API:** Node.js, TypeScript y Fastify, con validación Zod.
- **Base de datos:** SQLite (`node:sqlite`, incluido en Node).
- **App y web de administración:** React, Vite y TypeScript.
- **Mapa:** Leaflet con teselas de OpenStreetMap (gratuito, sin clave).
- **Pruebas:** `node:test` (102 pruebas de la API y las reglas del negocio).
- **Monorepo** con npm workspaces: `apps/api`, `apps/app`, `apps/admin` y `packages/shared` (tipos y esquemas compartidos).

## Instalación y uso

Requisitos: **Node.js 24 o superior** (probado con Node 26) y conexión a internet solo para `npm install` y para el plano del mapa.

```bash
npm install
npm run seed     # carga los datos sintéticos (opcional: la API los carga sola si la base está vacía)
npm run api      # API en http://127.0.0.1:3001
npm run app      # app en http://localhost:5173 (en otra terminal)
npm run admin    # web de administración en http://localhost:5174 (en otra terminal)
```

Abre `http://localhost:5173`, elige si entras como comercio o como comedor y prueba el flujo: publicar, reservar y recoger. Abre `http://localhost:5174` para ver el panel, el registro de eventos y gestionar comedores y comercios.

Para volver a los datos de demostración originales, ejecuta `npm run seed` de nuevo. La API acepta las variables `PORT` (por defecto 3001) y `DB_PATH` (archivo de la base de datos).

Pruebas y verificación de tipos:

```bash
npm test
npm run typecheck
```

Versión compilada de la app (es la que registra el modo sin conexión; con la API encendida):

```bash
npm run build:app
npm run preview -w @ayni/app    # http://localhost:4173
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

Prototipo funcional de extremo a extremo, desarrollado durante el evento y verificado instalándolo desde cero en una carpeta limpia (instalación, pruebas, comprobación de tipos y compilación).

Alcance del prototipo: no hay autenticación real (se elige un rol y una cuenta), no hay pagos ni logística de transporte, y todos los datos son ficticios.

Los supuestos de la demostración son constantes del código y se pueden ajustar:

- 1 ración ≈ 0,5 kg: `KG_POR_RACION`, en `packages/shared/src/index.ts`.
- Peso aproximado de una unidad de cada producto (un pan ≈ 0,1 kg, una lata de atún ≈ 0,17 kg…), solo para convertir a kilos las cifras del panel de impacto: `pesoKgPorUnidad`, en `packages/shared/src/catalogo.ts`. Un producto sin peso definido cuenta 0,25 kg por unidad.
- Stock mínimo de 10 por producto: `STOCK_MINIMO`, en `packages/shared/src/catalogo.ts`.
- Capacidad de almacenar 7 días de consumo: `DIAS_DE_CAPACIDAD`, en `apps/api/src/emparejamiento.ts`.
