import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncProductBasePrice } from "../lib/product-base-price.server";

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

  // 🚀 FILTRO 1 — SOLO ACTIVE (direttamente da payload)
  if (payload?.status !== "active") {
    return new Response("Skip not active", { status: 200 });
  }

  // 🚀 FILTRO 2 — evita trigger inutili (opzionale ma potente)
  // Se Shopify non manda cambi rilevanti (es: solo inventory/altro)
  const hasPriceChange =
    payload?.variants?.some(
      (v: any) =>
        v.price !== undefined ||
        v.compare_at_price !== undefined
    ) || false;

  if (!hasPriceChange) {
    return new Response("Skip no price change", { status: 200 });
  }

  await syncProductBasePrice({
    admin,
    productId,
  });

  return new Response("OK", { status: 200 });
};