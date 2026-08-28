/**
 * Camada de transporte da Action API: fila serial com atraso mínimo entre requisições,
 * retry com backoff exponencial e contador de requisições para instrumentação.
 *
 * A serialização é deliberada — a etiqueta da API pede um cliente sequencial, e a busca
 * expande um vértice por vez de qualquer forma.
 */

import {
  WIKI_API_ENDPOINT,
  WIKI_BACKOFF_MS,
  WIKI_MAX_RETRIES,
  WIKI_MIN_DELAY_MS,
  WIKI_USER_AGENT,
} from "./config";
import { WikiApiError, type ApiParams, type ApiResponse } from "./types";

let requestCount = 0;

/** Requisições HTTP feitas até agora, contando cada tentativa de retry. */
export function getRequestCount(): number {
  return requestCount;
}

export function resetRequestCount(): void {
  requestCount = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let tail: Promise<unknown> = Promise.resolve();
let lastStartedAt = 0;

/** Enfileira `task`, garantindo `WIKI_MIN_DELAY_MS` entre o início de duas execuções. */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    const wait = lastStartedAt + WIKI_MIN_DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStartedAt = Date.now();
    return task();
  });
  // A cauda ignora falhas: um erro em uma requisição não pode travar a fila.
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  return WIKI_BACKOFF_MS * 2 ** attempt;
}

function buildUrl(params: ApiParams): string {
  const url = new URL(WIKI_API_ENDPOINT);
  url.search = new URLSearchParams({
    format: "json",
    formatversion: "2",
    ...params,
  }).toString();
  return url.toString();
}

/** Executa uma consulta à Action API respeitando fila, atraso e retry. */
export async function queryApi(params: ApiParams): Promise<ApiResponse> {
  const url = buildUrl(params);

  return schedule(async () => {
    for (let attempt = 0; ; attempt++) {
      requestCount++;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
        });
      } catch (cause) {
        if (attempt >= WIKI_MAX_RETRIES) {
          throw new WikiApiError(`Falha de rede ao consultar a API: ${String(cause)}`);
        }
        await sleep(WIKI_BACKOFF_MS * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        if (!isRetryable(response.status) || attempt >= WIKI_MAX_RETRIES) {
          throw new WikiApiError(`API respondeu HTTP ${response.status} para ${url}`);
        }
        await sleep(retryDelayMs(response, attempt));
        continue;
      }

      const data = (await response.json()) as ApiResponse;
      if (data.error) {
        throw new WikiApiError(`API retornou erro ${data.error.code}: ${data.error.info}`);
      }
      return data;
    }
  });
}
