"use client";

/**
 * Desenho do subgrafo explorado, com o caminho destacado.
 *
 * O componente é cliente e o `react-force-graph-2d` entra por importação dinâmica com
 * `ssr: false`: ele desenha em `<canvas>` e toca `window` no próprio módulo, então renderizá-lo
 * no servidor quebraria a página. Segundo a documentação desta versão do Next, `ssr: false` só
 * é aceito dentro de um Client Component — daí o `"use client"` no topo deste arquivo, e não
 * na página.
 *
 * O que está desenhado é a **árvore de busca amostrada** (ver `lib/search/explored.ts`), não a
 * vizinhança bruta: é ela que difere entre BFS, Dijkstra e A* para o mesmo par, e portanto a
 * única figura em que trocar de algoritmo muda alguma coisa. Sobre ela, em traço fraco, vêm as
 * arestas já conhecidas entre os vértices desenhados — as que fecham os ciclos que o Tarjan
 * encontra, e sem as quais a colorização por componente não teria o que mostrar.
 */

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ForceGraphProps } from "react-force-graph-2d";
import type { NodeRole, Subgraph } from "@/lib/api/types";

/** Cor por papel do vértice. Origem e destino são as âncoras da leitura da figura. */
const ROLE_COLOR: Record<NodeRole, string> = {
  source: "#059669",
  target: "#e11d48",
  path: "#f59e0b",
  visited: "#a1a1aa",
};

const ROLE_RADIUS: Record<NodeRole, number> = {
  source: 6,
  target: 6,
  path: 5,
  visited: 2,
};

interface ViewNode {
  id: string;
  role: NodeRole;
  scc: number;
  x?: number;
  y?: number;
}

interface ViewLink {
  source: string | ViewNode;
  target: string | ViewNode;
  weight: number;
  inPath: boolean;
  tree: boolean;
}

/**
 * Cor de uma componente, pelo ângulo áureo: índices vizinhos caem longe um do outro no círculo
 * de matizes, então componentes adjacentes na tela não saem em tons parecidos.
 */
const componentColor = (index: number) => `hsl(${(index * 137.508) % 360} 65% 45%)`;

/**
 * O componente é genérico nos tipos de nó e de aresta, e `next/dynamic` apaga essa
 * generalidade — sem a anotação, todo acessor receberia o nó anônimo da biblioteca e o TypeScript
 * recusaria ler `role` ou `weight`. A asserção fixa os tipos deste desenho.
 */
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <p className="p-6 text-sm text-zinc-500">carregando o desenho…</p>,
}) as ComponentType<ForceGraphProps<ViewNode, ViewLink>>;

/** `source`/`target` viram objetos assim que o layout roda; antes disso ainda são strings. */
const endpoint = (value: string | ViewNode): ViewNode | undefined =>
  typeof value === "string" ? undefined : value;

export function GraphView({ subgraph }: { subgraph: Subgraph }) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [colorByScc, setColorByScc] = useState(false);

  // O force-graph precisa de largura e altura em pixels; sem medir o contêiner ele assume o
  // tamanho da janela e transborda o painel.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * A biblioteca **muta** os objetos recebidos (grava posições nos nós e troca os ids das
   * pontas por referências). Por isso cada resposta vira uma cópia nova: reaproveitar os
   * objetos do JSON faria o desenho anterior vazar para o próximo algoritmo.
   */
  const data = useMemo(
    () => ({
      nodes: subgraph.nodes.map((node): ViewNode => ({ ...node })),
      links: subgraph.links.map((link): ViewLink => ({ ...link })),
    }),
    [subgraph],
  );

  /** Acima de algumas centenas de nós, rotular todos vira uma mancha ilegível. */
  const labelAll = data.nodes.length <= 60;

  /**
   * No modo componente, singletons ficam cinzentos: componente de um vértice é a ausência de
   * ciclo, e colorir todas igualmente esconderia justamente o que a fase quer mostrar.
   */
  const nodeColor = (node: ViewNode): string => {
    if (!colorByScc) return ROLE_COLOR[node.role];
    const size = subgraph.sccSizes[node.scc] ?? 1;
    return size > 1 ? componentColor(node.scc) : "#d4d4d8";
  };

  return (
    <div ref={container} className="relative h-full w-full">
      <button
        type="button"
        onClick={() => setColorByScc((on) => !on)}
        className="absolute right-3 top-3 z-10 rounded-full border border-zinc-300 bg-white/90 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300"
      >
        {colorByScc ? "colorir por papel" : "colorir por componente"}
      </button>
      {subgraph.scc.cyclic > 0 && colorByScc && (
        <p className="absolute left-3 top-3 z-10 text-xs text-zinc-500">
          {subgraph.scc.cyclic} componente(s) com mais de um vértice — cada uma é prova de ciclo
        </p>
      )}
      {size.width > 0 && (
        <ForceGraph2D
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor="transparent"
          cooldownTicks={100}
          d3VelocityDecay={0.3}
          linkDirectionalArrowLength={(link: ViewLink) => (link.inPath ? 5 : link.tree ? 2.5 : 0)}
          linkDirectionalArrowRelPos={1}
          linkColor={(link: ViewLink) =>
            link.inPath ? "#f59e0b" : link.tree ? "#d4d4d8" : "#ececee"
          }
          linkWidth={(link: ViewLink) => (link.inPath ? 2.5 : link.tree ? 0.5 : 0.3)}
          nodeLabel={(node: ViewNode) => node.id}
          nodeCanvasObject={(node: ViewNode, ctx, globalScale) => {
            const radius = ROLE_RADIUS[node.role];
            ctx.beginPath();
            ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI);
            ctx.fillStyle = nodeColor(node);
            ctx.fill();

            if (node.role === "visited" && !labelAll) return;
            // O rótulo é desenhado em tamanho constante na tela, dividindo pela escala do
            // zoom — sem isso ele encolhe junto com o grafo e some ao afastar.
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = node.role === "visited" ? "#71717a" : "#27272a";
            ctx.fillText(node.id, node.x ?? 0, (node.y ?? 0) + radius + 1);
          }}
          nodeCanvasObjectMode={() => "replace"}
          linkCanvasObjectMode={() => "after"}
          linkCanvasObject={(link: ViewLink, ctx, globalScale) => {
            // Só as arestas do caminho ganham o peso em rótulo: é o número que sustenta a
            // afirmação de que aquele caminho é o mais barato.
            if (!link.inPath) return;
            const from = endpoint(link.source);
            const to = endpoint(link.target);
            if (!from || !to) return;

            const fontSize = 10 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#b45309";
            ctx.fillText(
              link.weight.toFixed(3),
              ((from.x ?? 0) + (to.x ?? 0)) / 2,
              ((from.y ?? 0) + (to.y ?? 0)) / 2,
            );
          }}
        />
      )}
    </div>
  );
}
