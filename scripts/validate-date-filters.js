const fs = require("node:fs");

function getEnv(name) {
  const env = fs.readFileSync(".env", "utf8");
  const line = env.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1) : "";
}

function matchesAccount(source, row, configuredAccount) {
  const accountName = String(row.account_name ?? "").trim().toLowerCase();
  const target = String(configuredAccount ?? "").trim().toLowerCase();
  if (source === "hubspot") return true;
  return accountName === target;
}

async function main() {
  const cfg = {
    google_ads: { ds: "google_ads", acct: getEnv("WINDSOR_ACCOUNT_GOOGLE_ADS") },
    linkedin_forms: { ds: "linkedin", acct: getEnv("WINDSOR_ACCOUNT_LINKEDIN") },
    reddit_ads: { ds: "reddit", acct: getEnv("WINDSOR_ACCOUNT_REDDIT") },
    hubspot: { ds: "hubspot", acct: getEnv("WINDSOR_ACCOUNT_HUBSPOT") }
  };

  const url = new URL(getEnv("WINDSOR_CONNECTOR_URL"));
  url.searchParams.set(
    "fields",
    "account_name,campaign,clicks,impressions,datasource,date,source,spend,sessions,email,activities___id"
  );

  const ranges = [
    ["2026-04-20", "2026-04-26"],
    ["2026-04-21", "2026-04-27"]
  ];

  const res = await fetch(url.toString());
  const payload = await res.json();
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];

  for (const [startDate, endDate] of ranges) {
    const apiRes = await fetch(
      `http://localhost:4000/channels/breakdown?startDate=${startDate}&endDate=${endDate}`
    );
    const apiRows = await apiRes.json();
    const bySource = Object.fromEntries((apiRows ?? []).map((r) => [r.source, r]));

    console.log(`\nRANGE ${startDate}..${endDate}`);
    for (const [source, c] of Object.entries(cfg)) {
      const sourceRows = rows.filter(
        (r) =>
          String(r.datasource ?? "")
            .toLowerCase()
            .startsWith(c.ds) && matchesAccount(source, r, c.acct)
      );
      const filtered = sourceRows.filter((r) => {
        const d = String(r.date ?? "");
        return d >= startDate && d <= endDate;
      });

      const wClicks = filtered.reduce((a, b) => a + Number(b.clicks ?? 0), 0);
      const wImpr = filtered.reduce(
        (a, b) =>
          a +
          (source === "ga4"
            ? Math.max(Number(b.impressions ?? 0), Number(b.sessions ?? 0), Number(b.clicks ?? 0))
            : Math.max(Number(b.impressions ?? 0), Number(b.clicks ?? 0))),
        0
      );

      const db = bySource[source] ?? { clicks: 0, impressions: 0 };
      const dClicks = Number(db.clicks ?? 0);
      const dImpr = Number(db.impressions ?? 0);
      const ok = wClicks === dClicks && wImpr === dImpr;
      console.log(
        `${source}: WIN clicks=${wClicks} impr=${wImpr} | DB clicks=${dClicks} impr=${dImpr} | ${
          ok ? "OK" : "DIFF"
        }`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
