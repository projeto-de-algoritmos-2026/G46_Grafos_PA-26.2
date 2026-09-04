"""
Gráfico comparativo dos quatro algoritmos, a partir de `data/results/benchmark.csv`.

    python3 -m venv .venv
    .venv/bin/pip install matplotlib
    .venv/bin/python scripts/plot.py

Escreve `docs/comparison.png`. Roda **fora** da aplicação de propósito: o gráfico é material
de análise, não funcionalidade do produto, e nada em `src/` deve depender dele.

**O que é medido em cada painel.** Em cima, os vértices expandidos, em escala logarítmica —
a grandeza varia de 1 a 140 mil entre configurações, e em escala linear as barras pequenas
sumiriam. Embaixo, o custo do caminho encontrado. Os dois juntos são a leitura do trabalho:
o A* ponderado expande ordens de grandeza menos, e a pergunta é quanto de custo isso paga.

**Por que não o tempo.** `elapsed_ms` varia até 6× entre execuções idênticas por causa do
coletor de lixo (medido; ver `data/results/README.md`). Contagem de nós é exata e
determinística, e é sobre ela que a análise se sustenta.
"""

import csv
from pathlib import Path

import matplotlib

# Backend sem janela: o script roda em terminal e só escreve arquivo.
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402  (precisa vir depois de `use`)

ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "data" / "results" / "benchmark.csv"
OUTPUT = ROOT / "docs" / "comparison.png"

# Ordem fixa: uma configuração é sempre a mesma cor e a mesma hachura, em qualquer painel.
CONFIGS = ["bfs", "dijkstra", "astar-admissible", "astar-weighted"]
LABELS = {
    "bfs": "BFS",
    "dijkstra": "Dijkstra",
    "astar-admissible": "A* admissível",
    "astar-weighted": "A* ponderado (λ=0.5)",
}
COLORS = {
    "bfs": "#2a78d6",
    "dijkstra": "#eb6834",
    "astar-admissible": "#1baf7a",
    "astar-weighted": "#eda100",
}
# Codificação secundária: identidade não pode depender só da cor, e duas das quatro ficam
# abaixo de 3:1 de contraste sobre o fundo claro.
HATCHES = {"bfs": "", "dijkstra": "///", "astar-admissible": "...", "astar-weighted": "xxx"}

INK = "#0b0b0b"
MUTED = "#52514e"
SURFACE = "#fcfcfb"


def read_rows():
    with CSV.open(encoding="utf8") as handle:
        return list(csv.DictReader(handle))


def draw(axis, pairs, values, title, ylabel, log):
    width = 0.2
    for slot, config in enumerate(CONFIGS):
        offsets = [index + (slot - 1.5) * width for index in range(len(pairs))]
        axis.bar(
            offsets,
            [values[config][pair] for pair in pairs],
            width=width * 0.9,  # a folga entre barras vizinhas é o separador de superfície
            color=COLORS[config],
            hatch=HATCHES[config],
            edgecolor=SURFACE,
            linewidth=0.6,
            label=LABELS[config],
        )

    if log:
        axis.set_yscale("log")
    axis.set_title(title, fontsize=11, color=INK, loc="left", pad=10)
    axis.set_ylabel(ylabel, fontsize=9, color=MUTED)
    axis.set_xticks(range(len(pairs)))
    axis.set_xticklabels(pairs, fontsize=9, color=MUTED)
    axis.tick_params(axis="y", labelsize=8, colors=MUTED)

    # Grade recessiva e sem moldura: o dado é a única coisa em primeiro plano.
    axis.grid(axis="y", color="#e4e4e1", linewidth=0.6)
    axis.set_axisbelow(True)
    for side in ("top", "right", "left"):
        axis.spines[side].set_visible(False)
    axis.spines["bottom"].set_color("#d4d4d1")


def main():
    rows = read_rows()
    pairs = sorted({row["pair_id"] for row in rows})

    expanded = {config: {} for config in CONFIGS}
    cost = {config: {} for config in CONFIGS}
    for row in rows:
        expanded[row["algo"]][row["pair_id"]] = int(row["expanded"])
        cost[row["algo"]][row["pair_id"]] = float(row["path_cost"])

    figure, (top, bottom) = plt.subplots(2, 1, figsize=(10, 7.5), facecolor=SURFACE)
    figure.subplots_adjust(hspace=0.35, top=0.86)

    draw(top, pairs, expanded, "Vértices expandidos (escala log — menor é melhor)", "nós", True)
    draw(bottom, pairs, cost, "Custo do caminho encontrado (menor é melhor)", "custo", False)

    for axis in (top, bottom):
        axis.set_facecolor(SURFACE)

    figure.legend(
        *top.get_legend_handles_labels(),
        loc="upper left",
        bbox_to_anchor=(0.08, 0.97),
        ncol=4,
        frameon=False,
        fontsize=9,
        labelcolor=MUTED,
    )
    figure.suptitle(
        "BFS, Dijkstra e A* sobre os 10 pares fixos (modo offline, sobre o dump)",
        fontsize=12,
        color=INK,
        x=0.08,
        y=0.985,
        ha="left",
    )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    figure.savefig(OUTPUT, dpi=200, facecolor=SURFACE)
    print(f"escrito {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
