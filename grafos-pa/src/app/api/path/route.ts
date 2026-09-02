/**
 * `GET /api/path?from=Brasil&to=Ludwig van Beethoven&algo=bfs`
 *
 * As buscas rodam no servidor porque as duas camadas que as sustentam — cache em disco e
 * cliente HTTP — são de Node, e porque expandir o grafo a partir do navegador multiplicaria as
 * requisições à Wikipédia por usuário.
 *
 * `algo` ganha `dijkstra` na Fase 5 e `astar` na Fase 6; o subgrafo explorado passa a ser
 * devolvido na Fase 8, quando houver o que desenhar com ele.
 */

import { LazyGraph } from "@/lib/graph/lazyGraph";
import { bfs } from "@/lib/search/bfs";
import { zeroHeuristic } from "@/lib/search/heuristics";
import { DEFAULT_MAX_EXPANSIONS, DEFAULT_TIMEOUT_MS } from "@/lib/search/options";
import { bestFirstSearch } from "@/lib/search/search";
import { WikiPageNotFoundError } from "@/lib/wiki/types";

const ALGORITHMS = ["bfs", "dijkstra"] as const;
type Algorithm = (typeof ALGORITHMS)[number];

const isAlgorithm = (value: string): value is Algorithm =>
  (ALGORITHMS as readonly string[]).includes(value);

/** Lê um inteiro positivo da query, preso a um teto para não virar vetor de abuso. */
function readNumber(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const from = params.get("from")?.trim();
  const to = params.get("to")?.trim();
  const algo = params.get("algo") ?? "bfs";

  if (!from || !to) {
    return Response.json({ error: "informe os parâmetros 'from' e 'to'" }, { status: 400 });
  }
  if (!isAlgorithm(algo)) {
    return Response.json(
      { error: `algoritmo desconhecido: "${algo}"`, disponíveis: ALGORITHMS },
      { status: 400 },
    );
  }

  const options = {
    maxExpansions: readNumber(params.get("maxExpansions"), DEFAULT_MAX_EXPANSIONS, 500_000),
    timeoutMs: readNumber(params.get("timeoutMs"), DEFAULT_TIMEOUT_MS, 120_000),
  };

  const graph = new LazyGraph();

  try {
    // Resolver antes de buscar garante que o caminho seja reportado em títulos canônicos, e
    // que "EUA" e "Estados Unidos" produzam exatamente o mesmo resultado.
    const source = await graph.resolve(from);
    const target = await graph.resolve(to);
    const result =
      algo === "bfs"
        ? await bfs(graph, source, target, options)
        : await bestFirstSearch(graph, source, target, zeroHeuristic, options);

    return Response.json({
      algo,
      source,
      target,
      found: result.found,
      stopReason: result.stopReason,
      path: result.path,
      cost: result.cost,
      metrics: result.metrics,
      graph: graph.stats(),
      // O subgrafo explorado não é coletado aqui: uma busca larga percorre dezenas de milhões
      // de arestas e ele só serve para desenhar. A Fase 8 liga a coleta, amostrada.
    });
  } catch (error) {
    if (error instanceof WikiPageNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502 });
  }
}
