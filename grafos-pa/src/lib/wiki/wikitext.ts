/**
 * Extração da ordem dos links a partir do wikitext.
 *
 * Motivo: `generator=links` e `action=parse&prop=links` devolvem os links em ordem
 * alfabética, não na ordem em que aparecem no artigo — e a ordem é justamente o insumo
 * de `pos(u, v)` na função de custo. O wikitext preserva a ordem de escrita, com a
 * introdução (onde estão os links definidores do tópico) primeiro.
 */

const LINK_TARGET = /\[\[\s*([^[\]|]+)/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const NOWIKI_BLOCK = /<nowiki>[\s\S]*?<\/nowiki>/gi;

/**
 * Alvos dos links internos na ordem de aparição, ainda sem normalizar e com repetições.
 * Links aninhados (por exemplo dentro da legenda de uma imagem) também são capturados,
 * já que cada um abre o seu próprio `[[`.
 */
export function extractLinkTargets(wikitext: string): string[] {
  const cleaned = wikitext.replace(HTML_COMMENT, "").replace(NOWIKI_BLOCK, "");

  const targets: string[] = [];
  for (const match of cleaned.matchAll(LINK_TARGET)) {
    const target = match[1].trim();
    if (target.length > 0) targets.push(target);
  }
  return targets;
}
