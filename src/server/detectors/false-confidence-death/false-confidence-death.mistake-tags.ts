import "server-only";

// types
import type { HeuristicFlagsT } from "./heuristics/types";

export const MISTAKE_TAG_ORDER = [
  "NO_UTILITY_BEFORE_CONTACT",
  "FAST_ENTRY_BEFORE_DEATH",
  "NO_TRADE_SUPPORT",
  "ISOLATED_POSITION",
  "SHORT_TIME_TO_DEATH",
  "POSSIBLE_NO_CLEAR",
  "HEADSHOT_PUNISH",
] as const;

export type FalseConfidenceMistakeTagT = (typeof MISTAKE_TAG_ORDER)[number];

const tagSet = (f: HeuristicFlagsT): Set<FalseConfidenceMistakeTagT> => {
  const s = new Set<FalseConfidenceMistakeTagT>();
  if (f.earlyRound) s.add("FAST_ENTRY_BEFORE_DEATH");
  if (f.noAlliedUtilityWindow) s.add("NO_UTILITY_BEFORE_CONTACT");
  if (f.spatialSupportGap) s.add("ISOLATED_POSITION");
  if (f.noTrade) s.add("NO_TRADE_SUPPORT");
  if (f.shortDamageTimeline) s.add("SHORT_TIME_TO_DEATH");
  if (f.headshotRifle) s.add("HEADSHOT_PUNISH");

  const possibleNoClear =
    (f.noTrade && f.shortDamageTimeline) ||
    (f.noAlliedUtilityWindow && f.noTrade) ||
    (f.isolated && f.noTrade && !f.spatialSupportGap) ||
    (f.lowCombatCluster && f.noTrade && f.shortDamageTimeline);
  if (possibleNoClear) s.add("POSSIBLE_NO_CLEAR");

  return s;
};

export const deriveFalseConfidenceMistakeTags = (
  f: HeuristicFlagsT
): FalseConfidenceMistakeTagT[] => {
  const s = tagSet(f);
  return MISTAKE_TAG_ORDER.filter((t) => s.has(t));
};

export const filterMistakeTagsForQuality = (
  tags: FalseConfidenceMistakeTagT[],
  deathWasTraded: boolean
): FalseConfidenceMistakeTagT[] =>
  deathWasTraded ? tags.filter((t) => t !== "NO_TRADE_SUPPORT") : tags;

const EVIDENCE_BY_TAG: Record<FalseConfidenceMistakeTagT, string> = {
  FAST_ENTRY_BEFORE_DEATH: "Ранній вихід у дуель — мало часу на підготовку.",
  NO_UTILITY_BEFORE_CONTACT: "Сухий вихід без flash/smoke перед смертю.",
  ISOLATED_POSITION: "Поруч не видно союзника, який міг би прикрити.",
  NO_TRADE_SUPPORT: "Після смерті не було швидкого трейду на ворога.",
  SHORT_TIME_TO_DEATH: "Смерть сталася швидко після входу в контакт.",
  POSSIBLE_NO_CLEAR:
    "Гравець, ймовірно, не зупинився для повної перевірки позиції.",
  HEADSHOT_PUNISH: "Миттєве покарання хедшотом.",
};

export const buildConciseEvidenceLines = (
  tags: FalseConfidenceMistakeTagT[]
): string[] => tags.map((t) => EVIDENCE_BY_TAG[t]);

export const buildShortReasonFromTags = (
  tags: FalseConfidenceMistakeTagT[]
): string => {
  const p: string[] = [];
  if (tags.includes("NO_UTILITY_BEFORE_CONTACT"))
    p.push("перед смертю майже не видно утиліти");
  if (tags.includes("ISOLATED_POSITION"))
    p.push("позиція була без явного прикриття союзником");
  if (tags.includes("NO_TRADE_SUPPORT")) p.push("не вистачило швидкого трейду");
  if (tags.includes("SHORT_TIME_TO_DEATH"))
    p.push("смерть прийшла дуже швидко після контакту");
  if (tags.includes("FAST_ENTRY_BEFORE_DEATH"))
    p.push("вихід стався дуже рано в раунді");
  if (tags.includes("HEADSHOT_PUNISH"))
    p.push("ворог відповів жорстким хедшотом");
  if (tags.includes("POSSIBLE_NO_CLEAR") && !tags.includes("ISOLATED_POSITION"))
    p.push("схоже, небезпечний кут не перевірили до кінця");
  if (p.length === 0)
    return "Гравець ризикнув виходом і швидко поплатився — схоже на необережний пік.";
  if (p.length === 1)
    return `Гравець вийшов у небезпечну зону без помітної підготовки: ${p[0]}.`;

  const last = p.pop()!;
  return `Гравець вийшов у небезпечну зону без помітної підготовки: ${p.join(", ")} і ${last}.`;
};

export const FALSE_CONFIDENCE_SHORT_RECOMMENDATION_UK =
  "Перед таким виходом варто зупинитися, перевірити кут, використати flash/smoke або вийти разом із teammate для трейду.";

export const FALSE_CONFIDENCE_VERDICT_UK =
  "Висновок: момент підходить для відео, бо гравець зіграв занадто самовпевнено і був швидко покараний.";
