# S2 — Métricas de Pedidos

## Experimento

1. Petición A: `GET http://localhost:3000/reporte/bloqueante`
2. Petición B (enseguida, mientras A seguía esperando): `GET http://localhost:3000/health`
3. Al terminar: `GET http://localhost:3000/metricas`

## Resultado de /health según el cliente (Postman / navegador)

- Código de estado: **200 OK**
- Tiempo: **3.37 s (3370 ms)** según Postman

## Respuesta completa de /metricas

```json
{
    "umbralLentaMs": 1000,
    "rutas": [
        {
            "ruta": "GET /reporte/bloqueante",
            "peticiones": 1,
            "promedioMs": 5005,
            "maxMs": 5005,
            "lentas": 1
        },
        {
            "ruta": "GET /health",
            "peticiones": 1,
            "promedioMs": 1,
            "maxMs": 1,
            "lentas": 0
        }
    ]
}
```

## ¿Por qué el cliente y el interceptor miden distinto a /health, y qué fallo ve el cliente?

El interceptor arranca su cronómetro cuando Express por fin ejecuta `medirLatencia`, y eso solo ocurre después de que el bucle de eventos queda libre; mientras `/reporte/bloqueante` ocupaba el único hilo, la petición de `/health` esperaba en cola sin que nadie la atendiera. Por eso el interceptor reporta /health en 1 ms: solo mide el tiempo dentro del manejador. Postman, en cambio, mide desde que envía la petición hasta que recibe la respuesta, así que incluye toda la espera en cola (3.37 s).
El cliente no ve un error: ve un **200 OK, pero lento**, es decir, un fallo de latencia (degradación de rendimiento) y no de disponibilidad; las métricas internas del servicio lo ocultan, porque el tiempo perdido está antes de que empiece la medición.
