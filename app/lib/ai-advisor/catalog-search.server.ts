import { unauthenticated } from "../../shopify.server";

type Filters={category:string;gender?:string;size?:string;color?:string;features?:string};
const QUERY=`#graphql
query AdvisorSearch($query:String!,$after:String){
 products(first:40,after:$after,query:$query,sortKey:RELEVANCE){
  pageInfo{hasNextPage endCursor}
  nodes{handle title description productType tags featuredImage{url}
   variants(first:100){pageInfo{hasNextPage} nodes{id availableForSale price selectedOptions{name value}}}
  }
 }
}`;
const norm=(s:unknown)=>String(s||"").toLocaleLowerCase("it").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
const sizeMatch=(options:any[],size:string)=>options.some(o=>/taglia|size|misura/i.test(o.name)&&norm(o.value)===norm(size));
const colorMatch=(options:any[],color:string)=>options.some(o=>/colou?r|colore/i.test(o.name)&&norm(o.value).includes(norm(color)));
export async function searchAdvisorCatalog(filters:Filters){
 const shop=process.env.SHOPIFY_SHOP_DOMAIN;
 if(!shop)throw Error("Shop missing");
 const {admin}=await unauthenticated.admin(shop);
 const category=filters.category==="shorts"?"shorts":filters.category==="tops"?"tops":"accessories";
 const terms=category==="shorts"?["pantaloncini","shorts"]:category==="tops"?["maglia","t-shirt"]:["accessori"];
 const query=terms.map(t=>"title:"+t+"*").join(" OR ");
 const response=await admin.graphql(QUERY,{variables:{query}});
 const json:any=await response.json();
 if(json.errors?.length||!json.data?.products)throw Error("Catalog search failed");
 const out:any[]=[];
 for(const p of json.data.products.nodes){
  if(p.variants.pageInfo.hasNextPage)continue;
  const info=norm([p.title,p.productType,...(p.tags||[]),p.description].join(" "));
  const gender=norm(filters.gender);
  if(gender==="men"&&/\b(donna|women|femminile)\b/.test(info)&&!/\b(uomo|men|unisex|maschile)\b/.test(info))continue;
  if(gender==="women"&&/\b(uomo|men|maschile)\b/.test(info)&&!/\b(donna|women|unisex|femminile)\b/.test(info))continue;
  const variants=p.variants.nodes.filter((v:any)=>v.availableForSale&&(!filters.size||sizeMatch(v.selectedOptions,filters.size)));
  if(!variants.length)continue;
  let score=0;
  if(filters.color){const colors=norm(filters.color).split(",").map(x=>x.trim()).filter(Boolean);const matching=variants.filter((v:any)=>colors.some(c=>colorMatch(v.selectedOptions,c)));if(matching.length){score+=4;variants.splice(0,variants.length,...matching)}else if(colors.some(c=>info.includes(c)))score+=1;else continue}
  if(filters.features){const words=norm(filters.features).split(/[,\s]+/).filter(x=>x.length>4);score+=words.filter(w=>info.includes(w)).length}
  score+=terms.some(t=>norm(p.title).includes(norm(t)))?2:0;
  const v=variants[0];
  out.push({title:p.title,handle:p.handle,url:"/products/"+encodeURIComponent(p.handle),imageUrl:p.featuredImage?.url||"",priceCents:Math.round(Number(v.price)*100),size:filters.size||"",variantId:String(v.id).split("/").pop(),reasons:[],score});
 }
 return out.sort((a,b)=>b.score-a.score).slice(0,4).map(({score,...p})=>p);
}
