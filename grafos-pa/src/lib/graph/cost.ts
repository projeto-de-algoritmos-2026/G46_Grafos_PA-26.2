/**
 * Função de custo das arestas: `w(u → v) = ε + α · pos(u, v) + β · gen(v)`.
 *
 * O custo mede **quão periférico é aquele link**, não um salto uniforme. Isso é o que torna
 * Dijkstra necessário: com peso constante ele degenera em BFS, e o trabalho perderia o núcleo.
 *
 * Toda a informação usada aqui vem da expansão de `u` — nenhuma requisição por vizinho. É uma
 * restrição de projeto, não uma coincidência: um termo que dependesse do grau de entrada de `v`
 * exigiria uma chamada `list=backlinks` por vértice e multiplicaria o custo de cada busca.
 */

import { ALPHA, BETA, EPSILON, LENGTH_FLOOR, LENGTH_REFERENCE } from "./cost.config";
import type { Neighbor } from "./types";

const LOG_FLOOR = Math.log1p(LENGTH_FLOOR);
const LOG_SPAN = Math.log1p(LENGTH_REFERENCE) - LOG_FLOOR;

/**
 * `pos(u, v) ∈ (0, 1]` — posição relativa do link no corpo de `u`.
 *
 * A seção introdutória de um artigo concentra os links que definem o tópico; os do fim, vindos
 * de listas, "ver também" e navboxes, são progressivamente mais periféricos. Link citado cedo
 * custa menos.
 */
export function linkPosition(neighbor: Neighbor): number {
  if (neighbor.total <= 0) return 1;
  return neighbor.rank / neighbor.total;
}

/**
 * `gen(v) ∈ [0, 1]` — generalidade do destino, medida pelo tamanho do artigo.
 *
 * É um proxy de "quão hub" é `v`: artigos enormes são pontos de passagem vagos, e passar por
 * eles precisa custar caro, senão todo caminho vira "origem → Brasil → destino". A escala é
 * logarítmica porque a diferença entre 2 KB e 20 KB diz muito mais sobre especificidade do que
 * a diferença entre 180 KB e 200 KB.
 *
 * A normalização é feita entre `LENGTH_FLOOR` e `LENGTH_REFERENCE`, e não a partir de zero:
 * medida contra zero, a faixa real de tamanhos ocupava só a metade superior de [0, 1] e o
 * termo mal discriminava. Ver a justificativa em `cost.config.ts`.
 */
export function generality(neighbor: Neighbor): number {
  if (neighbor.length <= 0) return 0;
  return Math.min(1, Math.max(0, (Math.log1p(neighbor.length) - LOG_FLOOR) / LOG_SPAN));
}

/**
 * Custo da aresta que leva a `neighbor`. Sempre em `(ε, ε + α + β]` — com as constantes
 * padrão, `(0.1, 1.1]`. Positivo e limitado inferiormente por `ε`: os dois fatos de que
 * dependem a corretude de Dijkstra e as provas da heurística.
 */
export function edgeCost(neighbor: Neighbor): number {
  return EPSILON + ALPHA * linkPosition(neighbor) + BETA * generality(neighbor);
}
