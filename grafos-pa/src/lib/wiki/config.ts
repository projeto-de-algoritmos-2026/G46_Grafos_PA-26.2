/** Configuração do acesso à MediaWiki Action API, ajustável por variável de ambiente. */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const WIKI_LANG = process.env.WIKI_LANG ?? "pt";

export const WIKI_API_ENDPOINT = `https://${WIKI_LANG}.wikipedia.org/w/api.php`;

/**
 * A política de etiqueta da API exige um User-Agent que identifique o projeto e ofereça
 * um contato. Defina `WIKI_CONTACT` com um e-mail se quiser um canal direto.
 */
export const WIKI_CONTACT =
  process.env.WIKI_CONTACT ??
  "https://github.com/projeto-de-algoritmos-2026/G46_Grafos_PA-26.2";

export const WIKI_USER_AGENT =
  process.env.WIKI_USER_AGENT ??
  `grafos-pa/0.1 (trabalho de Projeto de Algoritmos, UnB/FCTE; ${WIKI_CONTACT})`;

/** Atraso mínimo entre o início de duas requisições, em milissegundos. */
export const WIKI_MIN_DELAY_MS = envNumber("WIKI_MIN_DELAY_MS", 200);

/** Tentativas extras após a primeira falha retentável. */
export const WIKI_MAX_RETRIES = envNumber("WIKI_MAX_RETRIES", 3);

/** Base do backoff exponencial, em milissegundos. */
export const WIKI_BACKOFF_MS = envNumber("WIKI_BACKOFF_MS", 500);
