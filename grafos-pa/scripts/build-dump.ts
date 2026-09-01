/**
 * Constrói o dump offline a partir dos pares fixos de `data/pairs.json`.
 *
 *   npx tsx scripts/build-dump.ts [--depth N] [--max-nodes N]
 *
 * Faz uma BFS por saltos a partir de **todas as origens ao mesmo tempo**, com teto de vértices,
 * e consolida tudo em `data/dump/graph.json.gz`.
 *
 * Duas propriedades importam mais que a estrutura da busca:
 *
 * - **É retomável.** Toda expansão passa pelo cache em disco, então uma segunda execução
 *   reaproveita o que já foi baixado e continua de onde parou. Como cada vértice custa cerca
 *   de um segundo (fila serial da API), um dump de milhares de vértices leva dezenas de
 *   minutos e vai ser interrompido — isso é esperado, não um problema.
 * - **A expansão é balanceada entre as sementes.** Dentro de um nível, os vértices são
 *   percorridos em rodízio pela semente que os alcançou primeiro. Uma BFS ingênua gastaria o
 *   teto inteiro na vizinhança das primeiras origens e nunca chegaria perto dos destinos.
 */

import { readFile } from "node:fs/promises";
import type { NodeId } from "@/lib/graph/types";
import { writeDump, type DumpNeighbor, type GraphDumpFile } from "@/lib/cache/dump";
import { fetchPageWithOrigin } from "@/lib/wiki/client";
import { WIKI_LANG, WIKI_OFFLINE, WIKI_PAIRS_PATH } from "@/lib/wiki/config";
import { getRequestCount, resetRequestCount } from "@/lib/wiki/ratelimit";
import { normalizeTitle } from "@/lib/wiki/titles";

const DEFAULT_DEPTH = 2;

/**
 * Teto de vértices. Dimensionado para cobrir a vizinhança completa das 10 origens, que somam
 * 4941 links de saída: é o que garante que todo caminho de 2 saltos exista no dump. Abaixo
 * disso a busca offline passa a maior parte do tempo batendo na borda.
 */
const DEFAULT_MAX_NODES = 5000;

interface Pair {
  id: string;
  from: string;
  to: string;
  note?: string;
}

interface PairsFile {
  lang: string;
  pairs: Pair[];
}

/** Vértice na fronteira, com a semente que o alcançou primeiro. */
interface QueueItem {
  title: string;
  owner: number;
}

function parseArgs(argv: string[]): { depth: number; maxNodes: number } {
  const args = argv.slice(2);
  const read = (flag: string, fallback: number, minimum: number): number => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    const value = Number(args[index + 1]);
    return Number.isFinite(value) && value >= minimum ? value : fallback;
  };
  return {
    // `--depth 0` expande só as sementes: é o modo de conferir se os títulos dos pares existem.
    depth: read("--depth", DEFAULT_DEPTH, 0),
    maxNodes: read("--max-nodes", DEFAULT_MAX_NODES, 1),
  };
}

async function readPairs(): Promise<Pair[]> {
  const file = JSON.parse(await readFile(WIKI_PAIRS_PATH, "utf8")) as PairsFile;
  if (file.lang !== WIKI_LANG) {
    console.warn(
      `aviso: pairs.json é da wiki "${file.lang}" mas WIKI_LANG é "${WIKI_LANG}" — ` +
        `os títulos podem não existir.`,
    );
  }
  return file.pairs;
}

/**
 * Achata as filas por semente em rodízio: primeiro vértice de cada semente, depois o
 * segundo de cada uma, e assim por diante. É o que garante o avanço simultâneo pelas duas
 * pontas de cada par.
 */
function interleave(byOwner: Map<number, string[]>): QueueItem[] {
  const lanes = [...byOwner.entries()].sort(([a], [b]) => a - b);
  const flattened: QueueItem[] = [];

  for (let index = 0; ; index++) {
    let pushedAny = false;
    for (const [owner, titles] of lanes) {
      if (index < titles.length) {
        flattened.push({ title: titles[index], owner });
        pushedAny = true;
      }
    }
    if (!pushedAny) return flattened;
  }
}

let interrupted = false;

async function main() {
  if (WIKI_OFFLINE) {
    console.error("erro: build-dump precisa de rede; rode sem WIKI_OFFLINE=1.");
    process.exit(1);
  }

  const { depth: maxDepth, maxNodes } = parseArgs(process.argv);
  const pairs = await readPairs();

  // Só as origens são sementes. Uma busca para frente nunca expande o destino — ela para
  // quando o desenfileira, e os links de *saída* dele nunca são consultados. Semear pelos
  // destinos gastava metade do orçamento em vizinhanças que nenhum dos algoritmos usa; medido,
  // isso deixava 7 dos 10 pares sem caminho no modo offline. Expandir pelas duas pontas só
  // faria sentido para busca bidirecional, que está em trabalhos futuros.
  const seeds = pairs.map((pair) => pair.from);

  console.log(`pares:      ${pairs.length}  (${seeds.length} sementes)`);
  console.log(`orçamento:  ${maxNodes} vértices, profundidade ${maxDepth}`);
  console.log(`wiki:       ${WIKI_LANG}.wikipedia.org`);
  console.log("Ctrl+C interrompe e grava o dump com o que já foi expandido.\n");

  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    console.log("\ninterrompendo após o vértice atual…");
  });

  const pages = new Map<NodeId, DumpNeighbor[]>();
  const aliases = new Map<string, NodeId>();
  const seen = new Set<string>();
  const failures: string[] = [];

  resetRequestCount();
  const startedAt = Date.now();

  let level: QueueItem[] = seeds.map((title, owner) => ({ title, owner }));
  seeds.forEach((title) => seen.add(normalizeTitle(title)));

  for (let depth = 0; depth <= maxDepth && level.length > 0 && !interrupted; depth++) {
    const nextByOwner = new Map<number, string[]>();

    for (const item of level) {
      if (interrupted || pages.size >= maxNodes) break;

      const normalized = normalizeTitle(item.title);
      let canonical: NodeId;
      let neighbors: DumpNeighbor[];

      try {
        const { page, origin } = await fetchPageWithOrigin(item.title);
        canonical = page.source;
        neighbors = page.neighbors.map((neighbor) => [neighbor.id, neighbor.length]);

        if (pages.size % 25 === 0) {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
          console.log(
            `[${String(pages.size).padStart(4)}/${maxNodes}] d${depth} ${elapsed}s ` +
              `${origin.padEnd(7)} ${canonical}`,
          );
        }
      } catch (error) {
        failures.push(`${item.title}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      pages.set(canonical, neighbors);
      if (canonical !== normalized) aliases.set(normalized, canonical);
      seen.add(canonical);

      // O último nível serve só para trazer os vizinhos dos anteriores; não vale enfileirar
      // uma fronteira que nunca será expandida.
      if (depth === maxDepth) continue;

      const lane = nextByOwner.get(item.owner) ?? [];
      for (const [id] of neighbors) {
        if (seen.has(id)) continue;
        seen.add(id);
        lane.push(id);
      }
      nextByOwner.set(item.owner, lane);
    }

    level = pages.size >= maxNodes ? [] : interleave(nextByOwner);
  }

  const file: GraphDumpFile = {
    lang: WIKI_LANG,
    builtAt: new Date().toISOString(),
    pages: Object.fromEntries(pages),
    aliases: Object.fromEntries(aliases),
  };
  const bytes = await writeDump(file);

  const edges = [...pages.values()].reduce((total, list) => total + list.length, 0);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log();
  console.log(`vértices:   ${pages.size} expandidos, ${seen.size} conhecidos`);
  console.log(`arestas:    ${edges}`);
  console.log(`aliases:    ${aliases.size}`);
  console.log(`requests:   ${getRequestCount()}`);
  console.log(`tempo:      ${elapsed} s`);
  console.log(`dump:       ${(bytes / 1024 / 1024).toFixed(1)} MiB comprimidos`);

  if (failures.length > 0) {
    console.log();
    console.log(`${failures.length} artigo(s) falharam:`);
    for (const failure of failures.slice(0, 20)) console.log(`  ${failure}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
