"use client";

import { useCallback, useEffect, useState } from "react";
import type { TopClientRow, TopClientsPeriod } from "@/lib/dashboard";

async function fetchTopClients(period: TopClientsPeriod, limit: number): Promise<TopClientRow[]> {
  const res = await fetch(`/api/dashboard/top-clients?period=${period}&limit=${limit}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Failed to load top clients (${res.status})`);
  }
  return res.json() as Promise<TopClientRow[]>;
}

export function useTopClients(limit = 6) {
  const [tab, setTab] = useState<TopClientsPeriod>("month");
  const [byPeriod, setByPeriod] = useState<Partial<Record<TopClientsPeriod, TopClientRow[]>>>({});
  const [loading, setLoading] = useState<Partial<Record<TopClientsPeriod, boolean>>>({
    month: true,
    last_3_months: true,
    all_time: true,
  });
  const [errors, setErrors] = useState<Partial<Record<TopClientsPeriod, string>>>({});

  const loadPeriod = useCallback(
    async (period: TopClientsPeriod) => {
      setLoading((l) => ({ ...l, [period]: true }));
      setErrors((e) => {
        const next = { ...e };
        delete next[period];
        return next;
      });
      try {
        const rows = await fetchTopClients(period, limit);
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
    void loadPeriod("month");
    void loadPeriod("last_3_months");
    void loadPeriod("all_time");
  }, [loadPeriod]);

  const rows = byPeriod[tab] ?? [];
  const isLoading = loading[tab] ?? (rows.length === 0 && !errors[tab]);

  return {
    tab,
    setTab,
    rows,
    isLoading,
    error: errors[tab] ?? null,
  };
}
