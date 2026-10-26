import { unauthenticated } from "../../shopify.server";

type Filters={brand?:string;size?:string;maxPrice?:number;sort?:"newest"|"deals"|"price";outlet?:boolean;newOnly?:boolean;productType?:string};
const QUERY=`#graphql
query AdvisorCommercial($query:String!,$after:String,$sort:ProductSortKeys!,$reverse:Boolean!){
 products(first:50,after:$after,query:$query,sortKey:$sort,reverse:$reverse){
  pageInfo{hasNextPage endCursor}
  nodes{handle title vendor productType tags createdAt featuredImage{url} collections(first:100){nodes{handle}}
   variants(first:100){pageInfo{hasNextPage} nodes{id availableForSale price compareAtPrice selectedOptions{name value}}}
  }
 }
}`;
const clean=(value:unknown)=>String(value??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
const shoe=(p:any)=>/scarpe|shoes|running|trail|sneaker|calzature/i.test([p.productType,p.title,...(p.tags||[])].join(" "))&&!/maglia|shirt|pantalon|shorts|calzini|sock|accessor/i.test([p.productType,p.title].join(" "));
const inCollection=(p:any,part:string)=>p.collections?.nodes?.some((c:any)=>clean(c.handle).includes(part))===true;
const sizeMatch=(v:any,size:string)=>v.selectedOptions?.some((o:any)=>/tagli|size|misur|numero|eu/i.test(o.name)&&clean(o.value).replace(",",".").replace(/\s*(eu|eur)$/,"")===clean(size).replace(",",".").replace(/\s*(eu|eur)$/,""));
export async function searchCommercialShoes(filters:Filters){
 const shop=process.env.SHOPIFY_SHOP_DOMAIN;if(!shop)throw Error("Shop unavailable");
 const {admin}=await unauthenticated.admin(shop);
 const brand=String(filters.brand||"").trim().slice(0,40);
 const query=brand?'vendor:"'+brand.replace(/["\\]/g,"")+'"':"status:active";
 const sort=filters.sort==="newest"?"CREATED_AT":"RELEVANCE";
 const products:any[]=[];let after:string|null=null;
 for(let i=0;i<5;i++){
  const response=await admin.graphql(QUERY,{variables:{query,after,sort,reverse:filters.sort==="newest"}});
  const json:any=await response.json();
  if(json.errors?.length||!json.data?.products)throw Error("Commercial catalog unavailable");
  products.push(...json.data.products.nodes);
  if(!json.data.products.pageInfo.hasNextPage)break;
  after=json.data.products.pageInfo.endCursor;if(!after)break;
 }
 const results:any[]=[];
 for(const p of products){
  if(!shoe(p)||p.variants?.pageInfo?.hasNextPage)continue;
  if(filters.productType&&clean(p.productType)!==clean(filters.productType))continue;
  if(filters.newOnly&&!inCollection(p,"new"))continue;
  if(brand&&clean(p.vendor)!==clean(brand))continue;
  const variants=p.variants.nodes.filter((v:any)=>v.availableForSale&&Number.isFinite(Number(v.price)));
  const sized=filters.size?variants.filter((v:any)=>sizeMatch(v,filters.size!)):variants;
  if(!sized.length)continue;
  const budget=Number(filters.maxPrice);
  const eligible=Number.isFinite(budget)&&budget>0?sized.filter((v:any)=>Number(v.price)<=budget):sized;
  if(!eligible.length)continue;
  if(filters.outlet&&!inCollection(p,"outlet"))continue;
  const ranked=eligible.slice().sort((a:any,b:any)=>{
   if(filters.sort==="deals"||filters.outlet)return (Number(b.compareAtPrice||b.price)-Number(b.price))-(Number(a.compareAtPrice||a.price)-Number(a.price));
   return Number(a.price)-Number(b.price);
  });
  const v=ranked[0];
  results.push({title:p.title,handle:p.handle,url:"/products/"+encodeURIComponent(p.handle),imageUrl:p.featuredImage?.url||"",priceCents:Math.round(Number(v.price)*100),variantId:String(v.id).split("/").pop(),size:filters.size||"",reasons:[...(Number(v.compareAtPrice)>Number(v.price)?["Prezzo scontato"]:[]),...(inCollection(p,"outlet")?["In collezione Outlet"]:[]),...(inCollection(p,"new")?["In collezione Novità"]:[])] ,createdAt:p.createdAt,discount:Number(v.compareAtPrice||v.price)-Number(v.price)});
 }
 if(filters.sort==="newest")results.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 else if(filters.sort==="deals"||filters.outlet)results.sort((a,b)=>b.discount-a.discount);
 else results.sort((a,b)=>a.priceCents-b.priceCents);
 return results.slice(0,8).map(({createdAt,discount,...item})=>item);
}
