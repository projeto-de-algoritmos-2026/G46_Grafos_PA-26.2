/**
 * Heurísticas para o motor de `search.ts`.
 *
 * O problema de heurística aqui é honesto e difícil: A* funciona bem quando existe uma
 * estimativa barata e razoavelmente justa do custo restante, e em grafos com métrica geométrica
 * (mapas, malhas) a distância em linha reta cumpre esse papel. **A Wikipédia não tem métrica.**
 * Não há coordenada de artigo, e qualquer noção de "quão perto de Beethoven está Bona" ou é
 * fraca, ou custa uma requisição que anularia o ganho.
 *
 * O que sobra é a semelhança entre os títulos, calculada sem nenhuma requisição adicional. É um
 * sinal fraco, e o projeto assume isso explicitamente: a heurística admissível é limitada por
 * `ε`, o menor custo possível de uma aresta, o que a torna correta mas de ganho modesto. A
 * variante ponderada existe para mostrar o outro lado da troca.
 */

import { EPSILON } from "@/lib/graph/cost.config";
import type { NodeId } from "@/lib/graph/types";
import type { Heuristic } from "./search";

/** Peso da heurística ponderada. `λ ≫ ε` é o que a torna agressiva e não admissível. */
export const DEFAULT_LAMBDA = 0.5;

/**
 * `h ≡ 0`. Trivialmente admissível (`0 ≤ d*(v, t)` para qualquer `v`) e trivialmente
 * consistente (`h(u) − h(v) = 0 ≤ w(u, v)`, pois todo peso é positivo).
 *
 * Com ela, ordenar por `f = g + h` é ordenar por `g`, e `bestFirstSearch` **é** Dijkstra —
 * não uma imitação.
 */
export const zeroHeuristic: Heuristic = () => 0;

/* ── Semelhança entre títulos ─────────────────────────────────────────────────────── */

/** Minúsculas, sem acento e sem pontuação: "Ludwig van Beethoven" → "ludwig van beethoven". */
function normalize(title: string): string {
  return title
    .normalize("NFD")
    // Marcas combinantes que o NFD separou das letras: "ã" vira "a" + U+0303.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter((word) => word.length > 0));
}

/**
 * Trigramas de caracteres sobre o título com margens. As margens fazem o início e o fim da
 * string contarem, distinguindo "Roma" de "Aroma" — sem elas os dois compartilhariam quase
 * todos os trigramas.
 */
function trigrams(normalized: string): Set<string> {
  const padded = `  ${normalized}  `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * `sim(a, b) ∈ [0, 1]` — média de dois sinais complementares sobre os títulos normalizados:
 * Jaccard de palavras, que captura tópicos compartilhados ("Guerra Fria" e "Guerra do Vietnã"),
 * e Jaccard de trigramas, que capta parentesco morfológico que a divisão em palavras perde
 * ("Alemanha" e "alemão").
 *
 * Nenhum dos dois olha para o conteúdo do artigo, então o sinal é fraco por construção. É o
 * preço de não gastar requisição: qualquer medida semântica de verdade exigiria buscar as
 * categorias ou o texto de cada vértice avaliado.
 */
export function titleSimilarity(a: NodeId, b: NodeId): number {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return 1;
  return (jaccard(words(left), words(right)) + jaccard(trigrams(left), trigrams(right))) / 2;
}

/* ── Heurísticas ──────────────────────────────────────────────────────────────────── */

/**
 * Memoiza `1 − sim(v, t)` por vértice. O motor consulta `h` uma vez por relaxamento, e um
 * vértice de grau alto é relaxado muitas vezes; recalcular os trigramas a cada consulta
 * dominaria o tempo da busca.
 */
function dissimilarityTo(target: NodeId): (node: NodeId) => number {
  const cache = new Map<NodeId, number>();
  return (node) => {
    let value = cache.get(node);
    if (value === undefined) {
      value = 1 - titleSimilarity(node, target);
      cache.set(node, value);
    }
    return value;
  };
}

/**
 * `h(v) = ε · (1 − sim(v, t))`, com `h(t) = 0`.
 *
 * **Admissibilidade.** Para `v ≠ t`, todo caminho de `v` a `t` tem ao menos uma aresta, e todo
 * peso satisfaz `w > ε`; logo `d*(v, t) > ε`. Como `sim ∈ [0, 1]`, vale `h(v) ≤ ε < d*(v, t)`.
 * Para `v = t`, `sim = 1` e `h = 0 = d*(t, t)`. ∎
 *
 * **Consistência.** Para toda aresta `u → v`:
 * `h(u) − h(v) = ε · (sim(v,t) − sim(u,t)) ≤ ε · 1 = ε < w(u, v)`. ∎
 * Consistência implica que nenhum vértice fechado é reaberto — o que `verify.ts` confere
 * empiricamente pelo contador `reopened`.
 *
 * **Limitação, a registrar no README.** O ganho é modesto por construção: `h ≤ ε` significa que
 * a heurística nunca corrige a estimativa em mais do que o custo de uma única aresta mínima.
 * Na prática ela atua como desempate informado entre vértices de mesmo `g`, não como poda.
 */
export function admissibleHeuristic(target: NodeId): Heuristic {
  const dissimilarity = dissimilarityTo(target);
  return (node) => EPSILON * dissimilarity(node);
}

/**
 * `h(v) = λ · (1 − sim(v, t))` com `λ ≫ ε`. É A* ponderado.
 *
 * **Não é admissível**: com `λ = 0.5` e arestas baratas de custo próximo de `ε = 0.1`, existe
 * `v` com `h(v) > d*(v, t)`, e o caminho devolvido pode ser mais caro que o ótimo. Também não
 * é consistente, então vértices fechados podem ser reabertos.
 *
 * Existe para medir a troca: quanto de otimalidade se paga por quanta redução de expansões. A
 * Fase 7 reporta o fator de subotimalidade real, `custo_encontrado / custo_ótimo`, contra o
 * ótimo vindo do Dijkstra.
 */
export function weightedHeuristic(target: NodeId, lambda: number = DEFAULT_LAMBDA): Heuristic {
  const dissimilarity = dissimilarityTo(target);
  return (node) => lambda * dissimilarity(node);
}
