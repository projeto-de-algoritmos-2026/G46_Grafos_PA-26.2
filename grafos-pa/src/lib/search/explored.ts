/**
 * Amostragem do subgrafo explorado, para a visualização da Fase 8.
 *
 * O subgrafo bruto é inviável: uma busca larga percorre `expansões × grau de saída` arestas —
 * os números da Fase 7 chegam a 190 mil vértices enfileirados e dezenas de milhões de arestas
 * relaxadas. Serializar isso custaria centenas de megabytes e travaria o navegador antes de
 * desenhar o primeiro nó.
 *
 * O que se desenha, então, é a **árvore de busca**: cada vértice aparece com a única aresta
 * pela qual a busca chegou a ele mais barato. É exatamente a estrutura que os algoritmos
 * constroem — a árvore de predecessores que reconstrói o caminho —, então comparar BFS com
 * Dijkstra na tela é comparar o que eles de fato fizeram, e não a vizinhança bruta dos
 * vértices, que é a mesma para os dois.
 *
 * **Como a amostra é escolhida.** Pegar simplesmente os primeiros vértices descobertos seria
 * inútil: os milhares primeiros são todos filhos da origem, e o desenho vira uma estrela de um
 * nível só, idêntica para qualquer algoritmo. A amostra é tirada dos vértices **expandidos**,
 * em passo constante ao longo da execução, e cada escolhido arrasta seus ancestrais para que a
 * figura continue conexa. O resultado é uma fatia rala da árvore inteira, com a profundidade
 * real preservada e representando toda a execução — não só o começo.
 */

import type { Edge, NodeId } from "@/lib/graph/types";

/** De onde um vértice foi alcançado, e por qual peso. É a aresta da árvore de busca. */
export interface Arrival {
  from: NodeId;
  weight: number;
}

/**
 * Teto de vértices desenhados. Acima de poucas centenas o layout por força vira uma bola de
 * lã ilegível e o quadro cai abaixo de tempo real — o limite é de leitura, não de memória.
 */
export const DEFAULT_EXPLORED_LIMIT = 400;

/**
 * Fatia da árvore de busca: uma amostra em passo constante dos vértices expandidos, fechada
 * pelos ancestrais, mais o caminho encontrado inteiro.
 *
 * O caminho entra por último e sem sujeição ao teto: seus vértices finais costumam ser
 * descobertos tarde, e um desenho sem o caminho perderia o motivo de existir.
 */
export function sampleExploredTree(
  parents: Map<NodeId, Arrival>,
  expandedOrder: readonly NodeId[],
  path: NodeId[],
  limit = DEFAULT_EXPLORED_LIMIT,
): Edge[] {
  // Chaveado pelo destino: na árvore, cada vértice tem uma aresta de entrada só, e é isso que
  // faz um ancestral já incluído não ser reinserido por outro descendente.
  const edges = new Map<NodeId, Edge>();

  /** Inclui o vértice e sobe pelos pais até topar com algo já desenhado ou com a origem. */
  const include = (node: NodeId): void => {
    for (let current = node; !edges.has(current); ) {
      const arrival = parents.get(current);
      if (arrival === undefined) return; // chegou à origem, que não tem aresta de entrada
      edges.set(current, { from: arrival.from, to: current, weight: arrival.weight });
      current = arrival.from;
    }
  };

  const stride = Math.max(1, Math.ceil(expandedOrder.length / limit));
  for (let i = 0; i < expandedOrder.length && edges.size < limit; i += stride) {
    include(expandedOrder[i]);
  }

  for (const node of path) include(node);

  return [...edges.values()];
}
