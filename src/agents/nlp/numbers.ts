import { addDays } from "@/lib/time";
import { fold, type Span } from "./text";

/** Times, durations and relative dates as people say or write them in the field. */

const UNITS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };

/** "fifteen" → 15, "forty five" → 45, "12" → 12. */
export function parseNumberWords(words: string): number | undefined {
  const w = words.trim();
  if (/^\d+$/.test(w)) return Number(w);
  const parts = w.split(/\s+/);
  if (parts.length === 1) return UNITS[parts[0]] ?? TENS[parts[0]];
  if (
    parts.length === 2 &&
    TENS[parts[0]] !== undefined &&
    UNITS[parts[1]] !== undefined &&
    UNITS[parts[1]] < 10
  ) {
    return TENS[parts[0]] + UNITS[parts[1]];
  }
  return undefined;
}

const HOUR_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
const MINUTE_WORDS =
  "(?:(?:twenty|thirty|forty|fifty)(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?|ten|fifteen|o'clock|oh\\s+(?:one|two|three|four|five|six|seven|eight|nine))";

export interface TimeMention extends Span {
  /** Minutes after midnight. */
  minutes: number;
}

function toMinutes(hour: number, minute: number, meridiem?: string): number {
  let h = hour % 12;
  if (meridiem?.startsWith("p")) h += 12;
  else if (!meridiem && hour < 6) h += 12; // shift hours: "two thirty" means 14:30
  if (!meridiem && hour === 12) h = 12;
  return h * 60 + minute;
}

/** "8:40", "1:00 PM", "about eight forty", "ten fifteen", "2 pm". */
export function findTimes(text: string): TimeMention[] {
  const folded = fold(text);
  const out: TimeMention[] = [];
  const digital = /\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/g;
  let m: RegExpExecArray | null;
  while ((m = digital.exec(folded))) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) continue;
    const meridiem = m[3]?.replaceAll(".", "");
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      minutes: hour > 12 ? hour * 60 + minute : toMinutes(hour, minute, meridiem),
    });
  }
  const bare = /\b(\d{1,2})\s*(am|pm)\b/g;
  while ((m = bare.exec(folded))) {
    if (out.some((t) => m!.index >= t.start && m!.index < t.end)) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      minutes: toMinutes(Number(m[1]), 0, m[2]),
    });
  }
  const words = new RegExp(`\\b(${HOUR_WORDS})\\s+(${MINUTE_WORDS})\\b`, "g");
  while ((m = words.exec(folded))) {
    const hour = UNITS[m[1]];
    const minuteText = m[2].replace(/^oh\s+/, "");
    const minute = minuteText === "o'clock" ? 0 : parseNumberWords(minuteText);
    if (minute === undefined || minute > 59) continue;
    // "two thirty minutes" is a duration, not a time.
    if (/^\s+(?:minutes?|mins?|hours?|feet|ft)\b/.test(folded.slice(m.index + m[0].length)))
      continue;
    out.push({ start: m.index, end: m.index + m[0].length, minutes: toMinutes(hour, minute) });
  }
  return out.sort((a, b) => a.start - b.start);
}

export interface DurationMention extends Span {
  minutes: number;
}

/** "fifteen minutes", "15 min", "half an hour", "a quarter hour". */
export function findDurations(text: string): DurationMention[] {
  const folded = fold(text);
  const out: DurationMention[] = [];
  const re =
    /\b((?:twenty|thirty|forty|fifty)(?:\s+\w+)?|\w+|\d+)\s+(minutes?|mins?|hours?|hrs?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded))) {
    const n = parseNumberWords(m[1]) ?? parseNumberWords(m[1].split(/\s+/)[0]);
    if (n === undefined) continue;
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      minutes: m[2].startsWith("h") ? n * 60 : n,
    });
  }
  const phrases: [RegExp, number][] = [
    [/\bhalf an hour\b/g, 30],
    [/\ba quarter (?:of an )?hour\b/g, 15],
    [/\ban hour\b/g, 60],
  ];
  for (const [p, minutes] of phrases) {
    while ((m = p.exec(folded))) out.push({ start: m.index, end: m.index + m[0].length, minutes });
  }
  return out.sort((a, b) => a.start - b.start);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export interface DateMention extends Span {
  date: string;
}

/** "by Friday", "tomorrow", "in 3 days", "next week" relative to `today` (YYYY-MM-DD). */
export function findRelativeDates(text: string, today: string): DateMention[] {
  const folded = fold(text);
  const out: DateMention[] = [];
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  let m: RegExpExecArray | null;
  const day = new RegExp(`\\b(${WEEKDAYS.join("|")})\\b`, "g");
  while ((m = day.exec(folded))) {
    const target = WEEKDAYS.indexOf(m[1]);
    const ahead = (target - dow + 7) % 7 || 7;
    out.push({ start: m.index, end: m.index + m[0].length, date: addDays(today, ahead) });
  }
  const simple: [RegExp, (m: RegExpExecArray) => number][] = [
    [/\btomorrow\b/g, () => 1],
    [/\btoday\b|\bend of (?:the )?(?:day|shift)\b/g, () => 0],
    [/\bnext week\b/g, () => 7],
    [/\bin (\d+|\w+) days?\b/g, (x) => parseNumberWords(x[1]) ?? NaN],
  ];
  for (const [re, offset] of simple) {
    while ((m = re.exec(folded))) {
      const n = offset(m);
      if (Number.isFinite(n))
        out.push({ start: m.index, end: m.index + m[0].length, date: addDays(today, n) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** "10/21/2026" (US) or "2026-10-21". */
export function parseDate(text: string): string | undefined {
  const us = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  return iso ? iso[0] : undefined;
}

export const minutesToClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
