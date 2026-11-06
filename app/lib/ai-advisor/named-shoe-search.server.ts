import { unauthenticated } from "../../shopify.server";

const normalize=(s:string)=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const query=`#graphql
query AdvisorNamedShoes($search:String!,$sort:ProductSortKeys!,$reverse:Boolean!){
 products(first:60,query:$search,sortKey:$sort,reverse:$reverse){
 nodes{handle title vendor productType status featuredImage{url}
 variants(first:100){nodes{id availableForSale price selectedOptions{name value}}}
 }
 }
}`;
export async function searchNamedRunningShoes(input:{brand?:string;model?:string;latest?:boolean;size?:string}){
 const shop=process.env.SHOPIFY_SHOP_DOMAIN;
 if(!shop)throw Error("Shop missing");
 const {admin}=await unauthenticated.admin(shop);
 const brand=(input.brand||"").replace(/[^a-zA-Z0-9 -]/g,"").trim().slice(0,35);
 const model=(input.model||"").replace(/[^a-zA-Z0-9 .-]/g,"").trim().slice(0,60);
 if(!brand&&!model)return [];
 const search=[
  ...(brand?["vendor:"+JSON.stringify(brand)]:[]),
  ...(model?model.split(/\s+/).filter(Boolean).map(w=>"title:"+w+"*"):[])
 ].join(" AND ");
 const response=await admin.graphql(query,{variables:{search,sort:input.latest?"CREATED_AT":"RELEVANCE",reverse:Boolean(input.latest)}});
 const data:any=await response.json();
 if(data.errors?.length)throw Error("Shopify product search unavailable");
 const products=(data.data?.products?.nodes||[]).filter((p:any)=>{
  const title=normalize(p.title);
  if(model&&!normalize(model).split(" ").every(t=>title.includes(t)))return false;
  if(brand&&!normalize(brand).split(" ").every(t=>normalize(p.vendor+" "+p.title).includes(t)))return false;
  return p.status==="ACTIVE";
 });
 const results=[];
 for(const p of products){
  const variants=p.variants?.nodes||[];
  const available=variants.filter((v:any)=>v.availableForSale);
  if(!available.length)continue;
  const size=input.size?available.find((v:any)=>v.selectedOptions?.some((o:any)=>/tagli|size|misur|numero|eu/i.test(o.name)&&normalize(o.value)===normalize(input.size||""))):undefined;
  const v=size||available[0];
  results.push({title:p.title,handle:p.handle,url:"/products/"+encodeURIComponent(p.handle),imageUrl:p.featuredImage?.url||"",priceCents:Math.round(Number(v.price)*100),variantId:String(v.id).split("/").pop(),size:size?input.size||"":"",reasons:[...(input.size&&!size?["La taglia "+input.size+" non risulta disponibile: verifica le altre taglie"]:[])]});
 }
 return results.slice(0,8);
}
