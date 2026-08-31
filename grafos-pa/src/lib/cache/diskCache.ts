/**
 * Cache chave→JSON em disco, usado para que expandir um artigo seja feito uma única vez.
 *
 * O nome do arquivo é o SHA-1 da chave, não a chave em si. O motivo não é desempenho: um
 * título de artigo não é um nome de arquivo válido — tem `/`, `:` e acento — e o sistema de
 * arquivos padrão do macOS é *case-insensitive*, então "Brasil" e "brasil" colidiriam. O
 * primeiro byte do digest vira subdiretório para não deixar milhares de arquivos num nível só.
 *
 * A escrita é atômica (arquivo temporário + `rename`) porque `build-dump.ts` roda por dezenas
 * de minutos e é interrompido com frequência: sem isso, um `Ctrl+C` no momento errado deixaria
 * um JSON truncado que só explodiria dias depois, durante o benchmark.
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { WIKI_CACHE_DIR } from "@/lib/wiki/config";

/** O valor guardado vem acompanhado da chave, já que o nome do arquivo é opaco. */
interface Envelope<T> {
  key: string;
  savedAt: string;
  value: T;
}

function filePathFor(key: string): string {
  const digest = createHash("sha1").update(key).digest("hex");
  return path.join(WIKI_CACHE_DIR, digest.slice(0, 2), `${digest}.json`);
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/**
 * Valor associado a `key`, ou `undefined` se ausente. Entrada corrompida conta como
 * ausente: a próxima escrita a substitui, o que é preferível a abortar a execução.
 */
export async function readCache<T>(key: string): Promise<T | undefined> {
  let raw: string;
  try {
    raw = await readFile(filePathFor(key), "utf8");
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }

  try {
    return (JSON.parse(raw) as Envelope<T>).value;
  } catch {
    return undefined;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  const target = filePathFor(key);
  const envelope: Envelope<T> = { key, savedAt: new Date().toISOString(), value };

  await mkdir(path.dirname(target), { recursive: true });

  // O sufixo aleatório evita que duas escritas concorrentes disputem o mesmo temporário.
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(envelope), "utf8");
  await rename(temporary, target);
}
