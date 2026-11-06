export type ShoeMatchStatus = "rated" | "unrated" | "size_mismatch";

export function describeShoeMatch(status: ShoeMatchStatus): string {
  switch (status) {
    case "rated": return "Valutazione tecnica disponibile";
    case "size_mismatch": return "Verificare la taglia richiesta";
    default: return "Dati tecnici insufficienti";
  }
}

export function summarizeTechnicalMatch(input: {
  bucket: "primary" | "secondary" | "fallback";
  score: number;
  labels: string[];
}): string {
  const verdict = input.bucket === "primary"
    ? "Coerente con il tipo di appoggio dichiarato."
    : input.bucket === "secondary"
      ? "Alternativa da valutare con attenzione."
      : "Non tra le prime scelte per l'appoggio dichiarato.";
  const details = input.labels.length ? " " + input.labels.join("; ") + "." : "";
  return verdict + details + " Punteggio tecnico interno: " + input.score +
    " (non è una percentuale di compatibilità).";
}
