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

function normalizeCollectionGid(raw: string): string {
 const value = raw.trim();
 if (/^gid:\/\/shopify\/Collection\/\d+$/.test(value)) return value;
 if (/^\d+$/.test(value)) return `gid://shopify/Collection/${value}`;
 const match = value.match(/^https?:\/\/[^/]+\/store\/[^/]+\/collections\/(\d+)(?:[/?#]|$)/i)
  ?? value.match(/^https?:\/\/[^/]+\/admin\/collections\/(\d+)(?:[/?#]|$)/i);
 if (match) return `gid://shopify/Collection/${match[1]}`;
 throw new Error("Invalid Advisor collection ID configuration");
}

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
 const collectionGid = normalizeCollectionGid(collectionId);
 let admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"];
 try {
  ({admin} = await unauthenticated.admin(shop));
 } catch (error) {
  console.error("[AI_ADVISOR][SESSION]", {name: error instanceof Error ? error.name : "Unknown", message: error instanceof Error ? error.message.slice(0,240) : "Unknown"});
  throw new Error("Advisor Shopify offline session failed");
 }
 console.info("[AI_ADVISOR][STAGE]", {gender, stage:"session_ready"});
 const products: unknown[] = [];
 let after: string | null = null;
 const cursors = new Set<string>();
 for (;;) {
  let response: Response;
  try {
   response = await admin.graphql(QUERY, {variables: {id: collectionGid, after}});
  } catch (error) {
   console.error("[AI_ADVISOR][GRAPHQL]", {name: error instanceof Error ? error.name : "Unknown", message: error instanceof Error ? error.message.slice(0,240) : "Unknown"});
   throw new Error("Advisor Shopify GraphQL request failed");
  }
  console.info("[AI_ADVISOR][STAGE]", {gender, stage:"graphql_response_received"});
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
  console.info("[AI_ADVISOR][STAGE]", {gender, stage:"transform_start", count:page?.nodes?.length ?? null});
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
      .map((v: any) => {
        const options = v.selectedOptions || [];
        const size = options.find((o: any) => /taglia|size|misura|numero|eu size/i.test(o.name || ""));
        const fallback = options.find((o: any) => /^(?:[2-5][0-9])(?:[.,]5)?(?:\s*(?:EU|EUR))?$/i.test(String(o.value || "").trim()));
        return String((size || fallback)?.value || "");
      })
      .map((v: string) => v.replace(/,/g, ".").replace(/\s*EU\b|EUR\b/gi, "").trim()).filter(Boolean)
   });
  }
  if (!page.pageInfo.hasNextPage) break;
  after = page.pageInfo.endCursor;
  if (!after || cursors.has(after)) throw new Error("Shopify catalog pagination failure");
  cursors.add(after);
 }
 console.info("[AI_ADVISOR][STAGE]", {gender, stage:"complete", count:products.length});
 cache.set(gender, {products, expires: Date.now() + 60000});
 return products;
}
export function invalidateAdvisorCatalog() { cache.clear(); }
