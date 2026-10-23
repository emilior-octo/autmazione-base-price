import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import {authenticate,unauthenticated} from "../shopify.server";

const headers={"Cache-Control":"private, no-store"};
async function context(request:Request) {
 const auth=await authenticate.public.appProxy(request);
 const q=new URL(request.url).searchParams;
 const id=q.get("logged_in_customer_id");
 if(!auth.session||q.get("shop")!==process.env.SHOPIFY_SHOP_DOMAIN||!id||!/^\d{1,20}$/.test(id)) return null;
 const {admin}=await unauthenticated.admin(process.env.SHOPIFY_SHOP_DOMAIN!);
 return {admin,id,ownerId:"gid://shopify/Customer/"+id};
}
export async function loader({request}:LoaderFunctionArgs) {
 let c;try{c=await context(request)}catch{return Response.json({status:"unavailable"},{status:503,headers})}
 if(!c)return Response.json({status:"login_required"},{headers});
 try {
  const response=await c.admin.graphql(`#graphql
    query AdvisorConsent($id:ID!){customer(id:$id){
      emailMarketingConsent{marketingState consentUpdatedAt}
      metafield(namespace:"custom",key:"running_marketing_decision"){value}
    }}`,{variables:{id:c.ownerId}});
  const payload:any=await response.json();
  const customer=payload.data?.customer;
  if(payload.errors?.length||!customer)throw new Error("Customer query failed");
  const state=customer.emailMarketingConsent?.marketingState;
  const decision=customer.metafield?.value;
  // Only prompt where Shopify has no saved choice (including no consent timestamp).
  const hasChoice=state==="SUBSCRIBED"||state==="PENDING"||
    Boolean(customer.emailMarketingConsent?.consentUpdatedAt)||decision==="declined"||decision==="accepted";
  // UNSUBSCRIBED without a decision timestamp is not proof that the customer
  // explicitly refused: Shopify can use this as the initial default state.
  return Response.json({status:"success",askMarketing:!hasChoice,marketingState:state||"UNKNOWN"},{headers});
 }catch{return Response.json({status:"unavailable"},{status:503,headers})}
}
export async function action({request}:ActionFunctionArgs) {
 if(request.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers});
 let c;try{c=await context(request)}catch{return Response.json({status:"unavailable"},{status:503,headers})}
 if(!c)return Response.json({status:"login_required",code:"AUTH_REQUIRED"},{status:401,headers});
 let body:any;try{body=await request.json()}catch{return Response.json({error:"Invalid request"},{status:400,headers})}
 if(body?.choice!=="accept"&&body?.choice!=="decline")return Response.json({error:"Invalid choice"},{status:400,headers});
 try{
  // A decline only records that we asked. It does not modify Shopify marketing status.
  if(body.choice==="decline"){
    const response=await c.admin.graphql(`#graphql mutation AdvisorDecline($fields:[MetafieldsSetInput!]!){
      metafieldsSet(metafields:$fields){metafields{id}userErrors{message}}
    }`,{variables:{fields:[{ownerId:c.ownerId,namespace:"custom",key:"running_marketing_decision",type:"single_line_text_field",value:"declined"}]}});
    const result:any=await response.json();
    if(result.errors?.length||result.data?.metafieldsSet?.userErrors?.length||!result.data?.metafieldsSet?.metafields?.length){
      console.error("[ADVISOR CONSENT] Decline GraphQL",JSON.stringify({errors:result.errors?.map((e:any)=>e.message),userErrors:result.data?.metafieldsSet?.userErrors}).slice(0,650));
      throw new Error("DECLINE_WRITE_FAILED");
    }
  }else{
    const response=await c.admin.graphql(`#graphql mutation AdvisorOptIn($input:CustomerEmailMarketingConsentUpdateInput!){
      customerEmailMarketingConsentUpdate(input:$input){customer{id}userErrors{message}}
    }`,{variables:{input:{customerId:c.ownerId,emailMarketingConsent:{marketingState:"SUBSCRIBED",marketingOptInLevel:"SINGLE_OPT_IN"}}}});
    const result:any=await response.json();
    if(result.errors?.length||result.data?.customerEmailMarketingConsentUpdate?.userErrors?.length||!result.data?.customerEmailMarketingConsentUpdate?.customer){
      console.error("[ADVISOR CONSENT] Opt-in GraphQL",JSON.stringify({errors:result.errors?.map((e:any)=>e.message),userErrors:result.data?.customerEmailMarketingConsentUpdate?.userErrors}).slice(0,650));
      throw new Error("OPT_IN_WRITE_FAILED");
    }
  }
  return Response.json({status:"success"},{headers});
 }catch(e){console.error("[ADVISOR CONSENT]",e instanceof Error?e.message:"Unknown");return Response.json({status:"unavailable",code:e instanceof Error?e.message:"WRITE_FAILED"},{status:503,headers})}
}
