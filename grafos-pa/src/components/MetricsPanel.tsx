"use client";

/**
 * Métricas das execuções do par atual, lado a lado.
 *
 * Uma coluna por algoritmo já rodado, e não só do selecionado: a comparação é o produto do
 * trabalho — é aqui que se lê que o BFS acha um caminho mais caro, que o A* admissível bate o
 * custo do Dijkstra expandindo menos, e que o ponderado expande uma fração dos dois. As linhas
 * são as mesmas colunas de `data/results/benchmark.csv`.
 */

import type { AlgorithmMode } from "@/lib/api/algorithms";
import type { PathResponse } from "@/lib/api/types";

export interface MetricsPanelProps {
  modes: AlgorithmMode[];
  results: Record<string, PathResponse>;
  selected: string;
  onSelect: (key: string) => void;
}

const STOP_REASON_LABEL: Record<string, string> = {
  found: "encontrado",
  exhausted: "fronteira esgotada",
  expansions: "teto de expansões",
  timeout: "tempo esgotado",
};

const integer = new Intl.NumberFormat("pt-BR");

/**
 * Cada linha sabe extrair seu valor e dizer se "melhor" é o menor número — o destaque do
 * melhor valor por linha é o que faz a tabela ser lida sem contas.
 */
interface Row {
  label: string;
  value: (result: PathResponse) => number;
  format: (value: number) => string;
  lowerIsBetter: boolean;
}

const ROWS: Row[] = [
  {
    label: "custo do caminho",
    value: (r) => r.metrics.pathCost,
    format: (v) => v.toFixed(4),
    lowerIsBetter: true,
  },
  {
    label: "saltos",
    value: (r) => r.metrics.pathLength,
    format: (v) => integer.format(v),
    lowerIsBetter: false,
  },
  {
    label: "expandidos",
    value: (r) => r.metrics.expanded,
    format: (v) => integer.format(v),
    lowerIsBetter: true,
  },
  {
    label: "enfileirados",
    value: (r) => r.metrics.enqueued,
    format: (v) => integer.format(v),
    lowerIsBetter: true,
  },
  {
    label: "reaberturas",
    value: (r) => r.metrics.reopened,
    format: (v) => integer.format(v),
    lowerIsBetter: true,
  },
  {
    label: "requisições HTTP",
    value: (r) => r.metrics.requests,
    format: (v) => integer.format(v),
    lowerIsBetter: true,
  },
  {
    label: "acertos de cache/dump",
    value: (r) => r.metrics.cacheHits,
    format: (v) => integer.format(v),
    lowerIsBetter: false,
  },
  {
    label: "tempo (ms)",
    value: (r) => r.metrics.elapsedMs,
    format: (v) => v.toFixed(0),
    lowerIsBetter: true,
  },
];

export function MetricsPanel({ modes, results, selected, onSelect }: MetricsPanelProps) {
  const columns = modes.filter((mode) => results[mode.key]);
  if (columns.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="py-2 pr-3 text-left font-medium text-zinc-500">métrica</th>
            {columns.map((mode) => (
              <th key={mode.key} className="px-2 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(mode.key)}
                  className={`rounded px-2 py-1 text-xs ${
                    mode.key === selected
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                  // Trocar de coluna troca o grafo desenhado: é o botão de comparação visual.
                  title="ver o subgrafo explorado por este algoritmo"
                >
                  {mode.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const values = columns.map((mode) => row.value(results[mode.key]));
            const best = row.lowerIsBetter ? Math.min(...values) : Math.max(...values);
            return (
              <tr key={row.label} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1.5 pr-3 text-zinc-500">{row.label}</td>
                {values.map((value, index) => (
                  <td
                    key={columns[index].key}
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      columns.length > 1 && value === best ? "font-semibold text-emerald-600" : ""
                    }`}
                  >
                    {row.format(value)}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="py-1.5 pr-3 text-zinc-500">parada</td>
            {columns.map((mode) => (
              <td key={mode.key} className="px-2 py-1.5 text-right text-xs text-zinc-500">
                {STOP_REASON_LABEL[results[mode.key].stopReason] ?? results[mode.key].stopReason}
              </td>
            ))}
          </tr>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="py-1.5 pr-3 text-zinc-500">componentes (Tarjan)</td>
            {columns.map((mode) => {
              const { scc } = results[mode.key].subgraph;
              return (
                <td key={mode.key} className="px-2 py-1.5 text-right text-xs text-zinc-500">
                  {integer.format(scc.components)}, {integer.format(scc.cyclic)} com ciclo, maior
                  com {integer.format(scc.largest)}
                </td>
              );
            })}
          </tr>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="py-1.5 pr-3 text-zinc-500">vértices desenhados</td>
            {columns.map((mode) => {
              const { subgraph } = results[mode.key];
              return (
                <td key={mode.key} className="px-2 py-1.5 text-right text-xs text-zinc-500">
                  {integer.format(subgraph.nodes.length)} de{" "}
                  {integer.format(subgraph.expanded)} expandidos
                  {subgraph.truncated && " (amostra)"}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
