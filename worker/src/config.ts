import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WINDSOR_CONNECTOR_URL: z.string().url().optional(),
  WINDSOR_ACCOUNT_GOOGLE_ADS: z.string().optional(),
  WINDSOR_ACCOUNT_HUBSPOT: z.string().optional(),
  WINDSOR_ACCOUNT_LEMLIST: z.string().optional(),
  WINDSOR_ACCOUNT_LINKEDIN: z.string().optional(),
  WINDSOR_ACCOUNT_REDDIT: z.string().optional(),
  WINDSOR_ACCOUNT_GA4: z.string().optional(),
  HUBSPOT_ACCESS_TOKEN: z.string().optional(),
  LEMLIST_API_KEY: z.string().optional(),
  WINDSOR_API_KEY: z.string().optional(),
  LINKEDIN_ACCESS_TOKEN: z.string().optional(),
  LINKEDIN_AD_ACCOUNT_ID: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),
  GA4_PROPERTY_ID: z.string().optional(),
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_REFRESH_TOKEN: z.string().optional()
});

export const env = envSchema.parse(process.env);

export const sourceNames = [
  "hubspot",
  "lemlist",
  "windsor",
  "linkedin_forms",
  "google_ads",
  "reddit_ads",
  "ga4"
] as const;

export type SourceName = (typeof sourceNames)[number];
