create table if not exists source_sync_status (
  source_name text primary key,
  last_successful_sync_at timestamptz,
  last_error text
);

create table if not exists raw_campaign_payloads (
  source text not null,
  source_campaign_id text not null,
  campaign_name text not null,
  metric_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (source, source_campaign_id, metric_date)
);

create table if not exists dim_campaign (
  source text not null,
  source_campaign_id text not null,
  campaign_name text not null,
  platform text not null,
  status text not null,
  primary key (source, source_campaign_id)
);

create table if not exists dim_account (
  source text not null,
  source_account_id text not null,
  account_name text,
  primary key (source, source_account_id)
);

create table if not exists dim_contact (
  email text primary key,
  hubspot_contact_id text,
  linkedin_lead_id text
);

create table if not exists fact_campaign_performance (
  source text not null,
  source_campaign_id text not null,
  metric_date date not null,
  spend numeric(12, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(10, 6) not null default 0,
  cpc numeric(12, 6) not null default 0,
  cpm numeric(12, 6) not null default 0,
  leads bigint not null default 0,
  conversions bigint not null default 0,
  primary key (source, source_campaign_id, metric_date)
);

create table if not exists fact_forms (
  source text not null default 'linkedin_forms',
  source_form_id text not null,
  source_campaign_id text not null,
  submitted_at timestamptz not null,
  email text,
  form_payload jsonb not null,
  primary key (source_form_id, submitted_at)
);

create table if not exists fact_web_analytics (
  source text not null default 'ga4',
  source_campaign_id text not null,
  metric_date date not null,
  sessions bigint not null default 0,
  users_count bigint not null default 0,
  conversions bigint not null default 0,
  bounce_rate numeric(10, 6) not null default 0,
  primary key (source, source_campaign_id, metric_date)
);

create table if not exists fact_email_outreach (
  source_campaign_id text not null,
  metric_date date not null,
  email text not null,
  sends bigint not null default 0,
  opens bigint not null default 0,
  replies bigint not null default 0,
  bounces bigint not null default 0,
  primary key (source_campaign_id, metric_date, email)
);

create table if not exists hubspot_contacts (
  email text primary key,
  hubspot_contact_id text,
  lifecycle_stage text,
  owner_name text
);

create table if not exists map_email_to_crm (
  email text primary key,
  hubspot_contact_id text,
  matched boolean not null default false,
  lifecycle_stage text,
  owner_name text,
  last_seen_at timestamptz not null default now()
);

create table if not exists ingestion_audit_log (
  id bigserial primary key,
  job_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists ingestion_alerts (
  id bigserial primary key,
  severity text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create or replace view campaign_performance_view as
select
  f.source,
  f.source_campaign_id,
  c.campaign_name,
  f.metric_date,
  f.spend,
  f.impressions,
  f.clicks,
  f.ctr,
  f.cpc,
  f.cpm,
  f.leads,
  f.conversions
from fact_campaign_performance f
join dim_campaign c
  on c.source = f.source
 and c.source_campaign_id = f.source_campaign_id;
