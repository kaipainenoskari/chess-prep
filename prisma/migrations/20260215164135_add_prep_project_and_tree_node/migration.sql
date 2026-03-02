-- AlterTable
ALTER TABLE "PositionCache" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "PrepProject" (
    "id" TEXT NOT NULL,
    "opponentUsername" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "ratingBucket" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "timeClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningTreeNode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fen" TEXT NOT NULL,
    "move" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "gamesCount" INTEGER NOT NULL DEFAULT 0,
    "riskScore" DOUBLE PRECISION,
    "analysisStatus" TEXT NOT NULL DEFAULT 'UNSCANNED',
    "trapCount" INTEGER NOT NULL DEFAULT 0,
    "lastAnalyzedAt" TIMESTAMP(3),
    "lastJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningTreeNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpeningTreeNode_projectId_fen_key" ON "OpeningTreeNode"("projectId", "fen");

-- AddForeignKey
ALTER TABLE "OpeningTreeNode" ADD CONSTRAINT "OpeningTreeNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PrepProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningTreeNode" ADD CONSTRAINT "OpeningTreeNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "OpeningTreeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
