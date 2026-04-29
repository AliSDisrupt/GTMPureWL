-- Freshness check (must be <= 30 minutes for active sources)
select source_name, last_successful_sync_at
from source_sync_status
where last_successful_sync_at < now() - interval '30 minutes';

-- Metric sanity checks
select *
from fact_campaign_performance
where impressions < clicks or spend < 0;

-- Match quality summary
select
  count(*) as total_emails,
  count(*) filter (where matched) as matched_emails
from map_email_to_crm;
