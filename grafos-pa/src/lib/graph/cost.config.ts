/**
 * Constantes da função de custo `w(u → v) = ε + α · pos(u, v) + β · gen(v)`.
 *
 * Ficam isoladas num arquivo próprio porque são o principal ponto de calibração do projeto:
 * mudar qualquer uma muda todo caminho encontrado e invalida os CSVs de `data/results/`.
 */

/**
 * Piso do custo de qualquer aresta.
 *
 * Cumpre três papéis, nesta ordem de importância: garante `w > 0`, que é pré-requisito de
 * Dijkstra; impede caminhos de custo zero, que tornariam a comparação com BFS degenerada; e
 * mantém um viés residual por caminhos curtos em número de saltos. É também o limite superior
 * da heurística admissível da Fase 6 — daí ela ser fraca por construção.
 */
export const EPSILON = 0.1;

/** Peso do termo de posição do link no corpo do artigo de origem. */
export const ALPHA = 0.5;

/** Peso do termo de generalidade do artigo de destino. */
export const BETA = 0.5;

/**
 * Tamanho de artigo, em bytes, a partir do qual `gen` satura em 1.
 *
 * 200 KB é a ordem de grandeza dos artigos-hub da Wikipédia lusófona (países grandes, séculos,
 * áreas inteiras do conhecimento) — exatamente os pontos de passagem semanticamente vagos que
 * a função de custo existe para encarecer.
 */
export const LENGTH_REFERENCE = 200_000;

/**
 * Tamanho, em bytes, abaixo do qual `gen` satura em 0.
 *
 * Sem este piso a normalização logarítmica seria feita contra `ln(1)`, e a faixa real de
 * tamanhos de artigo cairia comprimida em [0.51, 1.00]: um esboço de 1,8 KB pontuava 0,61
 * contra os 0,99 de um artigo de 190 KB. O termo `β · gen` variava metade do que `α · pos`
 * variava, e a punição à passagem por hubs — a razão de o termo existir — ficava fraca.
 *
 * 1 KB é o limiar de esboço da Wikipédia lusófona: abaixo disso a diferença de tamanho já não
 * carrega informação sobre generalidade, só sobre o artigo estar incompleto.
 */
export const LENGTH_FLOOR = 1_000;
