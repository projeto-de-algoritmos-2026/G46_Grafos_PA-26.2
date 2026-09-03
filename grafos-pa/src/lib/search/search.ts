/**
 * Motor de busca pelo melhor primeiro — **um só**, parametrizado pela heurística.
 *
 * Com `h ≡ 0` a ordenação por `f = g + h` vira ordenação por `g`, e o algoritmo é exatamente
 * Dijkstra. Com uma heurística admissível é A*. Não há dois códigos: essa é a razão de o motor
 * receber `h` como parâmetro em vez de existir em duas cópias, e a Fase 6 verifica a
 * equivalência comparando custo **e contagem de expansões** entre `astar(h=0)` e `dijkstra`.
 *
 * O laço é o clássico: retira da fronteira o vértice de menor `f`, fecha-o, relaxa suas
 * arestas. Duas particularidades valem nota:
 *
 * - **Reabertura.** Com heurística consistente um vértice fechado nunca é reaberto, e o
 *   contador `reopened` fica em zero. A heurística ponderada da Fase 6 não é consistente, e é
 *   esse contador que mostra o preço disso.
 * - **Ordem de expansão determinística.** Empates de `f` são resolvidos pela ordem de inserção
 *   no heap, para que duas execuções do benchmark devolvam o mesmo caminho.
 */

import type { Graph, NodeId, PathResult, StopReason } from "@/lib/graph/types";
// `heuristics.ts` importa `Heuristic` daqui, mas só como tipo — a importação é apagada na
// compilação, então não há ciclo em tempo de execução.
import { type Arrival, sampleExploredTree } from "./explored";
import { zeroHeuristic } from "./heuristics";
import { MetricsCollector } from "./metrics";
import { MinHeap } from "./priorityQueue";
import { DEFAULT_MAX_EXPANSIONS, DEFAULT_TIMEOUT_MS, type SearchOptions } from "./options";

/**
 * Estimativa do custo restante de um vértice até o destino. Ver `heuristics.ts` para as provas
 * de admissibilidade e consistência das heurísticas concretas.
 */
export type Heuristic = (node: NodeId) => number;

export async function bestFirstSearch(
  graph: Graph,
  source: NodeId,
  target: NodeId,
  heuristic: Heuristic,
  options: SearchOptions = {},
): Promise<PathResult> {
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const collectExplored = options.collectExplored ?? false;
  const deadline = Date.now() + timeoutMs;

  const metrics = new MetricsCollector();

  /** Melhor custo conhecido da origem até cada vértice. */
  const g = new Map<NodeId, number>([[source, 0]]);
  /** Árvore de predecessores: reconstrói o caminho e, na Fase 8, é o subgrafo desenhado. */
  const parents = new Map<NodeId, Arrival>();
  const closed = new Set<NodeId>();
  /** Ordem de expansão, insumo da amostra do desenho. Só acumulada quando há o que desenhar. */
  const expandedOrder: NodeId[] = [];

  const frontier = new MinHeap();
  frontier.push(source, heuristic(source));
  metrics.enqueued = 1;

  const reconstruct = (): { path: NodeId[]; cost: number } => {
    const path: NodeId[] = [target];
    for (let node = target; node !== source; ) {
      const arrival = parents.get(node);
      if (arrival === undefined) break;
      node = arrival.from;
      path.push(node);
    }
    return { path: path.reverse(), cost: g.get(target) ?? 0 };
  };

  const finish = (stopReason: StopReason): PathResult => {
    const { path, cost } =
      stopReason === "found" ? reconstruct() : { path: [] as NodeId[], cost: 0 };
    return {
      found: stopReason === "found",
      path,
      cost,
      explored: collectExplored
        ? sampleExploredTree(parents, expandedOrder, path, options.exploredLimit)
        : [],
      metrics: metrics.finish(cost, Math.max(path.length - 1, 0)),
      stopReason,
    };
  };

  while (frontier.size > 0) {
    if (metrics.expanded >= maxExpansions) return finish("expansions");
    if (Date.now() > deadline) return finish("timeout");

    const node = frontier.pop()!.key;

    // Fechar no momento da retirada é o que garante a otimalidade em Dijkstra: com pesos não
    // negativos, nenhum caminho descoberto depois pode chegar mais barato a um vértice já
    // retirado. É também por isso que o destino só é dado por encontrado aqui, e não ao ser
    // relaxado — ao ser relaxado, `g[target]` ainda pode melhorar.
    if (node === target) return finish("found");

    closed.add(node);
    if (collectExplored) expandedOrder.push(node);
    const neighbors = await graph.expand(node);
    metrics.expanded++;

    const gNode = g.get(node)!;

    for (const { to, weight } of neighbors) {
      const tentative = gNode + weight;
      const known = g.get(to);
      if (known !== undefined && tentative >= known) continue;

      g.set(to, tentative);
      parents.set(to, { from: node, weight });

      if (closed.has(to)) {
        // Só acontece com heurística não consistente. Ver `reopened` em `SearchMetrics`.
        closed.delete(to);
        metrics.reopened++;
      }

      const priority = tentative + heuristic(to);
      if (frontier.has(to)) {
        frontier.decreaseKey(to, priority);
      } else {
        frontier.push(to, priority);
        metrics.enqueued++;
      }
    }
  }

  return finish("exhausted");
}

/**
 * Dijkstra: o motor com `h ≡ 0`. Não há implementação separada — se houvesse, seria uma
 * segunda chance de errar.
 */
export function dijkstra(
  graph: Graph,
  source: NodeId,
  target: NodeId,
  options: SearchOptions = {},
): Promise<PathResult> {
  return bestFirstSearch(graph, source, target, zeroHeuristic, options);
}

/** A*: o mesmo motor, com heurística. Ver as provas em `heuristics.ts`. */
export function astar(
  graph: Graph,
  source: NodeId,
  target: NodeId,
  heuristic: Heuristic,
  options: SearchOptions = {},
): Promise<PathResult> {
  return bestFirstSearch(graph, source, target, heuristic, options);
}
