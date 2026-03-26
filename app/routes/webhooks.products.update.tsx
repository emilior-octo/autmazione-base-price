import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncProductBasePrice } from "../lib/product-base-price.server";

// 🧠 cache in-memory
const recentProducts = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000; // 5 secondi

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, payload, admin } = await authenticate.webhook(request);

  if (!admin) {
    return new Response("No admin client", { status: 401 });
  }

  if (topic !== "PRODUCTS_UPDATE") {
    return new Response("Unhandled topic", { status: 200 });
  }

  const productId = payload?.admin_graphql_api_id;

  if (!productId) {
    return new Response("Missing product id", { status: 200 });
  }

  // 🚀 SOLO ACTIVE
  if (payload?.status !== "active") {
    return new Response("Skip not active", { status: 200 });
  }

  // 🚀 DEDUP LOGIC
  const now = Date.now();
  const lastRun = recentProducts.get(productId);

  if (lastRun && now - lastRun < DEDUP_WINDOW_MS) {
    return new Response("Skip dedup", { status: 200 });
  }

  // salva timestamp
  recentProducts.set(productId, now);

  // cleanup leggero (evita memory leak)
  if (recentProducts.size > 1000) {
    for (const [key, ts] of recentProducts) {
      if (now - ts > DEDUP_WINDOW_MS) {
        recentProducts.delete(key);
      }
    }
  }

  await syncProductBasePrice({
    admin,
    productId,
  });

  return new Response("OK", { status: 200 });
};