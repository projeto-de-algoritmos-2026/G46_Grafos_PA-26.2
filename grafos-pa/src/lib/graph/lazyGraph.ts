/**
 * Grafo materializado sob demanda: não existe grafo global em memória, e a vizinhança de um
 * vértice só passa a existir depois que ele é expandido.
 *
 * Uma instância representa **uma sessão de busca**. A memoização é sua, não global, por dois
 * motivos: uma busca reexpande os mesmos hubs dezenas de vezes e não pode pagar `JSON.parse`
 * a cada vez; e o benchmark da Fase 7 precisa que cada execução comece do zero para que a
 * contagem de expansões seja comparável entre algoritmos.
 */

import { fetchPageWithOrigin } from "@/lib/wiki/client";
import { WikiOfflineMissError, WikiPageNotFoundError } from "@/lib/wiki/types";
import { edgeCost } from "./cost";
import type { Edge, NodeId, WeightedEdge } from "./types";

export interface GraphStats {
  /** Vértices distintos efetivamente expandidos nesta sessão. */
  expansions: number;
  /** Expansões respondidas pela memoização em memória. */
  memoHits: number;
  /**
   * Vértices que a busca alcançou mas que o dump não cobre, em modo offline.
   *
   * Não é erro: o dump é construído com teto de vértices, então toda busca acaba tocando a
   * borda dele. É medida de cobertura — se este número for alto perto de `expansions`, a busca
   * está andando no vazio e o dump precisa ser reconstruído com orçamento maior.
   */
  frontierMisses: number;
}

export class LazyGraph {
  /** Título canônico → vizinhança ponderada. */
  private readonly adjacency = new Map<NodeId, WeightedEdge[]>();
  /** Título como pedido → título canônico, para não repetir a resolução de redirect. */
  private readonly canonical = new Map<string, NodeId>();

  private expansions = 0;
  private memoHits = 0;
  private frontierMisses = 0;

  /**
   * Vizinhança ponderada de um vértice, expandindo-o se preciso.
   *
   * Um vértice fora do dump em modo offline devolve lista vazia — é tratado como folha, e não
   * como falha, para que a busca continue pelo resto da fronteira.
   */
  async expand(nodeId: NodeId): Promise<WeightedEdge[]> {
    const known = this.adjacency.get(this.canonical.get(nodeId) ?? nodeId);
    if (known) {
      this.memoHits++;
      return known;
    }

    let edges: WeightedEdge[];
    let source: NodeId;

    try {
      const { page } = await fetchPageWithOrigin(nodeId);
      source = page.source;
      edges = page.neighbors.map((neighbor) => ({
        to: neighbor.id,
        weight: edgeCost(neighbor),
      }));
    } catch (error) {
      if (error instanceof WikiOfflineMissError) {
        this.frontierMisses++;
      } else if (!(error instanceof WikiPageNotFoundError)) {
        throw error;
      }
      // Artigo inalcançável ou fora do dump: folha. Memoizado para não ser tentado de novo.
      source = nodeId;
      edges = [];
    }

    this.expansions++;
    this.adjacency.set(source, edges);
    if (source !== nodeId) this.canonical.set(nodeId, source);
    return edges;
  }

  /**
   * Título canônico de um artigo. Expande de passagem, já que a mesma requisição que resolve
   * o redirect traz a vizinhança — usado para normalizar origem e destino antes da busca.
   */
  async resolve(title: string): Promise<NodeId> {
    await this.expand(title);
    return this.canonical.get(title) ?? title;
  }

  /** Vizinhança já conhecida, sem disparar expansão. */
  neighborsOf(nodeId: NodeId): WeightedEdge[] | undefined {
    return this.adjacency.get(this.canonical.get(nodeId) ?? nodeId);
  }

  /** Subgrafo explorado até agora, na forma completa que a visualização consome. */
  exploredEdges(): Edge[] {
    const edges: Edge[] = [];
    for (const [from, neighbors] of this.adjacency) {
      for (const { to, weight } of neighbors) edges.push({ from, to, weight });
    }
    return edges;
  }

  stats(): GraphStats {
    return {
      expansions: this.expansions,
      memoHits: this.memoHits,
      frontierMisses: this.frontierMisses,
    };
  }
}
