import { unauthenticated } from "../../shopify.server";

export async function getAdvisorCustomerContext(verifiedCustomerId: string) {
  if (!/^\d{1,20}$/.test(verifiedCustomerId)) return null;
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shop) throw new Error("Shop not configured");
  let admin;
  try { ({ admin } = await unauthenticated.admin(shop)); }
  catch (error) { console.warn("[ADVISOR CUSTOMER] Admin session failed", error instanceof Error ? error.message.slice(0,180) : "Unknown"); throw new Error("Admin session unavailable"); }
  const ownerId = "gid://shopify/Customer/" + verifiedCustomerId;
  async function queryCustomer(fields: string) {
    try {
      const response = await admin.graphql(
        "query AdvisorCustomer($id: ID!) { customer(id: $id) { " + fields + " } }",
        { variables: { id: ownerId } }
      );
      const data: any = await response.json();
      if (data.errors?.length) throw new Error(data.errors.map((e: any) => e.extensions?.code || "GRAPHQL_ERROR").join(","));
      return data.data?.customer || null;
    } catch (error) {
      console.warn("[ADVISOR CUSTOMER] Query unavailable", error instanceof Error ? error.message.slice(0,120) : "Unknown");
      return null;
    }
  }
  const profileCustomer = await queryCustomer('metafield(namespace: "custom", key: "running_profile") { value }');
  const ordersCustomer = await queryCustomer('orders(first: 5, sortKey: CREATED_AT, reverse: true) { nodes { createdAt lineItems(first: 10) { nodes { title variantTitle quantity } } } }');
  if (!profileCustomer && !ordersCustomer) throw new Error("Customer data unavailable");
  const customer = profileCustomer || ordersCustomer;
  let profile: Record<string, string> | null = null;
  try {
    const raw = JSON.parse(profileCustomer?.metafield?.value || "null");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const keys = ["gender", "size", "weight", "usage", "support", "distance"];
      profile = Object.fromEntries(keys.filter(k => typeof raw[k] === "string")
        .map(k => [k, String(raw[k]).slice(0, 32)]));
    }
  } catch {}
  return {
    runnerProfile: profile,
    recentOrders: (ordersCustomer?.orders?.nodes || []).map((order: any) => ({
      date: String(order.createdAt || "").slice(0, 10),
      items: (order.lineItems?.nodes || []).map((line: any) => ({
        title: String(line.title || "").slice(0, 100),
        variant: String(line.variantTitle || "").slice(0, 60),
        quantity: Math.max(0, Math.min(100, Number(line.quantity) || 0)),
      })),
    })),
  };
}
