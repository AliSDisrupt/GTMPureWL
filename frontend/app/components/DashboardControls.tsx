"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type DashboardControlsProps = {
  startDate: string;
  endDate: string;
  preset: string;
  source?: string;
  dataFetchedAt?: string;
};

type PresetValue = "today" | "yesterday" | "7d" | "30d" | "90d" | "mtd";
type ActiveDateFilter = PresetValue | "custom";

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPresetRange(preset: PresetValue): { startDate: string; endDate: string } {
  const today = new Date();
  let end = new Date(today);
  let start = new Date(today.getTime() - 30 * 86400000);

  if (preset === "today") {
    start = new Date(today);
    end = new Date(today);
  } else if (preset === "yesterday") {
    start = new Date(today.getTime() - 86400000);
    end = new Date(today.getTime() - 86400000);
  } else if (preset === "7d") {
    // Inclusive range: today + previous 6 days = 7 days total.
    start = new Date(today.getTime() - 6 * 86400000);
  } else if (preset === "90d") {
    // Inclusive range: today + previous 89 days = 90 days total.
    start = new Date(today.getTime() - 89 * 86400000);
  } else if (preset === "mtd") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

function buildUrl(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export default function DashboardControls({ startDate, endDate, preset, source, dataFetchedAt }: DashboardControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState(0);
  const [updateLabel, setUpdateLabel] = useState("Updating dashboard...");
  const [lastUpdated, setLastUpdated] = useState("--:--:--");
  const [customStartDate, setCustomStartDate] = useState(startDate);
  const [customEndDate, setCustomEndDate] = useState(endDate);
  const fetchedTimeLabel = dataFetchedAt
    ? new Date(dataFetchedAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "Not fetched yet";

  const currentParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  useEffect(() => {
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    const timer = setInterval(() => {
      setUpdateLabel("Auto-updating data...");
      startTransition(() => {
        router.refresh();
      });
    }, 15 * 60 * 1000);
    return () => clearInterval(timer);
  }, [router, startTransition]);

  useEffect(() => {
    if (!isPending) {
      setProgress(100);
      const doneTimer = setTimeout(() => setProgress(0), 280);
      return () => clearTimeout(doneTimer);
    }

    const progressTimer = setInterval(() => {
      setProgress((value) => (value >= 92 ? value : value + 8));
    }, 120);

    return () => clearInterval(progressTimer);
  }, [isPending]);

  useEffect(() => {
    setLastUpdated(
      new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    );
  }, []);

  useEffect(() => {
    if (!isPending) {
      setLastUpdated(
        new Date().toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    }
  }, [isPending]);

  const applyPreset = (presetValue: PresetValue): void => {
    const params = new URLSearchParams(currentParams.toString());
    const range = getPresetRange(presetValue);
    params.set("preset", presetValue);
    params.set("startDate", range.startDate);
    params.set("endDate", range.endDate);
    if (source) {
      params.set("source", source);
    }

    setUpdateLabel("Updating dashboard...");
    startTransition(() => {
      router.push(buildUrl(pathname, params));
    });
  };

  const activeDateFilter: ActiveDateFilter = (preset === "today" || preset === "yesterday" || preset === "7d" || preset === "30d" || preset === "90d" || preset === "mtd")
    ? preset
    : "custom";

  const applyCustomRange = (nextStart: string, nextEnd: string): void => {
    const params = new URLSearchParams(currentParams.toString());

    params.set("preset", "custom");
    params.set("startDate", nextStart);
    params.set("endDate", nextEnd);
    if (source) {
      params.set("source", source);
    }

    setUpdateLabel("Updating dashboard...");
    startTransition(() => {
      router.push(buildUrl(pathname, params));
    });
  };

  return (
    <>
      <div className="presetRow">
        <button type="button" className={`preset-btn ${activeDateFilter === "today" ? "active" : ""}`} onClick={() => applyPreset("today")}>
          Today
        </button>
        <button type="button" className={`preset-btn ${activeDateFilter === "yesterday" ? "active" : ""}`} onClick={() => applyPreset("yesterday")}>
          Yesterday
        </button>
        <button type="button" className={`preset-btn ${activeDateFilter === "7d" ? "active" : ""}`} onClick={() => applyPreset("7d")}>
          Last 7d
        </button>
        <button type="button" className={`preset-btn ${activeDateFilter === "30d" ? "active" : ""}`} onClick={() => applyPreset("30d")}>
          Last 30d
        </button>
        <button type="button" className={`preset-btn ${activeDateFilter === "90d" ? "active" : ""}`} onClick={() => applyPreset("90d")}>
          Last 90d
        </button>
        <button type="button" className={`preset-btn ${activeDateFilter === "mtd" ? "active" : ""}`} onClick={() => applyPreset("mtd")}>
          MTD
        </button>
      </div>

      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          applyCustomRange(customStartDate, customEndDate);
        }}
      >
        <input type="hidden" name="preset" value={preset} />
        <label>
          <span>Start Date</span>
          <input
            type="date"
            name="startDate"
            value={customStartDate}
            onChange={(event) => setCustomStartDate(event.target.value)}
          />
        </label>
        <label>
          <span>End Date</span>
          <input
            type="date"
            name="endDate"
            value={customEndDate}
            onChange={(event) => setCustomEndDate(event.target.value)}
          />
        </label>
        <button type="submit">{isPending ? "Updating..." : "Apply"}</button>
      </form>

      <div className="last-updated">Last updated: {lastUpdated}</div>
      <div className="last-fetched">Data fetched at: {fetchedTimeLabel}</div>

      {progress > 0 ? (
        <div className="loading-toast" role="status" aria-live="polite">
          <div className="loading-toast-title">{updateLabel}</div>
          <div className="loading-track">
            <div className="loading-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="loading-percent">{Math.min(progress, 100)}%</div>
        </div>
      ) : null}
    </>
  );
}
