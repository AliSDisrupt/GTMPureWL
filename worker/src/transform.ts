import { pool, type RawMetric } from "./db.js";

function normalizeEmail(value?: string): string | null {
  if (!value) {
    return null;
  }
  return value.trim().toLowerCase();
}

export async function normalizeIntoFacts(rows: RawMetric[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of rows) {
      await client.query(
        `insert into dim_campaign (source, source_campaign_id, campaign_name, platform, status)
         values ($1, $2, $3, $4, 'active')
         on conflict (source, source_campaign_id) do update set
           campaign_name = excluded.campaign_name,
           platform = excluded.platform`,
        [row.source, row.sourceCampaignId, row.campaignName, row.source]
      );

      await client.query(
        `insert into fact_campaign_performance
         (source, source_campaign_id, metric_date, spend, impressions, clicks, ctr, cpc, cpm, leads, conversions)
         values ($1, $2, $3, $4::numeric, $5::bigint, $6::bigint,
           case when $5::bigint > 0 then $6::numeric / $5::numeric else 0 end,
           case when $6::bigint > 0 then $4::numeric / $6::numeric else 0 end,
           case when $5::bigint > 0 then ($4::numeric * 1000) / $5::numeric else 0 end,
           $7::bigint, $8::bigint)
         on conflict (source, source_campaign_id, metric_date) do update set
           spend = excluded.spend,
           impressions = excluded.impressions,
           clicks = excluded.clicks,
           ctr = excluded.ctr,
           cpc = excluded.cpc,
           cpm = excluded.cpm,
           leads = excluded.leads,
           conversions = excluded.conversions`,
        [row.source, row.sourceCampaignId, row.metricDate, row.spend, row.impressions, row.clicks, row.leads, row.conversions]
      );

      if (row.source === "ga4") {
        await client.query(
          `insert into fact_web_analytics
           (source, source_campaign_id, metric_date, sessions, users_count, conversions, bounce_rate)
           values ('ga4', $1, $2, $3::bigint, $4::bigint, $5::bigint, 0)
           on conflict (source, source_campaign_id, metric_date) do update set
             sessions = excluded.sessions,
             users_count = excluded.users_count,
             conversions = excluded.conversions,
             bounce_rate = excluded.bounce_rate`,
          [row.sourceCampaignId, row.metricDate, row.impressions, row.clicks, row.conversions]
        );

        if (row.leads > 0) {
          const payloadEvent = String(row.payload.event_name ?? row.payload.event ?? "Lead_Generated_All_Sites");
          const payloadSource = String(row.payload.source ?? "unknown");
          await client.query(
            `insert into fact_forms
             (source, source_form_id, source_campaign_id, submitted_at, email, form_payload)
             values ('ga4', $1, $2, $3::timestamptz, $4, $5::jsonb)
             on conflict (source_form_id, submitted_at) do update set
               form_payload = excluded.form_payload`,
            [
              `ga4:${row.sourceCampaignId}:${payloadEvent}:${payloadSource}`,
              row.sourceCampaignId,
              `${row.metricDate}T00:00:00.000Z`,
              normalizeEmail(row.email),
              {
                ...row.payload,
                event_name: payloadEvent,
                source: payloadSource,
                form_submissions: row.leads
              }
            ]
          );
        }
      }

      const normalizedEmail = normalizeEmail(row.email);
      if (normalizedEmail) {
        await client.query(
          `insert into fact_email_outreach
           (source_campaign_id, metric_date, email, sends, opens, replies, bounces)
           values ($1, $2, $3, 1, 1, 0, 0)
           on conflict (source_campaign_id, metric_date, email) do update set
             sends = fact_email_outreach.sends + 1`,
          [row.sourceCampaignId, row.metricDate, normalizedEmail]
        );
      }
    }

    await matchLemlistEmailsToHubSpot(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function matchLemlistEmailsToHubSpot(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  await syncHubspotContactsFromRaw(client);
  await client.query(
    `insert into map_email_to_crm (email, hubspot_contact_id, matched, lifecycle_stage, owner_name, last_seen_at)
     select
       feo.email,
       hc.hubspot_contact_id,
       hc.email is not null as matched,
       hc.lifecycle_stage,
       hc.owner_name,
       now() as last_seen_at
     from fact_email_outreach feo
     left join hubspot_contacts hc on hc.email = feo.email
     on conflict (email) do update set
       hubspot_contact_id = excluded.hubspot_contact_id,
       matched = excluded.matched,
       lifecycle_stage = excluded.lifecycle_stage,
       owner_name = excluded.owner_name,
       last_seen_at = excluded.last_seen_at`
  );
}

async function syncHubspotContactsFromRaw(client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }): Promise<void> {
  await client.query(
    `insert into hubspot_contacts (email, hubspot_contact_id, lifecycle_stage, owner_name)
     select distinct on (email)
       email,
       hubspot_contact_id,
       lifecycle_stage,
       owner_name
     from (
       select
         lower(trim(coalesce(payload->>'email', payload->>'contact_email', payload->>'hs_email', ''))) as email,
         nullif(coalesce(payload->>'hubspot_contact_id', payload->>'contact_id', payload->>'id', payload->>'vid', ''), '') as hubspot_contact_id,
         nullif(
           coalesce(
             payload->>'lifecyclestage',
             payload->>'lifecycle_stage',
             payload->>'hs_lead_status',
             ''
           ),
           ''
         ) as lifecycle_stage,
         nullif(
           coalesce(
             payload->>'owner_name',
             payload->>'hubspot_owner_name',
             payload->>'hubspot_owner',
             ''
           ),
           ''
         ) as owner_name,
         metric_date
       from raw_campaign_payloads
       where source = 'hubspot'
     ) normalized
     where email <> ''
     order by email, metric_date desc
     on conflict (email) do update set
       hubspot_contact_id = coalesce(excluded.hubspot_contact_id, hubspot_contacts.hubspot_contact_id),
       lifecycle_stage = coalesce(excluded.lifecycle_stage, hubspot_contacts.lifecycle_stage),
       owner_name = coalesce(excluded.owner_name, hubspot_contacts.owner_name)`
  );
}
