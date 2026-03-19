export const METAFIELDS_DELETE_MUTATION = `#graphql
  mutation DeleteProductBasePrice($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields {
        ownerId
        namespace
        key
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;