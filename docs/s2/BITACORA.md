# Bitácora · Arquitecturas y procesos · Elkin Saltos

## Entorno
| Dato | Valor |
| --- | --- |
| Laptop (CPU, RAM) | Lenovo 82SB · AMD Ryzen 5 6600H (6 núcleos / 12 hilos) · 20 GB RAM · Windows 11 + Docker Desktop |
| nucleos según /metricas | 12 |
| MAX_TRABAJADORES y MAX_COLA | 12 y 24 (valores por defecto: `os.availableParallelism()` y el doble) |
| Duración de un reporte con n=2000000 | ≈ 345 ms (`/reporte/worker` 342 ms, `/reporte/pool` 346 ms, una petición aislada) |

## 1. Resultados
| Escenario | Latencia 50 % | Latencia máx. | Respuestas 2xx | Respuestas 503 | Timeouts | bucle.maxMs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · bloqueo (/health) | 4 ms | 4945 ms | ≈ 19k (18 834 según /metricas) | 0 | 0 | 5012 |
| 2 · worker sin límite | 3642 ms | 6133 ms | 316 | 0 | 0 | 460 |
| 3 · pool con límite | 8 ms | 3692 ms | 265 | 26 248 | 0 | 43 |

Antes de cada escenario se reinició Pedidos con `docker compose restart pedidos`. En el escenario 1, mientras corría la carga, se pidió dos veces `GET /reporte/bloqueante` (≈ 5 s cada uno).

### Escenario 1 · bloqueo
```
Running 15s test @ http://localhost:3000/health
20 connections

┌─────────┬──────┬──────┬───────┬───────┬─────────┬───────────┬─────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%   │ Avg     │ Stdev     │ Max     │
├─────────┼──────┼──────┼───────┼───────┼─────────┼───────────┼─────────┤
│ Latency │ 2 ms │ 4 ms │ 13 ms │ 19 ms │ 15.5 ms │ 227.37 ms │ 4945 ms │
└─────────┴──────┴──────┴───────┴───────┴─────────┴───────────┴─────────┘
┌───────────┬─────┬──────┬─────┬─────────┬──────────┬──────────┬────────┐
│ Stat      │ 1%  │ 2.5% │ 50% │ 97.5%   │ Avg      │ Stdev    │ Min    │
├───────────┼─────┼──────┼─────┼─────────┼──────────┼──────────┼────────┤
│ Req/Sec   │ 0   │ 0    │ 0   │ 4,775   │ 1,254.27 │ 1,609.89 │ 1,020  │
├───────────┼─────┼──────┼─────┼─────────┼──────────┼──────────┼────────┤
│ Bytes/Sec │ 0 B │ 0 B  │ 0 B │ 1.29 MB │ 340 kB   │ 436 kB   │ 276 kB │
└───────────┴─────┴──────┴─────┴─────────┴──────────┴──────────┴────────┘

Req/Bytes counts sampled once per second.
# of samples: 15

19k requests in 15.1s, 5.1 MB read
```
Respuesta de /metricas:
```json
{"umbralLentaMs":1000,"nucleos":12,"bucle":{"p50Ms":10,"p99Ms":20,"maxMs":5012},"rutas":[{"ruta":"GET /health","peticiones":18834,"promedioMs":0,"maxMs":12,"lentas":0},{"ruta":"GET /reporte/bloqueante","peticiones":2,"promedioMs":5001,"maxMs":5001,"lentas":2}],"pool":{"maxTrabajadores":12,"activos":0,"enCola":0,"maxCola":24,"rechazadas":0}}
```

### Escenario 2 · un hilo por petición, sin límite
```
Running 20s test @ http://localhost:3000/reporte/worker?n=2000000
50 connections

┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬────────────┬─────────┐
│ Stat    │ 2.5%    │ 50%     │ 97.5%   │ 99%     │ Avg     │ Stdev      │ Max     │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼────────────┼─────────┤
│ Latency │ 1723 ms │ 3642 ms │ 5574 ms │ 5881 ms │ 3584 ms │ 1007.52 ms │ 6133 ms │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴────────────┴─────────┘
┌───────────┬─────┬──────┬─────────┬─────────┬─────────┬─────────┬───────┐
│ Stat      │ 1%  │ 2.5% │ 50%     │ 97.5%   │ Avg     │ Stdev   │ Min   │
├───────────┼─────┼──────┼─────────┼─────────┼─────────┼─────────┼───────┤
│ Req/Sec   │ 0   │ 0    │ 8       │ 36      │ 13.3    │ 9.74    │ 3     │
├───────────┼─────┼──────┼─────────┼─────────┼─────────┼─────────┼───────┤
│ Bytes/Sec │ 0 B │ 0 B  │ 2.32 kB │ 10.4 kB │ 3.86 kB │ 2.82 kB │ 870 B │
└───────────┴─────┴──────┴─────────┴─────────┴─────────┴─────────┴───────┘

Req/Bytes counts sampled once per second.
# of samples: 20

316 requests in 20.19s, 77.1 kB read
```
Respuesta de /metricas:
```json
{"umbralLentaMs":1000,"nucleos":12,"bucle":{"p50Ms":10,"p99Ms":138,"maxMs":460},"rutas":[{"ruta":"GET /reporte/worker","peticiones":272,"promedioMs":3508,"maxMs":6016,"lentas":272}],"pool":{"maxTrabajadores":12,"activos":0,"enCola":0,"maxCola":24,"rechazadas":0}}
```

### Escenario 3 · pool con límite
```
Running 20s test @ http://localhost:3000/reporte/pool?n=2000000
50 connections

┌─────────┬──────┬──────┬───────┬────────┬─────────┬───────────┬─────────┐
│ Stat    │ 2.5% │ 50%  │ 97.5% │ 99%    │ Avg     │ Stdev     │ Max     │
├─────────┼──────┼──────┼───────┼────────┼─────────┼───────────┼─────────┤
│ Latency │ 3 ms │ 8 ms │ 30 ms │ 284 ms │ 35.3 ms │ 256.55 ms │ 3692 ms │
└─────────┴──────┴──────┴───────┴────────┴─────────┴───────────┴─────────┘
┌───────────┬────────┬────────┬────────┬────────┬──────────┬────────┬────────┐
│ Stat      │ 1%     │ 2.5%   │ 50%    │ 97.5%  │ Avg      │ Stdev  │ Min    │
├───────────┼────────┼────────┼────────┼────────┼──────────┼────────┼────────┤
│ Req/Sec   │ 849    │ 849    │ 1,300  │ 1,717  │ 1,325.65 │ 262.09 │ 849    │
├───────────┼────────┼────────┼────────┼────────┼──────────┼────────┼────────┤
│ Bytes/Sec │ 339 kB │ 339 kB │ 522 kB │ 689 kB │ 532 kB   │ 105 kB │ 339 kB │
└───────────┴────────┴────────┴────────┴────────┴──────────┴────────┴────────┘

Req/Bytes counts sampled once per second.
# of samples: 20

265 2xx responses, 26248 non 2xx responses
27k requests in 20.07s, 10.6 MB read
```
Respuesta de /metricas:
```json
{"umbralLentaMs":1000,"nucleos":12,"bucle":{"p50Ms":12,"p99Ms":31,"maxMs":43},"rutas":[{"ruta":"GET /reporte/pool","peticiones":26527,"promedioMs":26,"maxMs":3721,"lentas":253}],"pool":{"maxTrabajadores":12,"activos":0,"enCola":0,"maxCola":24,"rechazadas":26262}}
```

## 2. Análisis

**1. Escenario 1: bucle.maxMs frente al maxMs de /health.**
`bucle.maxMs` llegó a 5012 ms, mientras que en `rutas` el `maxMs` de `GET /health` fue solo 12 ms (promedio 0 ms). autocannon, en cambio, vio una latencia máxima de 4945 ms y en los percentiles 1 % a 50 % de Req/Sec hubo segundos con 0 respuestas. El interceptor arranca el cronómetro cuando Express ejecuta `medirLatencia`, y eso solo ocurre cuando el hilo principal queda libre. Durante los 5 s de `/reporte/bloqueante`, las peticiones de /health esperaban en el socket sin que nadie las atendiera, así que esa espera nunca entra en su medición. `monitorEventLoopDelay` mide justamente eso: un temporizador que debía dispararse cada 10 ms se disparó con 5 s de retraso. El interceptor mide el trabajo de la ruta; el monitor del bucle mide la capacidad del proceso para atender.

**2. Escenario 2: completadas y timeouts.**
Se completaron 316 peticiones en 20 s (13,3 por segundo) y 0 terminaron en timeout. Aun así, la mediana fue 3642 ms y el máximo 6133 ms, aunque un reporte aislado tarda ≈ 345 ms: 10 veces más lento. Con 50 conexiones se crean 50 hilos a la vez que compiten por 12 núcleos, así que cada uno recibe solo una fracción de CPU. Además, crear un worker (un motor V8 nuevo) cuesta memoria y tiempo, y el hilo principal tuvo pausas de hasta 460 ms (`bucle.maxMs`) solo por crearlos y recibir sus mensajes. Las 272 peticiones registradas fueron "lentas" (> 1000 ms). No hubo timeouts porque esta máquina tiene 12 hilos lógicos y el peor caso (6,1 s) quedó por debajo de los 10 s que espera autocannon. En una laptop de 4 núcleos el mismo reparto daría latencias de más de 10 s, y ahí aparecen los timeouts: no hay límite, así que más carga solo significa que todos van más lento.

**3. Escenario 3: 2xx frente a 503, y los modelos de fallo.**
Hubo 265 respuestas 2xx y 26 248 respuestas 503 (el pool registró 26 262 rechazos). El servidor nunca tuvo más de 12 reportes corriendo, el bucle se mantuvo sano (`maxMs` 43 ms, p99 31 ms) y la mediana del cliente fue 8 ms, porque la mayoría de las respuestas eran rechazos inmediatos. Un 503 con `Retry-After: 1` es un **fallo por omisión explícito y rápido** (fail-fast): el cliente sabe en milisegundos que no se atendió, que el servidor está sano pero lleno y cuándo conviene volver a intentarlo, así que puede reintentar, avisar al usuario o degradar el servicio. Un timeout es un **fallo de temporización** ambiguo: el cliente esperó todo el plazo sin saber si la petición se perdió, sigue en curso o se ejecutó, y mientras tanto mantiene recursos ocupados (conexión, hilo, usuario esperando). El 503 es preferible porque convierte un fallo lento e incierto en uno rápido y claro.

**4. autocannon ignora Retry-After.**
Como autocannon reintenta enseguida, cada conexión que recibía un 503 volvía a pedir de inmediato: unas 1300 peticiones por segundo, de las cuales casi todas (26 248 de 26 513) fueron rechazadas. El servidor gastó su hilo principal en aceptar conexiones, parsear HTTP y responder rechazos, en lugar de producir reportes: en 20 s solo terminó 265, menos que las 316 del escenario 2. Es una pequeña "tormenta de reintentos" que, en un servicio más frágil, puede mantenerlo saturado aunque la carga real sea baja. Un cliente bien diseñado respeta `Retry-After` y espera al menos 1 s. Si vuelve a fallar, reintenta con espera exponencial y jitter (1 s, 2 s, 4 s… con aleatoriedad para no sincronizarse con otros clientes), limita el número de reintentos y usa un circuit breaker para dejar de insistir mientras el servicio siga lleno.

**5. Tres réplicas detrás de un balanceador.**
Cada réplica tiene su propio `Map` de métricas, su propio bucle y su propio pool. Cada `GET /metricas` lo atiende una sola réplica elegida por el balanceador, así que mostraría solo un tercio del tráfico, y dos llamadas seguidas podrían dar números distintos sin relación entre sí. Además, al reiniciar o escalar se pierde todo. Cada réplica permite 12 trabajadores y 24 en cola, así que en total habría hasta 36 reportes simultáneos y 72 en espera. Si las tres corren en la misma máquina de 12 hilos, se repite el problema del escenario 2: más hilos que núcleos. Cambiaría tres cosas. Primero, exportar las métricas a un sistema central (por ejemplo, Prometheus raspando `/metricas` de cada réplica y agregándolas con una etiqueta por instancia). Segundo, fijar `MAX_TRABAJADORES` según los CPU asignados a cada contenedor y no según los núcleos del host. Tercero, si se necesita un límite global, mover la cola a un componente compartido (Redis/BullMQ o RabbitMQ) con trabajadores separados de la API.

## 3. Problemas encontrados
- El repositorio no tenía `worker-reporte.ts` ni la ruta `/reporte/worker` de la práctica guiada, así que los agregué en un commit previo (cuenta primos ≤ n en un hilo trabajador) antes de construir el pool.
- La rama `s2/metricas` aún no estaba unida a `main`, así que `s2/deber` se creó a partir de ella para conservar el interceptor.
- En el escenario 1, autocannon no imprime la línea "2xx / non 2xx" cuando todas las respuestas son 2xx; tomé el número exacto (18 834) del contador de `/metricas`.
- En el escenario 2, autocannon cuenta 316 peticiones y `/metricas` 272: al terminar los 20 s, autocannon corta las conexiones que siguen esperando, y en esas el evento `finish` nunca ocurre, así que el interceptor no las registra.
- No hubo timeouts en el escenario 2 porque la máquina tiene 12 hilos lógicos; el efecto esperado (latencia que crece sin límite) sí se ve en la mediana de 3,6 s.
- `bucle.p50Ms` siempre marca ≈ 10 ms incluso en reposo: es la resolución del monitor (`resolution: 10`), no un retraso real. El dato útil es `maxMs` y `p99Ms`.

## 4. Uso declarado de IA
Usé un asistente de IA (Claude, de Anthropic) en este trabajo para: escribir el código de `metricas.ts`, `pool.ts`, `worker-reporte.ts` y las rutas nuevas de `index.ts`; configurar Docker; ejecutar los tres escenarios con autocannon; y redactar un primer borrador de este análisis a partir de los datos medidos. Revisé el código, comprobé que las rutas respondan y verifiqué que las cifras citadas coincidan con las salidas pegadas arriba.
