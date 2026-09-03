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

import type { NodeId } from "@/lib/graph/types";
import { bfs } from "@/lib/search/bfs";
import { FIXTURE_CASE, FIXTURE_EDGES, FIXTURE_NODES, FixtureGraph } from "@/lib/search/fixtures";
import { EPSILON } from "@/lib/graph/cost.config";
import {
  admissibleHeuristic,
  DEFAULT_LAMBDA,
  titleSimilarity,
  weightedHeuristic,
  zeroHeuristic,
} from "@/lib/search/heuristics";
import { astar, bestFirstSearch, dijkstra } from "@/lib/search/search";

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

/**
 * Floyd–Warshall, escrita aqui de propósito: é uma implementação independente, de derivação
 * diferente da do Dijkstra, e por isso serve de referência. Se as duas concordam em todos os
 * 225 pares ordenados do fixture, um erro teria que estar presente nas duas ao mesmo tempo.
 */
function floydWarshall(): Map<string, number> {
  const distance = new Map<string, number>();
  const at = (from: NodeId, to: NodeId) => distance.get(`${from}|${to}`) ?? Infinity;

  for (const node of FIXTURE_NODES) distance.set(`${node}|${node}`, 0);
  for (const [from, to, weight] of FIXTURE_EDGES) {
    if (weight < at(from, to)) distance.set(`${from}|${to}`, weight);
  }

  for (const k of FIXTURE_NODES) {
    for (const i of FIXTURE_NODES) {
      for (const j of FIXTURE_NODES) {
        const through = at(i, k) + at(k, j);
        if (through < at(i, j)) distance.set(`${i}|${j}`, through);
      }
    }
  }
  return distance;
}

async function verifyDijkstra(): Promise<void> {
  const graph = new FixtureGraph();
  const reference = floydWarshall();

  let compared = 0;
  let divergent = 0;
  let firstDivergence = "";

  for (const source of FIXTURE_NODES) {
    for (const target of FIXTURE_NODES) {
      const result = await bestFirstSearch(graph, source, target, zeroHeuristic);
      const expected = reference.get(`${source}|${target}`) ?? Infinity;
      compared++;

      const agrees = Number.isFinite(expected)
        ? result.found && close(result.cost, expected)
        : !result.found;

      if (!agrees) {
        divergent++;
        if (!firstDivergence) {
          firstDivergence =
            `${source}→${target}: dijkstra ${result.found ? result.cost.toFixed(3) : "∞"} ` +
            `vs floyd–warshall ${Number.isFinite(expected) ? expected.toFixed(3) : "∞"}`;
        }
      }
    }
  }

  check(
    "dijkstra == floyd-warshall",
    divergent === 0,
    divergent === 0 ? `${compared} pares ordenados conferem` : firstDivergence,
  );

  // O confronto direto com o baseline, no par canônico do fixture.
  const { source, target, cheapest } = FIXTURE_CASE;
  const viaBfs = await bfs(graph, source, target);
  const viaDijkstra = await bestFirstSearch(graph, source, target, zeroHeuristic);

  console.log(`dijkstra ${source} → ${target}`);
  console.log(`  caminho:     ${asPath(viaDijkstra.path)}`);
  console.log(`  saltos:      ${viaDijkstra.metrics.pathLength}`);
  console.log(`  custo:       ${viaDijkstra.cost.toFixed(3)}`);
  console.log(`  expandidos:  ${viaDijkstra.metrics.expanded}`);
  console.log(`  reaberturas: ${viaDijkstra.metrics.reopened}`);
  console.log();

  check(
    "dijkstra encontra o caminho de menor custo",
    viaDijkstra.found && close(viaDijkstra.cost, cheapest.cost),
    `${viaDijkstra.cost.toFixed(3)}, esperado ${cheapest.cost.toFixed(3)}`,
  );

  check(
    "dijkstra acha caminho mais barato que o bfs",
    viaDijkstra.cost < viaBfs.cost - TOLERANCE,
    `${viaDijkstra.cost.toFixed(3)} < ${viaBfs.cost.toFixed(3)}`,
  );

  check(
    "e mais longo em saltos que o do bfs",
    viaDijkstra.metrics.pathLength > viaBfs.metrics.pathLength,
    `${viaDijkstra.metrics.pathLength} > ${viaBfs.metrics.pathLength} saltos`,
  );

  // Com pesos não negativos, `h ≡ 0` é consistente, então nenhum vértice fechado é reaberto.
  check(
    "dijkstra não reabre vértice fechado",
    viaDijkstra.metrics.reopened === 0,
    `${viaDijkstra.metrics.reopened} reaberturas`,
  );
}

async function verifyAstar(): Promise<void> {
  const graph = new FixtureGraph();

  let equivalentCost = 0;
  let equivalentExpansions = 0;
  let optimalCost = 0;
  let reopened = 0;
  let compared = 0;
  let firstDivergence = "";

  for (const source of FIXTURE_NODES) {
    for (const target of FIXTURE_NODES) {
      const reference = await dijkstra(graph, source, target);
      const withZero = await astar(graph, source, target, zeroHeuristic);
      const withAdmissible = await astar(graph, source, target, admissibleHeuristic(target));
      compared++;

      // 1. O motor é o mesmo: mesma resposta E mesmo trabalho.
      if (withZero.found === reference.found && close(withZero.cost, reference.cost)) {
        equivalentCost++;
      }
      if (withZero.metrics.expanded === reference.metrics.expanded) equivalentExpansions++;

      // 2. A heurística admissível não estraga a otimalidade.
      if (withAdmissible.found === reference.found && close(withAdmissible.cost, reference.cost)) {
        optimalCost++;
      } else if (!firstDivergence) {
        firstDivergence =
          `${source}→${target}: a* ${withAdmissible.cost.toFixed(3)} ` +
          `vs ótimo ${reference.cost.toFixed(3)}`;
      }

      // 3. Consistência implica não reabrir vértice fechado.
      reopened += withAdmissible.metrics.reopened;
    }
  }

  check(
    "astar(h=0) == dijkstra (custo)",
    equivalentCost === compared,
    `${equivalentCost}/${compared} pares`,
  );
  check(
    "astar(h=0) == dijkstra (nós expandidos)",
    equivalentExpansions === compared,
    `${equivalentExpansions}/${compared} pares`,
  );
  check(
    "astar(h admissível) == dijkstra (custo)",
    optimalCost === compared,
    optimalCost === compared ? `${compared} pares` : firstDivergence,
  );
  check(
    "astar(h admissível) não reabre vértice fechado",
    reopened === 0,
    `${reopened} reaberturas em ${compared} buscas`,
  );

  // Consistência conferida aresta a aresta, que é a hipótese da qual "não reabre" decorre.
  let inconsistent = 0;
  let worstSlack = Infinity;
  for (const target of FIXTURE_NODES) {
    const h = admissibleHeuristic(target);
    for (const [from, to, weight] of FIXTURE_EDGES) {
      const slack = weight - (h(from) - h(to));
      if (slack < worstSlack) worstSlack = slack;
      if (slack < -TOLERANCE) inconsistent++;
    }
  }
  check(
    "consistência h(u) − h(v) ≤ w(u,v)",
    inconsistent === 0,
    `${FIXTURE_EDGES.length * FIXTURE_NODES.length} arestas, folga mínima ${worstSlack.toFixed(3)}`,
  );

  // O limite h ≤ ε é o que sustenta a prova de admissibilidade; conferido sobre títulos reais,
  // onde a semelhança de fato varia (no fixture os rótulos têm uma letra e sim é degenerada).
  const realTitles = [
    ["Brasil", "Ludwig van Beethoven"],
    ["Bona", "Ludwig van Beethoven"],
    ["Alemanha", "Ludwig van Beethoven"],
    ["Guerra Fria", "Guerra do Vietnã"],
    ["Alemanha", "Alemão"],
    ["Roma", "Aroma"],
    ["Café", "Revolução Francesa"],
  ] as const;

  console.log("semelhança entre títulos reais (sinal da heurística)");
  let aboveEpsilon = 0;
  for (const [a, b] of realTitles) {
    const sim = titleSimilarity(a, b);
    const h = EPSILON * (1 - sim);
    if (h > EPSILON + TOLERANCE) aboveEpsilon++;
    console.log(`  sim(${`${a} , ${b}`.padEnd(42)}) = ${sim.toFixed(3)}   h = ${h.toFixed(4)}`);
  }
  console.log();

  check(
    "h admissível respeita o limite h ≤ ε",
    aboveEpsilon === 0,
    `ε = ${EPSILON}, ${realTitles.length} pares reais`,
  );

  // Informativo: no fixture os rótulos de uma letra fazem sim ≈ 0 para todo v ≠ t, então a
  // heurística ponderada vira uma constante e não altera a ordem de expansão. A subotimalidade
  // dela só aparece sobre títulos reais — é o que a Fase 7 mede.
  const { source, target, cheapest } = FIXTURE_CASE;
  const weighted = await astar(graph, source, target, weightedHeuristic(target, DEFAULT_LAMBDA));
  const ratio = weighted.found ? weighted.cost / cheapest.cost : Infinity;
  console.log(
    `astar(h ponderada, λ=${DEFAULT_LAMBDA}): custo ${weighted.cost.toFixed(3)} ` +
      `vs ótimo ${cheapest.cost.toFixed(3)}, razão ${ratio.toFixed(3)} ` +
      `(informativo — pode ser subótimo)`,
  );
  console.log(
    `  expandidos ${weighted.metrics.expanded} contra ${
      (await dijkstra(graph, source, target)).metrics.expanded
    } do dijkstra, ${weighted.metrics.reopened} reaberturas`,
  );
  console.log();
}

async function main() {
  console.log("=== verificação sobre o grafo sintético ===");
  console.log(`fixture: ${FIXTURE_NODES.length} vértices, ${FIXTURE_EDGES.length} arestas`);
  console.log();

  await verifyBfs();
  await verifyDijkstra();
  await verifyAstar();

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
