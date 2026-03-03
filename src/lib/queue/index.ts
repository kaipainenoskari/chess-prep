import { Queue } from "bullmq";

const QUEUE_NAME = "line-analysis";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const connection = { url: REDIS_URL } as const;

export const lineAnalysisQueue = new Queue<import("./processor").LineAnalysisJobData>(
  QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: { count: 500 },
    },
  },
);

export { processLineAnalysisJob } from "./processor";
