-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "PositionCache" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "multipv" INTEGER NOT NULL,
    "engineJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LichessMoveCache" (
    "id" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "ratingBucket" TEXT NOT NULL,
    "movesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LichessMoveCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGame" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "pgn" TEXT NOT NULL,
    "parsedJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineAnalysis" (
    "id" TEXT NOT NULL,
    "rootFen" TEXT NOT NULL,
    "lineMoves" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "metricsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LineAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PositionCache_fen_depth_multipv_key" ON "PositionCache"("fen", "depth", "multipv");

-- CreateIndex
CREATE UNIQUE INDEX "LichessMoveCache_fen_ratingBucket_key" ON "LichessMoveCache"("fen", "ratingBucket");

