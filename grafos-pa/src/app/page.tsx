"use client";

/**
 * Página única do buscador de caminhos.
 *
 * É um Client Component porque o estado é todo de interação — par atual, algoritmos já rodados,
 * qual deles está desenhado. A busca em si continua no servidor, em `/api/path`: é lá que
 * ficam o cliente HTTP e o cache em disco, e é o que impede que cada aba aberta multiplique as
 * requisições à Wikipédia.
 *
 * Os resultados são guardados **por algoritmo** para o mesmo par. Rodar um segundo algoritmo
 * não descarta o primeiro: é o que permite alternar entre os dois desenhos e ver a área
 * explorada mudar sem refazer a busca.
 */

import { useCallback, useState } from "react";
import { GraphView } from "@/components/GraphView";
import { MetricsPanel } from "@/components/MetricsPanel";
import { SearchForm } from "@/components/SearchForm";
import { ALGORITHM_MODES, type AlgorithmMode, pathQuery } from "@/lib/api/algorithms";
import type { ErrorResponse, PathResponse } from "@/lib/api/types";

const LEGEND = [
  { color: "#059669", label: "origem" },
  { color: "#e11d48", label: "destino" },
  { color: "#f59e0b", label: "caminho" },
  { color: "#a1a1aa", label: "explorado" },
];

export default function Home() {
  const [pair, setPair] = useState({ from: "Brasil", to: "Ludwig van Beethoven" });
  const [mode, setMode] = useState<AlgorithmMode>(ALGORITHM_MODES[1]);
  const [results, setResults] = useState<Record<string, PathResponse>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (target: AlgorithmMode) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(pathQuery(target, pair.from, pair.to));
        const body = (await response.json()) as PathResponse | ErrorResponse;
        if (!response.ok) throw new Error((body as ErrorResponse).error);

        setResults((previous) => ({ ...previous, [target.key]: body as PathResponse }));
        setSelected(target.key);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [pair],
  );

  // Trocar o par invalida tudo que estava na tela: as métricas só são comparáveis entre
  // algoritmos que rodaram sobre a mesma origem e o mesmo destino.
  const changePair = (next: { from: string; to: string }) => {
    setPair(next);
    setResults({});
    setSelected(null);
    setError(null);
  };

  const changeMode = (next: AlgorithmMode) => {
    setMode(next);
    if (results[next.key]) setSelected(next.key);
  };

  // Escolher uma coluna da tabela também move a seleção do formulário: os dois controles falam
  // do mesmo algoritmo, e vê-los discordando faria o próximo "Buscar" parecer arbitrário.
  const select = (key: string) => {
    setSelected(key);
    const mode = ALGORITHM_MODES.find((option) => option.key === key);
    if (mode) setMode(mode);
  };

  const current = selected ? results[selected] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Wikipedia Path Finder</h1>
        <p className="text-sm text-zinc-500">
          Caminho entre dois artigos por hiperlinks, sobre um grafo direcionado e ponderado
          construído sob demanda.
        </p>
      </header>

      <SearchForm
        from={pair.from}
        to={pair.to}
        mode={mode}
        loading={loading}
        onChange={changePair}
        onModeChange={changeMode}
        onSubmit={() => run(mode)}
      />

      {error && (
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950">
          {error}
        </p>
      )}

      {current && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            {current.found ? (
              current.path.map((node, index) => (
                <span key={`${node}-${index}`} className="flex items-baseline gap-2">
                  {index > 0 && <span className="text-zinc-400">→</span>}
                  <span className="font-medium">{node}</span>
                </span>
              ))
            ) : (
              <span className="text-zinc-500">
                nenhum caminho encontrado ({current.stopReason})
              </span>
            )}
            {current.found && (
              <span className="ml-2 text-zinc-500">
                custo {current.cost.toFixed(4)} em {current.metrics.pathLength} saltos
                {current.heuristic && ` · heurística ${current.heuristic}`}
              </span>
            )}
          </div>

          <div className="h-[520px] overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <GraphView subgraph={current.subgraph} />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            {LEGEND.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
            <span className="ml-auto">
              a figura é a árvore de busca — a aresta por onde cada vértice foi alcançado mais
              barato
            </span>
          </div>
        </section>
      )}

      <MetricsPanel
        modes={ALGORITHM_MODES}
        results={results}
        selected={selected ?? ""}
        onSelect={select}
      />

      {current && (
        <p className="text-xs text-zinc-500">
          Rode outro algoritmo no mesmo par para comparar: as colunas ficam lado a lado e clicar
          no cabeçalho troca o subgrafo desenhado.
        </p>
      )}
    </main>
  );
}
