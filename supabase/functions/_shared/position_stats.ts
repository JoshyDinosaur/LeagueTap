// Which raw box-score stats (never fantasy points) explain a start/sit call,
// per position. Used by ledger-report to build the starter-vs-bench
// "stat_comparison" grid stored on a blunder/steal ledger_items row. Field
// names match Sleeper's stats/projections endpoints (confirmed against
// https://api.sleeper.app/stats/nfl/{season}/{week}?season_type=regular).

export type StatField = { key: string; label: string };

export const POSITION_STAT_FIELDS: Record<string, StatField[]> = {
  QB: [
    { key: "pass_yd", label: "PASS YD" },
    { key: "pass_td", label: "PASS TD" },
    { key: "pass_int", label: "INT" },
    { key: "rush_yd", label: "RUSH YD" },
  ],
  RB: [
    { key: "rush_yd", label: "RUSH YD" },
    { key: "rush_td", label: "RUSH TD" },
    { key: "rec", label: "REC" },
    { key: "rec_yd", label: "REC YD" },
  ],
  WR: [
    { key: "rec", label: "REC" },
    { key: "rec_yd", label: "REC YD" },
    { key: "rec_td", label: "REC TD" },
  ],
  TE: [
    { key: "rec", label: "REC" },
    { key: "rec_yd", label: "REC YD" },
    { key: "rec_td", label: "REC TD" },
  ],
  K: [
    { key: "fgm", label: "FG MADE" },
    { key: "fga", label: "FG ATT" },
    { key: "xpm", label: "XP MADE" },
  ],
  DEF: [
    { key: "sack", label: "SACKS" },
    { key: "int", label: "INT" },
    { key: "fum_rec", label: "FUM REC" },
  ],
};

const MAX_STATS_SHOWN = 3;

export type StatLine = { key: string; label: string; value: number };

// Picks the position's relevant fields out of a raw Sleeper stat blob,
// dropping any that are missing/zero-and-uninteresting, capped at
// MAX_STATS_SHOWN so the grid stays small. Returns [] (not null) when there's
// nothing worth showing -- callers should treat an empty list same as absent.
export function statLineFor(
  position: string | null | undefined,
  rawStats: Record<string, number> | null | undefined,
): StatLine[] {
  if (!rawStats) return [];
  const fields = POSITION_STAT_FIELDS[position ?? ""] ?? [];
  const lines: StatLine[] = [];
  for (const f of fields) {
    const v = rawStats[f.key];
    if (typeof v === "number" && v !== 0) lines.push({ key: f.key, label: f.label, value: v });
  }
  return lines.slice(0, MAX_STATS_SHOWN);
}
