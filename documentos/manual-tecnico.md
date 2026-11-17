# Manual técnico del sistema de transporte

## 1. ¿Cómo está organizado el proyecto?

Para este proyecto decidimos que cada lenguaje fuera totalmente independiente. Es decir, no hicimos un solo backend y tres frontends, sino **tres aplicaciones completas**. 

Java, Python y JavaScript leen exactamente los mismos archivos de la carpeta `datos/`, pero cada uno levanta su propio servidor y tiene su propia interfaz. 
*   Java corre en el puerto **8081**.
*   Python corre en el puerto **8082**.
*   JavaScript corre en el puerto **8083**.

Ninguna interfaz se comunica con el backend de otro lenguaje. Todo el estado (solicitudes y vehículos) se guarda en la memoria del servidor; si reinicias la aplicación, todo vuelve a como estaba en los archivos JSON originales.

## 2. ¿Cómo se dividió el código en cada lenguaje?

Tratamos de mantener una estructura modular en los tres casos para que fuera fácil de leer:

*   **En Java:** Usamos el paradigma orientado a objetos. Separamos los datos en `modelo/`, la lógica pesada (Dijkstra y validaciones) en `servicio/`, la lectura de archivos en `infraestructura/` y el servidor web en `servidor/`. La interfaz web está en `resources/static/`. Al final, Maven nos genera un archivo `.jar` que se puede ejecutar en cualquier lado.
*   **En Python:** Para no complicarnos instalando frameworks, usamos las librerías nativas. Toda la lógica de transporte y concurrencia está en `transporte.py`, y el servidor web en `servidor.py` (usando `ThreadingHTTPServer`). Las pruebas están hechas con `pytest`.
*   **En JavaScript (Node.js):** Al igual que en Python, evitamos dependencias externas. Usamos el módulo nativo `node:http` para el servidor y `Promise.all` para la concurrencia. Las pruebas las corremos con el runner nativo `node:test`.

## 3. ¿Qué datos usamos?

Toda la información inicial viene de tres archivos JSON:
*   `red_transporte.json`: Tiene las ubicaciones, las conexiones (aristas) y los niveles de tráfico.
*   `vehiculos.json`: El catálogo de vehículos disponibles (motos, autos, camiones).
*   `casos_prueba.json`: Los 5 escenarios de prueba comunes que usamos para verificar que los 3 lenguajes dan los mismos resultados.

Cada solicitud que se registra debe tener un `id`, `cliente`, origen, destino, el criterio a evaluar, la fecha y los pasajeros. Si no se especifica el nivel de tráfico, el sistema toma por defecto el que está configurado en la red.

## 4. ¿Cómo funciona el algoritmo de Dijkstra?

Para encontrar la mejor ruta, implementamos el algoritmo de Dijkstra desde cero en los tres lenguajes. El algoritmo básicamente va guardando la distancia más corta conocida hacia cada nodo y una "cola de prioridad" para saber cuál visitar primero. Si encuentra un camino más corto hacia un nodo, actualiza el registro (esto se conoce como "relajar la arista").

Dependiendo de lo que elija el usuario, el "peso" de la arista cambia:
*   Si elige **distancia**, minimiza los kilómetros.
*   Si elige **tiempo**, multiplica el tiempo base por el nivel de tráfico (bajo = 1.0, medio = 1.2, alto = 1.5).
*   Si elige **costo**, minimiza el precio del viaje.

Cuando el algoritmo termina, reconstruimos el camino usando los nodos anteriores y sumamos los totales de distancia, tiempo y costo para mostrarlos en la interfaz. 

**Un detalle:** Como la red es dirigida (las calles tienen un solo sentido), el algoritmo solo revisa las conexiones de salida. Si no hay forma de llegar al destino, el sistema devuelve un error controlado (`RUTA_NO_DISPONIBLE`).

## 5. ¿Cómo asignamos los vehículos?

Una vez que se calcula la ruta, el sistema busca en la lista de vehículos el primero que esté `disponible` y que tenga la capacidad suficiente para los pasajeros. 
*   Si lo encuentra, lo marca como `ocupado` y lo asigna a la solicitud.
*   Si no hay vehículos, lanza un error (`VEHICULO_NO_DISPONIBLE`).
*   Cuando el usuario finaliza el viaje, el vehículo vuelve a estar `disponible`.

## 6. ¿Cómo hicimos el procesamiento concurrente?

Se nos pidió procesar varias solicitudes al mismo tiempo. Para eso creamos un endpoint `/api/lote`. Lo resolvimos de la siguiente manera:

*   **En Java:** Usamos `ExecutorService` para mandar cada cálculo a un hilo separado y luego esperamos los resultados. La asignación de vehículos la hicimos de forma secuencial para que no se asignara el mismo vehículo a dos viajes a la vez.
*   **En Python:** Usamos `ThreadPoolExecutor` con `map` para procesar los lotes. Aunque Python tiene el GIL (que limita un poco la concurrencia real por CPU), para este proyecto funciona bien. La asignación también es secuencial.
*   **En JavaScript:** Usamos `Promise.all`. Ojo: las promesas de JS no crean hilos reales, pero como el cálculo es rápido, funcionan perfecto para el event loop y mantienen el orden de los resultados.

Si una solicitud del lote falla (por ejemplo, porque no hay ruta), el sistema no se cae: devuelve el error en la posición que le corresponde y sigue procesando las demás.

## 7. La API (Endpoints)

Nuestros servidores manejan las siguientes rutas:
*   `GET /api/datos` → Devuelve la red y los vehículos.
*   `POST /api/rutas` → Registra una solicitud y devuelve el cálculo.
*   `POST /api/lote` → Procesa un lote de solicitudes concurrentemente.
*   `POST /api/solicitudes/{id}/finalizar` → Termina el viaje y libera el vehículo.

Si algo está mal (por ejemplo, falta un dato o no hay ruta), el servidor responde con un código HTTP 400 y un mensaje claro.

## 8. ¿Cómo correr las pruebas?

Desde la raíz del proyecto, se puedeb correr los tests de los tres lenguajes con estos comandos:
```powershell
mvn -f java/pom.xml test
python -m pytest python/tests
node --test javascript/tests