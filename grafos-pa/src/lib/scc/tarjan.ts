/**
 * Componentes fortemente conexas pelo algoritmo de Tarjan, em `O(V + E)` — uma única busca em
 * profundidade, sem grafo transposto (que é o que Kosaraju exigiria, e o grafo aqui é lazy).
 *
 * **Por que iterativo.** A formulação clássica é recursiva, e a profundidade da recursão é a
 * profundidade da DFS: sobre um subgrafo de centenas de vértices da Wikipédia isso estoura a
 * pilha do V8 em um caso perfeitamente normal. A pilha de quadros aqui é explícita, e cada
 * quadro guarda onde parou a iteração sobre os vizinhos — é a mesma recursão, materializada.
 *
 * **O que o resultado significa neste projeto.** Toda componente com mais de um vértice é uma
 * prova de ciclo: dois vértices distintos alcançáveis um pelo outro fecham um circuito. É a
 * evidência empírica de que o grafo é cíclico, e portanto de que ordenação topológica está
 * fora de escopo — a justificativa deixa de ser argumentativa e passa a ser medida.
 */

import type { NodeId } from "@/lib/graph/types";

export interface SccResult {
  /** Vértices de cada componente, em ordem topológica inversa (a saída natural de Tarjan). */
  components: NodeId[][];
  /** Índice da componente de cada vértice, para colorir o desenho. */
  componentOf: Map<NodeId, number>;
}

/**
 * @param nodes vértices a considerar; vértices repetidos são ignorados.
 * @param neighbors sucessores **já em memória** de um vértice. Não expande nada: a fase roda
 *   sobre o subgrafo que a busca deixou para trás, sem gastar uma requisição sequer.
 */
export function tarjanScc(
  nodes: Iterable<NodeId>,
  neighbors: (node: NodeId) => readonly NodeId[],
): SccResult {
  /** Ordem de descoberta na DFS. Ter índice atribuído é o mesmo que "já visitado". */
  const index = new Map<NodeId, number>();
  /**
   * Menor índice alcançável a partir da subárvore do vértice usando no máximo uma aresta de
   * retorno. `low === index` marca a raiz de uma componente: dali não se escapa para nada mais
   * antigo, então tudo que está acima dele na pilha forma uma componente.
   */
  const low = new Map<NodeId, number>();

  /** Vértices já visitados e ainda não atribuídos a uma componente. */
  const stack: NodeId[] = [];
  const onStack = new Set<NodeId>();

  const components: NodeId[][] = [];
  const componentOf = new Map<NodeId, number>();
  let counter = 0;

  /** Quadro de recursão: o vértice, seus sucessores e por qual deles a iteração vai. */
  interface Frame {
    node: NodeId;
    successors: readonly NodeId[];
    next: number;
  }

  for (const start of nodes) {
    if (index.has(start)) continue;

    const frames: Frame[] = [];

    const enter = (node: NodeId): void => {
      index.set(node, counter);
      low.set(node, counter);
      counter++;
      stack.push(node);
      onStack.add(node);
      frames.push({ node, successors: neighbors(node), next: 0 });
    };

    enter(start);

    while (frames.length > 0) {
      const frame = frames[frames.length - 1];

      if (frame.next < frame.successors.length) {
        const to = frame.successors[frame.next++];

        if (!index.has(to)) {
          enter(to);
        } else if (onStack.has(to)) {
          // Aresta de retorno: alcança um vértice ainda aberto, então os dois estão no mesmo
          // circuito. Vértices fora da pilha já pertencem a uma componente fechada e são
          // ignorados — é essa distinção que impede componentes de se fundirem indevidamente.
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(to)!));
        }
        continue;
      }

      // Sucessores esgotados: o equivalente ao retorno da chamada recursiva.
      frames.pop();
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!));

      if (low.get(frame.node) === index.get(frame.node)) {
        const component: NodeId[] = [];
        for (;;) {
          const member = stack.pop()!;
          onStack.delete(member);
          componentOf.set(member, components.length);
          component.push(member);
          if (member === frame.node) break;
        }
        components.push(component);
      }
    }
  }

  return { components, componentOf };
}

/** Resumo de um resultado de SCC, na forma que o painel de métricas exibe. */
export interface SccStats {
  /** Total de componentes, singletons incluídos. */
  components: number;
  /** Componentes com mais de um vértice: cada uma é uma prova de ciclo. */
  cyclic: number;
  /** Cardinalidade da maior componente. */
  largest: number;
}

export function sccStats(result: SccResult): SccStats {
  let cyclic = 0;
  let largest = 0;
  for (const component of result.components) {
    if (component.length > 1) cyclic++;
    if (component.length > largest) largest = component.length;
  }
  return { components: result.components.length, cyclic, largest };
}
