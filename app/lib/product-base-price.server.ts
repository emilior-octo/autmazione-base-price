import { PRODUCT_FOR_BASE_PRICE_QUERY } from "./graphql/product-for-base-price";
import { METAFIELDS_SET_MUTATION } from "./graphql/metafields-set";

type Variant = {
  id: string;
  price: string;
  compareAtPrice: string | null;
};

export async function syncProductBasePrice(admin: any, productId: string) {
  try {
    const response = await admin.graphql(PRODUCT_FOR_BASE_PRICE_QUERY, {
      variables: { id: productId },
    });

    const json = await response.json();

    const product = json?.data?.product;

    if (!product) return;

    // 🚫 SOLO ACTIVE
    if (product.status !== "ACTIVE") {
      console.log("[base-price-sync] SKIP NOT ACTIVE", {
        productId,
        status: product.status,
      });
      return;
    }

    const variants: Variant[] = product.variants?.nodes || [];
    if (!variants.length) return;

    // prendiamo prima variante (ok per il tuo use case)
    const v = variants[0];

    const price = parseFloat(v.price || "0");
    const compareAt = parseFloat(v.compareAtPrice || "0");

    let basePrice = 0;
    let discountPercentage = 0;

    if (compareAt > 0) {
      basePrice = compareAt;

      if (compareAt > price && price > 0) {
        discountPercentage = ((compareAt - price) / compareAt) * 100;
      }
    } else {
      basePrice = price;
    }

    // normalizzazione
    const basePriceStr = basePrice.toFixed(2);
    const discountInt = Math.round(discountPercentage); // INTEGER!

    const existingBase =
      product.basePriceMetafield?.value
        ? parseFloat(product.basePriceMetafield.value)
        : null;

    const existingDiscount =
      product.discountPercentageMetafield?.value
        ? parseInt(product.discountPercentageMetafield.value)
        : null;

    // 🧠 NO-OP WRITE (STOP LOOP)
    const baseUnchanged =
      existingBase !== null &&
      Math.abs(existingBase - basePrice) < 0.01;

    const discountUnchanged =
      existingDiscount !== null &&
      existingDiscount === discountInt;

    if (baseUnchanged && discountUnchanged) {
      console.log("[base-price-sync] SKIP NO CHANGE", {
        productId,
      });
      return;
    }

    console.log("[base-price-sync] SET", {
      productId,
      basePrice: basePriceStr,
      discountPercentage: discountInt,
    });

    const mutationRes = await admin.graphql(METAFIELDS_SET_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: "pricing",
            key: "base_price",
            type: "number_decimal",
            value: basePriceStr,
          },
          {
            ownerId: productId,
            namespace: "pricing",
            key: "discount_percentage",
            type: "number_integer",
            value: discountInt.toString(),
          },
        ],
      },
    });

    const mutationJson = await mutationRes.json();

    const userErrors = mutationJson?.data?.metafieldsSet?.userErrors;

    if (userErrors?.length) {
      console.error("metafieldsSet userErrors:", userErrors);
    }
  } catch (error: any) {
    console.error("[base-price-sync] ERROR", error);
  }
}