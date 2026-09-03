/**
 * Opções e limites comuns às buscas. Ficam num módulo próprio para que o motor de
 * `search.ts` e o baseline de `bfs.ts` compartilhem os mesmos tetos sem um depender do outro —
 * e para que o benchmark da Fase 7 rode os quatro algoritmos sob condições idênticas, que é
 * pré-requisito para os números serem comparáveis.
 */

export interface SearchOptions {
  /** Teto de vértices expandidos. */
  maxExpansions?: number;
  /** Tempo limite, em milissegundos. */
  timeoutMs?: number;
  /**
   * Devolver o subgrafo explorado, amostrado como árvore de busca — ver `explored.ts` para o
   * porquê da amostragem. Desligado por padrão: só a visualização precisa dele, e o benchmark
   * não pode pagar a montagem.
   */
  collectExplored?: boolean;
  /** Teto de vértices no subgrafo devolvido. Ver `DEFAULT_EXPLORED_LIMIT`. */
  exploredLimit?: number;
}

/**
 * Teto de expansões. Medido sobre os 10 pares: o mais caro (`Universidade de Brasília →
 * Álgebra linear`) precisa de 142 153 expansões para o BFS alcançar o destino. A maioria delas
 * é barata — são vértices da borda do dump, que respondem com lista vazia sem custo de rede —
 * mas todas contam como expansão, e um teto menor faz a busca "não achar" caminhos que existem.
 */
export const DEFAULT_MAX_EXPANSIONS = 200_000;

export const DEFAULT_TIMEOUT_MS = 60_000;
