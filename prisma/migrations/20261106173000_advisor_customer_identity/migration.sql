ALTER TABLE "AdvisorConversation" ADD COLUMN "customerId" TEXT;
CREATE INDEX "AdvisorConversation_shop_customerId_idx" ON "AdvisorConversation"("shop", "customerId");