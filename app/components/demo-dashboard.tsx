"use client";

import type { FC } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

// types
import type {
  AnalysisReportT,
  DemoFileT,
  ListDemosResponseT,
  NormalizedParseResultT,
  NormalizedRoundT,
  ParseAllDemosResponseT,
  ParseDemoResponseT,
  TacticalFindingT,
} from "@/app/api/demos/demos.types";

type DemosListStateT =
  | { status: "loading" }
  | { status: "ready"; demos: DemoFileT[] }
  | { status: "error"; message: string };

const FINDINGS_FILTER_SUMMARY_UK =
  "Показано тільки найімовірніші необережні смерті. Нормальні трейди, корисні entry-смерті та хаотичні масові перестрілки відфільтровані.";

const VIDEO_CLIP_MIN_CONFIDENCE = 0.65;
const VIDEO_CLIP_MIN_BAD_SCORE = 3;
const VIDEO_CLIP_MAX = 5;

const EMPTY_VALID_MOMENTS_UK =
  "Валідних моментів для ручної перевірки не знайдено. Можливо, потрібні точніші telemetry-поля або м'якші пороги детектора.";

const strNonEmpty = (s: string | null | undefined): s is string =>
  typeof s === "string" && s.trim().length > 0;

/** Mirrors server `resolveRoundContainingTick` (client-safe). */
const resolveRoundNumberFromTicks = (
  tick: number,
  rounds: NormalizedRoundT[]
): number | null => {
  if (!Number.isFinite(tick) || rounds.length === 0) return null;
  const sorted = [...rounds].sort((a, b) => a.roundNumber - b.roundNumber);
  for (const r of sorted) {
    if (r.startTick == null || !Number.isFinite(r.startTick)) continue;
    if (tick < r.startTick) continue;
    if (r.endTick != null && Number.isFinite(r.endTick) && tick > r.endTick)
      continue;
    return r.roundNumber;
  }
  return null;
};

const enrichFindingRoundNumber = (
  f: TacticalFindingT,
  rounds: NormalizedRoundT[]
): TacticalFindingT => {
  const rn = f.roundNumber;
  if (typeof rn === "number" && Number.isFinite(rn) && rn > 0) return f;
  const deathTick = f.clip?.deathTick ?? f.tick;
  const resolved =
    typeof deathTick === "number" && Number.isFinite(deathTick)
      ? resolveRoundNumberFromTicks(deathTick, rounds)
      : null;
  if (resolved == null) return f;
  return { ...f, roundNumber: resolved };
};

const isValidReviewFinding = (f: TacticalFindingT): boolean => {
  if (f.type !== "FALSE_CONFIDENCE_DEATH") return false;
  const r = f.roundNumber;
  if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) return false;
  const c = f.clip;
  if (c == null) return false;
  if (
    typeof c.deathTimeSeconds !== "number" ||
    !Number.isFinite(c.deathTimeSeconds) ||
    c.deathTimeSeconds <= 0
  )
    return false;
  if (!strNonEmpty(c.deathTimeLabel)) return false;
  if (c.deathTimeLabel.trim() === "0:00") return false;
  if (!strNonEmpty(c.clipStartLabel)) return false;
  if (!strNonEmpty(c.clipEndLabel)) return false;
  return true;
};

const prepareReviewFindings = (
  findings: TacticalFindingT[] | undefined,
  rounds: NormalizedRoundT[]
): TacticalFindingT[] => {
  const list = findings ?? [];
  const rs = rounds ?? [];
  return list
    .map((f) => enrichFindingRoundNumber(f, rs))
    .filter(isValidReviewFinding);
};

const selectVideoReadyFindings = (
  findings: TacticalFindingT[]
): TacticalFindingT[] => {
  const list = findings.filter(
    (f) =>
      isValidReviewFinding(f) &&
      f.quality != null &&
      f.quality.badDeathScore >= VIDEO_CLIP_MIN_BAD_SCORE &&
      f.confidence >= VIDEO_CLIP_MIN_CONFIDENCE
  );
  list.sort((a, b) => {
    const bd =
      (b.quality?.badDeathScore ?? 0) - (a.quality?.badDeathScore ?? 0);
    if (bd !== 0) return bd;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (a.clip?.clipStartSeconds ?? 0) - (b.clip?.clipStartSeconds ?? 0);
  });
  return list.slice(0, VIDEO_CLIP_MAX);
};

const TELEMETRY_DISCLAIMER_UK =
  "Оцінка базується на доступній demo-телеметрії та потребує ручної перевірки у відео.";

type MistakeTagUiT = NonNullable<TacticalFindingT["mistakeTags"]>[number];

const mistakeTagShortUk = (t: MistakeTagUiT): string => {
  const m: Record<MistakeTagUiT, string> = {
    NO_UTILITY_BEFORE_CONTACT: "без утиліти перед боєм",
    FAST_ENTRY_BEFORE_DEATH: "дуже ранній вихід",
    NO_TRADE_SUPPORT: "немає трейду",
    ISOLATED_POSITION: "без прикриття союзником",
    SHORT_TIME_TO_DEATH: "швидко після контакту",
    POSSIBLE_NO_CLEAR: "імовірно не перевірили кут",
    HEADSHOT_PUNISH: "хедшот-кара",
  };
  return m[t] ?? t;
};

const buildClipTimecodesCopyText = (f: TacticalFindingT): string => {
  const c = f.clip!;
  const round =
    typeof f.roundNumber === "number" && f.roundNumber > 0
      ? String(f.roundNumber)
      : "";
  const reason = (f.shortReason ?? "").trim() || "—";
  return [
    `Гравець: ${f.playerName}`,
    `Раунд: ${round}`,
    `Період: ${c.clipStartLabel}–${c.clipEndLabel}`,
    `Смерть: ${c.deathTimeLabel}`,
    `Причина: ${reason}`,
  ].join("\n");
};

const telemetryTierLabelUk = (
  t: AnalysisReportT["telemetrySummary"]["telemetryTier"]
): string => {
  switch (t) {
    case "kill_only":
      return "лише kill feed";
    case "limited":
      return "обмежений";
    case "spatial":
      return "просторовий";
    case "full":
      return "повний";
    default:
      return t;
  }
};

const parseStatusUk = (status: string): string => {
  if (status === "success") return "успіх";
  if (status === "error") return "помилка";
  return status;
};

type CompactStatPropsT = {
  label: string;
  value: string;
  sub?: string;
};

const CompactStat: FC<CompactStatPropsT> = ({ label, value, sub }) => (
  <div className="rounded-md border border-zinc-200 bg-zinc-50/80 px-2.5 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/50">
    <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
      {label}
    </div>
    <div className="mt-0.5 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
      {value}
    </div>
    {sub ? (
      <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
        {sub}
      </div>
    ) : null}
  </div>
);

type MistakeBucketT = {
  angleClear: number;
  dryPeek: number;
  noUtility: number;
  noTrade: number;
  repeek: number;
  noCover: number;
};

const emptyBuckets = (): MistakeBucketT => ({
  angleClear: 0,
  dryPeek: 0,
  noUtility: 0,
  noTrade: 0,
  repeek: 0,
  noCover: 0,
});

const addTagsToBuckets = (
  b: MistakeBucketT,
  tags: string[] | undefined
): void => {
  for (const t of tags ?? []) {
    switch (t) {
      case "POSSIBLE_NO_CLEAR":
        b.angleClear += 1;
        break;
      case "FAST_ENTRY_BEFORE_DEATH":
      case "SHORT_TIME_TO_DEATH":
        b.dryPeek += 1;
        break;
      case "NO_UTILITY_BEFORE_CONTACT":
        b.noUtility += 1;
        break;
      case "NO_TRADE_SUPPORT":
        b.noTrade += 1;
        break;
      case "HEADSHOT_PUNISH":
        b.repeek += 1;
        break;
      case "ISOLATED_POSITION":
        b.noCover += 1;
        break;
      default:
        break;
    }
  }
};

type PlayerAggT = {
  playerName: string;
  findings: TacticalFindingT[];
  riskyDeaths: number;
  avgConfidence: number;
  avgBadDeathScore: number;
  buckets: MistakeBucketT;
};

const aggregatePlayersFromFindings = (
  findings: TacticalFindingT[]
): PlayerAggT[] => {
  const by = new Map<string, TacticalFindingT[]>();
  for (const f of findings) {
    if (f.type !== "FALSE_CONFIDENCE_DEATH") continue;
    const key = f.playerName.trim() || "—";
    if (!by.has(key)) by.set(key, []);
    by.get(key)!.push(f);
  }
  const rows: PlayerAggT[] = [];
  for (const [playerName, list] of by) {
    const riskyDeaths = list.length;
    const avgConfidence =
      list.reduce((s, x) => s + x.confidence, 0) / Math.max(1, riskyDeaths);
    const withQ = list.filter((x) => x.quality != null);
    const avgBadDeathScore =
      withQ.reduce((s, x) => s + (x.quality?.badDeathScore ?? 0), 0) /
      Math.max(1, withQ.length);
    const buckets = emptyBuckets();
    for (const f of list) addTagsToBuckets(buckets, f.mistakeTags);
    rows.push({
      playerName,
      findings: [...list].sort((a, b) => {
        const qb =
          (b.quality?.badDeathScore ?? 0) - (a.quality?.badDeathScore ?? 0);
        if (qb !== 0) return qb;
        return b.confidence - a.confidence;
      }),
      riskyDeaths,
      avgConfidence,
      avgBadDeathScore,
      buckets,
    });
  }
  rows.sort((a, b) => {
    if (b.riskyDeaths !== a.riskyDeaths) return b.riskyDeaths - a.riskyDeaths;
    return b.avgBadDeathScore - a.avgBadDeathScore;
  });
  return rows;
};

const buildTacticalAutoSummaryUk = (aggs: PlayerAggT[]): string => {
  const totals = emptyBuckets();
  for (const r of aggs) {
    totals.angleClear += r.buckets.angleClear;
    totals.dryPeek += r.buckets.dryPeek;
    totals.noUtility += r.buckets.noUtility;
    totals.noTrade += r.buckets.noTrade;
    totals.repeek += r.buckets.repeek;
    totals.noCover += r.buckets.noCover;
  }
  const parts: { n: number; label: string }[] = [
    { n: totals.dryPeek, label: "агресивні виходи / сухі піки" },
    { n: totals.angleClear, label: "імовірно слабка перевірка кута" },
    { n: totals.noUtility, label: "мало утиліти перед контактом" },
    { n: totals.noTrade, label: "немає трейду" },
    { n: totals.repeek, label: "швидке покарання" },
    { n: totals.noCover, label: "без прикриття союзником" },
  ];
  parts.sort((a, b) => b.n - a.n);
  const top = parts.filter((p) => p.n > 0).slice(0, 3);
  if (top.length === 0)
    return "Недостатньо даних для короткого тактичного резюме.";
  return `Найчастіші ознаки: ${top.map((p) => `${p.label} (${p.n})`).join(", ")}.`;
};

const findingTitleUk = (f: TacticalFindingT): string => {
  const t = f.shortReason?.trim() ?? "";
  if (t.length <= 52) return t || "Ризикована смерть";
  return `${t.slice(0, 50)}…`;
};

const tagBadgeClass = (tag: MistakeTagUiT, confidence: number): string => {
  const base =
    "inline-flex max-w-full shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight";
  if (tag === "NO_TRADE_SUPPORT" || tag === "HEADSHOT_PUNISH")
    return `${base} bg-red-100 text-red-900 dark:bg-red-950/80 dark:text-red-200`;
  if (
    tag === "NO_UTILITY_BEFORE_CONTACT" ||
    tag === "POSSIBLE_NO_CLEAR" ||
    tag === "ISOLATED_POSITION"
  )
    return `${base} bg-amber-100 text-amber-950 dark:bg-amber-950/70 dark:text-amber-100`;
  return confidence >= 0.65
    ? `${base} bg-yellow-100 text-yellow-950 dark:bg-yellow-950/60 dark:text-yellow-100`
    : `${base} bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-200`;
};

type ReviewMomentExportRowT = {
  demoFile: string;
  playerName: string;
  roundNumber: number;
  clipStartLabel: string;
  deathTimeLabel: string;
  clipEndLabel: string;
  confidence: number;
  badDeathScore: number;
  reason: string;
  mistakeTags: string[];
};

const buildReviewMomentsExport = (
  demoFile: string,
  findings: TacticalFindingT[]
): ReviewMomentExportRowT[] =>
  selectVideoReadyFindings(findings).map((f) => {
    const c = f.clip!;
    const q = f.quality!;
    return {
      demoFile,
      playerName: f.playerName,
      roundNumber: f.roundNumber as number,
      clipStartLabel: c.clipStartLabel,
      deathTimeLabel: c.deathTimeLabel,
      clipEndLabel: c.clipEndLabel,
      confidence: f.confidence,
      badDeathScore: q.badDeathScore,
      reason: f.shortReason,
      mistakeTags: f.mistakeTags ?? [],
    };
  });

const triggerDownload = (fileName: string, body: string, mime: string) => {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
};

const buildMarkdownReportUk = (
  demoFile: string,
  analysis: AnalysisReportT,
  findings: TacticalFindingT[]
): string => {
  const lines: string[] = [
    `# Звіт аналізу CS2 demo`,
    ``,
    `- **Файл:** ${demoFile}`,
    `- **Згенеровано:** ${analysis.generatedAt}`,
    `- **Рівень телеметрії:** ${telemetryTierLabelUk(analysis.telemetrySummary.telemetryTier)}`,
    ``,
    `## Моменти для перевірки у demo`,
    ``,
  ];
  const clips = selectVideoReadyFindings(findings);
  if (clips.length === 0) {
    lines.push(`_${EMPTY_VALID_MOMENTS_UK}_`, ``);
    return lines.join("\n");
  }
  for (const f of clips) {
    const c = f.clip!;
    const q = f.quality!;
    const rn = f.roundNumber as number;
    lines.push(
      `### ${f.playerName} — Раунд ${rn}`,
      ``,
      `- Період: ${c.clipStartLabel}–${c.clipEndLabel}`,
      `- Смерть: ${c.deathTimeLabel}`,
      `- Впевненість: ${(f.confidence * 100).toFixed(0)}%`,
      `- Поганий бал: ${q.badDeathScore}`,
      `- Причина: ${f.shortReason}`,
      ``,
      `---`,
      ``
    );
  }
  lines.push(
    `_Оцінки за demo-телеметрією; перевірте моменти вручну у CS2 demo._`
  );
  return lines.join("\n");
};

const DemoDashboard: FC = () => {
  const [listState, setListState] = useState<DemosListStateT>({
    status: "loading",
  });
  const [parseLoading, setParseLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [result, setResult] = useState<NormalizedParseResultT | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisReportT | null>(null);
  const [batchResult, setBatchResult] = useState<ParseAllDemosResponseT | null>(
    null
  );
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [roundFilter, setRoundFilter] = useState<number | null>(null);

  const summary = useMemo(() => {
    if (!result) return null;
    const s = result.summary;
    return {
      fileName: result.fileName,
      map: result.mapName ?? "—",
      duration:
        result.durationSeconds != null
          ? `${result.durationSeconds.toFixed(1)} с`
          : "—",
      players: s.playersCount,
      rounds: s.roundsCount,
      kills: s.killsCount,
      warnings: s.warningsCount,
      status: result.status,
      usable: s.isUsableForAnalysis ? "так" : "ні",
    };
  }, [result]);

  const tacticalFindings = useMemo(() => {
    if (!analysis?.findings || !result || result.status !== "success")
      return [];
    return prepareReviewFindings(analysis.findings, result.rounds ?? []);
  }, [analysis, result]);

  const videoFindings = useMemo(() => {
    return selectVideoReadyFindings(tacticalFindings);
  }, [tacticalFindings]);

  const playerAggs = useMemo(
    () => aggregatePlayersFromFindings(tacticalFindings),
    [tacticalFindings]
  );

  const tacticalSummaryLine = useMemo(
    () => buildTacticalAutoSummaryUk(playerAggs),
    [playerAggs]
  );

  const findingsCountByRound = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of tacticalFindings) {
      const r = f.roundNumber;
      if (r == null || !Number.isFinite(r)) continue;
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return m;
  }, [tacticalFindings]);

  const roundNumbersForTimeline = useMemo(() => {
    if (!result || result.status !== "success") return [];
    if (result.rounds.length > 0) {
      return [...result.rounds].map((x) => x.roundNumber).sort((a, b) => a - b);
    }
    const keys = [...findingsCountByRound.keys()];
    const mx =
      keys.length > 0
        ? Math.max(...keys)
        : Math.max(1, result.summary.roundsCount);
    return Array.from({ length: mx }, (_, i) => i + 1);
  }, [result, findingsCountByRound]);

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
      const json = (await res.json()) as ListDemosResponseT;
      setListState({ status: "ready", demos: json.demos });
    } catch (e) {
      setListState({
        status: "error",
        message:
          e instanceof Error ? e.message : "Не вдалося завантажити список demo",
      });
    }
  }, []);

  const parseDemo = useCallback(async (fileName: string) => {
    setParseLoading(true);
    setParseError(null);
    setResult(null);
    setAnalysis(null);
    setExpandedPlayer(null);
    setRoundFilter(null);
    try {
      const res = await fetch("/api/demos/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }),
      });
      const json = (await res.json()) as ParseDemoResponseT & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setResult(json.result);
      setAnalysis(json.analysis ?? null);
    } catch (e) {
      setParseError(
        e instanceof Error ? e.message : "Запит на аналіз demo не вдався"
      );
    } finally {
      setParseLoading(false);
    }
  }, []);

  const parseAllDemos = useCallback(async () => {
    setBatchLoading(true);
    setBatchError(null);
    setBatchResult(null);
    try {
      const res = await fetch("/api/demos/parse-all", { method: "POST" });
      const json = (await res.json()) as ParseAllDemosResponseT & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setBatchResult(json);
    } catch (e) {
      setBatchError(
        e instanceof Error ? e.message : "Пакетний запит на аналіз не вдався"
      );
    } finally {
      setBatchLoading(false);
    }
  }, []);

  const exportClipsJson = useCallback(() => {
    if (!result || !analysis || result.status !== "success") return;
    const prepared = prepareReviewFindings(
      analysis.findings ?? [],
      result.rounds ?? []
    );
    const payload = buildReviewMomentsExport(result.fileName, prepared);
    triggerDownload(
      "review-moments.json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }, [result, analysis]);

  const exportMarkdown = useCallback(() => {
    if (!result || !analysis || result.status !== "success") return;
    const prepared = prepareReviewFindings(
      analysis.findings ?? [],
      result.rounds ?? []
    );
    const md = buildMarkdownReportUk(result.fileName, analysis, prepared);
    const base = result.fileName.replace(/\.dem$/i, "") || "report";
    triggerDownload(
      `${base}-demo-review.md`,
      md,
      "text/markdown;charset=utf-8"
    );
  }, [result, analysis]);

  const copyClipTimecodes = useCallback(async (f: TacticalFindingT) => {
    const text = buildClipTimecodesCopyText(f);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      loadDemos({ skipLoading: true });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadDemos]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-6 sm:px-4">
      <header className="flex flex-col gap-1.5 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Аналізатор CS2 demo
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Локальні .dem з папки samples, парсинг через demoparser2, тактичні
          евристики без LLM.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadDemos()}
            className="self-start rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Оновити список
          </button>
          <button
            type="button"
            onClick={() => void parseAllDemos()}
            disabled={
              batchLoading ||
              parseLoading ||
              listState.status !== "ready" ||
              listState.demos.length === 0
            }
            className="self-start rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Проаналізувати всі demo
          </button>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Зразки (.dem)
        </h2>
        {listState.status === "loading" ? (
          <p className="text-sm text-zinc-500">Сканування папки samples…</p>
        ) : null}
        {listState.status === "error" ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {listState.message}
          </p>
        ) : null}
        {listState.status === "ready" && listState.demos.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Немає .dem у <code className="font-mono">/samples</code>. Додай
            файли й натисни «Оновити список».
          </p>
        ) : null}
        {listState.status === "ready" && listState.demos.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {listState.demos.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => void parseDemo(d.fileName)}
                  disabled={parseLoading || batchLoading}
                  className="flex w-full flex-col items-start gap-1 rounded border border-zinc-200 bg-white p-4 text-left text-sm hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {d.fileName}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {(d.size / (1024 * 1024)).toFixed(2)} МБ ·{" "}
                    {new Date(d.modifiedAt).toLocaleString("uk-UA")}
                  </span>
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                    Проаналізувати demo
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Аналіз
        </h2>
        {parseLoading ? (
          <p className="text-sm text-zinc-500">Аналіз обраного demo…</p>
        ) : null}
        {parseError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{parseError}</p>
        ) : null}
        {batchLoading ? (
          <p className="text-sm text-zinc-500">
            Аналіз усіх demo (послідовно)…
          </p>
        ) : null}
        {batchError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{batchError}</p>
        ) : null}
      </section>

      {batchResult ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Пакетний аналіз
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Завершено: {new Date(batchResult.parsedAt).toLocaleString("uk-UA")}{" "}
            · усього {batchResult.total} · успіхів {batchResult.successCount} ·
            помилок {batchResult.errorCount}
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {batchResult.results.map((r) => (
              <li
                key={r.fileName}
                className="rounded border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {r.fileName}
                </span>{" "}
                <span className="text-zinc-500">
                  — {parseStatusUk(r.status)}
                </span>
                {r.outputFileName ? (
                  <span className="ml-2 text-xs text-zinc-500">
                    → outputs/{r.outputFileName}
                  </span>
                ) : null}
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Гравці {r.summary.playersCount} · Раунди{" "}
                  {r.summary.roundsCount} · Вбивства {r.summary.killsCount} ·
                  Попередження {r.summary.warningsCount} · аналіз{" "}
                  {r.summary.isUsableForAnalysis ? "доступний" : "неможливий"}
                </div>
                {r.errorMessage ? (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {r.errorMessage}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Підсумок матчу
          </h2>
          {result?.status === "error" && result.errorMessage ? (
            <p className="text-xs text-red-600 dark:text-red-400">
              {result.errorMessage}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <CompactStat label="Файл" value={summary.fileName} />
            <CompactStat label="Мапа" value={String(summary.map)} />
            <CompactStat label="Раунди" value={String(summary.rounds)} />
            <CompactStat label="Вбивства" value={String(summary.kills)} />
            <CompactStat label="Гравці" value={String(summary.players)} />
            <CompactStat label="Тривалість" value={summary.duration} />
            <CompactStat label="Статус" value={parseStatusUk(summary.status)} />
            <CompactStat
              label="Придатність"
              value={summary.usable}
              sub="аналіз"
            />
            {analysis ? (
              <CompactStat
                label="Ризикові смерті"
                value={String(tacticalFindings.length)}
                sub="валідний раунд і таймкоди"
              />
            ) : null}
            {analysis ? (
              <CompactStat
                label="Рівень аналізу"
                value={telemetryTierLabelUk(
                  analysis.telemetrySummary.telemetryTier
                )}
                sub={[
                  analysis.telemetrySummary.hasPlayerPositions && "позиції",
                  analysis.telemetrySummary.hasDamageEvents && "шкода",
                  analysis.telemetrySummary.hasUtilityEvents && "утиліта",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : null}
            <CompactStat
              label="Попередження"
              value={String(summary.warnings)}
            />
          </div>
          {result?.status === "success" && analysis ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Тактична панель
                </h3>
                <span className="text-right text-[10px] leading-tight text-zinc-400">
                  Валідних: {tacticalFindings.length}
                  {(analysis.findings ?? []).length !==
                  tacticalFindings.length ? (
                    <span className="block text-zinc-500">
                      Усього у відповіді: {(analysis.findings ?? []).length}
                    </span>
                  ) : null}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                {FINDINGS_FILTER_SUMMARY_UK}
              </p>
              <p className="mt-1.5 rounded-md bg-zinc-100 px-2 py-1 text-[11px] leading-snug text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                <span className="font-medium">Резюме: </span>
                {tacticalSummaryLine}
              </p>
              {roundNumbersForTimeline.length > 0 ? (
                <div className="mt-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    Раунди
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {roundNumbersForTimeline.map((n) => {
                      const cnt = findingsCountByRound.get(n) ?? 0;
                      const active = roundFilter === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setRoundFilter(active ? null : n);
                            setExpandedPlayer(null);
                          }}
                          className={`rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                            active
                              ? "border-blue-500 bg-blue-50 text-blue-900 dark:border-blue-600 dark:bg-blue-950/50 dark:text-blue-100"
                              : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                          }`}
                        >
                          R{n}
                          {cnt > 0 ? ` ${cnt === 1 ? "⚠" : "⚠⚠"}` : ""}
                        </button>
                      );
                    })}
                    {roundFilter != null ? (
                      <button
                        type="button"
                        onClick={() => setRoundFilter(null)}
                        className="text-[10px] text-blue-600 underline dark:text-blue-400"
                      >
                        скинути фільтр
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Гравці з найбільшою кількістю ризикових смертей
              </h4>
              {playerAggs.length === 0 ? (
                <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                  {EMPTY_VALID_MOMENTS_UK}
                </p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {playerAggs.map((row) => {
                    const open = expandedPlayer === row.playerName;
                    const visible = row.findings.filter(
                      (f) =>
                        roundFilter == null || f.roundNumber === roundFilter
                    );
                    const bucketLine = [
                      row.buckets.angleClear > 0 &&
                        `${row.buckets.angleClear} слабкий кут`,
                      row.buckets.dryPeek > 0 &&
                        `${row.buckets.dryPeek} агресивний вихід`,
                      row.buckets.noUtility > 0 &&
                        `${row.buckets.noUtility} без утиліти`,
                      row.buckets.noTrade > 0 &&
                        `${row.buckets.noTrade} без трейду`,
                      row.buckets.repeek > 0 &&
                        `${row.buckets.repeek} швидке покарання`,
                      row.buckets.noCover > 0 &&
                        `${row.buckets.noCover} без прикриття`,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li
                        key={row.playerName}
                        className="rounded-md border border-zinc-200 dark:border-zinc-800"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedPlayer(open ? null : row.playerName)
                          }
                          className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900/80"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1">
                            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                              {row.playerName}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {open ? "▲" : "▼"} знахідки
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-600 dark:text-zinc-400">
                            {row.riskyDeaths} ризик. смертей · середнє{" "}
                            {(row.avgConfidence * 100).toFixed(0)}% · поганий
                            бал {row.avgBadDeathScore.toFixed(1)}
                          </div>
                          {bucketLine ? (
                            <div className="text-[10px] leading-snug text-zinc-500">
                              {bucketLine}
                            </div>
                          ) : null}
                        </button>
                        {open ? (
                          <div className="border-t border-zinc-100 px-2 pb-2 pt-1 dark:border-zinc-800">
                            {visible.length === 0 ? (
                              <p className="text-[10px] text-zinc-500">
                                Немає знахідок для обраного раунду.
                              </p>
                            ) : (
                              <ul className="flex flex-col gap-1">
                                {visible.map((f) => {
                                  const c = f.clip!;
                                  const q = f.quality;
                                  return (
                                    <li
                                      key={f.id}
                                      id={`finding-${f.id}`}
                                      className="rounded border border-zinc-100 bg-zinc-50/80 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900/40"
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-1">
                                        <span className="text-[11px] font-medium leading-tight text-zinc-900 dark:text-zinc-100">
                                          ⚠ {findingTitleUk(f)}
                                        </span>
                                      </div>
                                      <div className="mt-0.5 space-y-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                                        <div>Раунд {f.roundNumber}</div>
                                        <div>
                                          Період: {c.clipStartLabel}–
                                          {c.clipEndLabel}
                                        </div>
                                        <div>Смерть: {c.deathTimeLabel}</div>
                                        <div>
                                          Впевненість:{" "}
                                          {(f.confidence * 100).toFixed(0)}%
                                          {q != null
                                            ? ` · Поганий бал: ${q.badDeathScore}`
                                            : ""}
                                        </div>
                                      </div>
                                      {(f.mistakeTags?.length ?? 0) > 0 ? (
                                        <div className="mt-1 flex flex-wrap gap-0.5">
                                          {(f.mistakeTags ?? []).map((t) => (
                                            <span
                                              key={`${f.id}-${t}`}
                                              className={tagBadgeClass(
                                                t as MistakeTagUiT,
                                                f.confidence
                                              )}
                                            >
                                              {mistakeTagShortUk(
                                                t as MistakeTagUiT
                                              )}
                                            </span>
                                          ))}
                                        </div>
                                      ) : null}
                                      <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                          Причина:{" "}
                                        </span>
                                        {f.shortReason}
                                      </p>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                {TELEMETRY_DISCLAIMER_UK}
              </p>

              <div className="mt-3 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase text-zinc-500">
                      Моменти для перевірки у demo
                    </h4>
                    <p className="mt-0.5 max-w-xl text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
                      Короткий список моментів, які варто відкрити у CS2 demo та
                      перевірити вручну.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={exportClipsJson}
                      disabled={
                        !result || !analysis || result.status !== "success"
                      }
                      className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      Експортувати моменти JSON
                    </button>
                    <button
                      type="button"
                      onClick={exportMarkdown}
                      disabled={
                        !result || !analysis || result.status !== "success"
                      }
                      className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      Експортувати звіт Markdown
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Показано до {VIDEO_CLIP_MAX} найімовірніших необережних
                  смертей з валідним раундом і таймкодами.
                </p>
                {tacticalFindings.length === 0 ? (
                  <p className="mt-1 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                    {EMPTY_VALID_MOMENTS_UK}
                  </p>
                ) : videoFindings.length === 0 ? (
                  <p className="mt-1 text-[10px] leading-snug text-zinc-600 dark:text-zinc-400">
                    Є валідні знахідки, але жодна не відповідає порогам відбору
                    для цього списку (впевненість ≥
                    {(VIDEO_CLIP_MIN_CONFIDENCE * 100).toFixed(0)}%, поганий бал
                    ≥{VIDEO_CLIP_MIN_BAD_SCORE}, наявність оцінки якості).
                  </p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {videoFindings.map((f) => {
                      const c = f.clip!;
                      const q = f.quality!;
                      return (
                        <li
                          key={`clip-${f.id}`}
                          className="rounded border border-zinc-100 px-2 py-1.5 text-[10px] dark:border-zinc-800"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1 space-y-0.5 text-zinc-800 dark:text-zinc-200">
                              <div className="font-semibold">
                                {f.playerName} · Раунд {f.roundNumber}
                              </div>
                              <div>
                                Період: {c.clipStartLabel}–{c.clipEndLabel}
                              </div>
                              <div>Смерть: {c.deathTimeLabel}</div>
                              <div>
                                Впевненість: {(f.confidence * 100).toFixed(0)}%
                                · Поганий бал: {q.badDeathScore}
                              </div>
                              <div className="text-zinc-600 dark:text-zinc-400">
                                Причина: {f.shortReason}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyClipTimecodes(f)}
                              className="shrink-0 rounded border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-blue-300 dark:hover:bg-zinc-800"
                            >
                              Копіювати таймкоди
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
          <details className="group rounded-md border border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-zinc-600 marker:text-zinc-400 dark:text-zinc-400">
              Сирі JSON-дані
            </summary>
            <pre className="max-h-[320px] overflow-auto border-t border-zinc-100 p-2 text-[10px] leading-tight text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
};

export default DemoDashboard;
