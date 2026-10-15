import type { LoaderFunctionArgs } from "react-router";
import { getAdvisorCatalog } from "../lib/ai-advisor/catalog.server";

export async function loader({request}: LoaderFunctionArgs) {
 const secret = process.env.AI_ADVISOR_INTERNAL_SECRET;
 if (!secret || secret.length < 32) return Response.json({error:"Not configured"}, {status:503});
 const supplied = request.headers.get("x-advisor-internal-key");
 // Never accept credentials from URL query parameters.
 if (!supplied || supplied !== secret) return Response.json({error:"Unauthorized"}, {status:401});
 const gender = new URL(request.url).searchParams.get("gender");
 if (gender !== "men" && gender !== "women") return Response.json({error:"Invalid gender"}, {status:400});
 try {
  const products = await getAdvisorCatalog(gender);
  return Response.json({products}, {headers:{"Cache-Control":"no-store"}});
 } catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const category = message.includes("Missing Advisor Shopify configuration") ? "CONFIG_MISSING"
    : message.includes("Shopify catalog query failed") ? "GRAPHQL_QUERY_FAILED"
    : message.includes("Incomplete product variants") ? "VARIANT_PAGINATION"
    : message.includes("pagination failure") ? "COLLECTION_PAGINATION"
    : /offline session|session.*not found|session.*missing|not installed/i.test(message) ? "SHOPIFY_SESSION"
    : "SHOPIFY_CLIENT_OR_UNKNOWN";
  console.error("[AI_ADVISOR][CATALOG]", {gender, category, errorName: error instanceof Error ? error.name : "Unknown"});
  return Response.json({error:"Catalog unavailable"}, {status:503});
 }
}
