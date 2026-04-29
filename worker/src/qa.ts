import { pool } from "./db.js";

export async function runQualityChecks(): Promise<void> {
  const staleSources = await pool.query(
    `select source_name
     from source_sync_status
     where last_successful_sync_at < now() - interval '30 minutes'`
  );

  if (staleSources.rowCount && staleSources.rowCount > 0) {
    await pool.query(
      `insert into ingestion_alerts (severity, message, created_at)
       values ('warning', $1, now())`,
      [`Stale sources: ${staleSources.rows.map((row) => row.source_name).join(", ")}`]
    );
  }

  await pool.query(
    `insert into ingestion_audit_log (job_name, message, created_at)
     values ('quality-check', 'Quality checks completed', now())`
  );
}
