# Aplicación Python

Servidor web construido con `http.server`/`ThreadingHTTPServer` de la biblioteca estándar. La aplicación usa diccionarios y listas, implementa Dijkstra sin bibliotecas de grafos y procesa lotes mediante `concurrent.futures.ThreadPoolExecutor`; los resultados y la asignación de vehículos conservan el orden recibido.

## Requisitos

- Python 3.10 o posterior
- `pytest` para ejecutar las pruebas

Desde la raíz del proyecto:

```powershell
python -m pip install -r python/requirements.txt
python -m pytest python/tests
python -m python.src.servidor
```

Para iniciar desde la carpeta `python`:

```powershell
python -m pip install -r requirements.txt
python -m pytest tests
python -m src.servidor
```

La aplicación escucha en `http://localhost:8082/` y entrega su propia UI en la ruta raíz.

También se pueden ejecutar las pruebas desde la raíz con `python -m pytest python/tests`.

## API

- `GET /api/datos`: red, vehículos y solicitudes.
- `POST /api/rutas`: calcula una ruta y asigna un vehículo.
- `POST /api/lote`: recibe `{ "solicitudes": [...] }` (también admite un arreglo JSON directo); calcula las rutas concurrentemente y devuelve los resultados en el orden de entrada.
- `POST /api/solicitudes/{id}/finalizar`: finaliza un viaje y libera su vehículo.

Las solicitudes deben contener `id`, `cliente`, `origenId`, `destinoId`, `criterio`, `fecha` y `pasajeros`. `nivelTrafico` es opcional; al omitirlo se usa el nivel definido en cada conexión. Los datos comunes de prueba están en `../datos/`.
