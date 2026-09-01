/**
 * Inspeção manual da expansão de um artigo.
 *
 *   npx tsx scripts/probe.ts "Brasil" [--limit N] [--top N]
 *
 * `--limit` mostra os vizinhos na ordem em que os links aparecem no corpo do artigo;
 * `--top` mostra os N mais baratos e os N mais caros segundo a função de custo.
 *
 * O modo `--top` é o critério de calibração da função de custo: os links mais baratos têm que
 * ser os da introdução para artigos específicos, e os mais caros, os do fim do artigo para
 * páginas gigantes. Se não for esse o padrão, `α` e `β` estão errados.
 */

import { edgeCost, generality, linkPosition } from "@/lib/graph/cost";
import { ALPHA, BETA, EPSILON } from "@/lib/graph/cost.config";
import type { Neighbor } from "@/lib/graph/types";
import { fetchPageWithOrigin } from "@/lib/wiki/client";
import { getRequestCount, resetRequestCount } from "@/lib/wiki/ratelimit";

const USAGE = 'uso: npx tsx scripts/probe.ts "Brasil" [--limit N] [--top N]';

interface Options {
  title: string;
  limit: number;
  top: number;
}

function parseArgs(argv: string[]): Options {
  const args = argv.slice(2);
  const flags = new Set(["--limit", "--top"]);

  const read = (flag: string, fallback: number): number => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    const value = Number(args[index + 1]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };

  const title = args.find(
    (arg, index) => !flags.has(arg) && !flags.has(args[index - 1] ?? ""),
  );
  if (!title) {
    console.error(USAGE);
    process.exit(1);
  }

  return { title, limit: read("--limit", 15), top: read("--top", 0) };
}

/** Uma linha por vizinho, com os dois termos da fórmula abertos ao lado do peso. */
function printNeighbors(neighbors: Neighbor[]): void {
  const width = Math.min(Math.max(...neighbors.map((n) => n.id.length), 6), 52);
  console.log(
    `${"rank".padStart(5)} ${"pos".padStart(5)} ${"gen".padStart(5)} ` +
      `${"bytes".padStart(8)} ${"w".padStart(5)}  título`,
  );
  for (const neighbor of neighbors) {
    console.log(
      `${String(neighbor.rank).padStart(5)} ` +
        `${linkPosition(neighbor).toFixed(3).padStart(5)} ` +
        `${generality(neighbor).toFixed(3).padStart(5)} ` +
        `${String(neighbor.length).padStart(8)} ` +
        `${edgeCost(neighbor).toFixed(3).padStart(5)}  ${neighbor.id.slice(0, width)}`,
    );
  }
}

function printSection(label: string, neighbors: Neighbor[]): void {
  if (neighbors.length === 0) return;
  console.log();
  console.log(`${label}:`);
  printNeighbors(neighbors);
}

async function main() {
  const { title, limit, top } = parseArgs(process.argv);

  resetRequestCount();
  const startedAt = Date.now();
  const { page, origin } = await fetchPageWithOrigin(title);
  const elapsedMs = Date.now() - startedAt;

  const costs = page.neighbors.map(edgeCost);

  console.log(`consulta:  "${title}"`);
  console.log(`canônico:  "${page.source}"${page.source === title ? "" : "  (redirect resolvido)"}`);
  console.log(`origem:    ${origin}`);
  console.log(`vizinhos:  ${page.neighbors.length}`);
  console.log(`requests:  ${getRequestCount()}`);
  console.log(`tempo:     ${elapsedMs} ms`);

  if (costs.length > 0) {
    // A faixa teórica é (ε, ε+α+β]; conferir que a real cabe dentro dela é o teste barato
    // de que a fórmula não escapou dos limites que as provas da Fase 6 assumem.
    console.log(
      `custo:     min ${Math.min(...costs).toFixed(3)}  ` +
        `max ${Math.max(...costs).toFixed(3)}  ` +
        `(faixa teórica: (${EPSILON.toFixed(1)}, ${(EPSILON + ALPHA + BETA).toFixed(1)}])`,
    );
  }

  if (top > 0) {
    const byCost = [...page.neighbors].sort((a, b) => edgeCost(a) - edgeCost(b));
    printSection(`${Math.min(top, byCost.length)} links mais baratos`, byCost.slice(0, top));
    printSection(`${Math.min(top, byCost.length)} links mais caros`, byCost.slice(-top).reverse());
    return;
  }

  printSection(`primeiros ${Math.min(limit, page.neighbors.length)} vizinhos`, page.neighbors.slice(0, limit));
  if (page.neighbors.length > limit) {
    printSection(
      `últimos ${Math.min(limit, page.neighbors.length - limit)} vizinhos`,
      page.neighbors.slice(-limit),
    );
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
