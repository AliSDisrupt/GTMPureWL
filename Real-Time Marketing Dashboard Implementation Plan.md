# Real-Time Marketing Dashboard Implementation Plan

## 1) Project Overview

This project is a production-style, near real-time marketing intelligence board for PureWL. It unifies paid media, website analytics, outreach, CRM, and lead-intake workflows into one dashboard with source-specific views and consolidated reporting.

Current product title in UI: **PureWL GTM Board**

Primary goals:
- Consolidate multi-source campaign performance in one place
- Support date-filtered reporting and source-specific drilldowns
- Surface lead outcomes and CRM match visibility
- Keep data fresh with scheduled ingestion and manual refresh capability

---

## 2) Implemented Stack

- **Frontend:** Next.js 14, React, TypeScript, App Router
- **Backend API:** Fastify + TypeScript
- **Worker/Ingestion:** Node.js + TypeScript + BullMQ
- **Database:** PostgreSQL
- **Queue/Cache:** Redis
- **Monorepo orchestration:** npm workspaces

Workspace layout:
- `frontend/`
- `backend/`
- `worker/`
- `db/`
- `shared/`

---

## 3) Data Sources Integrated

### Windsor AI Connector (single connector feed, filtered by account/source)
- Google Ads
- Reddit Ads
- LinkedIn Ads/Forms
- HubSpot rows (email-level records from connector)
- GA4 (`googleanalytics4__PureWL - PureVPN/WL`)

### Lemlist Direct API
- Campaigns
- Campaign stats
- Activity-level event aggregation (`emailsSent`, `emailsOpened`, `emailsClicked`, `emailsReplied`)
- Running campaign filtering and merged metrics

### Fluent Form Google Sheet
Spreadsheet:
`https://docs.google.com/spreadsheets/d/1T1P5o6vSdgLjsMxzsxJx4hPNtfz-homeji2__ZlVH30/edit`

Tabs:
- White-label
- Vpn Reseller-Paid
- Vpn Reseller - Organic
- PurewL
- PureWL - Contact US

Parsed columns:
- A = Date (`dd/mm/yyyy`)
- C = Name
- D = Email
- E = Company (currently not displayed in UI)
- K = Priority
- T = Lead Type

Filter logic:
- Priority in `Low Intent`, `Mid Intent`, `High Intent`
- Lead Type in `MQL`, `SQL`
- Date range filter applied

---

## 4) Data Model (Current)

Key relational tables/views:
- `source_sync_status`
- `raw_campaign_payloads`
- `dim_campaign`
- `fact_campaign_performance`
- `fact_forms`
- `fact_web_analytics`
- `fact_email_outreach`
- `hubspot_contacts`
- `map_email_to_crm`
- `campaign_performance_view`

Notable behaviors:
- Idempotent upserts on raw and fact tables
- GA4 form events mapped via `Lead_Generated_All_Sites`
- Lemlist metrics normalized into campaign performance facts
- Email-based CRM matching pipeline:
  - outreach emails (incl. Lemlist/event sources) -> `fact_email_outreach`
  - HubSpot emails -> `hubspot_contacts`
  - join into `map_email_to_crm`

---

## 5) Backend API Coverage (Implemented)

Core:
- `GET /health`
- `GET /sources/status`
- `GET /kpi/overview`
- `GET /campaigns/summary`
- `GET /channels/breakdown`
- `GET /funnel`

GA4:
- `GET /ga4/campaigns`
- `GET /ga4/lead-sources`

Lemlist:
- `GET /lemlist/campaigns`

HubSpot/CRM:
- `GET /hubspot/details`
- `GET /matches/lemlist-hubspot`
- `GET /hubspot/matched-leads` (with domain exclusions)

Fluent Form:
- `GET /fluentform/leads`
- `GET /fluentform/hubspot-matches`

Auth:
- `GET /api/auth/google`
- `GET /api/auth/google/callback`
- `POST /api/auth/local`
- `GET /api/auth/logout`

---

## 6) Frontend Features (Implemented)

### Dashboard Structure
- Sidebar source navigation:
  - Home
  - Google Ads
  - Reddit Ads
  - LinkedIn Ads
  - GA4
  - Lemlist
  - Fluent Forms
  - HubSpot
- Top bar with title: **PureWL GTM Board**
- Date presets:
  - Today
  - Yesterday
  - Last 7d
  - Last 30d
  - Last 90d
  - MTD
- Custom date range apply
- Loading toast with progress
- Auto-refresh (15 min)
- Last updated + Data fetched indicators
- Source freshness list in local time format

### KPI Logic Highlights
- Consolidated and collective lead logic tuned to requested source combinations
- Spend chart excludes HubSpot and GA4
- Source-specific tables and all-sources aggregate cards

### HubSpot Tab
- KPI cards:
  - Total Synced Emails
  - Matched in HubSpot
  - Not Found
  - Deals Created (proxy via lifecycle/opportunity-customer logic)
  - MQL / SQL / Customers
- Match/owner quality cards
- Owner breakdown table

### Fluent Forms Tab
- Priority-filtered lead ingestion from sheet
- Separate MQL and SQL tables
- HubSpot cross-check:
  - Checked vs HubSpot
  - Matched in HubSpot
  - Matched list table

---

## 7) Auth & Access (Implemented)

### Login Entry
- `/login` shown first for unauthenticated users
- Dashboard route guarded by auth cookie

### Local Auth
- Username: `admin`
- Password: `DisruptPartnerships2026`

### Google OAuth
- Real OAuth redirect + callback
- Domain allowlist enforced:
  - `purevpn.com`
  - `purewl.com`
  - `disrupt.com`

Cookies set on login:
- `purewl_auth`
- `purewl_auth_name`
- `purewl_auth_email`
- `purewl_auth_picture` (Google profile image when available)

Logout:
- Power button clears auth cookies and redirects to `/login`

User display:
- Sidebar footer shows logged-in user name/email
- Avatar uses Google picture; fallback uses email-based identicon

---

## 8) Reliability & Validation Notes

- End-to-end `npm run build` currently passes (backend + worker + frontend)
- Hydration mismatch on last-updated clock fixed
- Queue collision issue (quality checks vs ingestion) fixed by separate queue strategy
- LinkedIn/Reddit cleanup + re-sync steps were executed to align account-filtered metrics
- Lemlist aggregation improved for follow-up coverage and reply rate reliability

---

## 9) Known Current Data Caveats

- HubSpot connector payloads may lack rich CRM fields (e.g., deal stage, owner), which can cause `unknown`/`Unassigned` in certain views
- True deal object ingestion from HubSpot CRM APIs is not fully modeled yet (current deals-created metric is lifecycle-based proxy)

---

## 10) Recommended Next Phase

1. **Native HubSpot CRM deals ingestion**
   - add `hubspot_deals`, `hubspot_owners`, `hubspot_contact_deal_assoc`
   - expose real won/lost/pipeline value and stage analytics

2. **Hardening matching quality**
   - richer email normalization
   - confidence scoring on matches
   - match reason metadata in API responses

3. **Performance & governance**
   - cached API slices for expensive joins
   - endpoint-level observability (duration/error tags)
   - ingestion audit dashboards

4. **Auth production hardening**
   - secure cookies in prod (`secure: true`)
   - secret rotation policy
   - role-based page access

---

## 11) Operational Commands

Development:
- `npm run dev`

Validation:
- `npm run lint --workspace backend`
- `npm run lint --workspace worker`
- `npm run lint --workspace frontend`
- `npm run build`

