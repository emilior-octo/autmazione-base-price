import { unauthenticated } from "../../shopify.server";

const QUERY = `#graphql
query AdvisorCatalog($id: ID!, $after: String) {
 collection(id: $id) {
  products(first: 100, after: $after) {
   pageInfo { hasNextPage endCursor }
   nodes {
    id handle title onlineStoreUrl featuredImage { url }
    support: metafield(namespace: "custom", key: "finder_support") { type value }
    usage: metafield(namespace: "custom", key: "finder_usage") { type value }
    weight: metafield(namespace: "custom", key: "finder_weight_range") { type value }
    distance: metafield(namespace: "custom", key: "finder_distance_range") { type value }
    priority: metafield(namespace: "custom", key: "finder_priority") { value }
    excluded: metafield(namespace: "custom", key: "finder_exclude") { value }
    variants(first: 250) {
     pageInfo { hasNextPage }
     nodes { availableForSale price compareAtPrice selectedOptions { name value } }
    }
   }
  }
 }
}`;

type Gender = "men" | "women";
const cache = new Map<Gender, {expires: number; products: unknown[]}>();
function field(v: {type?: string; value: string} | null) {
 if (!v) return null;
 return v.type?.startsWith("list.") ? JSON.parse(v.value) : v.value;
}
export async function getAdvisorCatalog(gender: Gender) {
 if (gender !== "men" && gender !== "women") throw new Error("Invalid gender");
 const cached = cache.get(gender);
 if (cached && cached.expires > Date.now()) return cached.products;
 const shop = process.env.SHOPIFY_SHOP_DOMAIN;
 const collectionId = gender === "men" ? process.env.VALSPORT_MEN_COLLECTION_GID : process.env.VALSPORT_WOMEN_COLLECTION_GID;
 if (!shop || !collectionId) throw new Error("Missing Advisor Shopify configuration");
 let admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];
 try {
  ({admin} = await unauthenticated.admin(shop));
 } catch (error) {
  console.error("[AI_ADVISOR][SESSION]", {name: error instanceof Error ? error.name : "Unknown", message: error instanceof Error ? error.message.slice(0,240) : "Unknown"});
  throw new Error("Advisor Shopify offline session failed");
 }
 const products: unknown[] = [];
 let after: string | null = null;
 const cursors = new Set<string>();
 for (;;) {
  let response: Response;
  try {
   response = await admin.graphql(QUERY, {variables: {id: collectionId, after}});
  } catch (error) {
   console.error("[AI_ADVISOR][GRAPHQL]", {name: error instanceof Error ? error.name : "Unknown", message: error instanceof Error ? error.message.slice(0,240) : "Unknown"});
   throw new Error("Advisor Shopify GraphQL request failed");
  }
  const json = await response.json() as any;
  if (json.errors?.length || !json.data?.collection) {
   console.error("[AI_ADVISOR][GRAPHQL_RESPONSE]", {
    errorCodes: (json.errors ?? []).map((e: any) => e.extensions?.code ?? "UNSPECIFIED"),
    messages: (json.errors ?? []).map((e: any) => String(e.message ?? "").slice(0,160)),
    collectionNull: json.data?.collection == null
   });
   throw new Error("Shopify catalog query failed");
  }
  const page = json.data.collection.products;
  for (const p of page.nodes) {
   if (p.variants.pageInfo.hasNextPage) throw new Error("Incomplete product variants: " + p.id);
   const first = p.variants.nodes.find((v: any) => v.availableForSale) ?? p.variants.nodes[0];
   products.push({
    id: String(p.id).split("/").pop(), handle: p.handle, title: p.title,
    url: p.onlineStoreUrl || `https://${shop}/products/${encodeURIComponent(p.handle)}`,
    image: p.featuredImage?.url || "",
    price: first ? Math.round(Number(first.price) * 100) : 0,
    compare_at_price: first?.compareAtPrice ? Math.round(Number(first.compareAtPrice) * 100) : null,
    support: field(p.support), usage: field(p.usage), weight_range: field(p.weight),
    distance_range: field(p.distance), priority: Number(field(p.priority) || 0),
    excluded: field(p.excluded) === "true",
    sizes_available: p.variants.nodes.filter((v: any) => v.availableForSale)
      .map((v: any) => v.selectedOptions[1]?.value || "")
      .map((v: string) => v.replace(/,/g, ".").replace(/\s*EU\b|EUR\b/gi, "").trim()).filter(Boolean)
   });
  }
  if (!page.pageInfo.hasNextPage) break;
  after = page.pageInfo.endCursor;
  if (!after || cursors.has(after)) throw new Error("Shopify catalog pagination failure");
  cursors.add(after);
 }
 cache.set(gender, {products, expires: Date.now() + 60000});
 return products;
}
export function invalidateAdvisorCatalog() { cache.clear(); }
