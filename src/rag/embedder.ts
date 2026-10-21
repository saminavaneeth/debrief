/**
 * Optional vector embeddings for hybrid search. Indexes work without one (BM25 + filters); a
 * local model (e.g. MiniLM via @huggingface/transformers) can be plugged in later.
 */
export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Combine keyword scores with optional vector similarity. Keyword scores are normalised by the
 * best hit; with no embedder the result is the normalised keyword score.
 */
export function hybridScore(keyword: number, maxKeyword: number, vector?: number): number {
  const k = maxKeyword > 0 ? keyword / maxKeyword : 0;
  return vector === undefined ? k : 0.6 * k + 0.4 * Math.max(0, vector);
}
