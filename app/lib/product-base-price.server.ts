import { PRODUCT_FOR_BASE_PRICE_QUERY } from "./graphql/product-for-base-price";
import { METAFIELDS_SET_MUTATION } from "./graphql/metafields-set";

type SyncArgs = {
  admin: any;
  productId: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottledError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("throttled");
}

async function graphqlWithRetry(
  admin: any,
  query: string,
  variables: Record<string, any>,
  attempts = 4,
) {
  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await admin.graphql(query, { variables });
    } catch (error: any) {
      lastError = error;

      if (!isThrottledError(error) || attempt === attempts) {
        throw error;
      }

      const waitMs = 800 * attempt;
      console.warn("[base-price-sync] THROTTLED RETRY", {
        attempt,
        waitMs,
      });

      await sleep(waitMs);
    }
  }

  throw lastError;
}

function computeValues(input: {
  price: string | number | null;
  compareAtPrice: string | number | null;
}) {
  const price = Number(input.price ?? 0);
  const compareAtPrice = Number(input.compareAtPrice ?? 0);

  let basePrice = price;
  let discountPercentage = 0;

  if (compareAtPrice && compareAtPrice > 0) {
    basePrice = compareAtPrice;

    if (compareAtPrice > price && price > 0) {
      discountPercentage = ((compareAtPrice - price) / compareAtPrice) * 100;
    }
  }

  return {
    basePrice: basePrice.toFixed(2),
    discountPercentage: discountPercentage.toFixed(2),
  };
}

export async function syncProductBasePrice({ admin, productId }: SyncArgs) {
  const response = await graphqlWithRetry(
    admin,
    PRODUCT_FOR_BASE_PRICE_QUERY,
    { id: productId },
    4,
  );

  const json = await response.json();
  const product = json?.data?.product;

  if (!product) return;

  const variants = product?.variants?.nodes || [];
  if (!variants.length) return;

  const referenceVariant = [...variants].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0),
  )[0];

  const { basePrice, discountPercentage } = computeValues({
    price: referenceVariant.price,
    compareAtPrice: referenceVariant.compareAtPrice,
  });

  const setResponse = await graphqlWithRetry(
    admin,
    METAFIELDS_SET_MUTATION,
    {
      metafields: [
        {
          ownerId: product.id,
          namespace: "pricing",
          key: "base_price",
          type: "number_decimal",
          value: basePrice,
        },
        {
          ownerId: product.id,
          namespace: "pricing",
          key: "discount_percentage",
          type: "number_decimal",
          value: discountPercentage,
        },
      ],
    },
    4,
  );

  const setJson = await setResponse.json();

  const topLevelErrors = setJson?.errors || [];
  if (topLevelErrors.length) {
    throw new Error(
      `metafieldsSet top-level error: ${JSON.stringify(topLevelErrors)}`,
    );
  }

  const errors = setJson?.data?.metafieldsSet?.userErrors || [];
  if (errors.length) {
    throw new Error(`metafieldsSet userErrors: ${JSON.stringify(errors)}`);
  }

  console.log("[base-price-sync] SET", {
    productId: product.id,
    basePrice,
    discountPercentage,
  });
}