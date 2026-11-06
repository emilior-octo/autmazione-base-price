import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const allowed=new Set(["advisor_opened","advisor_message_sent","advisor_products_shown","advisor_product_clicked","product_viewed","product_added_to_cart","checkout_started","checkout_completed"]);
const uuid=/^[a-f0-9-]{36}$/i;
export async function action({request}:ActionFunctionArgs){
 if(request.method!=="POST")return Response.json({ok:false},{status:405});
 try{
  const auth=await authenticate.public.appProxy(request);
  if(!auth.session)return Response.json({ok:false},{status:503});
  const shop=new URL(request.url).searchParams.get("shop");
  if(!shop||shop!==process.env.SHOPIFY_SHOP_DOMAIN)return Response.json({ok:false},{status:403});
  const length=Number(request.headers.get("content-length")||"0");
  if(length>12000)return Response.json({ok:false},{status:413});
  const body=await request.json();
  const events=Array.isArray(body?.events)?body.events.slice(0,20):[body];
  let accepted=0;
  for(const event of events){
   if(!event||!allowed.has(event.type)||!uuid.test(event.visitorId||"")||!uuid.test(event.eventId||""))continue;
   const value=Number(event.value);
   try{
    await prisma.advisorAnalyticsEvent.create({data:{
     shop,eventId:event.eventId,visitorId:event.visitorId,eventType:event.type,
     productId:typeof event.productId==="string"?event.productId.slice(0,80):null,
     variantId:typeof event.variantId==="string"?event.variantId.slice(0,80):null,
     orderId:typeof event.orderId==="string"?event.orderId.slice(0,80):null,
     value:Number.isFinite(value)&&value>=0&&value<=1000000?value:null,
     currency:typeof event.currency==="string"&&/^[A-Z]{3}$/.test(event.currency)?event.currency:null
    }});
    accepted++;
   }catch(e){if((e as any)?.code!=="P2002")throw e;}
  }
  return Response.json({ok:true,accepted},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.warn("[ADVISOR EVENTS] rejected",error instanceof Error?error.name:"Unknown");return Response.json({ok:false},{status:400});}
}
