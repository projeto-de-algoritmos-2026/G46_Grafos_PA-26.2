/**
 * Instrumentação das buscas, no formato final desde já — as fases 5, 6 e 7 só consomem.
 *
 * O ponto não óbvio é qual grandeza domina. No modo lazy, uma expansão custa uma requisição de
 * rede (centenas de milissegundos) contra operações de heap que custam microssegundos: o número
 * de **requisições** é a medida real de desempenho, e as contagens de nós são o que explica
 * esse número. Por isso as quatro andam sempre juntas.
 */

import type { SearchMetrics } from "@/lib/graph/types";
import { getExpansionStats } from "@/lib/wiki/client";
import { getRequestCount } from "@/lib/wiki/ratelimit";

/**
 * Acumulador de uma execução. Os contadores de rede são lidos por diferença contra o instante
 * inicial, para que uma busca não herde o que execuções anteriores gastaram — é o que torna as
 * três repetições do benchmark comparáveis entre si.
 */
export class MetricsCollector {
  /** Vértices removidos da fronteira e expandidos. */
  expanded = 0;
  /** Vértices inseridos na fronteira. */
  enqueued = 0;

  private readonly startedAt = performance.now();
  private readonly baseRequests = getRequestCount();
  private readonly baseLocalHits = MetricsCollector.localHits();

  /** Expansões servidas pelas camadas locais: as que não custaram requisição. */
  private static localHits(): number {
    const { dump, cache } = getExpansionStats();
    return dump + cache;
  }

  finish(pathCost: number, pathLength: number): SearchMetrics {
    return {
      expanded: this.expanded,
      enqueued: this.enqueued,
      requests: getRequestCount() - this.baseRequests,
      cacheHits: MetricsCollector.localHits() - this.baseLocalHits,
      pathCost,
      pathLength,
      elapsedMs: performance.now() - this.startedAt,
    };
  }
}
