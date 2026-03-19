export const PRODUCT_FOR_BASE_PRICE_QUERY = `#graphql
  query ProductForBasePrice($id: ID!) {
    product(id: $id) {
      id
      title
      metafield(namespace: "pricing", key: "base_price") {
        namespace
        key
        value
        type
      }
      variants(first: 10) {
        nodes {
          id
          title
          price
          compareAtPrice
          position
        }
      }
    }
  }
`;