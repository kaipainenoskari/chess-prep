/**
 * Run the line-analysis BullMQ worker in a separate process.
 * Usage: npx tsx scripts/run-worker.ts
 * Requires: REDIS_URL, DATABASE_URL in env (or .env).
 */
import "dotenv/config";
import { Worker } from "bullmq";
import { processLineAnalysisJob } from "../src/lib/queue/processor";

const QUEUE_NAME = "line-analysis";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = {
  url: REDIS_URL,
  maxRetriesPerRequest: null as number | null,
};

const worker = new Worker<{ rootFen: string; projectId?: string }>(
  QUEUE_NAME,
  async (job) => {
    return processLineAnalysisJob(job.data, job);
  },
  { connection },
);

worker.on("completed", (job) => {
  console.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Line-analysis worker started. Waiting for jobs...");
