# Real-Time Marketing Dashboard

Custom monorepo for a 15-30 minute refresh dashboard that combines:

- HubSpot
- Lemlist
- Windsor
- LinkedIn Lead Gen Forms
- Google Ads
- Reddit Ads
- Google Analytics 4

## Structure

- `frontend`: Next.js dashboard UI.
- `backend`: API for KPI and campaign analytics queries.
- `worker`: Scheduled ingestion, normalization, and matching jobs.
- `db`: SQL schema and migration scripts.

## Quick Start

1. Copy `.env.example` to `.env` and fill credentials.
2. Install dependencies:
   - `npm install`
3. Start services:
   - `npm run dev`

## Data Flow

1. `worker` pulls platform APIs every 15-30 minutes.
2. Raw payloads are stored in raw tables.
3. Normalization builds canonical fact/dimension tables.
4. API serves aggregated metrics to the dashboard.
