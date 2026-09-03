"use client";

/**
 * Entrada da busca: origem, destino e algoritmo.
 *
 * Os dez pares de `data/pairs.json` aparecem como atalhos porque são os mesmos que o dump
 * cobre e que o benchmark mediu — em modo offline, qualquer outro par esbarra na borda do dump
 * e devolve um caminho pior ou nenhum. O atalho é, na prática, a lista do que a demo garante.
 */

import pairsFile from "../../data/pairs.json";
import { ALGORITHM_MODES, type AlgorithmMode } from "@/lib/api/algorithms";

const PAIRS = pairsFile.pairs;

export interface SearchFormProps {
  from: string;
  to: string;
  mode: AlgorithmMode;
  loading: boolean;
  onChange: (pair: { from: string; to: string }) => void;
  onModeChange: (mode: AlgorithmMode) => void;
  onSubmit: () => void;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none " +
  "focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

export function SearchForm({
  from,
  to,
  mode,
  loading,
  onChange,
  onModeChange,
  onSubmit,
}: SearchFormProps) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-400">Origem</span>
          <input
            className={inputClass}
            value={from}
            onChange={(event) => onChange({ from: event.target.value, to })}
            placeholder="Brasil"
            required
          />
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block font-medium text-zinc-600 dark:text-zinc-400">Destino</span>
          <input
            className={inputClass}
            value={to}
            onChange={(event) => onChange({ from, to: event.target.value })}
            placeholder="Ludwig van Beethoven"
            required
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALGORITHM_MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            title={option.note}
            onClick={() => onModeChange(option)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              option.key === mode.key
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="ml-auto rounded-full bg-emerald-600 px-5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "buscando…" : "Buscar"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
        <span className="mr-1">Pares do dump:</span>
        {PAIRS.map((pair) => (
          <button
            key={pair.id}
            type="button"
            title={pair.note}
            onClick={() => onChange({ from: pair.from, to: pair.to })}
            className="rounded border border-zinc-200 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:bg-zinc-800"
          >
            {pair.from} → {pair.to}
          </button>
        ))}
      </div>
    </form>
  );
}
