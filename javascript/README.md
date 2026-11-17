# Aplicación JavaScript

Servidor HTTP con el módulo nativo `node:http`, módulos ES, procesamiento asíncrono con `async`/`await` y cálculo concurrente de lotes mediante `Promise.all`. Dijkstra y las reglas de asignación están implementados sin bibliotecas externas.

## Requisitos

- Node.js 20 o posterior

Desde la raíz del proyecto:

```powershell
node --test javascript/tests
node javascript/src/servidor.js
```

Desde la carpeta `javascript`:

```powershell
npm test
npm start
```

La app sirve su propia UI en `http://localhost:8083/`.

El runner `node:test` forma parte de Node.js; no es necesario instalar paquetes.

## API

- `GET /api/datos`: red, vehículos y solicitudes.
- `POST /api/rutas`: calcula ruta y asigna vehículo.
- `POST /api/lote`: recibe `{ "solicitudes": [...] }` (también admite un arreglo JSON directo); calcula las rutas con `Promise.all` y conserva el orden de entrada al responder y asignar vehículos.
- `POST /api/solicitudes/{id}/finalizar`: finaliza un viaje y libera su vehículo.

Las solicitudes deben contener `id`, `cliente`, `origenId`, `destinoId`, `criterio`, `fecha` y `pasajeros`. `nivelTrafico` es opcional; al omitirlo se usa el nivel definido por cada conexión. Los datos compartidos están en `../datos/`.
