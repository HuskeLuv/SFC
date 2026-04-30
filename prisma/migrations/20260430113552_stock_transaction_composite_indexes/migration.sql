-- CreateIndex
CREATE INDEX "stock_transactions_userId_assetId_date_idx" ON "stock_transactions"("userId", "assetId", "date");
