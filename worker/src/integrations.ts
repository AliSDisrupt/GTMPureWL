import { env, type SourceName } from "./config.js";
import type { RawMetric } from "./db.js";

type IngestionConnector = {
  source: SourceName;
  isConfigured: boolean;
  pullMetrics: (asOfDate: string) => Promise<RawMetric[]>;
};

type WindsorRow = {
  account_name?: string;
  campaign?: string;
  clicks?: string | number;
  impressions?: string | number;
  datasource?: string;
  date?: string;
  source?: string;
  spend?: string | number;
  sessions?: string | number;
  conversions?: string | number;
  event_name?: string;
  event?: string;
  event_count?: string | number;
  email?: string;
  activities___id?: string | number;
  [key: string]: unknown;
};

type LemlistActivity = {
  _id?: string;
  campaignId?: string;
  name?: string;
  leadId?: string;
  createdAt?: string;
  type?: string;
  metaData?: {
    campaignId?: string;
    leadId?: string;
    type?: string;
    createdBy?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type LemlistCampaignListItem = {
  _id?: string;
  name?: string;
  archived?: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
};

type LemlistCampaignStats = {
  sentCount?: number;
  openedCount?: number;
  clickedCount?: number;
  repliedCount?: number;
  [key: string]: unknown;
};

const sourceConfig: Record<SourceName, { datasourcePrefix?: string; accountName?: string }> = {
  google_ads: {
    datasourcePrefix: "google_ads",
    accountName: env.WINDSOR_ACCOUNT_GOOGLE_ADS
  },
  hubspot: {
    datasourcePrefix: "hubspot",
    accountName: env.WINDSOR_ACCOUNT_HUBSPOT
  },
  lemlist: {
    datasourcePrefix: "lemlist",
    accountName: env.WINDSOR_ACCOUNT_LEMLIST
  },
  linkedin_forms: {
    datasourcePrefix: "linkedin",
    accountName: env.WINDSOR_ACCOUNT_LINKEDIN
  },
  reddit_ads: {
    datasourcePrefix: "reddit",
    accountName: env.WINDSOR_ACCOUNT_REDDIT
  },
  ga4: {
    datasourcePrefix: "googleanalytics4",
    accountName: env.WINDSOR_ACCOUNT_GA4
  },
  windsor: {
    datasourcePrefix: "windsor"
  }
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeMetricDate(rawValue: unknown, fallbackDate: string): string {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return fallbackDate;
  }

  // Preserve explicit ISO-style date strings without timezone shifting.
  const leadingIsoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (leadingIsoDate) {
    return leadingIsoDate[1];
  }

  // Handle DD/MM/YYYY or MM/DD/YYYY-ish patterns by Date parsing fallback.
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(
      parsed.getUTCDate()
    ).padStart(2, "0")}`;
  }

  return fallbackDate;
}

function rowMatchesSource(row: WindsorRow, source: SourceName): boolean {
  const config = sourceConfig[source];
  const datasource = String(row.datasource ?? "").toLowerCase().trim();
  const accountName = String(row.account_name ?? "").trim();
  const ga4DatasourceMatch =
    datasource.startsWith("googleanalytics4") || datasource.startsWith("google_analytics") || datasource === "ga4";

  const datasourceMatches =
    source === "ga4"
      ? ga4DatasourceMatch
      : config.datasourcePrefix
        ? datasource.startsWith(config.datasourcePrefix)
        : true;
  const configuredAccount = config.accountName?.trim();
  const normalizedConfiguredAccount =
    source === "ga4" && configuredAccount?.includes("__")
      ? configuredAccount.split("__").slice(1).join("__").trim()
      : configuredAccount;
  let accountMatches = true;

  if (normalizedConfiguredAccount) {
    if (accountName.length === 0) {
      // Some Windsor connectors (especially lemlist) return null account_name.
      // In that case, keep datasource-level rows instead of dropping all rows.
      accountMatches = source === "lemlist";
    } else {
      accountMatches = accountName.toLowerCase() === normalizedConfiguredAccount.toLowerCase();
    }
  }

  return datasourceMatches && accountMatches;
}

function rowsByDatasource(rows: WindsorRow[], source: SourceName): WindsorRow[] {
  const datasource = (row: WindsorRow) => String(row.datasource ?? "").toLowerCase().trim();
  if (source === "ga4") {
    return rows.filter((row) => {
      const ds = datasource(row);
      return (
        ds.startsWith("googleanalytics4") ||
        ds.startsWith("google_analytics") ||
        ds === "ga4" ||
        ds.startsWith("google_analytics_4")
      );
    });
  }

  const datasourcePrefix = sourceConfig[source].datasourcePrefix;
  if (!datasourcePrefix) {
    return rows;
  }
  return rows.filter((row) => datasource(row).startsWith(datasourcePrefix));
}

function pickRowsForSource(rows: WindsorRow[], source: SourceName): WindsorRow[] {
  const strictMatches = rows.filter((row) => rowMatchesSource(row, source));
  if (strictMatches.length > 0) {
    return strictMatches;
  }

  const datasourceRows = rowsByDatasource(rows, source);
  if (datasourceRows.length === 0) {
    return [];
  }

  const nonEmptyAccounts = Array.from(
    new Set(datasourceRows.map((row) => String(row.account_name ?? "").trim()).filter((name) => name.length > 0))
  );

  // If the connector currently exposes a single account for this datasource,
  // auto-use it even when configured account differs.
  if (nonEmptyAccounts.length === 1) {
    return datasourceRows;
  }

  return strictMatches;
}

async function fetchWindsorRows(): Promise<WindsorRow[]> {
  if (!env.WINDSOR_CONNECTOR_URL) {
    return [];
  }

  const url = new URL(env.WINDSOR_CONNECTOR_URL);
  url.searchParams.set("date_preset", "last_90d");
  url.searchParams.set(
    "fields",
    "account_name,campaign,clicks,impressions,datasource,date,source,spend,sessions,conversions,event_name,event,event_count,email,activities___id"
  );

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Windsor connector failed with ${response.status}`);
  }

  const body = (await response.json()) as unknown;
  if (Array.isArray(body)) {
    return body as WindsorRow[];
  }

  if (typeof body === "object" && body !== null && "data" in body && Array.isArray((body as { data?: unknown }).data)) {
    return (body as { data: WindsorRow[] }).data;
  }

  if (!Array.isArray(body)) {
    throw new Error("Windsor connector returned non-array payload");
  }

  return [];
}

async function fetchLemlistActivities(): Promise<LemlistActivity[]> {
  if (!env.LEMLIST_API_KEY) {
    return [];
  }

  const baseEndpoint = "https://api.lemlist.com/api/activities";
  const basicToken = Buffer.from(`:${env.LEMLIST_API_KEY}`).toString("base64");

  const tryFetch = async (url: string, headers: Record<string, string>): Promise<Response> => {
    return fetch(url, {
      headers: {
        Accept: "application/json",
        ...headers
      }
    });
  };

  const collect = async (authHeader: string): Promise<LemlistActivity[]> => {
    const all: LemlistActivity[] = [];
    for (let page = 1; page <= 10; page += 1) {
      const endpoint = `${baseEndpoint}?perPage=200&page=${page}`;
      const response = await tryFetch(endpoint, { Authorization: authHeader });
      if (!response.ok) {
        if (response.status === 429) {
          break;
        }
        throw new Error(`Lemlist API failed with ${response.status}`);
      }

      const body = (await response.json()) as unknown;
      const rows = Array.isArray(body) ? (body as LemlistActivity[]) : [];
      if (rows.length === 0) {
        break;
      }
      all.push(...rows);
      if (rows.length < 200) {
        break;
      }
    }
    return all;
  };

  try {
    return await collect(`Basic ${basicToken}`);
  } catch (error) {
    if (error instanceof Error && /401/.test(error.message)) {
      return collect(`Bearer ${env.LEMLIST_API_KEY}`);
    }
    throw error;
  }
}

async function fetchLemlistCampaigns(): Promise<LemlistCampaignListItem[]> {
  if (!env.LEMLIST_API_KEY) {
    return [];
  }

  const endpoint = "https://api.lemlist.com/api/campaigns?perPage=500";
  const basicToken = Buffer.from(`:${env.LEMLIST_API_KEY}`).toString("base64");
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Lemlist campaigns API failed with ${response.status}`);
  }

  const body = (await response.json()) as unknown;
  if (Array.isArray(body)) {
    return body as LemlistCampaignListItem[];
  }
  return [];
}

async function fetchLemlistCampaignStats(
  campaignId: string,
  startDate: string,
  endDate: string
): Promise<LemlistCampaignStats> {
  if (!env.LEMLIST_API_KEY) {
    return {};
  }
  const basicToken = Buffer.from(`:${env.LEMLIST_API_KEY}`).toString("base64");
  const url = `https://api.lemlist.com/api/campaigns/${campaignId}/stats?startDate=${encodeURIComponent(
    startDate
  )}&endDate=${encodeURIComponent(endDate)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${basicToken}`
    }
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 404) {
      return {};
    }
    throw new Error(`Lemlist campaign stats failed with ${response.status} for ${campaignId}`);
  }

  const body = (await response.json()) as unknown;
  if (typeof body === "object" && body !== null) {
    return body as LemlistCampaignStats;
  }
  return {};
}

async function pullFromWindsor(source: SourceName, asOfDate: string): Promise<RawMetric[]> {
  const rows = await fetchWindsorRows();
  const filtered = pickRowsForSource(rows, source);

  return filtered.map((row, idx) => {
    const campaignKey = String(row.campaign ?? row.activities___id ?? row.account_name ?? `${source}-${idx}`);
    const metricDate = normalizeMetricDate(row.date, asOfDate);
    const clicks = toNumber(row.clicks);
    const eventName = String(row.event_name ?? row.event ?? "").trim().toLowerCase();
    const isLeadGeneratedEvent = source === "ga4" && eventName === "lead_generated_all_sites";
    const leadEvents = isLeadGeneratedEvent ? Math.max(1, toNumber(row.event_count), toNumber(row.conversions)) : 0;
    const impressions =
      source === "ga4"
        ? Math.max(toNumber(row.sessions), toNumber(row.impressions), clicks)
        : Math.max(toNumber(row.impressions), clicks);
    const spend = toNumber(row.spend);
    const leads = source === "linkedin_forms" || source === "hubspot" ? 1 : leadEvents;
    const conversions = source === "ga4" ? Math.max(toNumber(row.conversions), leadEvents) : 0;

    return {
      source,
      sourceCampaignId: `${source}:${campaignKey}`,
      campaignName: String(row.campaign ?? row.account_name ?? `${source} campaign`),
      metricDate,
      spend,
      impressions,
      clicks,
      leads,
      conversions,
      email: row.email,
      payload: row
    };
  });
}

async function pullFromLemlist(asOfDate: string): Promise<RawMetric[]> {
  const campaigns = await fetchLemlistCampaigns();
  const activities = await fetchLemlistActivities();
  const activeCampaigns = campaigns.filter(
    (campaign) => !Boolean(campaign.archived) && String(campaign.status ?? "").toLowerCase() === "running"
  );
  // Store day-bucket metrics so date filters reflect actual daily sends/replies.
  // Using a rolling 90-day window here inflates "today" with historical totals.
  const startDate = asOfDate;
  const inWindow = (rawDate: unknown): boolean => {
    const date = normalizeMetricDate(rawDate, asOfDate);
    return date >= startDate && date <= asOfDate;
  };

  const activityByCampaign = new Map<string, { sent: number; opened: number; clicked: number; replied: number }>();
  for (const activity of activities) {
    if (!inWindow(activity.createdAt)) {
      continue;
    }
    const campaignId = String(activity.campaignId ?? activity.metaData?.campaignId ?? "").trim();
    if (!campaignId) {
      continue;
    }
    const type = String(activity.type ?? activity.metaData?.type ?? "").trim().toLowerCase();
    if (!type) {
      continue;
    }

    const bucket = activityByCampaign.get(campaignId) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 };
    if (type === "emailssent") bucket.sent += 1;
    if (type === "emailsopened") bucket.opened += 1;
    if (type === "emailsclicked") bucket.clicked += 1;
    if (type === "emailsreplied") bucket.replied += 1;
    activityByCampaign.set(campaignId, bucket);
  }

  const statsByCampaign = await Promise.all(
    activeCampaigns.map(async (campaign) => {
      const campaignId = String(campaign._id ?? "").trim();
      if (!campaignId) {
        return null;
      }
      const stats = await fetchLemlistCampaignStats(campaignId, startDate, asOfDate);
      return { campaign, campaignId, stats };
    })
  );

  return statsByCampaign
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map(({ campaign, campaignId, stats }) => {
      const activityCounts = activityByCampaign.get(campaignId) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 };
      // Keep stats endpoint as primary, but backfill and include follow-up events from activities.
      const sent = Math.max(toNumber(stats.sentCount), activityCounts.sent);
      const opened = Math.max(toNumber(stats.openedCount), activityCounts.opened);
      const clicked = Math.max(toNumber(stats.clickedCount), activityCounts.clicked);
      const replied = Math.max(toNumber(stats.repliedCount), activityCounts.replied);
      const campaignName = String(campaign.name ?? `Campaign ${campaignId}`);

      const sample: LemlistActivity = {
        _id: campaignId,
        campaignId,
        name: campaignName,
        createdAt: campaign.updatedAt ?? campaign.createdAt,
        type: "campaignStats",
        metaData: {
          campaignId,
          type: "campaignStats"
        },
        ...campaign
      };

    return {
      source: "lemlist",
      sourceCampaignId: `lemlist:${campaignId}`,
      campaignName,
      metricDate: asOfDate,
      spend: 0,
      impressions: sent, // emailsSent
      clicks: opened, // emailsOpened
      leads: replied, // emailsReplied
      conversions: clicked, // emailsClicked
      email: "",
      payload: {
        ...sample,
        campaignId,
        campaign_name: campaignName,
        status: campaign.status,
        emails_sent: sent,
        emails_opened: opened,
        emails_clicked: clicked,
        emails_replied: replied,
        open_rate: sent > 0 ? opened / sent : 0,
        click_rate: sent > 0 ? clicked / sent : 0,
        reply_rate: sent > 0 ? replied / sent : 0,
        stats_window_start: startDate,
        stats_window_end: asOfDate
      }
    };
  });
}

export const connectors: IngestionConnector[] = [
  {
    source: "hubspot",
    isConfigured: Boolean(env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      return pullFromWindsor("hubspot", asOfDate);
    }
  },
  {
    source: "lemlist",
    isConfigured: Boolean(env.LEMLIST_API_KEY || env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      if (env.LEMLIST_API_KEY) {
        return pullFromLemlist(asOfDate);
      }
      return pullFromWindsor("lemlist", asOfDate);
    }
  },
  {
    source: "windsor",
    isConfigured: Boolean(env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      return pullFromWindsor("windsor", asOfDate);
    }
  },
  {
    source: "linkedin_forms",
    isConfigured: Boolean(env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      return pullFromWindsor("linkedin_forms", asOfDate);
    }
  },
  {
    source: "google_ads",
    isConfigured: Boolean(env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      return pullFromWindsor("google_ads", asOfDate);
    }
  },
  {
    source: "reddit_ads",
    isConfigured: Boolean(env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      return pullFromWindsor("reddit_ads", asOfDate);
    }
  },
  {
    source: "ga4",
    isConfigured: Boolean(env.WINDSOR_CONNECTOR_URL),
    async pullMetrics(asOfDate) {
      return pullFromWindsor("ga4", asOfDate);
    }
  }
];
