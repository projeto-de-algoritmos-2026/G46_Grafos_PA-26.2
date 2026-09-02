/**
 * Tipos base do grafo. O grafo é direcionado, ponderado e materializado de forma
 * lazy: a vizinhança de um vértice só existe depois que ele é expandido.
 */

/** Título canônico de um artigo (namespace 0, pós-redirect). */
export type NodeId = string;

/**
 * Vizinho de saída de um vértice `u`, com os metadados que a função de custo consome.
 * Toda informação aqui vem da expansão de `u` — nenhuma requisição extra por vizinho.
 */
export interface Neighbor {
  /** Título canônico do destino. */
  id: NodeId;
  /** Posição ordinal do link no corpo de `u`, 1-based (`pos = rank / total`). */
  rank: number;
  /** Total de links de saída de `u`, o `L(u)` da função de custo. */
  total: number;
  /** Tamanho do artigo destino em bytes, insumo de `gen(v)`. */
  length: number;
}

/** Aresta ponderada já resolvida. */
export interface Edge {
  from: NodeId;
  to: NodeId;
  weight: number;
}

/**
 * Entrada da lista de adjacência de um vértice: a origem está implícita em quem foi expandido.
 * É o que a busca consome; `Edge` é a forma completa, usada para devolver o subgrafo explorado.
 */
export interface WeightedEdge {
  to: NodeId;
  weight: number;
}

/**
 * O que uma busca precisa de um grafo: a vizinhança ponderada de um vértice.
 *
 * Existe para que o mesmo `bfs` e o mesmo motor das fases 5 e 6 rodem tanto sobre a Wikipédia
 * (`LazyGraph`, assíncrono e caro) quanto sobre o grafo sintético de `fixtures.ts` (imediato).
 * É o que permite verificar a corretude dos algoritmos sem tocar a rede.
 */
export interface Graph {
  expand(nodeId: NodeId): Promise<WeightedEdge[]>;
}

/** Por que a busca parou. */
export type StopReason =
  /** Alcançou o destino. */
  | "found"
  /** Esgotou a fronteira sem alcançar o destino. */
  | "exhausted"
  /** Bateu no teto de expansões. */
  | "expansions"
  /** Estourou o tempo limite. */
  | "timeout";

/** Instrumentação de uma execução de busca. */
export interface SearchMetrics {
  /** Vértices removidos da fronteira e expandidos. */
  expanded: number;
  /** Vértices inseridos na fronteira. */
  enqueued: number;
  /**
   * Vértices já fechados que precisaram voltar à fronteira por terem sido alcançados mais
   * barato depois. Com heurística consistente isto é sempre 0 — é a verificação empírica da
   * prova de consistência da Fase 6, e o preço que a heurística ponderada paga.
   */
  reopened: number;
  /** Requisições HTTP gastas. */
  requests: number;
  /** Expansões atendidas pelo cache ou pelo dump. */
  cacheHits: number;
  pathCost: number;
  pathLength: number;
  elapsedMs: number;
}

/** Resultado de uma busca, incluindo o subgrafo explorado para a visualização. */
export interface PathResult {
  found: boolean;
  /** Caminho da origem ao destino, vazio quando `found` é falso. */
  path: NodeId[];
  cost: number;
  /** Arestas visitadas durante a busca. */
  explored: Edge[];
  metrics: SearchMetrics;
  /**
   * Distingue "não existe caminho" de "desisti antes de encontrar". Sem isso, um teto de
   * expansões atingido seria indistinguível de um destino inalcançável, e o benchmark da
   * Fase 7 registraria os dois como `found: false`.
   */
  stopReason: StopReason;
}
