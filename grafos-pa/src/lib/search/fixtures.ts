/**
 * Grafo sintético de referência, com 15 vértices e 21 arestas.
 *
 * Existe porque a corretude de Dijkstra e do A* não pode ser verificada sobre a Wikipédia: o
 * grafo real é grande demais para ter resposta conhecida e muda com o tempo. Aqui a resposta
 * certa é calculável à mão, a execução é instantânea e o resultado é reprodutível.
 *
 * Foi construído de propósito para que **o caminho mais curto em saltos não seja o mais
 * barato** — a rota de 2 saltos custa 1,8 e a de 4 saltos custa 0,8. É essa separação que
 * torna o BFS um baseline honesto em vez de uma solução, e é ela que a Fase 5 usa para
 * mostrar Dijkstra achando um caminho mais longo e mais barato.
 *
 * Os pesos ficam na mesma faixa da função de custo real, `(0.1, 1.1]`.
 *
 *        0.9        0.9
 *   A ────────► B ────────► O          rota do BFS: 2 saltos, custo 1.8
 *   │                       ▲
 *   │ 0.2                   │ 0.2
 *   ▼      0.2       0.2    │
 *   C ──────► E ──────► F ──┘          rota ótima: 4 saltos, custo 0.8
 *
 * Contém ainda dois ciclos disjuntos — `D → G → H → D` e `E → L → M → N → E` — que dão à
 * Fase 9 componentes fortemente conexas de resposta conhecida, e ao README a evidência
 * empírica de que o grafo é cíclico.
 */

import type { Graph, NodeId, WeightedEdge } from "@/lib/graph/types";

/** Aresta do fixture, na forma legível em que é mais fácil conferir a soma dos pesos. */
type FixtureEdge = readonly [from: NodeId, to: NodeId, weight: number];

export const FIXTURE_EDGES: readonly FixtureEdge[] = [
  ["A", "B", 0.9],
  ["A", "C", 0.2],
  ["A", "D", 0.5],
  ["B", "C", 0.3],
  ["B", "O", 0.9],
  ["C", "E", 0.2],
  ["C", "I", 0.4],
  ["D", "G", 0.3],
  ["E", "F", 0.2],
  ["E", "L", 0.7],
  ["F", "O", 0.2],
  ["G", "H", 0.3],
  ["G", "I", 0.5],
  ["H", "D", 0.4],
  ["H", "O", 0.6],
  ["I", "J", 0.3],
  ["J", "K", 0.3],
  ["K", "F", 0.2],
  ["L", "M", 0.2],
  ["M", "N", 0.2],
  ["N", "E", 0.2],
] as const;

export const FIXTURE_NODES: readonly NodeId[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
] as const;

/** Par canônico do fixture e as duas respostas que ele separa. */
export const FIXTURE_CASE = {
  source: "A",
  target: "O",
  /** Menor número de saltos, que é o que o BFS encontra. */
  shortest: { path: ["A", "B", "O"], hops: 2, cost: 1.8 },
  /** Menor custo, que é o que Dijkstra e o A* precisam encontrar. */
  cheapest: { path: ["A", "C", "E", "F", "O"], hops: 4, cost: 0.8 },
} as const;

/**
 * Componentes fortemente conexas esperadas, para o check da Fase 9. Toda componente com mais
 * de um vértice é prova de ciclo; os oito singletons são vértices que não pertencem a nenhum.
 */
export const FIXTURE_SCCS: readonly (readonly NodeId[])[] = [
  ["D", "G", "H"],
  ["E", "L", "M", "N"],
  ["A"], ["B"], ["C"], ["F"], ["I"], ["J"], ["K"], ["O"],
] as const;

/**
 * O fixture na mesma interface que a Wikipédia expõe. É assíncrono não por necessidade, mas
 * porque a busca precisa ser exatamente o mesmo código nos dois casos.
 */
export class FixtureGraph implements Graph {
  private readonly adjacency = new Map<NodeId, WeightedEdge[]>();

  constructor(edges: readonly FixtureEdge[] = FIXTURE_EDGES) {
    for (const node of FIXTURE_NODES) this.adjacency.set(node, []);
    for (const [from, to, weight] of edges) {
      const neighbors = this.adjacency.get(from) ?? [];
      neighbors.push({ to, weight });
      this.adjacency.set(from, neighbors);
    }
  }

  expand(nodeId: NodeId): Promise<WeightedEdge[]> {
    return Promise.resolve(this.adjacency.get(nodeId) ?? []);
  }
}
