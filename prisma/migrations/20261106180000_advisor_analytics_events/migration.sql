CREATE TABLE IF NOT EXISTS "AdvisorAnalyticsEvent" (
 "id" TEXT NOT NULL,
 "shop" TEXT NOT NULL,
 "eventId" TEXT NOT NULL,
 "visitorId" TEXT NOT NULL,
 "eventType" TEXT NOT NULL,
 "productId" TEXT,
 "variantId" TEXT,
 "orderId" TEXT,
 "value" DECIMAL(12,2),
 "currency" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AdvisorAnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdvisorAnalyticsEvent_shop_eventId_key" ON "AdvisorAnalyticsEvent"("shop","eventId");
CREATE INDEX IF NOT EXISTS "AdvisorAnalyticsEvent_shop_visitorId_createdAt_idx" ON "AdvisorAnalyticsEvent"("shop","visitorId","createdAt");
CREATE INDEX IF NOT EXISTS "AdvisorAnalyticsEvent_shop_eventType_createdAt_idx" ON "AdvisorAnalyticsEvent"("shop","eventType","createdAt");
