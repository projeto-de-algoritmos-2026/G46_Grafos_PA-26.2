/**
 * Contrato entre a rota `/api/path` e a interface. Está num módulo próprio, e não dentro da
 * rota, porque servidor e cliente precisam do mesmo tipo: é ele que garante que o painel de
 * métricas mostre exatamente o que a busca mediu, sem um `any` no meio.
 */

import type { GraphStats } from "@/lib/graph/lazyGraph";
import type { SccStats } from "@/lib/scc/tarjan";
import type { NodeId, SearchMetrics, StopReason } from "@/lib/graph/types";

/** Papel de um vértice no desenho. Define cor e tamanho em `GraphView`. */
export type NodeRole = "source" | "target" | "path" | "visited";

export interface SubgraphNode {
  id: NodeId;
  role: NodeRole;
  /** Índice da componente fortemente conexa, para a colorização alternável. */
  scc: number;
}

export interface SubgraphLink {
  source: NodeId;
  target: NodeId;
  weight: number;
  /** Aresta do caminho encontrado, destacada com o peso em rótulo. */
  inPath: boolean;
  /**
   * Aresta da árvore de busca. As de fora dela ligam vértices já desenhados e existem para
   * fechar os ciclos que o Tarjan encontra — desenhadas mais fracas, são o pano de fundo.
   */
  tree: boolean;
}

/**
 * Subgrafo explorado, na forma que o `react-force-graph` consome — `nodes` e `links` com
 * `source`/`target`, e não a `Edge` interna com `from`/`to`.
 */
export interface Subgraph {
  nodes: SubgraphNode[];
  links: SubgraphLink[];
  /** Quantos vértices a busca expandiu de fato, contra os `nodes.length` desenhados. */
  expanded: number;
  /** Verdadeiro quando o teto de nós cortou a árvore — o desenho é uma amostra. */
  truncated: boolean;
  /** Cardinalidade de cada componente, indexada pelo `scc` dos vértices. */
  sccSizes: number[];
  /** Resumo das componentes do subgrafo desenhado. */
  scc: SccStats;
}

export interface PathResponse {
  algo: string;
  /** Só em A*: qual das duas heurísticas da §1.3 foi usada. */
  heuristic?: string;
  source: NodeId;
  target: NodeId;
  found: boolean;
  stopReason: StopReason;
  path: NodeId[];
  cost: number;
  metrics: SearchMetrics;
  graph: GraphStats;
  subgraph: Subgraph;
}

export interface ErrorResponse {
  error: string;
}
