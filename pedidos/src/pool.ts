// Despachador con un número fijo de trabajadores y una cola acotada (trabajo autónomo S2).
import os from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";

const MAX_TRABAJADORES = Number(process.env.MAX_TRABAJADORES ?? os.availableParallelism());
const MAX_COLA = Number(process.env.MAX_COLA ?? MAX_TRABAJADORES * 2);

// Reutiliza worker-reporte.ts tal como está (en Docker, el .js compilado).
const RUTA_WORKER = path.join(__dirname, "worker-reporte" + path.extname(__filename));

interface Trabajo {
  n: number;
  resolve: (primos: number) => void;
  reject: (error: Error) => void;
}

const cola: Trabajo[] = [];
let activos = 0;
let rechazadas = 0;

export function contarPrimosEnPool(n: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const trabajo: Trabajo = { n, resolve, reject };
    if (activos < MAX_TRABAJADORES) {
      ejecutar(trabajo);
      return;
    }
    if (cola.length >= MAX_COLA) {
      rechazadas++;
      const error = new Error(`pool lleno: ${activos} activos y ${cola.length} en cola`);
      error.name = "PoolLleno";
      reject(error);
      return;
    }
    cola.push(trabajo);
  });
}

function ejecutar(trabajo: Trabajo): void {
  activos++;
  let liberado = false;
  // Libera el puesto una sola vez y despacha el siguiente trabajo de la cola.
  const liberar = () => {
    if (liberado) return;
    liberado = true;
    activos--;
    const siguiente = cola.shift();
    if (siguiente) ejecutar(siguiente);
  };

  const w = new Worker(RUTA_WORKER, { workerData: { n: trabajo.n } });
  w.once("message", (r: { primos: number }) => trabajo.resolve(r.primos));
  w.once("error", (error: Error) => {
    trabajo.reject(error);
    liberar();
  });
  w.once("exit", (code) => {
    if (code !== 0) trabajo.reject(new Error("el worker terminó con código " + code));
    liberar();
  });
}

export function estadoPool() {
  return { maxTrabajadores: MAX_TRABAJADORES, activos, enCola: cola.length, maxCola: MAX_COLA, rechazadas };
}
