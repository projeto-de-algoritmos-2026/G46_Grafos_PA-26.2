/**
 * Cliente da MediaWiki Action API: dado um artigo, devolve seus links de saída do
 * namespace 0 já com os metadados que a função de custo consome.
 *
 * Cada expansão combina duas consultas, porque nenhuma delas basta sozinha:
 *
 *  1. `prop=revisions` — resolve o redirect da origem e traz o wikitext, de onde sai a
 *     **ordem** dos links (`rank`). Uma requisição.
 *  2. `generator=links&prop=info` — traz o conjunto canônico de vizinhos do namespace 0,
 *     o `length` de cada um e a marca de desambiguação. Paginada em blocos de 500.
 *
 * Vizinhos que aparecem no wikitext entram na ordem de aparição; os que só existem via
 * template (infobox, navbox) não têm posição no corpo do artigo e vão para o fim — o que
 * é coerente com tratá-los como links periféricos.
 */

import type { Neighbor } from "@/lib/graph/types";
import { queryApi } from "./ratelimit";
import { isArticleTitle, isDisambiguationTitle, normalizeTitle } from "./titles";
import {
  WikiPageNotFoundError,
  type ApiPage,
  type PageOutlinks,
} from "./types";
import { extractLinkTargets } from "./wikitext";

interface ArticleSource {
  /** Título canônico, pós-redirect. */
  title: string;
  wikitext: string;
}

/** Consulta 1: título canônico e wikitext da origem. */
async function fetchSource(title: string): Promise<ArticleSource> {
  const data = await queryApi({
    action: "query",
    titles: normalizeTitle(title),
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
  });

  const page = data.query?.pages?.[0];
  if (!page || page.missing) throw new WikiPageNotFoundError(title);

  return {
    title: page.title,
    wikitext: page.revisions?.[0]?.slots?.main?.content ?? "",
  };
}

interface LinkedPages {
  pages: ApiPage[];
  /** Título como escrito no link (normalizado) → título canônico do destino. */
  redirects: Map<string, string>;
}

/** Consulta 2: vizinhos do namespace 0 com `length`, seguindo a continuação até esgotar. */
async function fetchLinkedPages(canonicalTitle: string): Promise<LinkedPages> {
  // Deduplicado por título: dois links que caem no mesmo artigo via redirects diferentes
  // reaparecem em blocos distintos da continuação.
  const byTitle = new Map<string, ApiPage>();
  const redirects = new Map<string, string>();
  let continuation: Record<string, string> | undefined;

  do {
    const data = await queryApi({
      action: "query",
      titles: canonicalTitle,
      generator: "links",
      gplnamespace: "0",
      gpllimit: "max",
      prop: "info|pageprops",
      ppprop: "disambiguation",
      redirects: "1",
      ...continuation,
    });

    for (const entry of data.query?.normalized ?? []) {
      redirects.set(normalizeTitle(entry.from), entry.to);
    }
    for (const entry of data.query?.redirects ?? []) {
      redirects.set(normalizeTitle(entry.from), entry.to);
    }
    for (const page of data.query?.pages ?? []) {
      if (!byTitle.has(page.title)) byTitle.set(page.title, page);
    }

    continuation = data.continue;
  } while (continuation);

  return { pages: [...byTitle.values()], redirects };
}

function isUsableNeighbor(page: ApiPage, source: string): boolean {
  return (
    !page.missing &&
    page.ns === 0 &&
    page.title !== source &&
    page.pageprops?.disambiguation === undefined &&
    !isDisambiguationTitle(page.title)
  );
}

/**
 * Posição da primeira ocorrência de cada vizinho no wikitext. Alvos escritos como
 * redirect são traduzidos para o título canônico antes da comparação.
 */
function positionsInBody(
  wikitext: string,
  canonicalTitles: Set<string>,
  redirects: Map<string, string>,
): Map<string, number> {
  const positions = new Map<string, number>();

  for (const raw of extractLinkTargets(wikitext)) {
    const normalized = normalizeTitle(raw);
    if (!isArticleTitle(normalized)) continue;

    const canonical = redirects.get(normalized) ?? normalized;
    if (!canonicalTitles.has(canonical) || positions.has(canonical)) continue;

    positions.set(canonical, positions.size);
  }
  return positions;
}

/** Expande um artigo: título canônico e vizinhos ordenados por posição no corpo. */
export async function fetchPage(title: string): Promise<PageOutlinks> {
  const source = await fetchSource(title);
  const { pages, redirects } = await fetchLinkedPages(source.title);

  const usable = pages.filter((page) => isUsableNeighbor(page, source.title));
  const positions = positionsInBody(
    source.wikitext,
    new Set(usable.map((page) => page.title)),
    redirects,
  );

  const inBody = usable
    .filter((page) => positions.has(page.title))
    .sort((a, b) => positions.get(a.title)! - positions.get(b.title)!);
  const fromTemplates = usable.filter((page) => !positions.has(page.title));

  const ordered = [...inBody, ...fromTemplates];
  const total = ordered.length;

  const neighbors: Neighbor[] = ordered.map((page, index) => ({
    id: page.title,
    rank: index + 1,
    total,
    length: page.length ?? 0,
  }));

  return { source: source.title, neighbors };
}

/** Vizinhos de saída de um artigo, na ordem em que os links aparecem no corpo. */
export async function fetchOutlinks(title: string): Promise<Neighbor[]> {
  const { neighbors } = await fetchPage(title);
  return neighbors;
}
