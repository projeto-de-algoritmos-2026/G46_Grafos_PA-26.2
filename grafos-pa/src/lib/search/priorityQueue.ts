/**
 * Heap binário de mínimo com `decreaseKey`, escrito à mão — o projeto não usa biblioteca de
 * estrutura de dados nem de caminho mínimo.
 *
 * O `decreaseKey` é o que separa este heap de uma fila de prioridade comum e o que dá a
 * Dijkstra a cota `O((V + E) log V)`: quando um vértice já na fronteira é alcançado por um
 * caminho mais barato, sua prioridade é corrigida **no lugar**, em `O(log V)`. A alternativa
 * preguiçosa — inserir uma segunda cópia e ignorar a obsoleta ao desempilhar — faria o heap
 * crescer até `O(E)` e distorceria a contagem de enfileirados que a Fase 7 compara.
 *
 * Para isso o heap mantém `positions`, um mapa de chave → índice no arranjo, atualizado a cada
 * troca. É a peça que um heap de livro-texto costuma omitir.
 *
 * **Desempate determinístico:** entre duas chaves de mesma prioridade vence a inserida
 * primeiro. Sem isso, a ordem de expansão dependeria de detalhes do arranjo e duas execuções
 * do benchmark poderiam reportar caminhos diferentes de mesmo custo.
 */

export interface HeapEntry {
  key: string;
  priority: number;
}

export class MinHeap {
  private readonly keys: string[] = [];
  private readonly priorities: number[] = [];
  /** Ordem de inserção de cada posição, usada só para desempatar. */
  private readonly sequences: number[] = [];
  private readonly positions = new Map<string, number>();
  private nextSequence = 0;

  get size(): number {
    return this.keys.length;
  }

  has(key: string): boolean {
    return this.positions.has(key);
  }

  /** Prioridade atual de uma chave na fronteira, ou `undefined` se ela não está lá. */
  priorityOf(key: string): number | undefined {
    const index = this.positions.get(key);
    return index === undefined ? undefined : this.priorities[index];
  }

  push(key: string, priority: number): void {
    if (this.positions.has(key)) {
      this.decreaseKey(key, priority);
      return;
    }

    this.keys.push(key);
    this.priorities.push(priority);
    this.sequences.push(this.nextSequence++);
    this.positions.set(key, this.keys.length - 1);
    this.siftUp(this.keys.length - 1);
  }

  /**
   * Reduz a prioridade de uma chave já presente. Chamadas que não reduzem são ignoradas: um
   * caminho pior não pode desfazer um melhor já registrado.
   */
  decreaseKey(key: string, priority: number): void {
    const index = this.positions.get(key);
    if (index === undefined || priority >= this.priorities[index]) return;

    this.priorities[index] = priority;
    this.siftUp(index);
  }

  pop(): HeapEntry | undefined {
    if (this.keys.length === 0) return undefined;

    const entry: HeapEntry = { key: this.keys[0], priority: this.priorities[0] };
    const last = this.keys.length - 1;

    this.swap(0, last);
    this.keys.pop();
    this.priorities.pop();
    this.sequences.pop();
    this.positions.delete(entry.key);

    if (last > 0) this.siftDown(0);
    return entry;
  }

  /** `a` precede `b`? Prioridade primeiro; empate resolvido pela ordem de inserção. */
  private precedes(a: number, b: number): boolean {
    if (this.priorities[a] !== this.priorities[b]) {
      return this.priorities[a] < this.priorities[b];
    }
    return this.sequences[a] < this.sequences[b];
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
    [this.sequences[a], this.sequences[b]] = [this.sequences[b], this.sequences[a]];
    this.positions.set(this.keys[a], a);
    this.positions.set(this.keys[b], b);
  }

  private siftUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.precedes(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(start: number): void {
    let index = start;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.keys.length && this.precedes(left, smallest)) smallest = left;
      if (right < this.keys.length && this.precedes(right, smallest)) smallest = right;
      if (smallest === index) return;

      this.swap(index, smallest);
      index = smallest;
    }
  }
}
