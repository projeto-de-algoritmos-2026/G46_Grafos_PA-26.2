/**
 * Dump consolidado do subgrafo explorado: um único arquivo comprimido, versionado no git,
 * que permite rodar a demonstração inteira e o benchmark sem tocar a rede.
 *
 * O dump guarda cada vizinho como `[título, bytes]` em vez do objeto `Neighbor` completo:
 * `rank` é a posição no array e `total` é o tamanho dele, então gravar os dois seria repetir
 * em cada uma das centenas de milhares de arestas o que a ordem do array já diz. A leitura
 * reconstrói os campos.
 */

import { gunzip, gzip } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Neighbor, NodeId } from "@/lib/graph/types";
import { WIKI_DUMP_PATH } from "@/lib/wiki/config";
import type { PageOutlinks } from "@/lib/wiki/types";

const gunzipAsync = promisify(gunzip);
const gzipAsync = promisify(gzip);

/** Vizinho no formato do arquivo: título canônico e tamanho do artigo em bytes. */
export type DumpNeighbor = [NodeId, number];

/** Estrutura serializada em `data/dump/graph.json.gz`. */
export interface GraphDumpFile {
  lang: string;
  builtAt: string;
  /** Título canônico → vizinhos de saída, na ordem em que aparecem no corpo do artigo. */
  pages: Record<NodeId, DumpNeighbor[]>;
  /** Título consultado (já normalizado) → título canônico, para poupar a ida ao redirect. */
  aliases: Record<string, NodeId>;
}

/**
 * Dump carregado. Os `Record` do arquivo viram `Map` porque as chaves são títulos de artigo
 * arbitrários e um artigo chamado "__proto__" ou "constructor" faria a busca por chave em um
 * objeto simples devolver algo do protótipo em vez de `undefined`.
 */
export interface GraphDump {
  lang: string;
  builtAt: string;
  pages: Map<NodeId, DumpNeighbor[]>;
  aliases: Map<string, NodeId>;
}

let loading: Promise<GraphDump | undefined> | undefined;

async function readDump(): Promise<GraphDump | undefined> {
  let compressed: Buffer;
  try {
    compressed = await readFile(WIKI_DUMP_PATH);
  } catch (error) {
    // Sem dump o sistema segue funcionando por cache e rede; só o modo offline exige ele.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  const file = JSON.parse((await gunzipAsync(compressed)).toString("utf8")) as GraphDumpFile;
  return {
    lang: file.lang,
    builtAt: file.builtAt,
    pages: new Map(Object.entries(file.pages)),
    aliases: new Map(Object.entries(file.aliases)),
  };
}

/** Carrega o dump uma única vez por processo; `undefined` quando o arquivo não existe. */
export function loadDump(): Promise<GraphDump | undefined> {
  loading ??= readDump();
  return loading;
}

/** Descarta o dump em memória — usado após reescrevê-lo. */
export function unloadDump(): void {
  loading = undefined;
}

/** Expansão de `normalizedTitle` segundo o dump, ou `undefined` se ele não a cobre. */
export async function lookupDump(normalizedTitle: string): Promise<PageOutlinks | undefined> {
  const dump = await loadDump();
  if (!dump) return undefined;

  const canonical = dump.pages.has(normalizedTitle)
    ? normalizedTitle
    : dump.aliases.get(normalizedTitle);
  if (canonical === undefined) return undefined;

  const entries = dump.pages.get(canonical);
  if (!entries) return undefined;

  const neighbors: Neighbor[] = entries.map(([id, length], index) => ({
    id,
    rank: index + 1,
    total: entries.length,
    length,
  }));
  return { source: canonical, neighbors };
}

/** Grava o dump comprimido, criando o diretório se preciso. Devolve o tamanho em bytes. */
export async function writeDump(file: GraphDumpFile): Promise<number> {
  const compressed = await gzipAsync(JSON.stringify(file));
  await mkdir(path.dirname(WIKI_DUMP_PATH), { recursive: true });
  await writeFile(WIKI_DUMP_PATH, compressed);
  unloadDump();
  return compressed.byteLength;
}
