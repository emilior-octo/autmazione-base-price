import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { createRequire } from "node:module";
import { authenticate, unauthenticated } from "../shopify.server";
import { getAdvisorCustomerContext } from "../lib/ai-advisor/customer-context.server";


const require = createRequire(import.meta.url);
const {scoreTechnicalCompatibility}=require(process.cwd()+"/app/lib/ai-advisor/technical-compatibility.cjs");
const {genderEligibility}=require(process.cwd()+"/app/lib/ai-advisor/product-gender.cjs");
const required = ["gender","size","weight","usage","support","distance"] as const;
const allowed: Record<string,string[]> = {
  gender:["men","women"],usage:["daily","long-distance","speed","race","trail"],
  support:["neutral","stability","supination","unknown"],
  weight:["under-60","60-75","76-90","over-90"],distance:["0-5","5-10","10-20","20-plus"]
};
const headers={"Cache-Control":"private, no-store"};

const productQuery=`#graphql
 query CompatibilityProducts($ids:[ID!]!){
  nodes(ids:$ids){... on Product {
   id handle tags
   support:metafield(namespace:"custom",key:"finder_support"){type value}
   usage:metafield(namespace:"custom",key:"finder_usage"){type value}
   weight:metafield(namespace:"custom",key:"finder_weight_range"){type value}
   distance:metafield(namespace:"custom",key:"finder_distance_range"){type value}
   excluded:metafield(namespace:"custom",key:"finder_exclude"){value}
   variants(first:100){pageInfo{hasNextPage}nodes{availableForSale selectedOptions{name value}}}
  }}
 }`;
function metafield(field:any):unknown{
 if(!field?.value)return null;
 if(field.type?.startsWith("list.")){try{return JSON.parse(field.value)}catch{return null}}
 return field.value;
}
async function getVisibleShoes(admin:any,ids:string[]){
 const products:any[]=[];
 for(let offset=0;offset<ids.length;offset+=10){
  const batch=ids.slice(offset,offset+10);
  const response=await admin.graphql(productQuery,{variables:{ids:batch.map(id=>"gid://shopify/Product/"+id)}});
  const data:any=await response.json();
  if(data.errors?.length||!Array.isArray(data.data?.nodes))throw Error("PRODUCT_QUERY_FAILED");
  for(const product of data.data.nodes){
   if(!product||product.variants?.pageInfo?.hasNextPage)continue;
   const sizes=product.variants?.nodes?.filter((v:any)=>v.availableForSale).map((v:any)=>{
    const opts=v.selectedOptions||[];
    const size=opts.find((o:any)=>/taglia|size|misura|numero/i.test(o.name||""))
      ||opts.find((o:any)=>/^(?:[2-5][0-9])(?:[.,]5)?(?:\s*(?:EU|EUR))?$/i.test(String(o.value||"").trim()));
    return String(size?.value||"").replace(",",".").replace(/\s*(?:EU|EUR)\b/gi,"").trim();
   }).filter(Boolean)||[];
   products.push({
    id:String(product.id).split("/").pop(),handle:product.handle,tags:product.tags,
    support:metafield(product.support),usage:metafield(product.usage),
    weight_range:metafield(product.weight),distance_range:metafield(product.distance),
    excluded:product.excluded?.value==="true",priority:0,price:0,
    sizes_available:sizes
   });
  }
 }
 return products;
}


async function scoreRequest(request:Request, guestProfile?:Record<string,string>) {
  let proxy:Awaited<ReturnType<typeof authenticate.public.appProxy>>;
  try { proxy=await authenticate.public.appProxy(request); }
  catch { return Response.json({status:"unauthorized",scores:{}},{status:401,headers}); }
  const params=new URL(request.url).searchParams;
  if(!proxy.session || params.get("shop")!==process.env.SHOPIFY_SHOP_DOMAIN)
    return Response.json({status:"unavailable",scores:{}},{status:403,headers});
  // This value is injected and signed by Shopify App Proxy. No client-supplied
  // identity, email or profile is trusted.
  const id=params.get("logged_in_customer_id");
  if(!guestProfile && (!id || !/^\d{1,20}$/.test(id)))
    return Response.json({status:"login_required",scores:{}},{headers});
  const ids=(params.get("ids")||"").split(",").filter(x=>/^\d{1,20}$/.test(x)).slice(0,guestProfile?20:40);
  if(!ids.length) return Response.json({status:"success",scores:{}},{headers});
  let stage="admin_session";
  try {
    const {admin}=await unauthenticated.admin(process.env.SHOPIFY_SHOP_DOMAIN!);
    stage="read_profile";
    // Reuse the same verified Shopify customer-context reader as the working chat.
    const profile=guestProfile || (await getAdvisorCustomerContext(id!))?.runnerProfile;
    if(!profile || required.some(k=>typeof profile[k]!=="string"||!profile[k].trim())
      || Object.entries(allowed).some(([k,values])=>!values.includes(profile[k]))
      || !/^(?:[2-5][0-9])(?:\.5)?$/.test(profile.size))
      return Response.json({status:"profile_incomplete",scores:{}},{headers});
    stage="load_engine";
    const engineModule=require(process.cwd()+"/app/lib/ai-advisor/shoe-finder-core.cjs");
    const core=engineModule.ValsportShoeFinderCore ?? (globalThis as any).ValsportShoeFinderCore;
    if(!core?.rankProducts)throw Error("Missing finder engine");
    // Evaluate actual storefront products, not just the two Finder discovery collections.
    stage="fetch_products";
    const catalog=await getVisibleShoes(admin,ids);
    const answers={
      gender:profile.gender,size:core.normalizeSize(profile.size),
      weight:core.normalizeWeight(profile.weight),usage:core.normalizeUsage(profile.usage),
      support:core.normalizeSupport(profile.support),distance:core.normalizeDistance(profile.distance)
    };
    stage="rank_products";
    // Card score measures technical suitability, NOT stock availability.
    // The Shoe Finder recommender still enforces actual available sizes.
    const normalized=catalog.map((p:any)=>core.normalizeProduct(p));
    const wanted=new Set(ids);
    const catalogIds=new Set(catalog.map((p:any)=>String(p.id||"").split("/").pop()));
    const scores:Record<string,{percentage:number;reasons:string[]}>={};
    const unavailable:Record<string,string>={};
    let technicalCoverage=0;
    let currentlyAvailableSize=0;
    for(const item of normalized){
      const productId=String(item.id||"").split("/").pop()||"";
      if(!wanted.has(productId))continue;
      if(item.excluded){unavailable[productId]='excluded_by_finder';continue;}
      const department=genderEligibility(catalog.find(p=>String(p.id)===productId)?.tags,answers.gender);
      if(!department.eligible){unavailable[productId]=department.reason;continue;}
      const missing=['support','usage','weight_range','distance_range'].filter(key=>!item[key]?.length);
      if(missing.length){unavailable[productId]='missing_'+missing.join('_');continue;}
      technicalCoverage++;
      const sizeMatch=core.getSizeCompatibility(item.sizes_available,answers.size);
      if(sizeMatch.isCompatible)currentlyAvailableSize++;
      scores[productId]=scoreTechnicalCompatibility(core,item,answers);
    }
    for(const id of ids)if(!catalogIds.has(id))unavailable[id]='not_found_in_shopify';
    return Response.json({status:"success",scores,unavailable,diagnostics:{requested:ids.length,foundInShopify:ids.filter(x=>catalogIds.has(x)).length,technicallyScored:Object.keys(scores).length,technicalCoverage,availableInCustomerSize:currentlyAvailableSize}},{headers});
  }catch(error){
    console.error("[ADVISOR COMPATIBILITY]",{stage,message:error instanceof Error?error.message:"Unknown"});
    // Shopify App Proxy can substitute a generic HTML 500 for upstream 5xx.
    // Keep failures structured and non-personal so mobile QA can identify the stage.
    return Response.json({status:"unavailable",stage,scores:{}},{headers});
  }
}

/** Authenticated Shopify customers still use their saved profile through GET.
 * Guests may preview technical scores from a validated session-only profile.
 * This action never writes a guest profile to Shopify or Klaviyo.
 */
export async function loader({request}:LoaderFunctionArgs) {
  return scoreRequest(request);
}
export async function action({request}:ActionFunctionArgs) {
  if(request.method!=="POST")return Response.json({status:"method_not_allowed",scores:{}},{status:405,headers});
  let data:any;
  try {
    if(Number(request.headers.get("content-length")||0)>1500)throw Error("Too large");
    data=await request.json();
  }catch{return Response.json({status:"invalid_profile",scores:{}},{status:400,headers})}
  const source=data?.profile;
  if(!source||typeof source!=="object"||Array.isArray(source)||
    Object.entries(allowed).some(([k,values])=>typeof source[k]!=="string"||!values.includes(source[k]))||
    !/^(?:[2-5][0-9])(?:\\.5)?$/.test(String(source.size)))
    return Response.json({status:"invalid_profile",scores:{}},{status:400,headers});
  const profile=Object.fromEntries(required.map(key=>[key,source[key]])) as Record<string,string>;
  // The score request itself enforces Shopify's signed App Proxy.
  return scoreRequest(request,profile);
}
