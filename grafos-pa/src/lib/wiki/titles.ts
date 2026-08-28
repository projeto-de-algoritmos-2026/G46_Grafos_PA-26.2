/** Normalização de títulos e resolução de redirects. */

import type { NodeId } from "@/lib/graph/types";
import { queryApi } from "./ratelimit";
import { WikiPageNotFoundError } from "./types";

/**
 * Normaliza um título para a forma que a MediaWiki usa como chave: sublinhados viram
 * espaços, espaços repetidos colapsam, a âncora é descartada e a primeira letra é
 * maiúscula. Não resolve redirects — isso exige uma requisição.
 */
export function normalizeTitle(raw: string): string {
  const withoutAnchor = raw.split("#")[0];
  const collapsed = withoutAnchor.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return "";
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1);
}

/**
 * Um título com dois-pontos indica namespace (`Ficheiro:`, `Categoria:`) ou interwiki
 * (`en:`), ambos fora do grafo, que só tem artigos do namespace 0.
 */
export function isArticleTitle(title: string): boolean {
  return title.length > 0 && !title.includes(":");
}

/** Desambiguações são pontos de passagem sem conteúdo próprio; ficam fora do grafo. */
export function isDisambiguationTitle(title: string): boolean {
  return /\((desambiguação|disambiguation)\)$/i.test(title);
}

/**
 * Resolve um título de entrada para o título canônico pós-redirect.
 * Requisição leve — o cliente resolve redirects de graça ao expandir um artigo,
 * então isto só é útil para validar a origem e o destino informados pelo usuário.
 */
export async function resolveTitle(title: string): Promise<NodeId> {
  const normalized = normalizeTitle(title);
  const data = await queryApi({ action: "query", titles: normalized, redirects: "1" });

  const page = data.query?.pages?.[0];
  if (!page || page.missing) throw new WikiPageNotFoundError(title);
  return page.title;
}
