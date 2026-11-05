-- CreateTable
CREATE TABLE "ServiceHeartbeat" (
    "service" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceHeartbeat_pkey" PRIMARY KEY ("service")
);
