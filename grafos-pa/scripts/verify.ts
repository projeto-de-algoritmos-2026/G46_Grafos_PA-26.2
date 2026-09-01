/**
 * Conferência de corretude dos algoritmos sobre o grafo sintético de `src/lib/search/fixtures.ts`.
 *
 *   npx tsx scripts/verify.ts
 *
 * Roda em segundos, não toca a rede e é a única evidência de que as buscas estão corretas —
 * a saída dele vai para o README e para o vídeo. Cresce ao longo das fases: BFS agora,
 * otimalidade de Dijkstra contra Floyd–Warshall na Fase 5, equivalência e consistência do A*
 * na Fase 6, e as componentes fortemente conexas na Fase 9.
 */

import { bfs } from "@/lib/search/bfs";
import { FIXTURE_CASE, FIXTURE_EDGES, FIXTURE_NODES, FixtureGraph } from "@/lib/search/fixtures";

const TOLERANCE = 1e-9;

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];

function check(label: string, ok: boolean, detail: string): void {
  checks.push({ label, ok, detail });
}

const close = (a: number, b: number) => Math.abs(a - b) < TOLERANCE;
const asPath = (path: readonly string[]) => path.join(" → ");

async function verifyBfs(): Promise<void> {
  const graph = new FixtureGraph();
  const { source, target, shortest, cheapest } = FIXTURE_CASE;
  const result = await bfs(graph, source, target);

  console.log(`bfs ${source} → ${target}`);
  console.log(`  caminho:     ${asPath(result.path)}`);
  console.log(`  saltos:      ${result.metrics.pathLength}`);
  console.log(`  custo:       ${result.cost.toFixed(3)}`);
  console.log(`  expandidos:  ${result.metrics.expanded}`);
  console.log(`  enfileirados:${String(result.metrics.enqueued).padStart(2)}`);
  console.log();
  console.log("ótimo em custo, conhecido por construção do fixture");
  console.log(`  caminho:     ${asPath(cheapest.path)}`);
  console.log(`  saltos:      ${cheapest.hops}`);
  console.log(`  custo:       ${cheapest.cost.toFixed(3)}`);
  console.log();

  check(
    "bfs encontra o caminho de menor número de saltos",
    result.found && result.metrics.pathLength === shortest.hops,
    `${result.metrics.pathLength} saltos, esperado ${shortest.hops}`,
  );

  check(
    "bfs encontra exatamente o caminho esperado",
    asPath(result.path) === asPath(shortest.path),
    asPath(result.path),
  );

  check(
    "o custo reportado pelo bfs confere com a soma dos pesos",
    close(result.cost, shortest.cost),
    `${result.cost.toFixed(3)}, esperado ${shortest.cost.toFixed(3)}`,
  );

  // O ponto do fixture inteiro: caminho mais curto ≠ caminho mais barato.
  check(
    "o caminho do bfs é mais caro que o ótimo",
    result.cost > cheapest.cost + TOLERANCE,
    `${result.cost.toFixed(3)} > ${cheapest.cost.toFixed(3)}`,
  );

  check(
    "o ótimo em custo é mais longo em saltos que o do bfs",
    cheapest.hops > result.metrics.pathLength,
    `${cheapest.hops} > ${result.metrics.pathLength} saltos`,
  );
}

async function main() {
  console.log("=== verificação sobre o grafo sintético ===");
  console.log(`fixture: ${FIXTURE_NODES.length} vértices, ${FIXTURE_EDGES.length} arestas`);
  console.log();

  await verifyBfs();

  for (const { label, ok, detail } of checks) {
    console.log(`[${ok ? "OK  " : "FALHA"}] ${label.padEnd(52)} ${detail}`);
  }

  const passed = checks.filter((c) => c.ok).length;
  console.log();
  console.log(`${passed} de ${checks.length} verificações passaram.`);

  if (passed !== checks.length) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
