/**
 * Busca em largura — o baseline de comparação, **não** a solução do problema.
 *
 * BFS minimiza o número de saltos e é cego aos pesos. Ele existe aqui por duas razões: dar um
 * ponto de referência de quantos vértices uma busca desinformada expande, e **reportar o custo
 * do caminho que encontra**, tornando visível que o caminho mais curto não é o mais barato.
 * No grafo sintético a separação é de 1,8 contra 0,8; na Wikipédia é o que a Fase 7 mede.
 */

import type { Edge, Graph, NodeId, PathResult, StopReason } from "@/lib/graph/types";
import { MetricsCollector } from "./metrics";
import { DEFAULT_MAX_EXPANSIONS, DEFAULT_TIMEOUT_MS, type SearchOptions } from "./options";

/** De onde cada vértice foi alcançado, para reconstruir o caminho ao final. */
interface Arrival {
  from: NodeId;
  weight: number;
}

function reconstruct(
  parents: Map<NodeId, Arrival>,
  source: NodeId,
  target: NodeId,
): { path: NodeId[]; cost: number } {
  const path: NodeId[] = [target];
  let cost = 0;

  for (let node = target; node !== source; ) {
    const arrival = parents.get(node);
    if (!arrival) break;
    cost += arrival.weight;
    node = arrival.from;
    path.push(node);
  }

  return { path: path.reverse(), cost };
}

export async function bfs(
  graph: Graph,
  source: NodeId,
  target: NodeId,
  options: SearchOptions = {},
): Promise<PathResult> {
  const maxExpansions = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const collectExplored = options.collectExplored ?? false;
  const deadline = Date.now() + timeoutMs;

  const metrics = new MetricsCollector();
  const explored: Edge[] = [];
  const parents = new Map<NodeId, Arrival>();
  const visited = new Set<NodeId>([source]);

  // Fila com índice de cabeça em vez de `shift()`: remover do início de um array é O(n), e com
  // dezenas de milhares de vértices enfileirados isso dominaria o tempo de execução.
  const queue: NodeId[] = [source];
  let head = 0;
  metrics.enqueued = 1;

  const finish = (stopReason: StopReason): PathResult => {
    const { path, cost } =
      stopReason === "found" ? reconstruct(parents, source, target) : { path: [], cost: 0 };
    return {
      found: stopReason === "found",
      path,
      cost,
      explored,
      metrics: metrics.finish(cost, Math.max(path.length - 1, 0)),
      stopReason,
    };
  };

  while (head < queue.length) {
    if (metrics.expanded >= maxExpansions) return finish("expansions");
    if (Date.now() > deadline) return finish("timeout");

    const node = queue[head++];

    // O teste é na remoção, e não na inserção, para que a contagem de expansões signifique a
    // mesma coisa aqui e no motor das fases 5 e 6 — sem isso a comparação seria enviesada.
    if (node === target) return finish("found");

    const neighbors = await graph.expand(node);
    metrics.expanded++;

    for (const { to, weight } of neighbors) {
      if (collectExplored) explored.push({ from: node, to, weight });
      if (visited.has(to)) continue;

      visited.add(to);
      parents.set(to, { from: node, weight });
      queue.push(to);
      metrics.enqueued++;
    }
  }

  return finish("exhausted");
}
