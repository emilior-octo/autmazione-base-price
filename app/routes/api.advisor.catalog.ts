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
 } catch {
  return Response.json({error:"Catalog unavailable"}, {status:503});
 }
}
