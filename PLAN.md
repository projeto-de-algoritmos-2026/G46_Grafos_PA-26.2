# PLAN.md — Wikipedia Path Finder

Projeto individual de **Projeto de Algoritmos** (UnB/FCTE). Entrega: **07/09/2026**.

Encontrar o melhor caminho entre dois artigos da Wikipédia navegando por hiperlinks,
sobre um grafo **direcionado e ponderado** construído sob demanda, e visualizar o
subgrafo explorado com o caminho destacado.

---

## 1. Decisões de modelagem (fixadas antes de codificar)

### 1.1 O grafo

| Propriedade | Decisão |
|---|---|
| Vértices | Artigos do namespace 0 (`ns=0`), identificados pelo título canônico pós-redirect |
| Arestas | Hiperlink `u → v` presente no corpo de `u` |
| Direção | Direcionado (o link não é simétrico) |
| Peso | Real positivo, ver §1.2 |
| Densidade | Esparso (grau de saída médio na casa das dezenas), fator de ramificação alto |
| Topologia | Mundo pequeno, cíclico, fortemente conexo em boa parte do núcleo |
| Materialização | **Lazy**: nenhum grafo global em memória; vizinhança de `v` só existe após expandir `v` |

Consequências diretas que o README precisa registrar:

- **Ordenação topológica está fora de escopo** porque o grafo é cíclico (a existência de
  ciclos é verificável empiricamente pela fase de SCC: qualquer componente com mais de um
  vértice é prova de ciclo).
- **Árvore geradora mínima (Prim/Kruskal) está fora de escopo** porque o problema é de
  *caminho entre dois vértices*, não de *conexão de custo mínimo de todos os vértices*;
  além disso MST é definida sobre grafos não-direcionados.
- **Detecção de comunidades e métricas de centralidade** ficam em trabalhos futuros.
- **BFS/DFS não são a solução**: BFS entra apenas como baseline de comparação, e DFS aparece
  somente como sub-rotina da fase de SCC.

### 1.2 Função de custo (proposta a implementar e justificar)

O custo de uma aresta deve refletir **quão relevante é aquele link**, não um salto uniforme.
É exatamente isso que torna Dijkstra necessário: com peso constante, Dijkstra degenera em BFS.

```
w(u → v) = ε + α · pos(u, v) + β · gen(v)
```

com `α = β = 0.5` e `ε = 0.1` (constantes configuráveis em `cost.config.ts`):

- **`pos(u, v) ∈ (0, 1]` — posição do link em `u`.**
  `pos = rank(v em u) / L(u)`, onde `rank` é o índice ordinal do link no corpo do artigo e
  `L(u)` o total de links de `u`. Justificativa: em artigos da Wikipédia a seção introdutória
  concentra os links definidores do tópico; links do fim do artigo, de listas e de navboxes
  são progressivamente mais periféricos. Link citado cedo → custo menor.

- **`gen(v) ∈ [0, 1]` — generalidade do destino.**
  `gen(v) = min(1, ln(1 + len(v)) / ln(1 + L_ref))`, com `len(v)` = tamanho do artigo em bytes
  e `L_ref = 200_000`. Proxy de "quão genérico/hub" é o destino: artigos enormes
  (*Estados Unidos*, *Ciência*) são pontos de passagem semanticamente vagos. Passar por eles
  custa mais caro.
  **Motivo de engenharia para usar `len` e não o grau de entrada:** o grau de entrada exigiria
  uma chamada `list=backlinks` por vértice, enquanto `len` vem de graça na mesma requisição
  que lista os links (`generator=links&prop=info`). Isso deve estar explícito no README.

- **`ε > 0`** garante `w > 0` (pré-requisito de Dijkstra), impede caminhos de custo zero e
  mantém um viés residual por caminhos curtos em número de saltos.

Faixa resultante: `w ∈ (0.1, 1.1]`. Todos os pesos são **não-negativos e limitados
inferiormente por ε** — os dois fatos usados nas provas da §1.3.

> **Restrição de projeto:** o peso de `u → v` só pode depender de informação obtida ao
> expandir `u`. Ambos os termos respeitam isso.

**Alternativas consideradas, a registrar no README:** custo uniforme (degenera em BFS);
`1/log(grau(v))` puro (favorece hubs, produzindo caminhos corretos mas semanticamente vazios);
peso por similaridade semântica (exigiria embeddings, fora do escopo de uma disciplina de
algoritmos).

### 1.3 Heurística para A*

Duas heurísticas, ambas sobre o mesmo motor de busca:

**`h_admissivel(v) = ε · (1 − sim(v, t))`**, com `h(t) = 0`.

- *Admissibilidade:* para `v ≠ t`, qualquer caminho de `v` a `t` tem ao menos uma aresta, logo
  `d*(v, t) ≥ ε`. Como `sim ∈ [0,1]`, tem-se `h(v) ≤ ε ≤ d*(v, t)`. ∎
- *Consistência:* para toda aresta `u → v`, `h(u) − h(v) ≤ ε − 0 = ε ≤ w(u,v)`. ∎
  Consistência implica que A* não reexpande nós, o que será verificado empiricamente.
- *Custo:* o ganho é modesto por construção (o limite superior é `ε`), atuando sobretudo como
  desempate informado entre nós de mesmo `g`. **Essa limitação é honesta e deve ser discutida
  no README**: em grafos sem métrica geométrica, heurísticas admissíveis fortes são raras.

**`h_ponderada(v) = λ · (1 − sim(v, t))`** com `λ ≫ ε` (padrão `λ = 0.5`).

- Não admissível. É A* ponderado: sacrifica otimalidade por número de expansões.
- A análise empírica mede o **fator de subotimalidade real** (`custo_encontrado / custo_ótimo`,
  com o ótimo vindo de Dijkstra) contra a **redução de nós expandidos e de requisições**.

**`sim(v, t) ∈ [0,1]`** é calculada sem requisição adicional, combinando:
sobreposição de tokens normalizados dos títulos (Jaccard sobre palavras + trigramas) e, quando
as categorias de `v` já estiverem em cache, Jaccard sobre categorias. Sinal fraco e assumido
como tal.

**`h ≡ 0` reduz o motor a Dijkstra** — é a verificação de equivalência da Fase 6.

---

## 2. Arquitetura alvo

```
src/
  lib/
    wiki/       client.ts  titles.ts  types.ts  ratelimit.ts
    cache/      diskCache.ts  dump.ts
    graph/      types.ts  lazyGraph.ts  cost.ts  cost.config.ts
    search/     priorityQueue.ts  bfs.ts  search.ts  heuristics.ts  metrics.ts  fixtures.ts
    scc/        tarjan.ts
  app/         page.tsx  api/path/route.ts
  components/  SearchForm.tsx  GraphView.tsx  MetricsPanel.tsx
scripts/       probe.ts  verify.ts  build-dump.ts  benchmark.ts
data/          pairs.json  cache/  dump/  results/
```

Buscas rodam **no servidor** (API route), porque cache em disco e cliente HTTP são Node.
O cliente recebe o caminho, o subgrafo explorado e as métricas.

**Sem suíte de testes.** Em vez disso, dois scripts manuais:

- **`scripts/probe.ts`** — inspeção: expande um artigo e imprime vizinhos, pesos e requisições
  gastas. Serve para conferir a olho que a API e a função de custo fazem sentido.
- **`scripts/verify.ts`** — conferência de corretude dos algoritmos sobre um grafo sintético
  fixo (`src/lib/search/fixtures.ts`), imprimindo um relatório. **A saída dele vai para o
  README e para o vídeo** — é o que dá lastro à afirmação de que A* é ótimo e de que o motor
  é compartilhado. Cresce ao longo das fases 4, 5, 6 e 9.

---

## 3. Fases

Cada fase é um commit isolado que deixa o projeto em estado funcional.

---

### Fase 0 — Bootstrap do projeto

**Objetivo:** ter um app Next.js + TypeScript rodando, com os tipos base do grafo.

**Scaffold** (na raiz do repo, que já contém `.git`, `README.md` e `PLAN.md`):

```bash
mv PLAN.md README.md ..
npx create-next-app@latest . --yes
mv ../PLAN.md ../README.md .
```

Os dois `mv` existem porque o `create-next-app` aborta se encontrar arquivos que considera
conflitantes, e porque ele sobrescreveria o `README.md`. Não usar um nome de pasta com
maiúsculas (`grafos-PA`): nome de pacote npm não aceita maiúscula e o comando falha.

**Arquivos:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `eslint.config.mjs`
- `src/app/layout.tsx`, `src/app/page.tsx` (placeholder)
- `src/lib/graph/types.ts` (`NodeId`, `Edge`, `Neighbor`, `PathResult`, `SearchMetrics`)

**Critério de pronto:**
- `npm run dev` sobe e a home renderiza sem erro de console.
- `npm run build` passa.
- `npx tsc --noEmit` sem erros.
- O diretório `src/` existe (o resto do plano assume `src/lib/...`); se o scaffold não o criar,
  mover `app/` para dentro de `src/` agora, antes de qualquer outra fase.
- `data/cache/` e `.next/` ignorados no git (`data/pairs.json` e `data/dump/` versionados).

**Commit:** `chore: scaffold next.js + typescript project`

**Esforço:** 1,5h

---

### Fase 1 — Cliente da MediaWiki Action API

**Objetivo:** obter, para um artigo, seus links de saída do namespace 0 já com os metadados
que a função de custo vai consumir.

**Arquivos:**
- `src/lib/wiki/client.ts` — `fetchOutlinks(title): Promise<Neighbor[]>`
- `src/lib/wiki/titles.ts` — normalização de títulos, resolução de redirects
- `src/lib/wiki/ratelimit.ts` — fila serial com atraso mínimo e retry com backoff
- `src/lib/wiki/types.ts`
- `scripts/probe.ts`

**Detalhes:**
- Endpoint: `action=query&generator=links&gplnamespace=0&gpllimit=max&prop=info&redirects=1`,
  que em **uma** requisição devolve os vizinhos **e** o `length` de cada um.
- Continuação (`continue`/`gplcontinue`) tratada até esgotar, preservando a ordem dos links
  (a ordem é o insumo de `pos`).
- `User-Agent` identificando o projeto e contato, conforme a política de etiqueta da API.
- Filtrar páginas faltantes (`missing`) e desambiguações óbvias.
- Contador de requisições exposto para instrumentação.

**Critério de pronto:**
- `npx tsx scripts/probe.ts "Brasil"` imprime ≥ 100 vizinhos, cada um com `title`, `rank`,
  `total` e `length`, e o número de requisições HTTP gastas.
- `npx tsx scripts/probe.ts "EUA"` resolve o redirect e reporta o título canônico.

**Commit:** `feat(wiki): add mediawiki action api client with redirect and pagination handling`

**Esforço:** 3,5h

---

### Fase 2 — Cache em disco e dump offline

**Objetivo:** tornar toda expansão de vértice repetível e permitir rodar a demonstração
inteira sem rede.

**Arquivos:**
- `src/lib/cache/diskCache.ts` — cache chave→JSON em `data/cache/`, sharding por hash do
  título, escrita atômica, métrica de hit/miss
- `src/lib/cache/dump.ts` — leitura do dump consolidado `data/dump/graph.json(.gz)`
- `src/lib/wiki/client.ts` — passa a consultar dump → cache → rede, nessa ordem
- `scripts/build-dump.ts` — aquece o cache a partir dos pares de teste e consolida o dump
- `data/pairs.json` — **conjunto fixo de 10 pares origem/destino** usado por todas as
  medições e pela demo

**Detalhes:**
- Modo `WIKI_OFFLINE=1`: qualquer miss lança erro em vez de ir à rede — garante que a
  apresentação não depende de conectividade.
- `build-dump.ts` faz expansão limitada (BFS por saltos, com teto de vértices) a partir das
  origens e destinos de `pairs.json`.
- Dump versionado no git se ficar abaixo de ~50 MB; caso contrário, comprimido e documentado.

**Critério de pronto:**
- `npx tsx scripts/build-dump.ts` gera `data/dump/graph.json.gz` cobrindo os 10 pares.
- Segunda execução de `scripts/probe.ts` para o mesmo artigo faz **0 requisições HTTP**.
- `WIKI_OFFLINE=1 npx tsx scripts/probe.ts "Brasil"` funciona com a interface de rede fora.

**Commit:** `feat(cache): add disk cache and offline graph dump`

**Esforço:** 3,5h

---

### Fase 3 — Função de custo

**Objetivo:** transformar cada vizinho em uma aresta ponderada, com a fórmula da §1.2.

**Arquivos:**
- `src/lib/graph/cost.ts` — `edgeCost(u, neighbor): number`
- `src/lib/graph/cost.config.ts` — `ε`, `α`, `β`, `L_ref`
- `src/lib/graph/lazyGraph.ts` — `expand(nodeId): Promise<WeightedEdge[]>`, memoização em
  memória por sessão de busca, contadores de expansões e requisições
- `scripts/probe.ts` — passa a imprimir os pesos

**Critério de pronto:**
- `npx tsx scripts/probe.ts "Brasil" --top 10` mostra os 10 links mais baratos e os 10 mais
  caros. Os mais baratos são links da introdução para artigos específicos; os mais caros são
  links do fim do artigo para páginas gigantes. Se não for esse o padrão, a fórmula ou as
  constantes estão erradas — **este é o critério real da fase**.
- A mesma saída confirma `w ∈ (0.1, 1.1]` em todas as arestas impressas.
- `probe.ts` chamado duas vezes para o mesmo nó não incrementa o contador de requisições.

**Commit:** `feat(graph): add weighted edge cost function and lazy graph expansion`

**Esforço:** 2,5h

---

### Fase 4 — BFS baseline

**Objetivo:** ter um baseline funcional que ignora pesos, com instrumentação já no formato
final.

**Arquivos:**
- `src/lib/search/bfs.ts`
- `src/lib/search/metrics.ts` — `SearchMetrics { expanded, enqueued, requests, cacheHits, pathCost, pathLength, elapsedMs }`
- `src/lib/search/fixtures.ts` — grafo sintético fixo (~15 vértices), construído de propósito
  para que o caminho mais curto em saltos **não** seja o mais barato
- `scripts/verify.ts` — primeira versão: roda BFS no grafo sintético e imprime caminho, saltos
  e custo
- `src/app/api/path/route.ts` — endpoint com `?algo=bfs`

**Detalhes:**
- BFS minimiza saltos, não custo. Ele **reporta** o custo do caminho encontrado (somando os
  pesos), o que evidencia empiricamente que caminho mais curto ≠ caminho mais barato.
- Limites de segurança: teto de nós expandidos e timeout, retornados no resultado.

**Critério de pronto:**
- `npx tsx scripts/verify.ts` mostra, no grafo sintético, que BFS acha o caminho de menor
  número de saltos e que esse caminho é mais caro que o ótimo conhecido do fixture.
- `curl 'localhost:3000/api/path?from=Brasil&to=Ludwig%20van%20Beethoven&algo=bfs'` devolve
  caminho válido e métricas preenchidas.

**Commit:** `feat(search): add bfs baseline with search instrumentation`

**Esforço:** 3h

---

### Fase 5 — Motor de busca informada + Dijkstra

**Objetivo:** implementar o motor único de busca com fila de prioridade própria e usá-lo como
Dijkstra (`h ≡ 0`).

**Arquivos:**
- `src/lib/search/priorityQueue.ts` — heap binário de mínimo, escrito à mão, com
  `decreaseKey` via mapa de posições
- `src/lib/search/search.ts` — `bestFirstSearch(graph, source, target, h, options)`
- `src/lib/search/heuristics.ts` — `zeroHeuristic`
- `scripts/verify.ts` — ganha o **check de otimalidade**: uma Floyd–Warshall de referência
  (~15 linhas, escrita no próprio script) sobre o grafo sintético, comparando custo a custo
  com o Dijkstra
- `src/app/api/path/route.ts` — `?algo=dijkstra`

**Detalhes:**
- Nenhuma biblioteca de caminho mínimo ou de heap. Tudo à mão.
- Desempate determinístico (ordem de inserção) para tornar as comparações reprodutíveis.
- Reconstrução de caminho por vetor de predecessores.

**Critério de pronto:**
- `npx tsx scripts/verify.ts` imprime `dijkstra == floyd-warshall: OK` para todos os pares do
  grafo sintético.
- O mesmo relatório mostra Dijkstra achando caminho **mais barato** e **mais longo em saltos**
  que BFS.
- Endpoint `?algo=dijkstra` responde com caminho e métricas.

**Commit:** `feat(search): add binary heap and dijkstra over the weighted graph`

**Esforço:** 3,5h

---

### Fase 6 — A*

**Objetivo:** parametrizar o mesmo motor com heurística e adicionar as duas heurísticas da §1.3.

**Arquivos:**
- `src/lib/search/heuristics.ts` — `admissibleHeuristic`, `weightedHeuristic`, `titleSimilarity`
- `src/lib/search/search.ts` — ajustes de ordenação por `f = g + h` (sem duplicar código)
- `scripts/verify.ts` — ganha os checks de **equivalência**, **otimalidade do A\*** e
  **consistência**
- `src/app/api/path/route.ts` — `?algo=astar&lambda=`

**Critério de pronto:** `npx tsx scripts/verify.ts` imprime as quatro linhas abaixo, e as três
primeiras precisam dar OK:

- `astar(h=0) == dijkstra: OK` — mesmo custo **e** mesma contagem de nós expandidos.
  Esta é a prova de que o motor é de fato compartilhado.
- `astar(h admissível) == dijkstra (custo): OK` em todos os pares.
- `consistência h(u) − h(v) ≤ w(u,v): OK` em todas as arestas do fixture, e nenhum nó fechado
  reaberto durante a busca.
- `astar(h ponderada): custo X vs ótimo Y, razão Z` — informativo, pode ser subótimo.

**Commit:** `feat(search): add a* with admissible and weighted heuristics sharing the dijkstra engine`

**Esforço:** 3,5h

---

### Fase 7 — Medição empírica e exportação CSV

**Objetivo:** produzir os números da análise sobre os 10 pares fixos.

**Arquivos:**
- `scripts/benchmark.ts`
- `data/results/benchmark.csv`
- `data/results/summary.csv`
- `data/results/README.md` descrevendo as colunas

**Detalhes:**
- Colunas: `pair_id, source, target, algo, lambda, path_length, path_cost, expanded, enqueued,
  requests, cache_hits, elapsed_ms, optimal_cost, suboptimality_ratio, found`.
- Roda em modo offline sobre o dump → resultados **reprodutíveis**, sem variação de rede.
- Cache em memória zerado entre execuções; tempo medido com `performance.now()`, 3 repetições,
  mediana.
- Configurações: `bfs`, `dijkstra`, `astar-admissible`, `astar-weighted(λ=0.5)`.

**Critério de pronto:**
- `WIKI_OFFLINE=1 npx tsx scripts/benchmark.ts` gera os dois CSVs para 10 pares × 4
  configurações sem erro.
- Duas execuções consecutivas produzem `path_cost` e `expanded` idênticos.
- `suboptimality_ratio = 1.0` para `dijkstra` e `astar-admissible` em todos os pares.

**Commit:** `feat(bench): add empirical comparison harness with csv export`

**Esforço:** 3h

---

### Fase 8 — Visualização do subgrafo

**Objetivo:** interface onde o usuário informa origem e destino, vê o caminho e o subgrafo
explorado.

**Arquivos:**
- `src/components/SearchForm.tsx` — origem, destino, seleção de algoritmo
- `src/components/GraphView.tsx` — `react-force-graph` com carregamento dinâmico (`ssr: false`)
- `src/components/MetricsPanel.tsx` — métricas da Fase 4 lado a lado
- `src/app/page.tsx`
- `src/app/api/path/route.ts` — passa a devolver também o subgrafo explorado

**Detalhes:**
- Nós do caminho destacados (cor e tamanho); arestas do caminho em destaque com o peso no
  rótulo; nós apenas visitados em tom neutro.
- Amostragem/limite de nós renderizados para não travar o navegador quando a exploração for
  grande.
- Botão para rodar o mesmo par com outro algoritmo e comparar visualmente a área explorada —
  este é o momento visual mais forte do vídeo.

**Critério de pronto:**
- Buscar `Brasil → Ludwig van Beethoven` na UI renderiza o grafo com o caminho destacado em
  menos de 5 s no modo offline.
- Trocar de algoritmo na mesma origem/destino muda visivelmente a área explorada.
- Painel de métricas bate com o retorno do endpoint.
- Sem erros no console; `npm run build` passa.

**Commit:** `feat(ui): add interactive subgraph visualization with highlighted path`

**Esforço:** 5h

---

### Fase 9 — Componentes fortemente conectados *(cortável)*

**Objetivo:** identificar SCCs no subgrafo explorado e destacá-los na visualização.

**Arquivos:**
- `src/lib/scc/tarjan.ts` — Tarjan iterativo (evita estouro de pilha), escrito à mão
- `scripts/verify.ts` — ganha o check de SCC sobre dois grafos de resposta conhecida
- `src/app/api/path/route.ts` — anexa `sccId` a cada nó
- `src/components/GraphView.tsx` — colorir por componente, alternável

**Detalhes:**
- Roda sobre o subgrafo **já explorado**, em memória — não gera requisições novas.
- O resultado dá evidência empírica da ciclicidade do grafo (§1.1), reforçando a justificativa
  de ordenação topológica fora de escopo.

**Critério de pronto:**
- `npx tsx scripts/verify.ts` imprime `tarjan: OK` para o exemplo clássico de Tarjan (SCCs
  conhecidas) e, num grafo acíclico, todas as componentes de tamanho 1.
- Na UI, alternar "colorir por SCC" agrupa visivelmente os nós; a maior componente e sua
  cardinalidade aparecem no painel de métricas.

**Commit:** `feat(scc): add tarjan strongly connected components over the explored subgraph`

**Esforço:** 2,5h

---

### Fase 10 — README, análise e material de entrega

**Objetivo:** escrever o documento que carrega a nota conceitual.

**Arquivos:**
- `README.md`
- `docs/comparison.png` (gráfico gerado **fora** da aplicação, a partir de
  `data/results/benchmark.csv`)
- `scripts/plot.py` ou planilha — registrar qual foi usado
- `docs/roteiro.md`

**Seções obrigatórias:**
1. **Modelagem do problema** — grafo direcionado/ponderado/esparso/cíclico, construção lazy,
   e justificativa da função de custo (§1.2) com as alternativas descartadas.
2. **Algoritmos implementados e complexidade teórica** — BFS `O(V+E)`; Dijkstra com heap
   binário `O((V+E) log V)`; A* com a mesma cota no pior caso, discutindo por que o ganho é
   empírico e não assintótico; Tarjan `O(V+E)`. Observar que, no modo lazy, o custo dominante
   é o número de **requisições**, não as operações de heap.
3. **Admissibilidade da heurística** — provas de admissibilidade e consistência da §1.3, e a
   discussão honesta do limite `h ≤ ε`; comparação com a variante ponderada e sua
   subotimalidade medida. **Colar aqui a saída de `scripts/verify.ts`** como evidência de
   corretude.
4. **Análise empírica** — tabela por par e gráfico de nós expandidos / requisições / custo /
   tempo entre os quatro modos; leitura dos resultados, inclusive dos casos em que A* não ganha.
5. **Decisões de engenharia** — Next.js + TS, cache em disco, dump offline, rate limiting e
   etiqueta com a API, `len` como proxy de generalidade, limites de exploração, tudo à mão sem
   biblioteca de caminho mínimo ou de SCC.
6. **Instruções de execução** — instalar, construir o dump, rodar offline, rodar o benchmark,
   rodar a verificação, reproduzir o gráfico.
7. **Trabalhos futuros e escopo excluído** — ordenação topológica (grafo cíclico), MST
   (problema é de caminho, e MST pressupõe grafo não-direcionado), detecção de comunidades,
   centralidade, heurísticas por embeddings, busca bidirecional.

**Critério de pronto:**
- As 7 seções existem e nenhuma está vazia.
- Números do README conferem com `data/results/benchmark.csv`.
- Um terceiro consegue clonar, seguir as instruções e reproduzir a demo offline.
- Roteiro do vídeo escrito em `docs/roteiro.md` (~5 min: problema → modelagem → BFS vs Dijkstra
  vs A* na UI → tabela → SCC → decisões).

**Commit:** `docs: add project readme with modeling rationale and empirical analysis`

**Esforço:** 4h

---

## 4. Cronograma (28/08 → 07/09)

| Data | Fase | h | Escopo |
|---|---|---|---|
| 28/08 sex | F0 Bootstrap | 1,5 | **Mínimo** |
| 29/08 sáb | F1 Cliente API | 3,5 | **Mínimo** |
| 30/08 dom | F2 Cache + dump offline | 3,5 | **Mínimo** |
| 31/08 seg | F3 Função de custo | 2,5 | **Mínimo** |
| 01/09 ter | F4 BFS baseline | 3 | **Mínimo** |
| 02/09 qua | F5 Heap + Dijkstra | 3,5 | **Mínimo** |
| 03/09 qui | F6 A* | 3,5 | **Mínimo** |
| 04/09 sex | F7 Benchmark + CSV | 3 | **Mínimo** |
| 05/09 sáb | F8 Visualização | 5 | **Mínimo** |
| 06/09 dom | F9 SCC (2,5h) + rascunho do README (3h) | 5,5 | F9 **cortável** |
| 07/09 seg | F10 README final, gráfico, gravação do vídeo | 4 | **Mínimo** |

**Total: ~38,5 h** em 11 dias de trabalho parcial.

### Escopo mínimo entregável

F0 → F8 + F10. Entrega um sistema que constrói o grafo sob demanda, acha o caminho por três
algoritmos, compara os três com números exportados, visualiza o resultado e documenta tudo.
Cobre Dijkstra e A*, que são o núcleo da nota.

### Cortáveis, em ordem de corte

1. **F9 (SCC)** — corta primeiro. Custo: perde-se um dos algoritmos da ementa e a evidência
   empírica de ciclicidade; a justificativa da §1.1 passa a ser só argumentativa. Se cortada,
   move-se para trabalhos futuros no README.
2. **`astar-weighted`** — manter só a heurística admissível; a análise de subotimalidade sai da
   seção 4 do README.
3. **Colorização por SCC na UI** — manter o cálculo e reportar só a estatística no painel.
4. **Dump offline ampliado** — reduzir de 10 para 5 pares em `pairs.json`, encolhendo F2 e F7.

**Não cortar `scripts/verify.ts`.** É meia hora de trabalho distribuída entre as fases 4–6 e é
a única evidência de que Dijkstra e A* estão corretos. Sem ela, a seção 3 do README vira
afirmação sem lastro, e é exatamente o ponto sobre o qual se pergunta na apresentação.

### Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Rate limit / bloqueio da API | Fila serial com atraso, `User-Agent` identificado, backoff; F2 antes de qualquer algoritmo faz a rede virar detalhe |
| Explosão de expansões em pares distantes | Teto de nós expandidos e timeout desde a F4; escolher os 10 pares com dificuldade variada mas viável |
| `react-force-graph` com SSR do Next | Import dinâmico com `ssr: false`, decidido já na F8 |
| A* ganhar pouco sobre Dijkstra | É um resultado, não uma falha: o README já prevê discutir por que heurísticas fortes são difíceis aqui, e a variante ponderada existe para mostrar o trade-off |
| Bug silencioso em Dijkstra/A* descoberto tarde | `scripts/verify.ts` roda em segundos e é atualizado nas próprias fases 5 e 6, antes de o algoritmo ser usado no benchmark |
| Atraso acumulado | F9 é cortável e está posicionada depois de tudo que é obrigatório |
