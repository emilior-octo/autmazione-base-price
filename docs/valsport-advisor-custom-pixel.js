// Shopify Custom Pixel — Valsport Running
// Configure under Settings > Customer events.
// Requires storefront to publish "valsport_advisor" with visitorId.
const endpoint="/apps/running-advisor/events";
let visitorId=null;

const uuid=/^[a-f0-9-]{36}$/i;
const newId=()=>"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
 const n=Math.floor(Math.random()*16);return(c==="x"?n:(n&3|8)).toString(16);
});
async function send(type,data,source){
 if(!uuid.test(visitorId||""))return;
 const href=source?.context?.document?.location?.href||init?.context?.document?.location?.href;
 if(!href)return;
 const origin=new URL(href).origin;
 const event={eventId:uuid.test(data?.eventId||"")?data.eventId:newId(),visitorId,type,
  productId:data?.productId?String(data.productId).slice(0,80):undefined,
  variantId:data?.variantId?String(data.variantId).slice(0,80):undefined,
  orderId:data?.orderId?String(data.orderId).slice(0,80):undefined,
  value:data?.value,currency:data?.currency};
 try{await fetch(origin+endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(event),keepalive:true})}catch(_){}
}
analytics.subscribe("valsport_advisor",async event=>{
 const data=event.customData||{};
 if(!uuid.test(data.visitorId||""))return;
 visitorId=data.visitorId;
 await browser.localStorage.setItem("valsport_advisor_visitor",JSON.stringify({id:visitorId,expires:Date.now()+86400000}));
 if(["advisor_opened","advisor_message_sent","advisor_products_shown","advisor_product_clicked","advisor_add_to_cart"].includes(data.action))
  await send(data.action,data,event);
});

analytics.subscribe("product_added_to_cart",async event=>{
 if(!visitorId){try{const saved=JSON.parse(await browser.localStorage.getItem("valsport_advisor_visitor")||"null");if(saved?.expires>Date.now())visitorId=saved.id;}catch(_){}}
 await send("product_added_to_cart",{productId:event.data?.cartLine?.merchandise?.product?.id},event);
});
analytics.subscribe("checkout_completed",async event=>{
 if(!visitorId){try{const saved=JSON.parse(await browser.localStorage.getItem("valsport_advisor_visitor")||"null");if(saved?.expires>Date.now())visitorId=saved.id;}catch(_){}}
 await send("checkout_completed",{orderId:event.data?.checkout?.order?.id},event);
});
