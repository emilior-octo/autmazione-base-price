// Deterministic routing: never send operational order requests to the LLM.
const operational = /\b(?:ordine|ordini|order|orders|spedizione|spedito|spedita|evasione|evadere|tracking|tracciamento|pacco|corriere|consegna|consegnato|ritardo|reso|resi|restituire|restituzione|rimborso|rimborsi|refund|cambio taglia|cambiare taglia|annullare|annullamento|cancellare l.ordine|reclamo)\b/i;
const status = /\b(?:dov.?è|dove|quando|stato|status|arriva|arriverà|ricevuto|ricevuta|partito|partita|problema|aiuto|assistenza|verificare|controllare|sapere|aggiornamenti|tracciare|seguire|mio|mia|miei|mie|ho fatto|ho effettuato)\b/i;
const educational = /\b(?:come funziona|come si fa|politica|policy|condizioni|informazioni generali|costi|quanto costa|tempo medio|tempi medi|soglia|gratuita|gratis|spedizione gratuita)\b/i;
const personalOrder = /\b(?:mio|mia|miei|mie|ho ordinato|ho acquistato|ho comprato|ho effettuato|ho fatto|numero ordine|tracking|tracciamento|dov.?è|dove si trova)\b/i;
const productHistory = /\b(?:consiglia|consigliami|alternativa|simil[ei]|scarpe|modelli|riacquistare|ricomprare|acquistato in passato|comprato in passato)\b/i;
export function needsHumanPostSale(message:string):boolean {
 const text=message.trim().toLowerCase();
 if(!text || !operational.test(text))return false;
 if(/\b(?:carrello|aggiungere al carrello|coupon|sconto)\b/.test(text)&&!personalOrder.test(text))return false;
 if(educational.test(text)&&!personalOrder.test(text))return false;
 if(productHistory.test(text)&&!status.test(text)&&!/(reso|rimborso|cambio taglia|reclamo)/i.test(text))return false;
 return /\b(?:reso|resi|restituire|restituzione|rimborso|rimborsi|refund|cambio taglia|annullare|annullamento|reclamo|evasione|tracking|tracciamento|corriere|consegna|consegnato|ritardo)\b/i.test(text) || (personalOrder.test(text)&&status.test(text));
}
