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

  await syncProductBasePrice({
    admin,
    productId,
  });

  return new Response("OK", { status: 200 });
};