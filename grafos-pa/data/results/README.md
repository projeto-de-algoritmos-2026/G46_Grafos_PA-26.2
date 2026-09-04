# Resultados da medição empírica

Gerados por `npm run benchmark`, que é
`WIKI_OFFLINE=1 WIKI_CACHE_DIR=data/.cache-disabled tsx scripts/benchmark.ts`.

**O cache é neutralizado de propósito.** `WIKI_CACHE_DIR` aponta para um diretório que não
existe, então a única fonte de dados é o dump versionado. Sem isso os números dependeriam do que
o cache local acumulou: quem rodou a interface em modo online algumas vezes mede um grafo maior
do que quem acabou de clonar o repositório. Não é hipótese — aconteceu: `p06` passou a achar um
caminho de 4 saltos e custo 1,2734 que o dump sozinho não contém.

Cada execução roda os **10 pares** de `data/pairs.json` × **4 configurações** × **3 repetições**,
inteiramente sobre `data/dump/graph.json.gz`. Nenhuma requisição de rede é feita: a coluna
`requests` deve ser 0 em todas as linhas, e é a conferência de que foi assim.

## Reprodutibilidade

Caminho, custo e contagens de nós são **determinísticos** — o heap desempata por ordem de
inserção e a memoização do grafo começa zerada a cada repetição. Só `elapsed_ms` varia, e por
isso é a mediana das três repetições. O script aborta com erro se duas repetições divergirem em
`found`, `path_cost` ou `expanded`, o que seria sinal de bug.

Duas execuções consecutivas produzem `benchmark.csv` idêntico exceto pelas colunas de tempo.

### `elapsed_ms` é ruidoso — não use como métrica principal

Medido: duas execuções consecutivas do benchmark completo, cada valor já sendo a mediana de 3
repetições, diferiram **2,3× no tempo total** e até **6,4× numa única linha**
(`p07/astar-admissible`). As contagens de nós foram idênticas nas duas.

A causa provável é o coletor de lixo: uma busca larga aloca mapas com centenas de milhares de
entradas, e o momento em que o GC roda depende do estado do heap, não do algoritmo. Aumentar as
repetições não resolve, porque a variação é entre processos, não dentro deles.

**Conclusão para a análise:** compare os algoritmos por `productive_expansions` e `expanded`,
que são exatos e determinísticos. `elapsed_ms` serve para dar ordem de grandeza — "milissegundos
contra segundos" — e não para afirmar que uma configuração é *x*% mais rápida que outra.

## O que "ótimo" significa aqui

`optimal_cost` é o custo que o Dijkstra encontra **sobre o subgrafo dumpado**, não sobre a
Wikipédia inteira. O dump tem 5000 vértices expandidos; vértices fora dele são tratados como
folhas. A comparação entre algoritmos continua válida — todos veem exatamente o mesmo grafo
finito — mas os caminhos não são necessariamente os melhores caminhos da Wikipédia real.

## Configurações

| `algo` | `lambda` | Heurística |
|---|---|---|
| `bfs` | — | nenhuma; minimiza saltos, ignora pesos |
| `dijkstra` | — | `h ≡ 0` |
| `astar-admissible` | — | `h(v) = ε · (1 − sim(v, t))`, admissível e consistente |
| `astar-weighted` | `0.5` | `h(v) = λ · (1 − sim(v, t))`, não admissível |

## `benchmark.csv` — uma linha por par × configuração

| Coluna | Significado |
|---|---|
| `pair_id` | identificador do par em `data/pairs.json` (`p01`…`p10`) |
| `source`, `target` | títulos canônicos, pós-redirect |
| `algo`, `lambda` | configuração; `lambda` só é preenchido para `astar-weighted` |
| `path_length` | saltos do caminho encontrado (arestas, não vértices) |
| `path_cost` | soma dos pesos do caminho |
| `expanded` | vértices retirados da fronteira e expandidos |
| `productive_expansions` | `expanded − frontier_misses`; ver a ressalva abaixo |
| `frontier_misses` | expansões de vértices ausentes do dump, que respondem vazio |
| `enqueued` | vértices inseridos na fronteira |
| `reopened` | vértices fechados que voltaram à fronteira; 0 com heurística consistente |
| `requests` | requisições HTTP gastas; sempre 0 no modo offline |
| `cache_hits` | expansões servidas pelo dump ou pelo cache em disco |
| `elapsed_ms` | mediana das 3 repetições |
| `optimal_cost` | `path_cost` do `dijkstra` para o mesmo par |
| `suboptimality_ratio` | `path_cost / optimal_cost`; 1.0 significa caminho ótimo |
| `found` | se o destino foi alcançado |
| `stop_reason` | `found`, `exhausted`, `expansions` ou `timeout` |

### Ressalva sobre `expanded`

Entre 80% e 96% das expansões são vértices da **borda do dump**: alcançados pela busca, mas não
expandidos na construção do dump, então respondem com lista vazia. Elas contam como expansão e
custam quase nada.

Isso significa que `expanded` mede em boa parte um artefato da fronteira, não comportamento
algorítmico. **Use `productive_expansions` para comparar os algoritmos entre si**; `expanded`
serve para explicar o tempo de execução, já que mesmo uma expansão vazia paga a consulta ao
dump e a manipulação do heap.

## `summary.csv` — uma linha por configuração

Médias sobre os 10 pares. `mean_path_length` e `mean_path_cost` são calculados apenas sobre os
pares em que a busca encontrou caminho; as demais médias, sobre todos.

`max_suboptimality_ratio` é o pior caso observado — a coluna que importa para julgar se a
heurística ponderada vale a pena.
