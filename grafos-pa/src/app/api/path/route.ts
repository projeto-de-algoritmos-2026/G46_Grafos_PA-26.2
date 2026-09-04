/**
 * `GET /api/path?from=Brasil&to=Ludwig van Beethoven&algo=bfs`
 *
 * As buscas rodam no servidor porque as duas camadas que as sustentam — cache em disco e
 * cliente HTTP — são de Node, e porque expandir o grafo a partir do navegador multiplicaria as
 * requisições à Wikipédia por usuário.
 *
 * Além do caminho e das métricas, a rota devolve o **subgrafo explorado** — a árvore de busca
 * amostrada de `explored.ts` — que é o que a visualização desenha. Ele é montado aqui, e não na
 * busca, porque a forma de que o `react-force-graph` precisa (`nodes`/`links`) é detalhe de
 * apresentação e não tem por que contaminar o motor.
 */

import type { NodeRole, PathResponse, Subgraph, SubgraphLink } from "@/lib/api/types";
import { LazyGraph } from "@/lib/graph/lazyGraph";
import type { Edge, NodeId } from "@/lib/graph/types";
import { sccStats, tarjanScc } from "@/lib/scc/tarjan";
import { bfs } from "@/lib/search/bfs";
import { DEFAULT_EXPLORED_LIMIT } from "@/lib/search/explored";
import { admissibleHeuristic, weightedHeuristic } from "@/lib/search/heuristics";
import { DEFAULT_MAX_EXPANSIONS, DEFAULT_TIMEOUT_MS } from "@/lib/search/options";
import { astar, dijkstra } from "@/lib/search/search";
import { WikiPageNotFoundError } from "@/lib/wiki/types";

const ALGORITHMS = ["bfs", "dijkstra", "astar"] as const;
type Algorithm = (typeof ALGORITHMS)[number];

const isAlgorithm = (value: string): value is Algorithm =>
  (ALGORITHMS as readonly string[]).includes(value);

/** Lê um inteiro positivo da query, preso a um teto para não virar vetor de abuso. */
function readNumber(raw: string | null, fallback: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(value, max);
}

/**
 * Teto de arestas fora da árvore **no desenho**. Elas revelam os ciclos (ver `closeCycles`),
 * mas o traço fraco de milhares delas vira uma névoa sobre a árvore. O Tarjan roda antes do
 * corte, sobre todas: a estatística é do subgrafo induzido pelos vértices desenhados, e só o
 * que se vê é amostrado.
 */
const MAX_DRAWN_EXTRA_EDGES = 1_500;

/**
 * Arestas já conhecidas **entre** os vértices desenhados, fora as da árvore de busca.
 *
 * A árvore de busca é, por definição, acíclica: rodar Tarjan só sobre ela devolveria
 * componentes de um vértice cada, e a fase perderia o sentido. Estas arestas são as que fecham
 * os circuitos — todas já estão na memória da sessão de busca, então reconstituí-las não custa
 * uma requisição sequer, que é a condição que a fase impõe.
 */
function closeCycles(
  graph: LazyGraph,
  nodes: Iterable<NodeId>,
  treeEdges: ReadonlySet<string>,
): Edge[] {
  const inside = new Set(nodes);
  const extra: Edge[] = [];

  for (const from of inside) {
    for (const { to, weight } of graph.neighborsOf(from) ?? []) {
      if (!inside.has(to) || treeEdges.has(`${from}\u0000${to}`)) continue;
      extra.push({ from, to, weight });
    }
  }
  return extra;
}

/**
 * Converte a árvore amostrada na forma do desenho, marcando o papel de cada vértice, fechando
 * os ciclos com as arestas conhecidas e rotulando cada vértice com sua componente fortemente
 * conexa.
 *
 * Os vértices saem das pontas das arestas da árvore: ela cobre todo vértice descoberto exceto
 * a origem, que não tem aresta de entrada e por isso é semeada à parte. As arestas de fora da
 * árvore não acrescentam vértices — só ligam os que já estão desenhados.
 */
function buildSubgraph(
  graph: LazyGraph,
  explored: Edge[],
  path: NodeId[],
  source: NodeId,
  target: NodeId,
  expanded: number,
  limit: number,
): Subgraph {
  const pathNodes = new Set(path);
  // Pares consecutivos do caminho, para distinguir a aresta usada da aresta que apenas liga
  // dois vértices do caminho — num grafo denso os dois casos coexistem.
  const pathEdges = new Set(path.slice(1).map((node, i) => `${path[i]}\u0000${node}`));

  const roleOf = (id: NodeId): NodeRole => {
    if (id === source) return "source";
    if (id === target) return "target";
    return pathNodes.has(id) ? "path" : "visited";
  };

  const nodes = new Map<NodeId, NodeRole>([[source, "source"]]);
  const treeEdges = new Set<string>();
  const links: SubgraphLink[] = explored.map((edge) => {
    nodes.set(edge.from, roleOf(edge.from));
    nodes.set(edge.to, roleOf(edge.to));
    treeEdges.add(`${edge.from}\u0000${edge.to}`);
    return {
      source: edge.from,
      target: edge.to,
      weight: edge.weight,
      inPath: pathEdges.has(`${edge.from}\u0000${edge.to}`),
      tree: true,
    };
  });

  const extra = closeCycles(graph, nodes.keys(), treeEdges);

  // Tarjan sobre o subgrafo induzido inteiro — árvore mais todas as arestas que fecham ciclo.
  // Cortar antes daria componentes menores por falta de aresta, e não por ausência de ciclo.
  const successors = new Map<NodeId, NodeId[]>();
  const addSuccessor = (from: NodeId, to: NodeId) => {
    const list = successors.get(from);
    if (list) list.push(to);
    else successors.set(from, [to]);
  };
  for (const link of links) addSuccessor(link.source, link.target);
  for (const edge of extra) addSuccessor(edge.from, edge.to);
  const scc = tarjanScc(nodes.keys(), (node) => successors.get(node) ?? []);

  for (const edge of extra.slice(0, MAX_DRAWN_EXTRA_EDGES)) {
    links.push({
      source: edge.from,
      target: edge.to,
      weight: edge.weight,
      inPath: false,
      tree: false,
    });
  }

  return {
    nodes: [...nodes].map(([id, role]) => ({ id, role, scc: scc.componentOf.get(id) ?? -1 })),
    links,
    expanded,
    truncated: explored.length >= limit,
    sccSizes: scc.components.map((component) => component.length),
    scc: sccStats(scc),
  };
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

  // O teto de nós desenhados é da apresentação, não da busca: mexer nele muda o tamanho da
  // figura, nunca o caminho encontrado nem as métricas.
  const exploredLimit = readNumber(params.get("maxNodes"), DEFAULT_EXPLORED_LIMIT, 5_000);
  const options = {
    maxExpansions: readNumber(params.get("maxExpansions"), DEFAULT_MAX_EXPANSIONS, 500_000),
    timeoutMs: readNumber(params.get("timeoutMs"), DEFAULT_TIMEOUT_MS, 120_000),
    collectExplored: true,
    exploredLimit,
  };

  const graph = new LazyGraph();

  try {
    // Resolver antes de buscar garante que o caminho seja reportado em títulos canônicos, e
    // que "EUA" e "Estados Unidos" produzam exatamente o mesmo resultado.
    const source = await graph.resolve(from);
    const target = await graph.resolve(to);
    // `lambda` só faz sentido com A*: presente, escolhe a variante ponderada e não admissível;
    // ausente, A* usa a heurística admissível, que preserva a otimalidade.
    const rawLambda = params.get("lambda");
    const lambda = rawLambda === null ? undefined : Number(rawLambda);
    if (lambda !== undefined && (!Number.isFinite(lambda) || lambda <= 0)) {
      return Response.json({ error: "'lambda' deve ser um número positivo" }, { status: 400 });
    }

    let result;
    if (algo === "bfs") {
      result = await bfs(graph, source, target, options);
    } else if (algo === "dijkstra") {
      result = await dijkstra(graph, source, target, options);
    } else {
      const heuristic =
        lambda === undefined ? admissibleHeuristic(target) : weightedHeuristic(target, lambda);
      result = await astar(graph, source, target, heuristic, options);
    }

    const response: PathResponse = {
      algo,
      ...(algo === "astar" && { heuristic: lambda === undefined ? "admissível" : `ponderada λ=${lambda}` }),
      source,
      target,
      found: result.found,
      stopReason: result.stopReason,
      path: result.path,
      cost: result.cost,
      metrics: result.metrics,
      graph: graph.stats(),
      subgraph: buildSubgraph(
        graph,
        result.explored,
        result.path,
        source,
        target,
        result.metrics.expanded,
        exploredLimit,
      ),
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof WikiPageNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502 });
  }
}
