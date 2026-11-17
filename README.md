# PROYECTO-FINAL-3

Sistema académico de gestión de rutas y solicitudes de transporte implementado de manera independiente en **Java**, **Python** y **JavaScript/Node.js**. Cada aplicación tiene su propio servidor, UI estática y API local: no existe un frontend central ni una app que consuma las APIs de las otras.

## Requisitos

- JDK 17 o posterior y Maven 3.9 o posterior.
- Python 3.10 o posterior.
- Node.js 20 o posterior.

Ejecutar los comandos desde la raíz de este repositorio, en PowerShell.

## Ejecutar las aplicaciones

### Java — puerto 8081

Compilar, ejecuta las pruebas y generar el JAR ejecutable con dependencias:

```powershell
mvn -f java/pom.xml clean package
```

Iniciar la aplicación empaquetada:

```powershell
java -jar java\target\proyecto-polycode-transporte-java-1.0.0.jar
```

Abrir <http://localhost:8081/>.

### Python — puerto 8082

Instalar el ejecutor de pruebas e iniciar el servidor con la biblioteca estándar `http.server`:

```powershell
python -m pip install -r python/requirements.txt
python -m python.src.servidor
```

Abrir <http://localhost:8082/>.

### JavaScript/Node.js — puerto 8083

No requiere dependencias externas:

```powershell
node javascript/src/servidor.js
```

Abrir <http://localhost:8083/>.

Detener cada servidor con `Ctrl+C`.

## Ejecutar todas las pruebas

Los comandos de cada bloque se ejecutan desde la raíz del proyecto:

```powershell
mvn -f java/pom.xml test
python -m pytest python/tests
node --test javascript/tests
```

## API común

Cada aplicación sirve su propia UI en `/` y expone el mismo contrato en su propio puerto:

| Operación | Método y ruta |
|---|---|
| Consultar red, vehículos y solicitudes | `GET /api/datos` |
| Calcular una ruta y asignar vehículo | `POST /api/rutas` |
| Procesar un lote en el orden de entrada | `POST /api/lote` |
| Finalizar un viaje y liberar el vehículo | `POST /api/solicitudes/{id}/finalizar` |

Una solicitud incluye `id`, `cliente`, `origenId`, `destinoId`, `criterio`, `fecha` y `pasajeros`; `nivelTrafico` es opcional. Los criterios válidos son `distancia`, `tiempo` y `costo`; los estados del vehículo son `disponible` y `ocupado`.

## Datos y documentación

- Datos y casos compartidos: [`datos/`](datos/).
- Análisis comparativo: [`documentos/analisis-comparativo.md`](documentos/analisis-comparativo.md).
- Manual técnico: [`documentos/manual-tecnico.md`](documentos/manual-tecnico.md).
- Diagramas: [`documentos/diagramas/diagramas.md`](documentos/diagramas/diagramas.md).
- Responsabilidades transversales: [`documentos/responsabilidades.md`](documentos/responsabilidades.md).
- Evidencias: [`evidencias/capturas/`](evidencias/capturas/) y [`evidencias/videos/`](evidencias/videos/).
- Instrucciones específicas: [`java/README.md`](java/README.md), [`python/README.md`](python/README.md) y [`javascript/README.md`](javascript/README.md).

