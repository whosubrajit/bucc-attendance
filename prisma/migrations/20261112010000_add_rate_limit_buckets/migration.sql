CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_buckets_key_key" ON "rate_limit_buckets"("key");
CREATE INDEX "rate_limit_buckets_window_start_idx" ON "rate_limit_buckets"("window_start");
