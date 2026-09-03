/**
 * As quatro configurações comparáveis, com os mesmos nomes usados nas colunas `algo` de
 * `data/results/benchmark.csv`. Ter uma lista só evita que a interface ofereça uma combinação
 * que o benchmark não mediu — e é o que permite ler o CSV e a tela como a mesma coisa.
 *
 * `astar-admissible` e `astar-weighted` são o mesmo endpoint: a diferença está em mandar ou
 * não `lambda`, que é o que troca a heurística admissível pela ponderada.
 */

import { DEFAULT_LAMBDA } from "@/lib/search/heuristics";

export interface AlgorithmMode {
  key: string;
  label: string;
  /** Uma linha sobre o que esperar — vira o título acessível do botão. */
  note: string;
  algo: "bfs" | "dijkstra" | "astar";
  lambda?: number;
}

export const ALGORITHM_MODES: AlgorithmMode[] = [
  {
    key: "bfs",
    label: "BFS",
    note: "Baseline cego aos pesos: minimiza saltos, não custo.",
    algo: "bfs",
  },
  {
    key: "dijkstra",
    label: "Dijkstra",
    note: "Ótimo em custo. É o motor com h ≡ 0.",
    algo: "dijkstra",
  },
  {
    key: "astar-admissible",
    label: "A* admissível",
    note: "Mesmo custo do Dijkstra, com menos expansões.",
    algo: "astar",
  },
  {
    key: "astar-weighted",
    label: `A* ponderado (λ=${DEFAULT_LAMBDA})`,
    note: "Heurística não admissível: muito mais rápido, sem garantia de otimalidade.",
    algo: "astar",
    lambda: DEFAULT_LAMBDA,
  },
];

/** Query da rota `/api/path` para um par e um modo. */
export function pathQuery(mode: AlgorithmMode, from: string, to: string): string {
  const params = new URLSearchParams({ from, to, algo: mode.algo });
  if (mode.lambda !== undefined) params.set("lambda", String(mode.lambda));
  return `/api/path?${params}`;
}
