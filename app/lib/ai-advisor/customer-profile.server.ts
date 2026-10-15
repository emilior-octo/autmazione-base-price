import { unauthenticated } from "../../shopify.server";

type Runner = Record<"gender"|"size"|"weight"|"usage"|"support"|"distance", string>;
export async function saveVerifiedRunnerProfile(customerId: string, profile: Runner) {
 if (!/^\\d+$/.test(customerId)) throw new Error("Invalid authenticated customer ID");
 const shop = process.env.SHOPIFY_SHOP_DOMAIN;
 if (!shop) throw new Error("Missing shop configuration");
 const {admin} = await unauthenticated.admin(shop);
 const ownerId = "gid://shopify/Customer/" + customerId;
 const query = `#graphql
 mutation SaveRunnerProfile($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
   metafields { id }
   userErrors { field message code }
  }
 }`;
 const response = await admin.graphql(query, {variables:{metafields:[{
  ownerId,namespace:"custom",key:"running_profile",type:"json",
  value:JSON.stringify({version:1,...profile,updatedAt:new Date().toISOString()})
 }]}});
 const data = await response.json() as any;
 if (data.errors?.length || data.data?.metafieldsSet?.userErrors?.length ||
     !data.data?.metafieldsSet?.metafields?.length) {
  throw new Error("Shopify customer metafield write failed");
 }
 return ownerId;
}
