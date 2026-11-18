import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";

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