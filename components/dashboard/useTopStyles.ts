"use client";

import { useCallback, useEffect, useState } from "react";
import type { TopStyleRow, TopStylesPeriod } from "@/lib/dashboard";

async function fetchTopStyles(period: TopStylesPeriod, limit: number): Promise<TopStyleRow[]> {
  const res = await fetch(`/api/dashboard/top-styles?period=${period}&limit=${limit}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Failed to load top styles (${res.status})`);
  }
  return res.json() as Promise<TopStyleRow[]>;
}

export function useTopStyles(limit = 5) {
  const [tab, setTab] = useState<TopStylesPeriod>("year");
  const [byPeriod, setByPeriod] = useState<Partial<Record<TopStylesPeriod, TopStyleRow[]>>>({});
  const [loading, setLoading] = useState<Partial<Record<TopStylesPeriod, boolean>>>({
    year: true,
    all_time: true,
  });
  const [errors, setErrors] = useState<Partial<Record<TopStylesPeriod, string>>>({});

  const loadPeriod = useCallback(
    async (period: TopStylesPeriod) => {
      setLoading((l) => ({ ...l, [period]: true }));
      setErrors((e) => {
        const next = { ...e };
        delete next[period];
        return next;
      });
      try {
        const rows = await fetchTopStyles(period, limit);
        setByPeriod((p) => ({ ...p, [period]: rows }));
      } catch (err) {
        setErrors((e) => ({
          ...e,
          [period]: err instanceof Error ? err.message : "Failed to load",
        }));
      } finally {
        setLoading((l) => ({ ...l, [period]: false }));
      }
    },
    [limit],
  );

  useEffect(() => {
    void loadPeriod("year");
    void loadPeriod("all_time");
  }, [loadPeriod]);

  useEffect(() => {
    if (byPeriod[tab] === undefined && !loading[tab]) {
      void loadPeriod(tab);
    }
  }, [tab, byPeriod, loading, loadPeriod]);

  const rows = byPeriod[tab] ?? [];
  const isLoading = loading[tab] ?? (rows.length === 0 && !errors[tab]);

  return {
    tab,
    setTab,
    rows,
    isLoading,
    error: errors[tab] ?? null,
    reload: () => void loadPeriod(tab),
  };
}
