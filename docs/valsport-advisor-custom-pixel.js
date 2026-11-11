// Shopify Custom Pixel — Valsport Running
// Configure under Settings > Customer events.
// Requires storefront to publish "valsport_advisor" with visitorId.
const endpoint="https://valsportrunning.com/apps/running-advisor/events";
let visitorId=null;

const uuid=/^[a-f0-9-]{36}$/i;
const newId=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
 const n=Math.floor(Math.random()*16);return(c==="x"?n:(n&3|8)).toString(16);
});
async function resolveVisitor(event){
 const attrs=event?.data?.checkout?.attributes||[];
 const cartId=attrs.find(a=>a?.key==="_valsport_advisor_visitor"||a?.key==="valsport_advisor_visitor")?.value;
 if(uuid.test(cartId||""))visitorId=cartId;
 if(!uuid.test(visitorId||"")){
  try{const saved=JSON.parse(await browser.localStorage.getItem("valsport_advisor_visitor")||"null");
   if(saved?.expires>Date.now()&&uuid.test(saved.id||""))visitorId=saved.id;
  }catch(_){}
 }
 if(!uuid.test(visitorId||""))console.warn("[Valsport Advisor Pixel] visitorId missing",event?.name,"checkout attributes",attrs.map(a=>a?.key));
 return uuid.test(visitorId||"");
}
async function send(type,data,source){
 if(!(await resolveVisitor(source)))return;
 const event={eventId:uuid.test(data?.eventId||"")?data.eventId:uuid.test(source?.id||"")?source.id:newId(),visitorId,type,
  productId:data?.productId?String(data.productId).slice(0,80):undefined,
  variantId:data?.variantId?String(data.variantId).slice(0,80):undefined,
  orderId:data?.orderId?String(data.orderId).slice(0,80):undefined,
  value:data?.value,currency:data?.currency};
 try{const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(event),keepalive:true});
  if(!response.ok)console.warn("[Valsport Advisor Pixel] HTTP",response.status,type);
  else console.info("[Valsport Advisor Pixel] delivered",type,await response.text());
 }catch(error){console.warn("[Valsport Advisor Pixel] send failed",type,String(error));}
}
analytics.subscribe("valsport_advisor",async event=>{
 const data=event.customData||{};
 if(!uuid.test(data.visitorId||""))return;
 visitorId=data.visitorId;
 await browser.localStorage.setItem("valsport_advisor_visitor",JSON.stringify({id:visitorId,expires:Date.now()+86400000}));
 // Storefront already sends Advisor events through the authenticated app proxy.
 // Do not duplicate them from this pixel.
});

analytics.subscribe("product_added_to_cart",async event=>{
 if(!visitorId){try{const saved=JSON.parse(await browser.localStorage.getItem("valsport_advisor_visitor")||"null");if(saved?.expires>Date.now())visitorId=saved.id;}catch(_){}}
 // Cart additions are not checkout events; do not use them as conversions.
});
analytics.subscribe("checkout_started",async event=>{
 if(!visitorId){try{const saved=JSON.parse(await browser.localStorage.getItem("valsport_advisor_visitor")||"null");if(saved?.expires>Date.now())visitorId=saved.id;}catch(_){}}
 await send("checkout_started",{value:event.data?.checkout?.totalPrice?.amount,currency:event.data?.checkout?.currencyCode},event);
});
analytics.subscribe("checkout_completed",async event=>{
 if(!visitorId){try{const saved=JSON.parse(await browser.localStorage.getItem("valsport_advisor_visitor")||"null");if(saved?.expires>Date.now())visitorId=saved.id;}catch(_){}}
 await send("checkout_completed",{orderId:event.data?.checkout?.order?.id,value:event.data?.checkout?.totalPrice?.amount,currency:event.data?.checkout?.currencyCode},event);
});
