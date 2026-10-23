import type { LoaderFunctionArgs } from "react-router";
import { createRequire } from "node:module";
import { authenticate, unauthenticated } from "../shopify.server";
import { getAdvisorCatalog } from "../lib/ai-advisor/catalog.server";

const require = createRequire(import.meta.url);
const required = ["gender","size","weight","usage","support","distance"] as const;
const allowed: Record<string,string[]> = {
  gender:["men","women"],usage:["daily","long-distance","speed","race","trail"],
  support:["neutral","stability","supination","unknown"],
  weight:["under-60","60-75","76-90","over-90"],distance:["0-5","5-10","10-20","20-plus"]
};
const headers={"Cache-Control":"private, no-store"};

export async function loader({request}:LoaderFunctionArgs) {
  let proxy:Awaited<ReturnType<typeof authenticate.public.appProxy>>;
  try { proxy=await authenticate.public.appProxy(request); }
  catch { return Response.json({status:"unauthorized",scores:{}},{status:401,headers}); }
  const params=new URL(request.url).searchParams;
  if(!proxy.session || params.get("shop")!==process.env.SHOPIFY_SHOP_DOMAIN)
    return Response.json({status:"unavailable",scores:{}},{status:403,headers});
  // This value is injected and signed by Shopify App Proxy. No client-supplied
  // identity, email or profile is trusted.
  const id=params.get("logged_in_customer_id");
  if(!id || !/^\d{1,20}$/.test(id))
    return Response.json({status:"login_required",scores:{}},{headers});
  const ids=(params.get("ids")||"").split(",").filter(x=>/^\d{1,20}$/.test(x)).slice(0,40);
  if(!ids.length) return Response.json({status:"success",scores:{}},{headers});
  try {
    const {admin}=await unauthenticated.admin(process.env.SHOPIFY_SHOP_DOMAIN!);
    const resp=await admin.graphql(`#graphql
      query RunnerCompatibilityProfile($id:ID!){
        customer(id:$id){metafield(namespace:"custom",key:"running_profile"){value}}
      }`,{variables:{id:"gid://shopify/Customer/"+id}});
    const data:any=await resp.json();
    const raw=data.data?.customer?.metafield?.value;
    const profile=raw?JSON.parse(raw):null;
    if(!profile || required.some(k=>typeof profile[k]!=="string"||!profile[k].trim())
      || Object.entries(allowed).some(([k,values])=>!values.includes(profile[k]))
      || !/^(?:[2-5][0-9])(?:\.5)?$/.test(profile.size))
      return Response.json({status:"profile_incomplete",scores:{}},{headers});
    const core=require(process.cwd()+"/app/lib/ai-advisor/shoe-finder-core.cjs").ValsportShoeFinderCore;
    if(!core?.rankProducts) throw new Error("Missing finder engine");
    const catalog=await getAdvisorCatalog(profile.gender);
    const answers={
      gender:profile.gender,size:core.normalizeSize(profile.size),
      weight:core.normalizeWeight(profile.weight),usage:core.normalizeUsage(profile.usage),
      support:core.normalizeSupport(profile.support),distance:core.normalizeDistance(profile.distance)
    };
    const ranked=core.rankProducts(catalog.map(core.normalizeProduct),answers);
    const wanted=new Set(ids);
    const scores:Record<string,{percentage:number;reasons:string[]}>={};
    for(const item of ranked.all){
      const productId=String(item.id||"").split("/").pop()||"";
      if(!wanted.has(productId) || item.bucket!=="primary") continue;
      // Technical-only percentage: usage 35 + distance 18 + weight 12 = 65.
      // Size is a compatibility gate. Merchant priority and price are excluded.
      if(!item.usage?.length || !item.distance_range?.length || !item.weight_range?.length || !item.support?.length) continue;
      const b=item.bucket_score||{};
      const technical=(Number(b.usage)||0)+(Number(b.distance)||0)+(Number(b.weight)||0);
      scores[productId]={percentage:Math.max(0,Math.min(100,Math.round(technical/65*100))),reasons:Array.isArray(item.labels)?item.labels.filter((x:unknown)=>typeof x==="string").slice(0,2):[]};
    }
    return Response.json({status:"success",scores,diagnostics:{requested:ids.length,inFinderCatalog:ids.filter(x=>catalogIds.has(x)).length,scored:Object.keys(scores).length}},{headers});
  }catch(error){
    console.error("[ADVISOR COMPATIBILITY]",error instanceof Error?error.name:"Unknown");
    return Response.json({status:"unavailable",scores:{}},{status:503,headers});
  }
}
