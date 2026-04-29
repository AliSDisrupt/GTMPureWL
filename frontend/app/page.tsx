import DashboardControls from "./components/DashboardControls";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";

type KPIOverview = {
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  leads: string;
  conversions: string;
};

type CampaignSummaryRow = {
  source: string;
  campaign_name: string;
  start_date: string;
  end_date: string;
  spend: string;
  impressions: string;
  clicks: string;
  form_submissions?: string;
  ctr: string;
};

type SearchParams = {
  startDate?: string;
  endDate?: string;
  source?: string;
  preset?: string;
};

type Ga4Campaign = {
  source_campaign_id: string;
  start_date?: string;
  end_date?: string;
  traffic_source?: string;
  leads?: string;
};
type Ga4LeadSource = {
  source: string;
  submissions: string;
};
type LemlistCampaign = {
  campaign_name: string;
  emails_sent: string;
  opened: string;
  clicked: string;
  open_rate: string;
  replied: string;
  reply_rate: string;
};

type HubspotDetails = {
  summary: {
    total_emails: string;
    matched_emails: string;
    unmatched_emails: string;
    deals_created?: string;
    mql_count?: string;
    sql_count?: string;
    customer_count?: string;
    assigned_owner_count?: string;
  };
  lifecycle: Array<{ lifecycle_stage: string; contacts: string }>;
  owners: Array<{ owner_name: string; matched_contacts: string; mql: string; sql: string; customers: string }>;
};
type HubspotMatch = {
  email: string;
  hubspot_contact_id?: string;
  matched: boolean;
  lifecycle_stage?: string;
  owner_name?: string;
  last_seen_at?: string;
};
type HubspotMatchedLead = {
  lead_name: string;
  email: string;
  deal_stage: string;
  owner_name: string;
  last_seen_at?: string;
};
type FluentLead = {
  date: string;
  name: string;
  email: string;
  company: string;
  priority: string;
  lead_type: string;
  source_tab: string;
};
type FluentLeadsResponse = {
  summary: { total: string; mql: string; sql: string };
  mql: FluentLead[];
  sql: FluentLead[];
};
type FluentHubspotMatch = {
  name: string;
  email: string;
  priority: string;
  lead_type: string;
  source_tab: string;
  hubspot_contact_id?: string | null;
  lifecycle_stage?: string;
  owner_name?: string;
};
type FluentHubspotMatchesResponse = {
  summary: { checked: number; matched: number };
  matched: FluentHubspotMatch[];
};
type UserLoginRow = {
  name: string;
  email: string;
  ip: string;
  logged_in_at: string;
};

type SourceBreakdown = {
  source: string;
  spend: string;
  impressions: string;
  clicks: string;
  leads?: string;
  conversions?: string;
};

async function fetchJson<T>(path: string): Promise<T> {
  const baseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
  try {
    const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${path}`);
    }
    return response.json() as Promise<T>;
  } catch {
    throw new Error(`unavailable:${path}`);
  }
}

async function fetchAppJson<T>(path: string): Promise<T> {
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;
  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load app path ${path}`);
  }
  return response.json() as Promise<T>;
}

function getDateRange(searchParams?: SearchParams): { startDate: string; endDate: string } {
  const today = new Date();
  const preset = searchParams?.preset ?? "30d";
  let start = new Date(today.getTime() - 30 * 86400000);
  let end = new Date(today);

  if (preset === "today") {
    start = new Date(today);
    end = new Date(today);
  } else if (preset === "yesterday") {
    start = new Date(today.getTime() - 86400000);
    end = new Date(today.getTime() - 86400000);
  } else if (preset === "7d") {
    start = new Date(today.getTime() - 7 * 86400000);
  } else if (preset === "90d") {
    start = new Date(today.getTime() - 90 * 86400000);
  } else if (preset === "mtd") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  const defaultStart = start.toISOString().slice(0, 10);
  const defaultEnd = end.toISOString().slice(0, 10);
  return {
    startDate: searchParams?.startDate ?? defaultStart,
    endDate: searchParams?.endDate ?? defaultEnd
  };
}

function toNumeric(value: string | number | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSourceName(source: string): string {
  const mapping: Record<string, string> = {
    google_ads: "Google Ads",
    reddit_ads: "Reddit Ads",
    linkedin_forms: "LinkedIn Ads",
    hubspot: "HubSpot",
    ga4: "Google Analytics 4"
  };
  return mapping[source] ?? source.replaceAll("_", " ");
}

function formatLocalDateTime(value?: string | null): string {
  if (!value) {
    return "Never synced";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString();
}

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const cookieStore = cookies();
  const authUser = cookieStore.get("purewl_auth")?.value;
  if (!authUser) {
    redirect("/login");
  }
  const authEmail = cookieStore.get("purewl_auth_email")?.value ?? (authUser.includes("@") ? authUser : "admin@purewl.com");
  const fallbackName = authEmail
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  const authName = cookieStore.get("purewl_auth_name")?.value ?? fallbackName;
  const emailHash = createHash("md5").update(authEmail.trim().toLowerCase()).digest("hex");
  const authPicture =
    cookieStore.get("purewl_auth_picture")?.value ?? `https://www.gravatar.com/avatar/${emailHash}?d=identicon&s=80`;
  const avatar = authName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "U";
  const { startDate, endDate } = getDateRange(searchParams);
  const source = searchParams?.source;
  const preset = searchParams?.preset ?? "30d";
  const dateQuery = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const sourceQuery = source ? `&source=${encodeURIComponent(source)}` : "";

  const [overviewResult, campaignSummaryResult, sourceStatusResult, channelsResult, funnelResult, ga4Result, ga4LeadSourcesResult, lemlistResult, hubspotResult, hubspotMatchesResult, hubspotMatchedLeadsResult, fluentLeadsResult, fluentHubspotMatchesResult, userLoginsResult] =
    await Promise.allSettled([
    fetchJson<KPIOverview>(`/kpi/overview?${dateQuery}`),
    fetchJson<CampaignSummaryRow[]>(`/campaigns/summary?${dateQuery}${sourceQuery}`),
    fetchJson<Array<{ source_name: string; last_successful_sync_at: string | null }>>("/sources/status"),
    fetchJson<SourceBreakdown[]>(`/channels/breakdown?${dateQuery}`),
    fetchJson<{ ad_clicks: string; form_submissions: string; emails_sent: string; crm_matched_contacts: string }>(`/funnel?${dateQuery}`),
    fetchJson<Ga4Campaign[]>(`/ga4/campaigns?${dateQuery}`),
    fetchJson<Ga4LeadSource[]>(`/ga4/lead-sources?${dateQuery}`),
    fetchJson<LemlistCampaign[]>(`/lemlist/campaigns?${dateQuery}`),
    fetchJson<HubspotDetails>(`/hubspot/details?${dateQuery}`),
    fetchJson<HubspotMatch[]>("/matches/lemlist-hubspot"),
    fetchJson<HubspotMatchedLead[]>(`/hubspot/matched-leads?${dateQuery}`),
    fetchJson<FluentLeadsResponse>(`/fluentform/leads?${dateQuery}`),
    fetchJson<FluentHubspotMatchesResponse>(`/fluentform/hubspot-matches?${dateQuery}`),
    fetchAppJson<UserLoginRow[]>("/api/auth/users")
  ]);

  const overview = overviewResult.status === "fulfilled" ? overviewResult.value : ({ spend: "0", impressions: "0", clicks: "0", ctr: "0", leads: "0", conversions: "0" } as KPIOverview);
  const campaignSummaryRaw = campaignSummaryResult.status === "fulfilled" ? campaignSummaryResult.value : [];
  const sourceStatus = sourceStatusResult.status === "fulfilled" ? sourceStatusResult.value : [];
  const channelsRaw = channelsResult.status === "fulfilled" ? channelsResult.value : [];
  const funnel =
    funnelResult.status === "fulfilled"
      ? funnelResult.value
      : ({ ad_clicks: "0", form_submissions: "0", emails_sent: "0", crm_matched_contacts: "0" } as {
          ad_clicks: string;
          form_submissions: string;
          emails_sent: string;
          crm_matched_contacts: string;
        });
  const ga4Campaigns = ga4Result.status === "fulfilled" ? ga4Result.value : [];
  const ga4LeadSources = ga4LeadSourcesResult.status === "fulfilled" ? ga4LeadSourcesResult.value : [];
  const lemlistCampaigns = lemlistResult.status === "fulfilled" ? lemlistResult.value : [];
  const hubspotDetails =
    hubspotResult.status === "fulfilled"
      ? hubspotResult.value
      : ({
          summary: { total_emails: "0", matched_emails: "0", unmatched_emails: "0", deals_created: "0" },
          lifecycle: [],
          owners: []
        } as HubspotDetails);
  const hubspotMatches = hubspotMatchesResult.status === "fulfilled" ? hubspotMatchesResult.value : [];
  const hubspotMatchedLeads = hubspotMatchedLeadsResult.status === "fulfilled" ? hubspotMatchedLeadsResult.value : [];
  const fluentLeads =
    fluentLeadsResult.status === "fulfilled"
      ? fluentLeadsResult.value
      : ({ summary: { total: "0", mql: "0", sql: "0" }, mql: [], sql: [] } as FluentLeadsResponse);
  const fluentHubspotMatches =
    fluentHubspotMatchesResult.status === "fulfilled"
      ? fluentHubspotMatchesResult.value
      : ({ summary: { checked: 0, matched: 0 }, matched: [] } as FluentHubspotMatchesResponse);
  const userLogins = userLoginsResult.status === "fulfilled" ? userLoginsResult.value : [];

  const hasBackendData = [
    overviewResult,
    campaignSummaryResult,
    sourceStatusResult,
    channelsResult,
    funnelResult,
    ga4Result,
    ga4LeadSourcesResult,
    lemlistResult,
    hubspotResult
    ,
    hubspotMatchesResult,
    hubspotMatchedLeadsResult,
    fluentLeadsResult,
    fluentHubspotMatchesResult
  ].some((result) => result.status === "fulfilled");

  const campaignSummaries = campaignSummaryRaw.filter((row) => row.source !== "lemlist");
  const channels = channelsRaw.filter((row) => row.source !== "lemlist");
  const visibleChannels = source ? channels.filter((row) => row.source === source) : channels;

  const collectiveMetrics = visibleChannels.reduce(
    (acc, item) => {
      acc.spend += toNumeric(item.spend);
      acc.impressions += toNumeric(item.impressions);
      acc.clicks += toNumeric(item.clicks);
      acc.leads += toNumeric(item.leads);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, leads: 0 }
  );
  const linkedinLeads = channels
    .filter((item) => item.source === "linkedin_forms")
    .reduce((acc, item) => acc + toNumeric(item.leads), 0);
  const ga4LeadsBySourceTotal = ga4LeadSources.reduce((acc, row) => acc + toNumeric(row.submissions), 0);
  const consolidatedLeads = linkedinLeads + ga4LeadsBySourceTotal;
  const collectiveLeads = source
    ? source === "linkedin_forms"
      ? linkedinLeads
      : source === "ga4"
        ? ga4LeadsBySourceTotal
        : 0
    : consolidatedLeads;

  const spendChartChannels = visibleChannels.filter((item) => item.source !== "hubspot" && item.source !== "ga4");
  const chartMaxSpend = Math.max(1, ...spendChartChannels.map((item) => toNumeric(item.spend)));

  const googleRows = campaignSummaries.filter((row) => row.source === "google_ads");
  const redditRows = campaignSummaries.filter((row) => row.source === "reddit_ads");
  const linkedinRows = campaignSummaries.filter((row) => row.source === "linkedin_forms");
  const hubspotRows = campaignSummaries.filter((row) => row.source === "hubspot");
  const showGoogle = !source || source === "google_ads";
  const showReddit = !source || source === "reddit_ads";
  const showLinkedin = !source || source === "linkedin_forms";
  const showGa4 = !source || source === "ga4";
  const showLemlist = !source || source === "lemlist";
  const showHubspot = !source || source === "hubspot";
  const showFluentForms = !source || source === "fluent_forms";
  const showUsers = source === "users";
  const sidebarQuery = `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&preset=${encodeURIComponent(preset)}`;
  const relevantFetchedTimes = source
    ? sourceStatus.filter((s) => s.source_name === source).map((s) => s.last_successful_sync_at).filter(Boolean)
    : sourceStatus.map((s) => s.last_successful_sync_at).filter(Boolean);
  const latestFetchedAt =
    relevantFetchedTimes.length > 0
      ? (relevantFetchedTimes.reduce((latest, current) =>
          new Date(String(current)).getTime() > new Date(String(latest)).getTime() ? current : latest
        ) as string)
      : null;
  const lemlistTotals = lemlistCampaigns.reduce(
    (acc, row) => {
      acc.sent += toNumeric(row.emails_sent);
      acc.opened += toNumeric(row.opened);
      acc.clicked += toNumeric(row.clicked);
      acc.replied += toNumeric(row.replied);
      return acc;
    },
    { sent: 0, opened: 0, clicked: 0, replied: 0 }
  );
  const lemlistCtr = lemlistTotals.sent > 0 ? (lemlistTotals.opened / lemlistTotals.sent) * 100 : 0;
  const lemlistReplyRate = lemlistTotals.sent > 0 ? (lemlistTotals.replied / lemlistTotals.sent) * 100 : 0;

  return (
    <main className="wireframeRoot">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-badge">PureWL GTM</div>
        </div>
        <div className="sidebar-section-label">Overview</div>
        <a href={`/?${sidebarQuery}`} className={`nav-item ${!source ? "active" : ""}`}><span className="nav-dot">⌂</span>Home</a>
        <div className="sidebar-section-label">Paid Ads</div>
        <a href={`/?${sidebarQuery}&source=google_ads`} className={`nav-item ${source === "google_ads" ? "active" : ""}`}><span className="nav-dot">G</span>Google Ads</a>
        <a href={`/?${sidebarQuery}&source=reddit_ads`} className={`nav-item ${source === "reddit_ads" ? "active" : ""}`}><span className="nav-dot">R</span>Reddit Ads</a>
        <a href={`/?${sidebarQuery}&source=linkedin_forms`} className={`nav-item ${source === "linkedin_forms" ? "active" : ""}`}><span className="nav-dot">in</span>LinkedIn Ads</a>
        <div className="sidebar-section-label">Analytics</div>
        <a href={`/?${sidebarQuery}&source=ga4`} className={`nav-item ${source === "ga4" ? "active" : ""}`}><span className="nav-dot">G4</span>GA4</a>
        <div className="sidebar-section-label">Outreach</div>
        <a href={`/?${sidebarQuery}&source=lemlist`} className={`nav-item ${source === "lemlist" ? "active" : ""}`}><span className="nav-dot">L</span>Lemlist</a>
        <a href={`/?${sidebarQuery}&source=fluent_forms`} className={`nav-item ${source === "fluent_forms" ? "active" : ""}`}><span className="nav-dot">F</span>Fluent Forms</a>
        <div className="sidebar-section-label">CRM</div>
        <a href={`/?${sidebarQuery}&source=hubspot`} className={`nav-item ${source === "hubspot" ? "active" : ""}`}><span className="nav-dot">H</span>HubSpot</a>
        <a href={`/?${sidebarQuery}&source=users`} className={`nav-item ${source === "users" ? "active" : ""}`}><span className="nav-dot">U</span>Users</a>
        <div className="sidebar-footer">
          <div className="sidebar-avatar">
            {authPicture ? <img src={authPicture} alt={authName} className="sidebar-avatar-img" /> : avatar}
          </div>
          <div className="sidebar-user">
            <div className="sidebar-name">{authName}</div>
            <div className="sidebar-email">{authEmail}</div>
          </div>
          <a href="/api/auth/logout" className="sidebar-power" title="Logout">⏻</a>
        </div>
      </aside>

      <div className="mainPanel">
        <header className="topbar">
          <div className="topbar-title">PureWL GTM Board</div>
          <DashboardControls
            startDate={startDate}
            endDate={endDate}
            preset={preset}
            source={source}
            dataFetchedAt={latestFetchedAt ?? undefined}
          />
        </header>

        <div className="content">
          <section className="section-heading">
            <span className="platform-badge">All Sources</span>
            Consolidated Overview
          </section>

          {!hasBackendData ? (
            <section className="sketch-card warningCard">
              Backend data is unavailable right now. Start PostgreSQL + Redis and backend to load live metrics.
            </section>
          ) : null}

          <section className="kpi-grid">
            <div className="kpi-card"><div className="kpi-label">Spend</div><div className="kpi-value">${Number(overview.spend ?? 0).toFixed(2)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Impressions</div><div className="kpi-value">{Number(overview.impressions ?? 0).toLocaleString()}</div></div>
            <div className="kpi-card"><div className="kpi-label">Clicks</div><div className="kpi-value">{Number(overview.clicks ?? 0).toLocaleString()}</div></div>
            <div className="kpi-card"><div className="kpi-label">CTR</div><div className="kpi-value">{(Number(overview.ctr ?? 0) * 100).toFixed(2)}%</div></div>
            <div className="kpi-card"><div className="kpi-label">Leads</div><div className="kpi-value">{consolidatedLeads.toLocaleString()}</div></div>
            <div className="kpi-card"><div className="kpi-label">Conversions</div><div className="kpi-value">{Number(overview.conversions ?? 0).toLocaleString()}</div></div>
          </section>

          <section className="sketch-card sectionCard">
            <div className="chart-label">Consolidated Totals by Source</div>
            <div className="collectiveGrid">
              {visibleChannels.map((sourceItem) => (
                <div className="collectiveItem" key={sourceItem.source}>
                  <div className="collectiveLabel">{formatSourceName(sourceItem.source)}</div>
                  <div className="collectiveValue">${toNumeric(sourceItem.spend).toFixed(2)}</div>
                  <div className="collectiveSub">Impressions: {toNumeric(sourceItem.impressions).toLocaleString()}</div>
                  <div className="collectiveSub">Clicks: {toNumeric(sourceItem.clicks).toLocaleString()}</div>
                  <div className="collectiveSub">
                    CTR:{" "}
                    {toNumeric(sourceItem.impressions) > 0
                      ? ((toNumeric(sourceItem.clicks) / toNumeric(sourceItem.impressions)) * 100).toFixed(2)
                      : "0.00"}
                    %
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="charts-row two-col">
            <div className="sketch-card chart-card tall">
              <div className="chart-label">Spend by Source</div>
              <div className="barChart">
                {spendChartChannels.map((item) => (
                  <div key={`bar-${item.source}`} className="barRow">
                    <div className="barLabel">{formatSourceName(item.source)}</div>
                    <div className="barTrack">
                      <div
                        className="barFill"
                        style={{ width: `${Math.max(6, (toNumeric(item.spend) / chartMaxSpend) * 100)}%` }}
                      />
                    </div>
                    <div className="barValue">${toNumeric(item.spend).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sketch-card chart-card tall">
              <div className="chart-label">{source ? `${formatSourceName(source)} Collective` : "All Sources Collective"}</div>
              <div className="collectiveGrid">
                <div className="collectiveItem">
                  <div className="collectiveLabel">Total Spend</div>
                  <div className="collectiveValue">${collectiveMetrics.spend.toFixed(2)}</div>
                </div>
                <div className="collectiveItem">
                  <div className="collectiveLabel">Total Impressions</div>
                  <div className="collectiveValue">{collectiveMetrics.impressions.toLocaleString()}</div>
                </div>
                <div className="collectiveItem">
                  <div className="collectiveLabel">Total Clicks</div>
                  <div className="collectiveValue">{collectiveMetrics.clicks.toLocaleString()}</div>
                </div>
                <div className="collectiveItem">
                  <div className="collectiveLabel">Total CTR</div>
                  <div className="collectiveValue">
                    {collectiveMetrics.impressions > 0
                      ? ((collectiveMetrics.clicks / collectiveMetrics.impressions) * 100).toFixed(2)
                      : "0.00"}
                    %
                  </div>
                </div>
                <div className="collectiveItem">
                  <div className="collectiveLabel">Total Leads</div>
                  <div className="collectiveValue">{collectiveLeads.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </section>

          {showGoogle ? <section id="google" className="section-heading"><span className="platform-badge">Google Ads</span>Campaigns</section> : null}
          {showGoogle ? <section className="sketch-card">
            <table className="sketch-table">
              <thead><tr><th>Campaign</th><th>Date Range</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
              <tbody>
                {googleRows.map((row, idx) => (
                  <tr key={`google-${idx}`}>
                    <td>{row.campaign_name}</td>
                    <td>{String(row.start_date).slice(0, 10)} to {String(row.end_date).slice(0, 10)}</td>
                    <td>${toNumeric(row.spend).toFixed(2)}</td>
                    <td>{toNumeric(row.impressions).toLocaleString()}</td>
                    <td>{toNumeric(row.clicks).toLocaleString()}</td>
                    <td>{(toNumeric(row.ctr) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showReddit ? <section id="reddit" className="section-heading"><span className="platform-badge">Reddit Ads</span>Campaigns</section> : null}
          {showReddit ? <section className="sketch-card">
            <table className="sketch-table">
              <thead><tr><th>Campaign</th><th>Date Range</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>CTR</th></tr></thead>
              <tbody>
                {redditRows.map((row, idx) => (
                  <tr key={`reddit-${idx}`}>
                    <td>{row.campaign_name}</td>
                    <td>{String(row.start_date).slice(0, 10)} to {String(row.end_date).slice(0, 10)}</td>
                    <td>${toNumeric(row.spend).toFixed(2)}</td>
                    <td>{toNumeric(row.impressions).toLocaleString()}</td>
                    <td>{toNumeric(row.clicks).toLocaleString()}</td>
                    <td>{(toNumeric(row.ctr) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showLinkedin ? <section id="linkedin" className="section-heading"><span className="platform-badge">LinkedIn Ads</span>Campaigns</section> : null}
          {showLinkedin ? <section className="sketch-card">
            <table className="sketch-table">
              <thead><tr><th>Campaign</th><th>Date Range</th><th>Spend</th><th>Impressions</th><th>Clicks</th><th>Form Submissions</th><th>CTR</th></tr></thead>
              <tbody>
                {linkedinRows.map((row, idx) => (
                  <tr key={`linkedin-${idx}`}>
                    <td>{row.campaign_name}</td>
                    <td>{String(row.start_date).slice(0, 10)} to {String(row.end_date).slice(0, 10)}</td>
                    <td>${toNumeric(row.spend).toFixed(2)}</td>
                    <td>{toNumeric(row.impressions).toLocaleString()}</td>
                    <td>{toNumeric(row.clicks).toLocaleString()}</td>
                    <td>{toNumeric(row.form_submissions ?? "0").toLocaleString()}</td>
                    <td>{(toNumeric(row.ctr) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showGa4 ? <section id="ga4" className="section-heading"><span className="platform-badge">GA4</span>Website Analytics</section> : null}
          {showGa4 ? <section className="sketch-card">
            <div className="chart-label">Leads by Source</div>
            {ga4LeadSources.length > 0 ? (
              <div className="collectiveGrid">
                {ga4LeadSources.map((row) => (
                  <div className="collectiveItem" key={`ga4-source-${row.source}`}>
                    <div className="collectiveLabel">{row.source}</div>
                    <div className="collectiveValue">{Number(row.submissions).toLocaleString()}</div>
                    <div className="collectiveSub">Leads</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rowItem">No leads found for this date range yet.</div>
            )}
          </section> : null}
          {showGa4 ? <section className="sketch-card">
            <table className="sketch-table">
              <thead><tr><th>Campaign</th><th>Source</th><th>Date</th><th>Leads</th></tr></thead>
              <tbody>
                {ga4Campaigns.slice(0, 20).map((row, idx) => (
                  <tr key={`ga4-${idx}`}>
                    <td>{row.source_campaign_id}</td>
                    <td>{row.traffic_source ?? "unknown"}</td>
                    <td>
                      {row.start_date && row.end_date
                        ? `${String(row.start_date).slice(0, 10)} to ${String(row.end_date).slice(0, 10)}`
                        : "-"}
                    </td>
                    <td>{Number(row.leads ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showLemlist ? <section id="lemlist" className="section-heading"><span className="platform-badge">Lemlist</span>Email Campaign Stats</section> : null}
          {showLemlist ? <section className="sketch-card">
            <div className="chart-label">Lemlist Collective</div>
            <div className="collectiveGrid">
              <div className="collectiveItem">
                <div className="collectiveLabel">Total Emails Sent</div>
                <div className="collectiveValue">{lemlistTotals.sent.toLocaleString()}</div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Total Opened</div>
                <div className="collectiveValue">{lemlistTotals.opened.toLocaleString()}</div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Total Clicked</div>
                <div className="collectiveValue">{lemlistTotals.clicked.toLocaleString()}</div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Total Open Rate</div>
                <div className="collectiveValue">{lemlistCtr.toFixed(2)}%</div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Total Replied</div>
                <div className="collectiveValue">{lemlistTotals.replied.toLocaleString()}</div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Total Reply Rate</div>
                <div className="collectiveValue">{lemlistReplyRate.toFixed(2)}%</div>
              </div>
            </div>
          </section> : null}
          {showLemlist ? <section className="sketch-card">
            <table className="sketch-table">
              <thead><tr><th>Campaign</th><th>Emails Sent</th><th>Opened</th><th>Clicked</th><th>Open Rate</th><th>Replied</th><th>Reply Rate</th></tr></thead>
              <tbody>
                {lemlistCampaigns.map((row, idx) => (
                  <tr key={`lemlist-${idx}`}>
                    <td>{row.campaign_name}</td>
                    <td>{Number(row.emails_sent ?? 0).toLocaleString()}</td>
                    <td>{Number(row.opened ?? 0).toLocaleString()}</td>
                    <td>{Number(row.clicked ?? 0).toLocaleString()}</td>
                    <td>{(Number(row.open_rate ?? 0) * 100).toFixed(2)}%</td>
                    <td>{Number(row.replied ?? 0).toLocaleString()}</td>
                    <td>{(Number(row.reply_rate ?? 0) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showHubspot ? <section id="hubspot" className="section-heading"><span className="platform-badge">HubSpot</span>CRM & Pipeline</section> : null}
          {showHubspot ? <section className="sketch-card">
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Total Synced Emails</div><div className="kpi-value">{Number(hubspotDetails.summary.total_emails).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">Matched in HubSpot</div><div className="kpi-value">{Number(hubspotDetails.summary.matched_emails).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">Not Found</div><div className="kpi-value">{Number(hubspotDetails.summary.unmatched_emails).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">Deals Created</div><div className="kpi-value">{Number(hubspotDetails.summary.deals_created ?? 0).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">MQL</div><div className="kpi-value">{Number(hubspotDetails.summary.mql_count ?? 0).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">SQL</div><div className="kpi-value">{Number(hubspotDetails.summary.sql_count ?? 0).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">Customers</div><div className="kpi-value">{Number(hubspotDetails.summary.customer_count ?? 0).toLocaleString()}</div></div>
            </div>
            <div className="collectiveGrid">
              <div className="collectiveItem">
                <div className="collectiveLabel">Match Rate</div>
                <div className="collectiveValue">
                  {Number(hubspotDetails.summary.total_emails) > 0
                    ? `${((Number(hubspotDetails.summary.matched_emails) / Number(hubspotDetails.summary.total_emails)) * 100).toFixed(1)}%`
                    : "0.0%"}
                </div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Owner Assigned Rate</div>
                <div className="collectiveValue">
                  {Number(hubspotDetails.summary.matched_emails) > 0
                    ? `${((Number(hubspotDetails.summary.assigned_owner_count ?? 0) / Number(hubspotDetails.summary.matched_emails)) * 100).toFixed(1)}%`
                    : "0.0%"}
                </div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Ad Clicks</div>
                <div className="collectiveValue">{Number(funnel.ad_clicks).toLocaleString()}</div>
              </div>
              <div className="collectiveItem">
                <div className="collectiveLabel">Form Submissions</div>
                <div className="collectiveValue">{Number(funnel.form_submissions).toLocaleString()}</div>
              </div>
            </div>
            {hubspotRows.length > 0 ? (
              <table className="sketch-table">
                <thead><tr><th>Campaign</th><th>Date Range</th><th>Leads</th></tr></thead>
                <tbody>
                  {hubspotRows.map((row, idx) => (
                    <tr key={`hubspot-${idx}`}>
                      <td>{row.campaign_name}</td>
                      <td>{String(row.start_date).slice(0, 10)} to {String(row.end_date).slice(0, 10)}</td>
                      <td>{toNumeric((channels.find((c) => c.source === "hubspot")?.leads as string) ?? "0").toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <div className="chart-label">Owner Breakdown</div>
            <table className="sketch-table">
              <thead><tr><th>Owner</th><th>Matched</th><th>MQL</th><th>SQL</th><th>Customers</th></tr></thead>
              <tbody>
                {hubspotDetails.owners.map((owner, idx) => (
                  <tr key={`hubspot-owner-${idx}`}>
                    <td>{owner.owner_name}</td>
                    <td>{Number(owner.matched_contacts).toLocaleString()}</td>
                    <td>{Number(owner.mql).toLocaleString()}</td>
                    <td>{Number(owner.sql).toLocaleString()}</td>
                    <td>{Number(owner.customers).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showFluentForms ? <section className="section-heading"><span className="platform-badge">Fluent Forms</span>MQL & SQL Leads</section> : null}
          {showFluentForms ? <section className="sketch-card">
            <div className="kpi-grid">
              <div className="kpi-card"><div className="kpi-label">Total Priority Leads</div><div className="kpi-value">{Number(fluentLeads.summary.total).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">MQL</div><div className="kpi-value">{Number(fluentLeads.summary.mql).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">SQL</div><div className="kpi-value">{Number(fluentLeads.summary.sql).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">Checked vs HubSpot</div><div className="kpi-value">{Number(fluentHubspotMatches.summary.checked).toLocaleString()}</div></div>
              <div className="kpi-card"><div className="kpi-label">Matched in HubSpot</div><div className="kpi-value">{Number(fluentHubspotMatches.summary.matched).toLocaleString()}</div></div>
            </div>
            <div className="chart-label">MQL Leads</div>
            <table className="sketch-table">
              <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Priority</th><th>Tab</th></tr></thead>
              <tbody>
                {fluentLeads.mql.slice(0, 50).map((row, idx) => (
                  <tr key={`fluent-mql-${idx}`}>
                    <td>{row.date}</td>
                    <td>{row.name || "-"}</td>
                    <td>{row.email}</td>
                    <td>{row.priority}</td>
                    <td>{row.source_tab}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="chart-label">SQL Leads</div>
            <table className="sketch-table">
              <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Priority</th><th>Tab</th></tr></thead>
              <tbody>
                {fluentLeads.sql.slice(0, 50).map((row, idx) => (
                  <tr key={`fluent-sql-${idx}`}>
                    <td>{row.date}</td>
                    <td>{row.name || "-"}</td>
                    <td>{row.email}</td>
                    <td>{row.priority}</td>
                    <td>{row.source_tab}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="chart-label">Fluent Leads Found in HubSpot</div>
            <table className="sketch-table">
              <thead><tr><th>Name</th><th>Email</th><th>Lead Type</th><th>Priority</th><th>Lifecycle</th><th>Owner</th><th>Tab</th></tr></thead>
              <tbody>
                {fluentHubspotMatches.matched.slice(0, 100).map((row, idx) => (
                  <tr key={`fluent-hubspot-match-${idx}`}>
                    <td>{row.name || "-"}</td>
                    <td>{row.email}</td>
                    <td>{row.lead_type}</td>
                    <td>{row.priority}</td>
                    <td>{row.lifecycle_stage ?? "unknown"}</td>
                    <td>{row.owner_name ?? "Unassigned"}</td>
                    <td>{row.source_tab}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          {showUsers ? <section className="section-heading"><span className="platform-badge">Users</span>Last Login Activity</section> : null}
          {showUsers ? <section className="sketch-card">
            <table className="sketch-table">
              <thead><tr><th>Name</th><th>Email</th><th>IP</th><th>Last Login</th></tr></thead>
              <tbody>
                {userLogins.slice(0, 200).map((row, idx) => (
                  <tr key={`user-login-${idx}`}>
                    <td>{row.name || "-"}</td>
                    <td>{row.email || "-"}</td>
                    <td>{row.ip || "unknown"}</td>
                    <td>{formatLocalDateTime(row.logged_in_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section> : null}

          <section className="sketch-card sectionCard">
            <div className="chart-label">Source Freshness</div>
            {sourceStatus.map((s) => (
              <div key={s.source_name} className="rowItem">
                {s.source_name}: {formatLocalDateTime(s.last_successful_sync_at)}
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
