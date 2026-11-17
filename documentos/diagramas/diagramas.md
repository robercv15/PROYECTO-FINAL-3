# Diagramas del sistema

Los diagramas muestran el diseño conceptual compartido. Cada lenguaje implementa sus propios componentes dentro de su carpeta y sirve su UI y API sin depender de las demás implementaciones.

## 1. Diagrama de clases y componentes de dominio

```mermaid
classDiagram
    class Ubicacion {
        +String id
        +String nombre
        +String tipo
    }
    class Conexion {
        +String origenId
        +String destinoId
        +double distanciaKm
        +double tiempoBaseMin
        +double costoBase
        +String nivelTrafico
    }
    class RedTransporte {
        +List ubicaciones
        +List conexiones
        +Map multiplicadoresTrafico
    }
    class Vehiculo {
        +String id
        +String placa
        +String tipo
        +int capacidad
        +String estado
        +ocupar(pasajeros)
        +liberar()
    }
    class Solicitud {
        +String id
        +String cliente
        +String origenId
        +String destinoId
        +String criterio
        +String estado
        +int pasajeros
        +String vehiculoAsignadoId
    }
    class ServicioTransporte {
        +procesarSolicitud(entrada)
        +procesarLote(entradas)
        +finalizarSolicitud(id)
        +calcularRuta(entrada)
        +asignarVehiculo(solicitud)
    }
    class ServidorHTTP {
        +consultarDatos()
        +crearRuta()
        +procesarLote()
        +finalizarSolicitud(id)
        +servirUI()
    }
    RedTransporte "1" o-- "*" Ubicacion
    RedTransporte "1" o-- "*" Conexion
    Solicitud "*" --> "1" Ubicacion : origen y destino
    Solicitud "*" --> "0..1" Vehiculo : asignación
    ServicioTransporte --> RedTransporte : consulta
    ServicioTransporte --> Vehiculo : asigna y libera
    ServicioTransporte --> Solicitud : registra
    ServidorHTTP --> ServicioTransporte : delega
```

## 2. Diagrama de secuencia de una solicitud de ruta

```mermaid
sequenceDiagram
    actor Cliente
    participant UI as UI propia
    participant HTTP as Backend del lenguaje
    participant Servicio as ServicioTransporte
    participant Grafo as Dijkstra
    participant Flota as Vehículos

    Cliente->>UI: Elige origen, destino, criterio y pasajeros
    UI->>HTTP: POST /api/rutas (JSON)
    HTTP->>Servicio: procesarSolicitud(entrada)
    Servicio->>Servicio: Validar campos y ubicaciones
    Servicio->>Grafo: Calcular ruta según distancia/tiempo/costo
    Grafo-->>Servicio: Camino y métricas acumuladas
    alt Existe ruta y vehículo disponible con capacidad suficiente
        Servicio->>Flota: Seleccionar primero disponible y ocupar
        Flota-->>Servicio: vehiculoAsignadoId
        Servicio->>Servicio: Registrar solicitud en curso
        Servicio-->>HTTP: Resultado de ruta y asignación
        HTTP-->>UI: 201 JSON
        UI-->>Cliente: Mostrar recorrido, métricas y vehículo
    else No existe ruta o vehículo adecuado
        Servicio-->>HTTP: Error de negocio controlado
        HTTP-->>UI: 400 JSON (código y mensaje)
        UI-->>Cliente: Mostrar el error
    end
```

## 3. Diagrama de máquina de estados del vehículo

```mermaid
stateDiagram-v2
    [*] --> disponible
    disponible --> ocupado: solicitud válida y capacidad suficiente / asignar
    ocupado --> disponible: viaje finalizado / liberar
    disponible --> disponible: solicitud no asignada
    ocupado --> ocupado: solicitud sin vehículo disponible
```

Una transición de asignación solo se permite cuando la capacidad del vehículo es mayor o igual al número de pasajeros. Si una solicitud no encuentra vehículo, no cambia el estado de ningún vehículo.
