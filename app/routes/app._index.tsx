import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { syncProductBasePrice } from "../lib/product-base-price.server";

const PRODUCTS_QUERY = `#graphql
  query ManualRunProducts($cursor: String) {
    products(first: 100, after: $cursor, sortKey: ID) {
      edges {
        cursor
        node {
          id
          title
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  let cursor: string | null = null;
  let hasNextPage = true;
  let processed = 0;

  while (hasNextPage) {
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: { cursor },
    });

    const json = await response.json();
    const products = json?.data?.products?.edges || [];
    hasNextPage = json?.data?.products?.pageInfo?.hasNextPage || false;

    for (const edge of products) {
      const productId = edge?.node?.id;
      if (!productId) continue;

      await syncProductBasePrice({
        admin,
        productId,
      });

      processed += 1;
      cursor = edge.cursor;
    }

    if (!products.length) {
      hasNextPage = false;
    }
  }

  return { ok: true, processed };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show(`Manual run completed: ${fetcher.data.processed} products processed`);
    }
  }, [fetcher.data, shopify]);

  const runManualSync = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Base price manual run">
      <s-button
        slot="primary-action"
        onClick={runManualSync}
        {...(isLoading ? { loading: true } : {})}
      >
        Run full catalog sync
      </s-button>

      <s-section heading="Manual rebuild">
        <s-paragraph>
          This runs the pricing metafield sync across the full catalog using the
          same logic used by the product webhooks.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button
            onClick={runManualSync}
            {...(isLoading ? { loading: true } : {})}
          >
            Run full catalog sync
          </s-button>
        </s-stack>

        {fetcher.data?.ok && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-paragraph>
              Completed. Products processed: {String(fetcher.data.processed)}
            </s-paragraph>
          </s-box>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};