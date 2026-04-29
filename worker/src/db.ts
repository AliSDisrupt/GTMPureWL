import { Pool } from "pg";
import { env, type SourceName } from "./config.js";

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export type RawMetric = {
  source: SourceName;
  sourceCampaignId: string;
  campaignName: string;
  metricDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  email?: string;
  payload: Record<string, unknown>;
};

export async function upsertSourceStatus(source: SourceName, error?: string): Promise<void> {
  await pool.query(
    `insert into source_sync_status (source_name, last_successful_sync_at, last_error)
     values ($1, now(), $2)
     on conflict (source_name) do update set
       last_successful_sync_at = excluded.last_successful_sync_at,
       last_error = excluded.last_error`,
    [source, error ?? null]
  );
}

export async function storeRawMetrics(rows: RawMetric[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of rows) {
      await client.query(
        `insert into raw_campaign_payloads
         (source, source_campaign_id, campaign_name, metric_date, payload)
         values ($1, $2, $3, $4, $5)
         on conflict (source, source_campaign_id, metric_date) do update set
           campaign_name = excluded.campaign_name,
           payload = excluded.payload`,
        [row.source, row.sourceCampaignId, row.campaignName, row.metricDate, row.payload]
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
