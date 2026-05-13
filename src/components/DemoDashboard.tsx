"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DemoFileEntry,
  DemosListResponse,
  NormalizedParseResult,
  ParseDemoResponse,
} from "@/contracts/demos";

type ListState =
  | { status: "loading" }
  | { status: "ready"; demos: DemoFileEntry[] }
  | { status: "error"; message: string };

export function DemoDashboard() {
  const [listState, setListState] = useState<ListState>({ status: "loading" });
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<NormalizedParseResult | null>(null);

  const loadDemos = useCallback(async (opts?: { skipLoading?: boolean }) => {
    if (!opts?.skipLoading) {
      setListState({ status: "loading" });
      setParseError(null);
    }
    try {
      const res = await fetch("/api/demos");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as DemosListResponse;
      setListState({ status: "ready", demos: json.demos });
    } catch (e) {
      setListState({
        status: "error",
        message: e instanceof Error ? e.message : "Failed to load demos",
      });
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadDemos({ skipLoading: true });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadDemos]);

  const parseDemo = useCallback(async (fileName: string) => {
    setParseLoading(true);
    setParseError(null);
    setResult(null);
    try {
      const res = await fetch("/api/demos/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }),
      });
      const json = (await res.json()) as ParseDemoResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setResult(json.result);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Parse request failed");
    } finally {
      setParseLoading(false);
    }
  }, []);

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      fileName: result.fileName,
      map: result.mapName ?? "—",
      duration:
        result.durationSeconds != null
          ? `${result.durationSeconds.toFixed(1)}s`
          : "—",
      players: result.players.length,
      rounds: result.rounds.length,
      kills: result.kills.length,
      warnings: result.parserWarnings.length,
      status: result.status,
    };
  }, [result]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          CS2 AI Demo Analyzer
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Phase 1: local samples scanner and demofile-backed parse results.
        </p>
        <button
          type="button"
          onClick={() => void loadDemos()}
          className="self-start rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Refresh list
        </button>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Samples (.dem)
        </h2>
        {listState.status === "loading" ? (
          <p className="text-sm text-zinc-500">Scanning samples folder…</p>
        ) : null}
        {listState.status === "error" ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {listState.message}
          </p>
        ) : null}
        {listState.status === "ready" && listState.demos.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No .dem files in <code className="font-mono">/samples</code>. Add
            demos and refresh.
          </p>
        ) : null}
        {listState.status === "ready" && listState.demos.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {listState.demos.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => void parseDemo(d.fileName)}
                  disabled={parseLoading}
                  className="flex w-full flex-col items-start gap-1 rounded border border-zinc-200 bg-white p-4 text-left text-sm hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {d.fileName}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {(d.size / (1024 * 1024)).toFixed(2)} MB ·{" "}
                    {new Date(d.modifiedAt).toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    Parse
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Parse
        </h2>
        {parseLoading ? (
          <p className="text-sm text-zinc-500">Parsing selected demo…</p>
        ) : null}
        {parseError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>
        ) : null}
      </section>

      {summary ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Summary
          </h2>
          {result?.status === "error" && result.errorMessage ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {result.errorMessage}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="File" value={summary.fileName} />
            <SummaryCard label="Map" value={String(summary.map)} />
            <SummaryCard label="Duration" value={summary.duration} />
            <SummaryCard label="Players" value={String(summary.players)} />
            <SummaryCard label="Rounds" value={String(summary.rounds)} />
            <SummaryCard label="Kills" value={String(summary.kills)} />
            <SummaryCard label="Warnings" value={String(summary.warnings)} />
            <SummaryCard label="Status" value={summary.status} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Raw JSON
            </h3>
            <pre className="max-h-[480px] overflow-auto rounded border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 break-all text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {value}
      </div>
    </div>
  );
}
