import { PRODUCT_FOR_BASE_PRICE_QUERY } from "./graphql/product-for-base-price";
import { METAFIELDS_SET_MUTATION } from "./graphql/metafields-set";
import { METAFIELDS_DELETE_MUTATION } from "./graphql/metafields-delete";

type SyncArgs = {
  admin: any;
  productId: string;
};

function computeBasePriceDecision(input: {
  price: string | number | null;
  compareAtPrice: string | number | null;
}) {
  const price = Number(input.price ?? 0);
  const compareAtPrice = Number(input.compareAtPrice ?? 0);

  if (!price || price <= 0) {
    return { action: "DELETE" as const };
  }

  if (!compareAtPrice || compareAtPrice <= 0 || compareAtPrice <= price) {
    return { action: "SET" as const, value: price.toFixed(2) };
  }

  const discountPct = ((compareAtPrice - price) / compareAtPrice) * 100;

  if (discountPct < 30) {
    return { action: "SET" as const, value: compareAtPrice.toFixed(2) };
  }

  return { action: "SET" as const, value: "0.00" };
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

  const decision = computeBasePriceDecision({
    price: referenceVariant.price,
    compareAtPrice: referenceVariant.compareAtPrice,
  });

  if (decision.action === "SET") {
    const setResponse = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: product.id,
            namespace: "pricing",
            key: "base_price",
            type: "number_decimal",
            value: decision.value,
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
      value: decision.value,
    });

    return;
  }

  const deleteResponse = await admin.graphql(METAFIELDS_DELETE_MUTATION, {
    variables: {
      metafields: [
        {
          ownerId: product.id,
          namespace: "pricing",
          key: "base_price",
        },
      ],
    },
  });

  const deleteJson = await deleteResponse.json();
  console.log("[base-price-sync] DELETE RAW", JSON.stringify(deleteJson, null, 2));

  const errors = deleteJson?.data?.metafieldsDelete?.userErrors || [];

  if (errors.length) {
    throw new Error(`metafieldsDelete error: ${JSON.stringify(errors)}`);
  }

  console.log("[base-price-sync] DELETE", {
    productId: product.id,
    deletedMetafields: deleteJson?.data?.metafieldsDelete?.deletedMetafields,
  });
}