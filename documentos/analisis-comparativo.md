# Análisis comparativo: Sistema de gestión de rutas de transporte

## 1. Portada

**UNIVERSIDAD AUTÓNOMA DEL ESTADO DE HIDALGO**  
**Lenguajes de Programación**  
**Implementación poliglota de un sistema de transporte**

**Docente:** Cornejo Velasquez Monica

**Integrantes del equipo:**
- Jose Juan Carlos Verdi Baltazar
- Camila Fernanda Villeda Mera
- Cruz Vergara Jose Roberto
- Corona Cortes Ernesto Antonio

**Fecha:** 17 noviembre del 2026

---

## 2. Introducción

Para esta actividad desarrollamos un mismo sistema de gestión de rutas y solicitudes de transporte usando tres lenguajes diferentes: **Java, Python y JavaScript** (con Node.js). Nuestro objetivo principal fue comparar cómo las características propias de cada lenguaje (sus tipos de datos, la forma en que se ejecutan y cómo manejan la concurrencia) afectan la forma en que resolvemos un mismo problema.

Decidimos que las tres aplicaciones fueran totalmente independientes. Es decir, cada lenguaje tiene su propio servidor, su propia API y su propia interfaz gráfica. No hay un frontend central ni comunicación entre los backends. Para que los resultados fueran idénticos, utilizamos los mismos archivos JSON en los tres casos, fijando así las mismas reglas de red, vehículos y los cinco casos de prueba de referencia.

## 3. Descripción del problema

El sistema debe administrar una red de transporte (representada como un grafo dirigido) y encontrar la mejor ruta entre un origen y un destino, dependiendo de si el usuario quiere optimizar distancia, tiempo o costo. Además, debe ser capaz de asignar un vehículo disponible que tenga capacidad suficiente y registrar la solicitud. Si no hay ruta o no hay vehículo, el sistema debe mostrar un error controlado sin cerrarse. Al finalizar el viaje, el vehículo vuelve a estar disponible.

La interfaz de cada lenguaje permite seleccionar el origen, el destino, el criterio de búsqueda, el nivel de tráfico y el número de pasajeros. También muestra un mapa de la red, la tabla de solicitudes procesadas y el estado de los vehículos.

## 4. Reglas de negocio y algoritmos

### 4.1 Grafos y cálculo de rutas
- Cada ubicación en nuestra red tiene un `id`, un `nombre` y un `tipo` (origen, destino o ambos).
- Las conexiones son dirigidas (tienen un solo sentido) y guardan la distancia, el tiempo base, el costo y el nivel de tráfico.
- Para encontrar las rutas, programamos el **algoritmo de Dijkstra desde cero** en los tres lenguajes (sin usar librerías externas de grafos).
- El peso de las conexiones cambia según el criterio:
  - **Distancia:** se minimizan los kilómetros.
  - **Tiempo:** se multiplica el tiempo base por el factor de tráfico (Bajo = 1.0, Medio = 1.2, Alto = 1.5).
  - **Costo:** se minimiza el precio base.
- Al final, el sistema devuelve el camino encontrado y los totales de distancia, tiempo real y costo.

### 4.2 Vehículos y solicitudes
- Cada vehículo tiene un `id`, `placa`, `tipo`, `capacidad` y un `estado` (disponible u ocupado).
- Cuando entra una solicitud, el sistema busca en orden el primer vehículo disponible que tenga capacidad suficiente para los pasajeros. 
- Si lo asigna, el vehículo pasa a "ocupado" y, al finalizar el viaje, vuelve a "disponible".
- Si no hay ruta, se devuelve el error `RUTA_NO_DISPONIBLE`. Si no hay vehículo, se devuelve `VEHICULO_NO_DISPONIBLE`.

## 5. ¿Por qué elegimos estos lenguajes?

**Java** nos permitió aplicar el paradigma de Orientación a Objetos de forma estricta. Al ser un lenguaje de tipado estático, nos obligó a modelar muy bien nuestras entidades (ubicaciones, vehículos, solicitudes) antes de programar. Además, usamos `ExecutorService` para demostrar cómo se manejan los hilos en un servidor real.

**Python** nos pareció ideal por su flexibilidad. Al ser un lenguaje multiparadigma, pudimos usar diccionarios y listas para representar los datos de forma muy rápida. Usamos la librería estándar `http.server` para no depender de frameworks pesados, y `concurrent.futures` para demostrar la concurrencia de forma sencilla.

**JavaScript (Node.js)** fue elegido por su enfoque orientado a eventos. Nos permitió usar `async`/`await` y `Promise.all` para manejar la asincronía de forma nativa, usando únicamente el módulo HTTP que trae Node por defecto.

## 6. Clasificación de los lenguajes

| Dimensión | Java | Python | JavaScript |
| :--- | :--- | :--- | :--- |
| **Abstracción principal** | Clases, interfaces, registros y objetos | Funciones, diccionarios y listas | Funciones, objetos y promesas |
| **Forma de ejecución** | Compilado a bytecode y ejecutado en la JVM | Interpretado (y compilado a bytecode por CPython) | Interpretado y compilado JIT (en el motor V8) |
| **Sistema de tipos** | Estático, nominal y fuerte | Dinámico y fuerte (con anotaciones opcionales) | Dinámico y coercitivo en algunos casos |
| **Propósito general** | Aplicaciones empresariales y multiplataforma | Automatización, scripting, ciencia de datos y web | Desarrollo web, servidores y aplicaciones en general |
| **Paradigmas disponibles** | Orientado a objetos, imperativo y funcional | Multiparadigma (imperativo, OOP y funcional) | Multiparadigma (funcional, imperativo y eventos) |
| **Paradigma destacado aquí** | Orientación a Objetos | Multiparadigma y estructurado | Orientado a eventos y asíncrono |
| **Tipo de lenguaje** | Compilado a bytecode | Alto nivel, interpretado | Alto nivel, dinámico y de propósito general |

## 7. Paradigmas que utilizamos en el código

- **Orientación a Objetos en Java:** Creamos clases explícitas como `Ubicacion`, `Conexion`, `Vehiculo` y `ServicioTransporte` para separar los datos de la lógica. Usamos enumeraciones para restringir los criterios permitidos.
- **Multiparadigma en Python:** Usamos diccionarios y listas nativas para guardar la red. Las funciones y métodos se encargan de aplicar las reglas y el algoritmo, lo que hizo el código muy legible.
- **Orientado a eventos en JavaScript:** Aprovechamos el *event loop* de Node. Los cálculos pesados (como Dijkstra) se ejecutan de forma síncrona, pero usamos promesas y `async/await` para coordinar las tareas de los lotes sin bloquear el servidor.

## 8. Arquitectura de cada solución

Aunque las tres aplicaciones hacen lo mismo, cada una tiene su propio proceso y puerto:

| Lenguaje | Servidor y puerto | Lógica | Interfaz (UI) |
| :--- | :--- | :--- | :--- |
| Java | `HttpServer` nativo, 8081 | Modelos tipados, servicio de transporte, Dijkstra y `ExecutorService`. | `java/src/main/resources/static/` |
| Python | `ThreadingHTTPServer`, 8082 | Servicio basado en diccionarios, Dijkstra y `ThreadPoolExecutor`. | `python/static/` |
| JavaScript | Módulo `node:http`, 8083 | Módulo de servicio, Dijkstra, funciones asíncronas y `Promise.all`. | `javascript/public/` |

Todas manejan los mismos endpoints (`/api/datos`, `/api/rutas`, `/api/lote` y finalización). Al no usar base de datos, el estado se mantiene en memoria, así que si reinicias el servidor, el catálogo vuelve a como estaba en el JSON.

## 9. Comparación de estructuras de datos

| Necesidad | Java | Python | JavaScript |
| :--- | :--- | :--- | :--- |
| **Ubicaciones** | Mapas indexados | Diccionarios | Objetos y `Map` |
| **Conexiones** | Mapas de listas | Diccionarios de listas | `Map` de arreglos |
| **Dijkstra** | Cola de prioridad | Cola de prioridad (`heapq`) | Arreglo ordenado (búsqueda lineal) |
| **Vehículos** | Objetos mutables | Diccionarios | Objetos planos |

*Nota:* Java y Python usan colas de prioridad para Dijkstra. JavaScript ordena un arreglo en cada iteración. Esto es más que suficiente para nuestra red de prueba pequeña, pero si el grafo creciera, tendríamos que usar un *heap* en JS.

## 10. Manejo de errores

En los tres lenguajes decidimos usar un formato común para los errores, devolviendo un JSON con un código y un mensaje (por ejemplo, `RUTA_NO_DISPONIBLE`). 
- En **Java**, usamos excepciones personalizadas (`ErrorNegocio`) que son atrapadas por el servidor HTTP y transformadas en respuestas HTTP 400.
- En **Python**, usamos excepciones nativas y las capturamos en el manejador del servidor.
- En **JavaScript**, usamos `try/catch` dentro de las funciones asíncronas para que un error en una solicitud no tumbe el servidor.

En los lotes de pruebas, si una solicitud falla, el sistema registra el error en esa posición específica y sigue procesando las demás, sin alterar el orden.

## 11. Comparación del sistema de tipos

- **Java** nos salvó de muchos errores gracias a su tipado estático. Si intentábamos pasar un dato mal formado, el compilador nos avisaba antes de ejecutar. La librería Jackson se encargó de convertir los JSON a nuestros modelos.
- **Python** comprueba los tipos en tiempo de ejecución. Por eso tuvimos que ser muy cuidadosos y agregar validaciones manuales para asegurarnos de que los pasajeros fueran un número entero y de que los criterios existieran.
- **JavaScript** es dinámico. Aunque usamos módulos para organizar el código, no tiene verificación estática, así que validamos manualmente cada objeto que llegaba por la API.

## 12. Ejecución y compilación

- **Java** requiere compilarse con Maven (`mvn clean package`). El resultado es un archivo `.jar` autocontenido que se ejecuta en cualquier máquina con la JVM instalada.
- **Python** no requiere compilación previa. El intérprete lee el código y lo ejecuta directamente. Para los tests usamos `pytest`.
- **JavaScript** usa módulos ES ejecutados por Node.js. No necesita paso de compilación. Para los tests usamos el runner nativo `node:test`.

## 13. Comparación de concurrencia y asincronía

- **Java:** Usamos `ExecutorService` para enviar los cálculos de los lotes a varios hilos y luego recoger los resultados en el mismo orden. La asignación de vehículos se hace de forma secuencial para evitar que dos solicitudes tomen el mismo vehículo al mismo tiempo.
- **Python:** Usamos `ThreadPoolExecutor`. Aunque Python tiene el GIL (que limita un poco el paralelismo real en tareas de CPU), para nuestro tamaño de datos funcionó bien y fue muy rápido de implementar.
- **JavaScript:** Usamos `Promise.all`. Aclaramos que las promesas no crean hilos nuevos ni paralelizan el CPU, pero el *event loop* de Node es tan eficiente que procesó los lotes muy rápido. Al igual que en los otros, la asignación de vehículos se hizo de forma secuencial.

## 14. Resultados de las pruebas

Terminamos las tres implementaciones y logramos que todas las pruebas pasaran en verde:

| Lenguaje | Comando de prueba | Pruebas aprobadas |
| :--- | :--- | :--- |
| Java | `mvn -f java/pom.xml test` | 7 |
| Python | `python -m pytest python/tests` | 8 |
| JavaScript | `node --test javascript/tests` | 8 |
| **Total** | | **23** |

En los tres lenguajes probamos los mismos 5 casos: ruta más corta, ruta más rápida evitando tráfico, ruta más barata, asignación de vehículo y error por falta de ruta. Las pruebas adicionales validaron los lotes y la entrada de datos.

## 15. Tiempos medidos y líneas de código

Medimos el procesamiento de 100 y 1000 solicitudes para ver qué tan rápido era cada lenguaje.

| Lenguaje | 100 secuenciales | 100 con lote | 1000 secuenciales | 1000 con lote |
| :--- | :--- | :--- | :--- | :--- |
| Java | 4.478 ms | 4.978 ms | 16.486 ms | 5.822 ms |
| Python | 2.003 ms | 8.002 ms | 21.854 ms | 44.429 ms |
| JavaScript | 1.047 ms | 1.252 ms | 6.794 ms | 8.531 ms |

*(Estos tiempos los tomamos en la misma computadora con Windows 10, Ryzen 5, OpenJDK, Python 3.14 y Node.js 26. Son datos aproximados y dependen del equipo).*

También contamos las líneas de código (sin contar JSONs ni tests):

| Lenguaje | Líneas aproximadas |
| :--- | :--- |
| Java | 1,000 |
| Python | 730 |
| JavaScript | 700 |

## 16. Ventajas y limitaciones

**Java**
- **Ventajas:** Tipado fuerte (menos errores), concurrencia real con hilos y un código muy ordenado.
- **Limitaciones:** Es más verboso (requiere más líneas de código) y necesita Maven/JVM para correr.

**Python**
- **Ventajas:** Código muy corto y legible, ideal para prototipar rápido. La librería estándar es suficiente.
- **Limitaciones:** El tipado dinámico requiere más cuidado en las validaciones. El GIL puede hacer que los hilos no sean tan rápidos para procesos de CPU pesados.

**JavaScript (Node.js)**
- **Ventajas:** Su modelo asíncrono es perfecto para manejar muchas peticiones. Usar el mismo lenguaje en frontend y backend es muy cómodo.
- **Limitaciones:** Al ser dinámico, los errores de tipo se ven hasta que el código corre. Un cálculo pesado puede bloquear el *event loop*.

## 17. Mantenibilidad, escalabilidad y conclusiones

Tener el mismo contrato de datos en los tres lenguajes nos facilitó la vida: si cambiábamos una regla, sabíamos exactamente qué probar en cada uno. Sin embargo, mantener tres bases de código significa que cualquier cambio de negocio debe replicarse y probarse tres veces.

El sistema actual guarda todo en memoria, lo cual es perfecto para este proyecto académico. Para llevarlo a la vida real, necesitaríamos una base de datos, autenticación de usuarios y un servidor con más recursos.

En conclusión, el proyecto nos demostró que un mismo problema (como calcular rutas en un grafo) se puede resolver con enfoques muy diferentes. Java nos dio seguridad, Python nos dio rapidez de escritura y JavaScript nos dio flexibilidad asíncrona. No hay un "mejor" lenguaje en general, sino el más adecuado para el contexto. Las 23 pruebas en verde nos respaldan que las tres versiones cumplen exactamente con lo que prometimos.

## 18. Referencias

1. Dijkstra, E. W. (1959). “A note on two problems in connexion with graphs”. *Numerische Mathematik*.
2. Oracle. *Java SE API — ExecutorService*.
3. Python Software Foundation. *concurrent.futures* y *http.server* (Documentación oficial).
4. Node.js. *HTTP, Promises y Test runner* (Documentación oficial).
5. Archivos comunes de este proyecto: `datos/red_transporte.json`, `datos/vehiculos.json` y `datos/casos_prueba.json`.