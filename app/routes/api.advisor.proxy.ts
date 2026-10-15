import type { ActionFunctionArgs } from "react-router";
import { createRequire } from "node:module";
import { authenticate } from "../shopify.server";
import { getAdvisorCatalog } from "../lib/ai-advisor/catalog.server";

const require = createRequire(import.meta.url);
const allowed = ["gender","size","weight","usage","support","distance"] as const;
const allowedValues: Record<string,string[]> = {
 gender:["men","women"], usage:["daily","long-distance","speed","race","trail"],
 support:["neutral","stability","supination","unknown"],
 weight:["under-60","60-75","76-90","over-90"],
 distance:["0-5","5-10","10-20","20-plus"]
};
const counters = new Map<string,{count:number;until:number}>();

export async function action({request}:ActionFunctionArgs) {
 if(request.method !== "POST") return Response.json({error:"Method not allowed"},{status:405});
 let proxy: Awaited<ReturnType<typeof authenticate.public.appProxy>>;
 try { proxy = await authenticate.public.appProxy(request); }
 catch { return Response.json({error:"Invalid Shopify proxy signature"},{status:401}); }
 if (!proxy.session) return Response.json({error:"App proxy session unavailable"},{status:503});
 const shop = new URL(request.url).searchParams.get("shop") || "";
 if (shop !== process.env.SHOPIFY_SHOP_DOMAIN) return Response.json({error:"Shop not permitted"},{status:403});
 const now=Date.now();
 for(const [key,value] of counters) if(value.until<now) counters.delete(key);
 const previous=counters.get(shop) || {count:0,until:now+60000};
 if(previous.count>=60) return Response.json({error:"Please retry shortly"},{status:429});
 counters.set(shop,{count:previous.count+1,until:previous.until});
 let input:Record<string,unknown>;
 try {
  if(Number(request.headers.get("content-length") || 0)>4096) throw new Error("Too large");
  input=await request.json();
  if(!input || typeof input!=="object" || Array.isArray(input)) throw new Error("Invalid body");
 } catch {return Response.json({error:"Invalid request"},{status:400});}
 if(allowed.some(key=>typeof input[key]!=="string" || !String(input[key]).trim()))
  return Response.json({error:"Incomplete runner profile"},{status:400});
 if(Object.entries(allowedValues).some(([key,values])=>!values.includes(String(input[key]))))
  return Response.json({error:"Invalid profile value"},{status:400});
 if(!/^(?:[2-5][0-9])(?:\\.5)?$/.test(String(input.size)))
  return Response.json({error:"Invalid shoe size"},{status:400});
 try {
  const core=require(process.cwd()+"/app/lib/ai-advisor/shoe-finder-core.cjs").ValsportShoeFinderCore
   ?? (globalThis as any).ValsportShoeFinderCore;
  if(!core?.rankProducts) throw new Error("Shoe Finder core unavailable");
  const catalog=await getAdvisorCatalog(input.gender as "men"|"women");
  const answers={
   gender:input.gender,size:core.normalizeSize(input.size),
   weight:core.normalizeWeight(input.weight),usage:core.normalizeUsage(input.usage),
   support:core.normalizeSupport(input.support),distance:core.normalizeDistance(input.distance)
  };
  const ranked=core.rankProducts(catalog.map(core.normalizeProduct),answers);
  return Response.json({
   status:ranked.all.length?"success":"no_matches",totalMatches:ranked.all.length,
   products:ranked.all.slice(0,4).map((p:any,i:number)=>({
    rank:i+1,title:p.title,handle:p.handle,bucket:p.bucket,
    priceCents:p.price,technicalScore:p.score,reasons:p.labels,
    url:"/products/"+encodeURIComponent(p.handle)
   }))
  },{headers:{"Cache-Control":"no-store"}});
 } catch(error) {
  console.error("[AI_ADVISOR][PROXY]",error instanceof Error?error.message:"Unknown");
  return Response.json({error:"Advisor temporarily unavailable"},{status:503});
 }
}
