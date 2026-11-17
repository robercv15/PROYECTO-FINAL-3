# Aplicación Java

Servidor HTTP con `HttpServer` del JDK, modelos orientados a objetos, Dijkstra implementado desde cero, Jackson para JSON y `ExecutorService` para el cálculo paralelo de lotes. La UI estática es servida por el mismo servidor.

## Requisitos

- JDK 17 o posterior
- Maven 3.9 o posterior

Desde la raíz del proyecto:

```powershell
mvn -f java/pom.xml clean package
java -jar java\target\proyecto-polycode-transporte-java-1.0.0.jar
```

El JAR incluye las dependencias y declara `com.polycode.transporte.servidor.ServidorTransporte` como clase principal. La aplicación escucha en `http://localhost:8081/`.

Desde la raíz, ejecuta las pruebas con:

```powershell
mvn -f java/pom.xml test
```

## API

- `GET /api/datos`: red, vehículos y solicitudes.
- `POST /api/rutas`: calcula ruta y asigna vehículo.
- `POST /api/lote`: recibe `{ "solicitudes": [...] }`; calcula rutas en paralelo y conserva orden de entrada y asignación de vehículos determinista.
- `POST /api/solicitudes/{id}/finalizar`: finaliza un viaje y libera su vehículo.

Las solicitudes deben contener `id`, `cliente`, `origenId`, `destinoId`, `criterio`, `fecha` y `pasajeros`. `nivelTrafico` es opcional; al omitirlo se usa el nivel definido por cada conexión. Los datos comunes de prueba están en `../datos/`.
