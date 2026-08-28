import type { Neighbor, NodeId } from "@/lib/graph/types";

/** Vizinhança de saída de um artigo, com o título já resolvido pós-redirect. */
export interface PageOutlinks {
  /** Título canônico do artigo expandido. */
  source: NodeId;
  /** Vizinhos ordenados por posição no corpo do artigo. */
  neighbors: Neighbor[];
}

/** Parâmetros de uma chamada à Action API (sem `format` e `formatversion`). */
export type ApiParams = Record<string, string>;

export class WikiPageNotFoundError extends Error {
  constructor(readonly title: string) {
    super(`Artigo não encontrado: "${title}"`);
    this.name = "WikiPageNotFoundError";
  }
}

export class WikiApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WikiApiError";
  }
}

/* Recortes das respostas da API — só os campos que o cliente consome. */

interface ApiError {
  code: string;
  info: string;
}

export interface ApiRedirect {
  from: string;
  to: string;
}

export interface ApiPage {
  ns: number;
  title: string;
  missing?: boolean;
  /** Ausente em páginas inexistentes. */
  length?: number;
  pageprops?: { disambiguation?: string };
  revisions?: Array<{ slots?: { main?: { content?: string } } }>;
}

export interface ApiResponse {
  error?: ApiError;
  continue?: Record<string, string>;
  query?: {
    redirects?: ApiRedirect[];
    normalized?: ApiRedirect[];
    pages?: ApiPage[];
  };
}
