import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./config.js";
import { connectors } from "./integrations.js";
import { storeRawMetrics, upsertSourceStatus } from "./db.js";
import { normalizeIntoFacts } from "./transform.js";
import { runQualityChecks } from "./qa.js";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const ingestionQueue = new Queue("ingestion", { connection });
const qualityQueue = new Queue("quality-checks", { connection });

type JobData = { source: string };

const worker = new Worker<JobData>(
  "ingestion",
  async (job) => {
    const connector = connectors.find((c) => c.source === job.data.source);
    if (!connector) {
      throw new Error(`Unknown source: ${job.data.source}`);
    }

    if (!connector.isConfigured) {
      await upsertSourceStatus(connector.source, "Missing API credentials");
      return;
    }

    try {
      const asOfDate = new Date().toISOString().slice(0, 10);
      const rows = await connector.pullMetrics(asOfDate);
      await storeRawMetrics(rows);
      await normalizeIntoFacts(rows);
      await upsertSourceStatus(connector.source);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";
      await upsertSourceStatus(connector.source, message);
      throw error;
    }
  },
  { connection }
);

worker.on("failed", (job, error) => {
  console.error("Ingestion failed", job?.name, error.message);
});

for (const connector of connectors) {
  await ingestionQueue.upsertJobScheduler(
    `sync-${connector.source}`,
    { every: 15 * 60 * 1000 },
    { name: `sync-${connector.source}`, data: { source: connector.source } }
  );
}

await qualityQueue.upsertJobScheduler(
  "quality-checks",
  { every: 15 * 60 * 1000 },
  { name: "quality-checks", data: { source: "quality-checks" } }
);

const qualityWorker = new Worker<JobData>(
  "quality-checks",
  async (job) => {
    if (job.name === "quality-checks") {
      await runQualityChecks();
    }
  },
  { connection }
);

qualityWorker.on("failed", (job, error) => {
  console.error("Quality check failed", job?.name, error.message);
});

console.info("Worker started with 15-minute ingestion schedules.");
