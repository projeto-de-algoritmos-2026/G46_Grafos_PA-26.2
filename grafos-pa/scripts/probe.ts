/**
 * Inspeção manual do cliente da Wikipédia.
 *
 *   npx tsx scripts/probe.ts "Brasil" [--limit N]
 *
 * Expande um artigo e imprime o título canônico, os vizinhos com seus metadados e as
 * requisições HTTP gastas. Serve para conferir a olho que a API e, mais adiante, a função
 * de custo fazem sentido.
 */

import { fetchPage } from "@/lib/wiki/client";
import { getRequestCount, resetRequestCount } from "@/lib/wiki/ratelimit";

function parseArgs(argv: string[]): { title: string; limit: number } {
  const args = argv.slice(2);
  const limitIndex = args.findIndex((arg) => arg === "--limit");
  const limit = limitIndex === -1 ? 15 : Number(args[limitIndex + 1]);
  const title = args.filter((arg, index) => {
    if (arg === "--limit") return false;
    if (limitIndex !== -1 && index === limitIndex + 1) return false;
    return true;
  })[0];

  if (!title) {
    console.error('uso: npx tsx scripts/probe.ts "Brasil" [--limit N]');
    process.exit(1);
  }
  return { title, limit: Number.isFinite(limit) && limit > 0 ? limit : 15 };
}

function printNeighbors(neighbors: { id: string; rank: number; total: number; length: number }[]) {
  const width = Math.max(...neighbors.map((n) => n.id.length), 6);
  console.log(
    `${"rank".padStart(6)}  ${"pos".padStart(6)}  ${"bytes".padStart(8)}  título`,
  );
  for (const neighbor of neighbors) {
    const pos = (neighbor.rank / neighbor.total).toFixed(3);
    console.log(
      `${String(neighbor.rank).padStart(6)}  ${pos.padStart(6)}  ` +
        `${String(neighbor.length).padStart(8)}  ${neighbor.id.padEnd(width)}`,
    );
  }
}

async function main() {
  const { title, limit } = parseArgs(process.argv);

  resetRequestCount();
  const startedAt = Date.now();
  const page = await fetchPage(title);
  const elapsedMs = Date.now() - startedAt;

  console.log(`consulta:  "${title}"`);
  console.log(`canônico:  "${page.source}"${page.source === title ? "" : "  (redirect resolvido)"}`);
  console.log(`vizinhos:  ${page.neighbors.length}`);
  console.log(`requests:  ${getRequestCount()}`);
  console.log(`tempo:     ${elapsedMs} ms`);
  console.log();

  console.log(`primeiros ${Math.min(limit, page.neighbors.length)} vizinhos:`);
  printNeighbors(page.neighbors.slice(0, limit));

  if (page.neighbors.length > limit) {
    console.log();
    console.log(`últimos ${Math.min(limit, page.neighbors.length - limit)} vizinhos:`);
    printNeighbors(page.neighbors.slice(-limit));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
