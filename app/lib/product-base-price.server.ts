import { PRODUCT_FOR_BASE_PRICE_QUERY } from "./graphql/product-for-base-price";
import { METAFIELDS_SET_MUTATION } from "./graphql/metafields-set";

type SyncArgs = {
  admin: any;
  productId: string;
};

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
  const response = await admin.graphql(PRODUCT_FOR_BASE_PRICE_QUERY, {
    variables: { id: productId },
  });

  const json = await response.json();
  const product = json?.data?.product;

  if (!product) return;

  const variants = product?.variants?.nodes || [];
  if (!variants.length) return;

  const referenceVariant = [...variants].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0)
  )[0];

  const { basePrice, discountPercentage } = computeValues({
    price: referenceVariant.price,
    compareAtPrice: referenceVariant.compareAtPrice,
  });

  const setResponse = await admin.graphql(METAFIELDS_SET_MUTATION, {
    variables: {
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
  });

  const setJson = await setResponse.json();
  const errors = setJson?.data?.metafieldsSet?.userErrors || [];

  if (errors.length) {
    throw new Error(`metafieldsSet error: ${JSON.stringify(errors)}`);
  }

  console.log("[base-price-sync] SET", {
    productId: product.id,
    basePrice,
    discountPercentage,
  });
}