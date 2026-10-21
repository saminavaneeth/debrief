/** Injectable clock so servers, gateway and workflows are deterministic under test. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(
  iso: string,
): Clock & { set(iso: string): void; advance(ms: number): void } {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (next) => {
      current = new Date(next);
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms);
    },
  };
}

function offsetMinutes(offset: string): number {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) throw new Error(`Invalid UTC offset: ${offset}`);
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

/** `2026-10-21T08:40:00-05:00` for the given instant, expressed at a fixed UTC offset. */
export function toOffsetIso(date: Date, offset: string): string {
  const shifted = new Date(date.getTime() + offsetMinutes(offset) * 60_000);
  return `${shifted.toISOString().slice(0, 19)}${offset}`;
}

/** Calendar date (`2026-10-21`) of the instant at a fixed UTC offset. */
export function toOffsetDate(date: Date, offset: string): string {
  return toOffsetIso(date, offset).slice(0, 10);
}

/** Add whole days to a calendar date string. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC offset of the device at `date`, e.g. `-05:00`. */
export function localOffset(date: Date): string {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Timestamp in the device's local time with its offset, e.g. `2026-10-21T08:40:00-05:00`. */
export const localIso = (date: Date = new Date()) => toOffsetIso(date, localOffset(date));

/** The device's local calendar date. */
export const localDate = (date: Date = new Date()) => localIso(date).slice(0, 10);
