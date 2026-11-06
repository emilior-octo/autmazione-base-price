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

export type GuestRunnerProfile = Partial<Record<"gender"|"size"|"weight"|"usage"|"support"|"distance",string>>;

export function extractGuestRunnerProfile(messages: Array<{role:string;content:string}>): GuestRunnerProfile {
 const profile:GuestRunnerProfile={};
 for(const entry of messages){
  if(entry.role!=="user")continue;
  const line=entry.content.toLowerCase().replace(/,/g,".");
  if(/(?:se fossi|se pesassi|per un amico|per una amica|per mio|per mia|ipotetic|what if|for my friend)/i.test(line))continue;
  if(/^(?:uomo|maschio|male|men)$/i.test(line.trim())||/\b(?:sono un uomo|scarpe da uomo|per me uomo)\b/i.test(line))profile.gender="men";
  if(/^(?:donna|femmina|female|women)$/i.test(line.trim())||/\b(?:sono una donna|scarpe da donna|per me donna)\b/i.test(line))profile.gender="women";
  const size=line.match(/(?:taglia|numero|porto|calzo)\s*(?:eu |è |e |di |il |la )*([2-5][0-9](?:\.5)?)/i);
  if(size)profile.size=size[1];
  const weight=line.match(/(?:peso|weight|i weigh)\s*(?:circa |about )?(\d{2,3})\s*(?:kg|chili|chilogrammi)?/i);
  if(weight){const kg=Number(weight[1]);if(kg>=35&&kg<=250)profile.weight=kg<60?"under-60":kg<=75?"60-75":kg<=90?"76-90":"over-90";}
  if(/\b(?:sono supinatore|sono supinatrice|appoggio supinatore|appoggio supinazione|supinazione|supinatore)\b/i.test(line))profile.support="supination";
  else if(/\b(?:sono pronatore|sono pronatrice|iperpronazione|appoggio pronatore)\b/i.test(line))profile.support="stability";
  else if(/\b(?:appoggio neutro|sono neutro|sono neutra)\b/i.test(line))profile.support="neutral";
  else if(/\b(?:appoggio non noto|non conosco l.appoggio|non so l.appoggio)\b/i.test(line))profile.support="unknown";
  const distance=line.match(/(?:percorro|cammino|corro|faccio|run|running)\s*(?:circa |about |di |per )*(\d{1,2})\s*km/i);
  if(distance){const km=Number(distance[1]);profile.distance=km<=5?"0-5":km<=10?"5-10":km<=20?"10-20":"20-plus";}
  if(/(?:camminata veloce|camminare|walking|allenamento quotidiano|uso quotidiano|daily)/i.test(line))profile.usage="daily";
  else if(/(?:trail|sterrato)/i.test(line))profile.usage="trail";
  else if(/(?:gara|race)/i.test(line))profile.usage="race";
  else if(/(?:velocità|ripetute|speed)/i.test(line))profile.usage="speed";
  else if(/(?:lunghe distanze|long distance)/i.test(line))profile.usage="long-distance";
 }
 return profile;
}
