export type ShoeMatchStatus = "rated" | "unrated" | "size_mismatch";

export function describeShoeMatch(status: ShoeMatchStatus): string {
  switch (status) {
    case "rated": return "Valutazione tecnica disponibile";
    case "size_mismatch": return "Verificare la taglia richiesta";
    default: return "Dati tecnici insufficienti";
  }
}
