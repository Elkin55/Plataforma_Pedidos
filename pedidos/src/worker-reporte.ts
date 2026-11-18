// Hilo trabajador: cuenta los primos menores o iguales a n sin bloquear el hilo principal.
import { parentPort, workerData } from "node:worker_threads";

function contarPrimos(n: number): number {
    let total = 0;
    for (let i = 2; i <= n; i++) {
        let esPrimo = true;
        for (let d = 2; d * d <= i; d++) {
            if (i % d === 0) {
                esPrimo = false;
                break;
            }
        }
        if (esPrimo) total++;
    }
    return total;
}

const { n } = workerData as { n: number };
parentPort?.postMessage({ primos: contarPrimos(n) });
