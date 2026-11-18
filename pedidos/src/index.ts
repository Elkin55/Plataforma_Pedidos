import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { medirLatencia, resumenMetricas } from "./metricas";

const PORT = Number(process.env.PORT ?? 3002);
const INVENTARIO_URL = process.env.INVENTARIO_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 2000);

interface Pedido {
    id: string;
    sku: string;
    cantidad: number;
    creadoEn: string;
}

const pedidos: Pedido[] = [];
const app = express();
app.use(express.json());
app.use(medirLatencia);

app.get("/metricas", (_req: Request, res: Response) => {
    res.json(resumenMetricas());
});

app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", servicio: "pedidos" });
});

app.get("/health/ready", async (_req: Request, res: Response) => {
    const inicio = performance.now();
    try {
        const r = await fetch(INVENTARIO_URL + "/health", {
            signal: AbortSignal.timeout(1000),
        });
        const ms = Math.round(performance.now() - inicio);
        if (!r.ok) {
            res.status(503).json({ status: "no-listo", inventario: "respondio " + r.status, ms });
            return;
        }
        res.json({ status: "listo", inventario: "ok", ms });
    } catch (error) {
        const ms = Math.round(performance.now() - inicio);
        const e = error as Error & { cause?: { code?: string } };
        const motivo =
            e.name === "TimeoutError"
                ? "inventario no respondio en 1000 ms"
                : "no se pudo conectar con inventario " + (e.cause?.code ?? e.message);
        res.status(503).json({ status: "no-listo", inventario: motivo, ms });
    }
});

// Reporte que hace trabajo de CPU en el hilo principal: congela el servicio (práctica guiada).
const REPORTE_MS = Number(process.env.REPORTE_MS ?? 5000);

app.get("/reporte/bloqueante", (_req: Request, res: Response) => {
    const inicio = performance.now();
    let iteraciones = 0;
    while (performance.now() - inicio < REPORTE_MS) {
        iteraciones += Math.sqrt(iteraciones) > -1 ? 1 : 0;
    }
    const ms = Math.round(performance.now() - inicio);
    res.json({ reporte: "listo", iteraciones, ms });
});

// Ruta del hilo trabajador: en Docker se ejecuta el .js compilado; con tsx, el .ts.
const RUTA_WORKER = path.join(__dirname, "worker-reporte" + path.extname(__filename));

function leerN(req: Request): number | null {
    const n = Number(req.query.n ?? 2000000);
    return Number.isInteger(n) && n > 1 && n <= 50_000_000 ? n : null;
}

// Un hilo nuevo por cada petición, sin límite (práctica guiada).
function contarPrimosEnWorker(n: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const w = new Worker(RUTA_WORKER, { workerData: { n } });
        w.once("message", (r: { primos: number }) => resolve(r.primos));
        w.once("error", reject);
        w.once("exit", (code) => {
            if (code !== 0) reject(new Error("el worker terminó con código " + code));
        });
    });
}

app.get("/reporte/worker", async (req: Request, res: Response) => {
    const n = leerN(req);
    if (n === null) {
        res.status(400).json({ error: "n debe ser un entero entre 2 y 50000000" });
        return;
    }
    const inicio = performance.now();
    try {
        const primos = await contarPrimosEnWorker(n);
        res.json({ modo: "worker", n, primos, ms: Math.round(performance.now() - inicio) });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

app.get("/pedidos", (_req: Request, res: Response) => {
    res.json(pedidos);
});

app.post("/pedidos", async (req: Request, res: Response) => {
    const { sku, cantidad } = req.body ?? {};
    if (typeof sku !== "string" || !Number.isInteger(cantidad) || cantidad <= 0) {
        res.status(400).json({ error: "sku debe ser string y cantidad un entero mayor que 0" });
        return;
    }

    const inicio = performance.now();
    try {
        const r = await fetch(INVENTARIO_URL + "/stock/" + encodeURIComponent(sku) + "/reservar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cantidad }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (r.status === 404) {
            res.status(404).json({ error: "Sku no encontrado " + sku });
            return;
        }
        if (r.status === 409) {
            const detalle = await r.json();
            res.status(409).json({ error: "No hay stock suficiente", detalle });
            return;
        }
        if (!r.ok) {
            res.status(502).json({ error: "inventario respondio " + r.status });
            return;
        }

        const pedido: Pedido = { id: randomUUID(), sku, cantidad, creadoEn: new Date().toISOString() };
        pedidos.push(pedido);
        res.status(201).json(pedido);
    } catch (error) {
        const duracionMs = Math.round(performance.now() - inicio);
        const e = error as Error & { cause?: { code?: string } };
        const motivo =
            e.name === "TimeoutError"
                ? "inventario no respondio en " + TIMEOUT_MS + " ms"
                : "No se pudo conectar con inventario " + (e.cause?.code ?? e.message);
        console.error("pedidos " + motivo);
        res.status(503).json({ error: "inventario no disponible", motivo, duracionMs });
    }
});

app.listen(PORT, () => {
    console.log(`Servicio pedidos escuchando en ${PORT}, inventario en ${INVENTARIO_URL} timeout ${TIMEOUT_MS} ms`);
});