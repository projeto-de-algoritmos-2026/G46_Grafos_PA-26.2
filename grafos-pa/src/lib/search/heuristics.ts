/**
 * Heurísticas para o motor de `search.ts`.
 *
 * A Fase 6 acrescenta aqui `admissibleHeuristic`, `weightedHeuristic` e `titleSimilarity`,
 * com as provas de admissibilidade e consistência. Por ora existe apenas a heurística nula,
 * que é o que reduz o motor a Dijkstra.
 */

import type { Heuristic } from "./search";

/**
 * `h ≡ 0`. Trivialmente admissível (`0 ≤ d*(v, t)` para qualquer `v`) e trivialmente
 * consistente (`h(u) − h(v) = 0 ≤ w(u, v)`, pois todo peso é positivo).
 *
 * Com ela, ordenar por `f = g + h` é ordenar por `g`, e `bestFirstSearch` **é** Dijkstra —
 * não uma imitação. A Fase 6 usa esse fato como prova de que o motor é compartilhado.
 */
export const zeroHeuristic: Heuristic = () => 0;
