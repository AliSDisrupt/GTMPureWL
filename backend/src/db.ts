import { Pool } from "pg";
import { env } from "./config.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL
});

export async function healthcheckDb(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("select 1");
    return true;
  } finally {
    client.release();
  }
}
