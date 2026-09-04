/**
 * Comparação empírica dos quatro algoritmos sobre os 10 pares fixos de `data/pairs.json`.
 *
 *   npm run benchmark [-- --repeats N]
 *
 * Escreve `data/results/benchmark.csv` (uma linha por par × configuração) e
 * `data/results/summary.csv` (uma linha por configuração).
 *
 * **Por que offline.** Rodar sobre o dump elimina as duas fontes de variação que tornariam os
 * números incomparáveis: a latência da rede, que domina o tempo, e o próprio conteúdo da
 * Wikipédia, que muda entre execuções. Todos os algoritmos veem exatamente o mesmo grafo
 * finito. O preço é que o "ótimo" reportado é o ótimo **sobre o subgrafo dumpado**, não sobre a
 * Wikipédia inteira — e isso precisa estar dito no README.
 *
 * **Por que o cache é neutralizado.** O script npm aponta `WIKI_CACHE_DIR` para um diretório
 * que não existe, então a única fonte de dados é o dump versionado. Sem isso os números
 * dependeriam do que o cache local acumulou — quem rodou a interface online algumas vezes mede
 * um grafo maior do que quem acabou de clonar o repositório, e os dois obtêm CSVs diferentes.
 * Foi exatamente o que aconteceu antes desta trava: `Universidade de Brasília → Álgebra linear`
 * passou a achar um caminho de 4 saltos e custo 1,2734 que o dump sozinho não contém.
 *
 * **Por que a mediana de três.** Só o tempo varia entre repetições; caminho, custo e contagens
 * de nós são determinísticos por construção (o heap desempata por ordem de inserção). O script
 * confere essa invariância e reclama se ela quebrar, o que seria sinal de bug.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { LazyGraph } from "@/lib/graph/lazyGraph";
import type { NodeId, PathResult } from "@/lib/graph/types";
import { bfs } from "@/lib/search/bfs";
import {
  admissibleHeuristic,
  DEFAULT_LAMBDA,
  weightedHeuristic,
} from "@/lib/search/heuristics";
import type { SearchOptions } from "@/lib/search/options";
import { astar, dijkstra } from "@/lib/search/search";
import { WIKI_OFFLINE, WIKI_PAIRS_PATH } from "@/lib/wiki/config";

const RESULTS_DIR = path.resolve(process.cwd(), "data", "results");
const DEFAULT_REPEATS = 3;

interface Pair {
  id: string;
  from: string;
  to: string;
}

interface Config {
  /** Nome na coluna `algo` do CSV. */
  name: string;
  lambda: number | "";
  run: (graph: LazyGraph, source: NodeId, target: NodeId, options: SearchOptions) => Promise<PathResult>;
}

const CONFIGS: Config[] = [
  { name: "bfs", lambda: "", run: (g, s, t, o) => bfs(g, s, t, o) },
  { name: "dijkstra", lambda: "", run: (g, s, t, o) => dijkstra(g, s, t, o) },
  {
    name: "astar-admissible",
    lambda: "",
    run: (g, s, t, o) => astar(g, s, t, admissibleHeuristic(t), o),
  },
  {
    name: "astar-weighted",
    lambda: DEFAULT_LAMBDA,
    run: (g, s, t, o) => astar(g, s, t, weightedHeuristic(t, DEFAULT_LAMBDA), o),
  },
];

/** Uma medição consolidada: o resultado determinístico mais o tempo mediano. */
interface Measurement {
  result: PathResult;
  /** Vértices que a busca alcançou mas que o dump não cobre — expansões sem trabalho real. */
  frontierMisses: number;
  medianElapsedMs: number;
  deterministic: boolean;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Roda uma configuração `repeats` vezes com um `LazyGraph` novo a cada vez — a memoização em
 * memória precisa começar zerada, senão a segunda repetição mediria um problema mais fácil.
 */
async function measure(
  config: Config,
  source: NodeId,
  target: NodeId,
  repeats: number,
  options: SearchOptions,
): Promise<Measurement> {
  const runs: { result: PathResult; frontierMisses: number }[] = [];

  for (let i = 0; i < repeats; i++) {
    const graph = new LazyGraph();
    const result = await config.run(graph, source, target, options);
    runs.push({ result, frontierMisses: graph.stats().frontierMisses });
  }

  const first = runs[0];
  const deterministic = runs.every(
    ({ result }) =>
      result.found === first.result.found &&
      result.cost === first.result.cost &&
      result.metrics.expanded === first.result.metrics.expanded,
  );

  return {
    result: first.result,
    frontierMisses: first.frontierMisses,
    medianElapsedMs: median(runs.map((run) => run.result.metrics.elapsedMs)),
    deterministic,
  };
}

/** Uma célula de CSV: aspas só quando necessário, e aspas internas duplicadas. */
function cell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const toCsv = (rows: (string | number)[][]): string =>
  rows.map((row) => row.map(cell).join(",")).join("\n") + "\n";

const BENCHMARK_HEADER = [
  "pair_id", "source", "target", "algo", "lambda",
  "path_length", "path_cost", "expanded", "productive_expansions", "frontier_misses",
  "enqueued", "reopened", "requests", "cache_hits", "elapsed_ms",
  "optimal_cost", "suboptimality_ratio", "found", "stop_reason",
];

const SUMMARY_HEADER = [
  "algo", "lambda", "pairs", "pairs_found",
  "mean_path_length", "mean_path_cost", "mean_expanded", "mean_productive_expansions",
  "mean_enqueued", "mean_elapsed_ms", "mean_suboptimality_ratio", "max_suboptimality_ratio",
];

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));
const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;

function parseArgs(argv: string[]): { repeats: number } {
  const index = argv.indexOf("--repeats");
  if (index === -1) return { repeats: DEFAULT_REPEATS };
  const value = Number(argv[index + 1]);
  return { repeats: Number.isFinite(value) && value >= 1 ? value : DEFAULT_REPEATS };
}

async function main() {
  if (!WIKI_OFFLINE) {
    console.warn(
      "aviso: rodando sem WIKI_OFFLINE=1. Os tempos incluirão latência de rede e os " +
        "resultados não serão reprodutíveis.\n",
    );
  }

  const { repeats } = parseArgs(process.argv);
  const { pairs } = JSON.parse(await readFile(WIKI_PAIRS_PATH, "utf8")) as { pairs: Pair[] };

  console.log(`${pairs.length} pares × ${CONFIGS.length} configurações × ${repeats} repetições`);
  console.log();

  const rows: (string | number)[][] = [BENCHMARK_HEADER];
  /** Medições por configuração, para o resumo. */
  const byConfig = new Map<string, { measurement: Measurement; ratio: number | "" }[]>();
  const nonDeterministic: string[] = [];

  for (const pair of pairs) {
    // Resolver uma única vez: os títulos canônicos são os mesmos para todas as configurações,
    // e resolver dentro do laço contaminaria a primeira medição de cada par.
    const resolver = new LazyGraph();
    const source = await resolver.resolve(pair.from);
    const target = await resolver.resolve(pair.to);

    const measurements = new Map<string, Measurement>();
    for (const config of CONFIGS) {
      measurements.set(config.name, await measure(config, source, target, repeats, {}));
    }

    // O ótimo de referência vem do Dijkstra, que é exato sobre este grafo.
    const optimal = measurements.get("dijkstra")!.result;
    const optimalCost = optimal.found ? optimal.cost : NaN;

    for (const config of CONFIGS) {
      const measurement = measurements.get(config.name)!;
      const { result, frontierMisses, medianElapsedMs } = measurement;
      const productive = result.metrics.expanded - frontierMisses;
      const ratio =
        result.found && Number.isFinite(optimalCost) && optimalCost > 0
          ? round(result.cost / optimalCost, 6)
          : "";

      if (!measurement.deterministic) nonDeterministic.push(`${pair.id}/${config.name}`);

      rows.push([
        pair.id, source, target, config.name, config.lambda,
        result.metrics.pathLength, round(result.cost), result.metrics.expanded,
        productive, frontierMisses, result.metrics.enqueued, result.metrics.reopened,
        result.metrics.requests, result.metrics.cacheHits, round(medianElapsedMs, 3),
        Number.isFinite(optimalCost) ? round(optimalCost) : "",
        ratio, result.found ? "true" : "false", result.stopReason,
      ]);

      const bucket = byConfig.get(config.name) ?? [];
      bucket.push({ measurement, ratio });
      byConfig.set(config.name, bucket);

      console.log(
        `${pair.id} ${config.name.padEnd(17)} ` +
          `custo ${result.found ? round(result.cost).toFixed(4) : "   —  "} ` +
          `exp ${String(result.metrics.expanded).padStart(6)} ` +
          `(útil ${String(productive).padStart(5)}) ` +
          `${medianElapsedMs.toFixed(0).padStart(6)} ms ` +
          `razão ${ratio === "" ? "—" : Number(ratio).toFixed(4)}`,
      );
    }
    console.log();
  }

  const summary: (string | number)[][] = [SUMMARY_HEADER];
  for (const config of CONFIGS) {
    const entries = byConfig.get(config.name) ?? [];
    const found = entries.filter((e) => e.measurement.result.found);
    const ratios = entries.map((e) => e.ratio).filter((r): r is number => r !== "");

    summary.push([
      config.name, config.lambda, entries.length, found.length,
      round(mean(found.map((e) => e.measurement.result.metrics.pathLength)), 2),
      round(mean(found.map((e) => e.measurement.result.cost))),
      round(mean(entries.map((e) => e.measurement.result.metrics.expanded)), 1),
      round(
        mean(entries.map((e) => e.measurement.result.metrics.expanded - e.measurement.frontierMisses)),
        1,
      ),
      round(mean(entries.map((e) => e.measurement.result.metrics.enqueued)), 1),
      round(mean(entries.map((e) => e.measurement.medianElapsedMs)), 3),
      ratios.length > 0 ? round(mean(ratios), 6) : "",
      ratios.length > 0 ? round(Math.max(...ratios), 6) : "",
    ]);
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(path.join(RESULTS_DIR, "benchmark.csv"), toCsv(rows), "utf8");
  await writeFile(path.join(RESULTS_DIR, "summary.csv"), toCsv(summary), "utf8");

  console.log("=== resumo ===");
  for (const row of summary.slice(1)) {
    console.log(
      `${String(row[0]).padEnd(17)} achou ${row[3]}/${row[2]}  ` +
        `exp médio ${String(row[6]).padStart(9)}  útil ${String(row[7]).padStart(8)}  ` +
        `${String(row[9]).padStart(9)} ms  razão média ${row[10]}  máx ${row[11]}`,
    );
  }

  console.log();
  console.log(`escritos: data/results/benchmark.csv (${rows.length - 1} linhas), summary.csv`);

  if (nonDeterministic.length > 0) {
    console.error(`\nERRO: resultado não determinístico em ${nonDeterministic.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
