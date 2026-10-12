import type { ActionFunctionArgs } from "react-router";
import { createRequire } from "node:module";
import { getAdvisorCatalog } from "../lib/ai-advisor/catalog.server";

const require = createRequire(import.meta.url);
const required = ["gender", "size", "weight", "usage", "support", "distance"] as const;

export async function action({request}: ActionFunctionArgs) {
 if (request.method !== "POST") return Response.json({error:"Method not allowed"},{status:405});
 const secret = process.env.AI_ADVISOR_INTERNAL_SECRET;
 const supplied = request.headers.get("x-advisor-internal-key");
 if (!secret || secret.length < 32) return Response.json({error:"Not configured"},{status:503});
 if (!supplied || supplied !== secret) return Response.json({error:"Unauthorized"},{status:401});
 let input: Record<string,unknown>;
 try {
  input = await request.json();
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
 } catch {return Response.json({error:"Invalid JSON body"},{status:400});}
 const missingFields = required.filter(key => input[key] == null || String(input[key]).trim() === "");
 if (missingFields.length) return Response.json({status:"missing_required_inputs",missingFields});
 if (input.gender !== "men" && input.gender !== "women") return Response.json({error:"Invalid gender"},{status:400});
 try {
  // Exact approved Shoe Finder engine; install file using the documented copy command.
  const core = require(process.cwd() + "/app/lib/ai-advisor/shoe-finder-core.cjs").ValsportShoeFinderCore
    ?? globalThis.ValsportShoeFinderCore;
  if (!core?.rankProducts) throw new Error("Core unavailable");
  const catalog = await getAdvisorCatalog(input.gender);
  const answers = {
   gender: input.gender, size: core.normalizeSize(input.size),
   weight: core.normalizeWeight(input.weight), usage: core.normalizeUsage(input.usage),
   support: core.normalizeSupport(input.support), distance: core.normalizeDistance(input.distance)
  };
  const ranked = core.rankProducts(catalog.map(core.normalizeProduct), answers);
  const limit = Number.isInteger(input.limit) ? Math.max(1,Math.min(24,input.limit as number)) : 4;
  return Response.json({
   status: ranked.all.length ? "success" : "no_matches",
   totalMatches: ranked.all.length,
   products: ranked.all.slice(0,limit).map((p:any,i:number)=>({
    productId:String(p.id),handle:p.handle,rank:i+1,bucket:p.bucket,
    technicalScore:p.score,scoreBreakdown:p.bucket_score,reasons:p.labels,
    priceCents:p.price,url:p.url
   }))
  },{headers:{"Cache-Control":"no-store"}});
 } catch {
  return Response.json({status:"error",code:"CATALOG_OR_MATCHING_UNAVAILABLE"},{status:503});
 }
}
