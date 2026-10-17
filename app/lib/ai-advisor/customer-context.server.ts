import { unauthenticated } from "../../shopify.server";

export async function getAdvisorCustomerContext(verifiedCustomerId: string) {
  if (!/^\d{1,20}$/.test(verifiedCustomerId)) return null;
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) throw new Error("Shop not configured");
  let admin;
  try { ({ admin } = await unauthenticated.admin(shop)); }
  catch (error) { console.warn("[ADVISOR CUSTOMER] Admin session failed", error instanceof Error ? error.message.slice(0,180) : "Unknown"); throw new Error("Admin session unavailable"); }
  let response;
  try { response = await admin.graphql(`#graphql
    query AdvisorCustomerContext($id: ID!) {
      customer(id: $id) {
        metafield(namespace: "custom", key: "running_profile") { value }
        orders(first: 5, sortKey: CREATED_AT, reverse: true) {
          nodes {
            createdAt
            lineItems(first: 10) { nodes { title variantTitle quantity } }
          }
        }
      }
    }
  `, { variables: { id: "gid://shopify/Customer/" + verifiedCustomerId } }); }
  catch (error) { console.warn("[ADVISOR CUSTOMER] GraphQL request failed", error instanceof Error ? error.message.slice(0,180) : "Unknown"); throw new Error("GraphQL request unavailable"); }
  let json: any;
  try { json = await response.json(); }
  catch (error) { console.warn("[ADVISOR CUSTOMER] GraphQL response parse failed", error instanceof Error ? error.name : "Unknown"); throw new Error("GraphQL response invalid"); }
  if (json.errors?.length) { console.warn("[ADVISOR CUSTOMER] GraphQL errors", json.errors.map((e: any) => ({ code: e.extensions?.code || "UNKNOWN", path: e.path?.join(".") || "unknown" }))); throw new Error("Customer query failed or permissions missing"); }
  const customer = json.data?.customer;
  if (!customer) return null;
  let profile: Record<string, string> | null = null;
  try {
    const raw = JSON.parse(customer.metafield?.value || "null");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const keys = ["gender", "size", "weight", "usage", "support", "distance"];
      profile = Object.fromEntries(keys.filter(k => typeof raw[k] === "string")
        .map(k => [k, String(raw[k]).slice(0, 32)]));
    }
  } catch {}
  return {
    runnerProfile: profile,
    recentOrders: (customer.orders?.nodes || []).map((order: any) => ({
      date: String(order.createdAt || "").slice(0, 10),
      items: (order.lineItems?.nodes || []).map((line: any) => ({
        title: String(line.title || "").slice(0, 100),
        variant: String(line.variantTitle || "").slice(0, 60),
        quantity: Math.max(0, Math.min(100, Number(line.quantity) || 0)),
      })),
    })),
  };
}
