/**
 * Running Advisor → Klaviyo. Server-side only; never expose private API keys
 * or use a browser-supplied list of recommended products.
 */
type Shoe = {
 productId: string | null;
 handle: string;
 title: string;
 url: string;
 imageUrl: string | null;
 priceCents: number;
 rank: number;
 technicalScore: number;
 reasons: unknown;
};
type Runner = Record<"gender"|"size"|"weight"|"usage"|"support"|"distance", string>;
export function buildRunningRecommendationsEvent(
 customer: {id: string; email: string},
 profile: Runner,
 products: Shoe[],
) {
 const updatedAt = new Date().toISOString();
 const recommendedProducts = products.slice(0, 4).map(p => ({
  product_id: p.productId,
  handle: p.handle,
  title: p.title,
  url: p.url,
  image_url: p.imageUrl,
  price: p.priceCents / 100,
  rank: p.rank,
  technical_score: p.technicalScore,
  reasons: p.reasons,
 }));
 return {
  metric: {name: "Running Recommendations Updated"},
  profile: {email: customer.email, external_id: customer.id},
  properties: {
   running_profile: profile,
   recommended_products: recommendedProducts,
   recommended_product_ids: recommendedProducts.map(p => p.product_id).filter(Boolean),
   recommended_product_handles: recommendedProducts.map(p => p.handle),
   recommendations_updated_at: updatedAt,
  },
  time: updatedAt,
 };
}
export async function sendRunningRecommendationsToKlaviyo(
 customer: {id: string; email: string},
 profile: Runner,
 products: Shoe[],
) {
 const key = process.env.KLAVIYO_PRIVATE_API_KEY;
 if (!key) throw new Error("KLAVIYO_PRIVATE_API_KEY is not configured");
 const event = buildRunningRecommendationsEvent(customer, profile, products);
 const response = await fetch("https://a.klaviyo.com/api/events", {
  method: "POST",
  headers: {
   Authorization: "Klaviyo-API-Key " + key,
   accept: "application/json",
   "content-type": "application/json",
   revision: "2025-10-15",
  },
  body: JSON.stringify({data:{
   type: "event",
   attributes: {
    properties: event.properties,
    time: event.time,
    metric: {data:{type:"metric",attributes:event.metric}},
    profile: {data:{type:"profile",attributes:{
     email: event.profile.email,
     external_id: event.profile.external_id,
    }}},
   },
  }}),
 });
 if (!response.ok) throw new Error("Klaviyo event request failed: HTTP " + response.status);
}
