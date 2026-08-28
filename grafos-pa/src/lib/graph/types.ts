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

/** Instrumentação de uma execução de busca. */
export interface SearchMetrics {
  /** Vértices removidos da fronteira e expandidos. */
  expanded: number;
  /** Vértices inseridos na fronteira. */
  enqueued: number;
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
}
