"use client";

import type { FC } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

// types
import type {
  AnalysisReportT,
  DemoFileT,
  ListDemosResponseT,
  NormalizedParseResultT,
  ParseAllDemosResponseT,
  ParseDemoResponseT,
  TacticalFindingT,
} from "@/app/api/demos/demos.types";

type DemosListStateT =
  | { status: "loading" }
  | { status: "ready"; demos: DemoFileT[] }
  | { status: "error"; message: string };

type SummaryCardPropsI = {
  label: string;
  value: string;
};

const SummaryCard: FC<SummaryCardPropsI> = ({ label, value }) => (
  <div className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
    <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
    <div className="mt-1 break-all text-sm font-medium text-zinc-900 dark:text-zinc-50">
      {value}
    </div>
  </div>
);

const FINDINGS_FILTER_SUMMARY_UK =
  "Показано тільки найімовірніші необережні смерті. Нормальні трейди, корисні entry-смерті та хаотичні масові перестрілки відфільтровані.";

const VIDEO_CLIP_MIN_CONFIDENCE = 0.65;
const VIDEO_CLIP_MIN_BAD_SCORE = 3;
const VIDEO_CLIP_MAX = 5;

const selectVideoReadyFindings = (
  findings: TacticalFindingT[]
): TacticalFindingT[] => {
  const list = findings.filter(
    (f) =>
      f.type === "FALSE_CONFIDENCE_DEATH" &&
      f.clip != null &&
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

const FINDING_TYPE_UK = "Смерть після необережного виходу";

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

const severityLabelUk = (s: TacticalFindingT["severity"]): string => {
  switch (s) {
    case "low":
      return "низький";
    case "medium":
      return "середній";
    case "high":
      return "високий";
    default:
      return s;
  }
};

const displayOrDash = (v: string | number | null | undefined): string => {
  if (v == null) return "-";
  if (typeof v === "number" && !Number.isFinite(v)) return "-";
  if (typeof v === "string" && v.trim().length === 0) return "-";
  return typeof v === "number" ? String(v) : v.trim();
};

const buildClipTimecodesCopyText = (
  demoFile: string,
  f: TacticalFindingT
): string => {
  const c = f.clip;
  const demo = displayOrDash(demoFile.trim() || null);
  const player = displayOrDash(f.playerName);
  const round =
    f.roundNumber != null && Number.isFinite(f.roundNumber)
      ? String(f.roundNumber)
      : "-";
  const clip =
    c != null &&
    displayOrDash(c.clipStartLabel) !== "-" &&
    displayOrDash(c.clipEndLabel) !== "-"
      ? `${c.clipStartLabel}–${c.clipEndLabel}`
      : "-";
  const death = c != null ? displayOrDash(c.deathTimeLabel) : "-";
  return `Demo: ${demo}\nPlayer: ${player}\nRound: ${round}\nClip: ${clip}\nDeath: ${death}\n`;
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

type ClipExportRowT = {
  demoFile: string;
  playerName: string;
  roundNumber: number | null;
  type: string;
  clipStartLabel: string;
  deathTimeLabel: string;
  clipEndLabel: string;
  clipStartSeconds: number;
  deathTimeSeconds: number;
  clipEndSeconds: number;
  confidence: number;
  severity: string;
  reason: string;
  evidence: string[];
  recommendation: string;
  mistakeTags: string[];
  verdict: string;
  badDeathScore: number;
  positiveImpactScore: number;
};

const buildClipsExport = (
  demoFile: string,
  findings: TacticalFindingT[]
): ClipExportRowT[] =>
  selectVideoReadyFindings(findings).map((f) => {
    const c = f.clip!;
    const q = f.quality!;
    return {
      demoFile,
      playerName: f.playerName,
      roundNumber: f.roundNumber,
      type: f.type,
      clipStartLabel: c.clipStartLabel,
      deathTimeLabel: c.deathTimeLabel,
      clipEndLabel: c.clipEndLabel,
      clipStartSeconds: c.clipStartSeconds,
      deathTimeSeconds: c.deathTimeSeconds,
      clipEndSeconds: c.clipEndSeconds,
      confidence: f.confidence,
      severity: f.severity,
      reason: f.shortReason,
      evidence: f.evidence ?? [],
      recommendation: f.recommendation,
      mistakeTags: f.mistakeTags ?? [],
      verdict: f.verdict ?? "",
      badDeathScore: q.badDeathScore,
      positiveImpactScore: q.positiveImpactScore,
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
    `## Моменти для відео`,
    ``,
  ];
  const clips = selectVideoReadyFindings(findings);
  if (clips.length === 0) {
    lines.push(`_Немає моментів для експорту за поточними порогами._`, ``);
    return lines.join("\n");
  }
  for (const f of clips) {
    const c = f.clip!;
    const q = f.quality!;
    lines.push(
      `### ${f.playerName} — раунд ${f.roundNumber ?? "—"}`,
      ``,
      `- **Оцінка поганої смерті:** ${q.badDeathScore}`,
      `- **Корисний вплив до смерті:** ${q.positiveImpactScore}`,
      `- **Період кліпу:** ${c.clipStartLabel}–${c.clipEndLabel}`,
      `- **Смерть:** ${c.deathTimeLabel}`,
      `- **Впевненість:** ${(f.confidence * 100).toFixed(0)}%`,
      `- **Рівень:** ${severityLabelUk(f.severity)}`,
      `- **Теги:** ${(f.mistakeTags ?? []).join(", ") || "—"}`,
      `- **Що сталося:** ${f.shortReason}`,
      `- **Висновок:** ${f.verdict ?? "—"}`,
      `- **Порада:** ${f.recommendation}`,
      ``,
      `Коротко для монтажу:`,
      ...(f.evidence ?? []).map((e) => `- ${e}`),
      ``,
      `---`,
      ``
    );
  }
  lines.push(
    `## Як використовувати для відео`,
    ``,
    `Відкрийте demo у CS2, перейдіть до вказаного періоду, запишіть фрагмент через OBS або інший інструмент і вручну перевірте момент.`,
    ``,
    `_Усі висновки наближені за доступною телеметрією; потребують ручної перевірки у відео._`
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

  const videoFindings = useMemo(() => {
    if (!analysis?.findings) return [];
    return selectVideoReadyFindings(analysis.findings);
  }, [analysis]);

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
    const payload = buildClipsExport(result.fileName, analysis.findings ?? []);
    triggerDownload(
      "clips.json",
      JSON.stringify(payload, null, 2),
      "application/json"
    );
  }, [result, analysis]);

  const exportMarkdown = useCallback(() => {
    if (!result || !analysis || result.status !== "success") return;
    const md = buildMarkdownReportUk(
      result.fileName,
      analysis,
      analysis.findings ?? []
    );
    const base = result.fileName.replace(/\.dem$/i, "") || "report";
    triggerDownload(
      `${base}-clips-report.md`,
      md,
      "text/markdown;charset=utf-8"
    );
  }, [result, analysis]);

  const copyClipTimecodes = useCallback(
    async (demoFile: string, f: TacticalFindingT) => {
      const text = buildClipTimecodesCopyText(demoFile, f);
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
    },
    []
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      loadDemos({ skipLoading: true });
    }, 0);
    return () => window.clearTimeout(handle);
  }, [loadDemos]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
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
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
            Підсумок
          </h2>
          {result?.status === "error" && result.errorMessage ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {result.errorMessage}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard label="Файл" value={summary.fileName} />
            <SummaryCard label="Мапа" value={String(summary.map)} />
            <SummaryCard label="Тривалість" value={summary.duration} />
            <SummaryCard label="Гравці" value={String(summary.players)} />
            <SummaryCard label="Раунди" value={String(summary.rounds)} />
            <SummaryCard label="Вбивства" value={String(summary.kills)} />
            <SummaryCard
              label="Попередження"
              value={String(summary.warnings)}
            />
            <SummaryCard label="Статус" value={parseStatusUk(summary.status)} />
            <SummaryCard label="Придатний для аналізу" value={summary.usable} />
          </div>
          {result?.status === "success" && analysis ? (
            <>
              <div className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Звіт аналізу
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Рівень телеметрії:{" "}
                  <span
                    className={
                      analysis.telemetrySummary.telemetryTier === "spatial"
                        ? "font-mono font-semibold text-emerald-700 dark:text-emerald-400"
                        : "font-mono text-zinc-900 dark:text-zinc-100"
                    }
                  >
                    {telemetryTierLabelUk(
                      analysis.telemetrySummary.telemetryTier
                    )}
                  </span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {analysis.telemetrySummary.telemetryTier === "spatial" ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                      просторовий
                    </span>
                  ) : null}
                  {analysis.telemetrySummary.hasPlayerPositions ? (
                    <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      позиції
                    </span>
                  ) : null}
                  {analysis.telemetrySummary.hasDamageEvents ? (
                    <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      шкода
                    </span>
                  ) : null}
                  {analysis.telemetrySummary.hasUtilityEvents ? (
                    <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      утиліта
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Знахідок: {(analysis.findings ?? []).length}
                </p>
                <h4 className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Тактичні моменти
                </h4>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {FINDINGS_FILTER_SUMMARY_UK}
                </p>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Позиції:{" "}
                  {analysis.telemetrySummary.hasPlayerPositions ? "так" : "ні"}{" "}
                  · Події шкоди:{" "}
                  {analysis.telemetrySummary.hasDamageEvents ? "так" : "ні"} ·
                  Утиліта:{" "}
                  {analysis.telemetrySummary.hasUtilityEvents ? "так" : "ні"}
                </p>
                {(analysis.findings ?? []).length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">
                    Жодна тактична знахідка не пройшла поточні пороги.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3 text-sm">
                    {(analysis.findings ?? []).map((f) => (
                      <li
                        key={f.id}
                        className="rounded border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-zinc-800 dark:text-zinc-200">
                          <span className="font-medium">
                            {f.type === "FALSE_CONFIDENCE_DEATH"
                              ? FINDING_TYPE_UK
                              : f.type}
                          </span>
                          <span className="text-zinc-500">
                            Рівень: {severityLabelUk(f.severity)}
                          </span>
                          <span className="text-zinc-500">
                            Впевненість: {(f.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                          <span className="font-medium">Гравець:</span>{" "}
                          {f.playerName}
                          {" · "}
                          <span className="font-medium">Раунд:</span>{" "}
                          {f.roundNumber ?? "—"}
                        </p>
                        {f.clip ? (
                          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium">Період:</span>{" "}
                            {f.clip.clipStartLabel}–{f.clip.clipEndLabel}
                            {" · "}
                            <span className="font-medium">Смерть:</span>{" "}
                            {f.clip.deathTimeLabel}
                          </p>
                        ) : null}
                        {f.quality ? (
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium">
                              Оцінка поганої смерті:
                            </span>{" "}
                            {f.quality.badDeathScore}
                            {" · "}
                            <span className="font-medium">
                              Корисний вплив до смерті:
                            </span>{" "}
                            {f.quality.positiveImpactScore}
                          </p>
                        ) : null}
                        {(f.mistakeTags?.length ?? 0) > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(f.mistakeTags ?? []).map((t) => (
                              <span
                                key={`${f.id}-${t}`}
                                className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                              >
                                {mistakeTagShortUk(t as MistakeTagUiT)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Що сталося
                        </p>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          {f.shortReason}
                        </p>
                        <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Ознаки
                        </p>
                        <ul className="mt-1 list-inside list-disc text-xs text-zinc-600 dark:text-zinc-400">
                          {(f.evidence ?? []).map((line, i) => (
                            <li key={`${f.id}-e-${i}`}>{line}</li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Висновок
                        </p>
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                          {f.verdict ?? "—"}
                        </p>
                        <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          Порада
                        </p>
                        <p className="text-xs text-zinc-700 dark:text-zinc-300">
                          {f.recommendation}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {(analysis.findings ?? []).length > 0 ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {TELEMETRY_DISCLAIMER_UK}
                  </p>
                ) : null}
              </div>

              <div className="rounded border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    Моменти для відео
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={exportClipsJson}
                      disabled={
                        !result || !analysis || result.status !== "success"
                      }
                      className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Експортувати clips.json
                    </button>
                    <button
                      type="button"
                      onClick={exportMarkdown}
                      disabled={
                        !result || !analysis || result.status !== "success"
                      }
                      className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    >
                      Експортувати звіт Markdown
                    </button>
                  </div>
                </div>
                <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                  Таймкоди сформовані для подальшої ручної перевірки та нарізки
                  відео у CS2/OBS.
                </p>
                {videoFindings.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    Немає кліпів для експорту: потрібні впевненість ≥65%, оцінка
                    поганої смерті ≥3 (макс. 5 моментів). Інші знахідки — у
                    блоці «Тактичні моменти».
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3 text-sm">
                    {videoFindings.map((f) => {
                      const c = f.clip!;
                      const q = f.quality!;
                      return (
                        <li
                          key={`clip-${f.id}`}
                          className="rounded border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="font-medium text-zinc-900 dark:text-zinc-50">
                              {result.fileName}
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                void copyClipTimecodes(result.fileName, f)
                              }
                              className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              Скопіювати таймкоди
                            </button>
                          </div>
                          <p className="mt-2 text-zinc-700 dark:text-zinc-300">
                            <span className="font-medium">Гравець:</span>{" "}
                            {f.playerName}
                            {" · "}
                            <span className="font-medium">Раунд:</span>{" "}
                            {f.roundNumber ?? "—"}
                          </p>
                          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium">Період:</span>{" "}
                            {c.clipStartLabel}–{c.clipEndLabel}
                            {" · "}
                            <span className="font-medium">Смерть:</span>{" "}
                            {c.deathTimeLabel}
                            {" · "}
                            <span className="font-medium">
                              Впевненість:
                            </span>{" "}
                            {(f.confidence * 100).toFixed(0)}%{" · "}
                            <span className="font-medium">Рівень:</span>{" "}
                            {severityLabelUk(f.severity)}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            <span className="font-medium">
                              Оцінка поганої смерті:
                            </span>{" "}
                            {q.badDeathScore}
                            {" · "}
                            <span className="font-medium">
                              Корисний вплив до смерті:
                            </span>{" "}
                            {q.positiveImpactScore}
                          </p>
                          {(f.mistakeTags?.length ?? 0) > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {(f.mistakeTags ?? []).map((t) => (
                                <span
                                  key={`${f.id}-v-${t}`}
                                  className="rounded-full border border-zinc-300 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200"
                                >
                                  {mistakeTagShortUk(t as MistakeTagUiT)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Що сталося
                          </p>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300">
                            {f.shortReason}
                          </p>
                          <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Ознаки
                          </p>
                          <ul className="mt-1 list-inside list-disc text-xs text-zinc-600 dark:text-zinc-400">
                            {(f.evidence ?? []).map((line, i) => (
                              <li key={`${f.id}-clip-e-${i}`}>{line}</li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Висновок
                          </p>
                          <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {f.verdict ?? "—"}
                          </p>
                          <p className="mt-2 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                            Порада
                          </p>
                          <p className="text-xs text-zinc-700 dark:text-zinc-300">
                            {f.recommendation}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {videoFindings.length > 0 ? (
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {TELEMETRY_DISCLAIMER_UK}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Сирі JSON-дані
            </h3>
            <pre className="max-h-[480px] overflow-auto rounded border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default DemoDashboard;
