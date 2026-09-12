// Shared slot-eligibility + position-matched start/sit comparison logic,
// used by both ledger-tossup (pre-game "toss-up" calls) and ledger-report
// (post-game blunder/steal grading). A flex slot can be filled by more than
// one position; a straight position slot (RB, WR, QB, ...) can only be
// filled by a bench player at that same position. Comparing a benched
// player against a starter at an ineligible position (e.g. crediting a
// bench WR's big day against a started QB) isn't a real alternative, so it
// must never drive a blunder/steal/toss-up call.

export const SLOT_ELIGIBLE: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};

export function eligiblePositions(slot: string): string[] {
  return SLOT_ELIGIBLE[slot] ?? [slot];
}

export type SlotPlayer = {
  player_id: string;
  name: string;
  position: string | null;
  points: number;
  // The roster slot this player actually started in (RB, WR, FLEX, ...).
  // Only meaningful for starters; absent/irrelevant for bench players.
  slot?: string | null;
  stats?: Record<string, number> | null;
};

// Whether this player's game has actually produced stats yet. Sleeper's
// matchup `players_points` defaults an unstarted player's score to 0 (or
// omits them) well before their game kicks off -- indistinguishable from a
// real bust unless checked against real per-week box-score data. `stats` is
// only ever populated (in snapshot-lineups) from Sleeper's real stats
// endpoint, whose rows appear for a player only once their game has
// recorded activity -- absent means their game hasn't happened yet.
function hasPlayed(p: SlotPlayer): boolean {
  return !!p.stats && Object.keys(p.stats).length > 0;
}

// The best-scoring bench player who could actually have filled this
// starter's slot -- same position for a straight slot, any FLEX-eligible
// position for a flex slot. Falls back to the starter's own position when
// `slot` wasn't recorded (older weekly_lineups rows, pre-dating slot
// capture) -- a same-position comparison, strictly narrower than "any
// bench player," rather than no comparison at all. Bench players whose game
// hasn't happened yet are never eligible -- crediting a not-yet-played
// player as "the correct call" is just as wrong as blaming a not-yet-played
// starter for a bust that hasn't happened.
export function bestEligibleBench(starter: SlotPlayer, bench: SlotPlayer[]): SlotPlayer | null {
  const eligible = eligiblePositions(starter.slot ?? starter.position ?? "");
  let best: SlotPlayer | null = null;
  for (const p of bench) {
    if (!p.position || !eligible.includes(p.position)) continue;
    if (!hasPlayed(p)) continue;
    if (!best || p.points > best.points) best = p;
  }
  return best;
}

export type SlotGap = { starter: SlotPlayer; bench: SlotPlayer; gap: number };

// The single biggest blunder in a team's week: the starter whose
// position-eligible bench alternative most outscored them. Null if no
// starter had any eligible bench alternative to compare against. A starter
// whose game hasn't happened yet is skipped entirely -- their real score
// isn't in yet, so there's no decision to judge.
export function worstBlunder(starters: SlotPlayer[], bench: SlotPlayer[]): SlotGap | null {
  let worst: SlotGap | null = null;
  for (const s of starters) {
    if (!hasPlayed(s)) continue;
    const alt = bestEligibleBench(s, bench);
    if (!alt) continue;
    const gap = alt.points - s.points;
    if (!worst || gap > worst.gap) worst = { starter: s, bench: alt, gap };
  }
  return worst;
}

// The single biggest steal in a team's week: the starter who most cleared
// their position-eligible bench alternative. Mirror of worstBlunder --
// same not-yet-played guard applies.
export function bestSteal(starters: SlotPlayer[], bench: SlotPlayer[]): SlotGap | null {
  let best: SlotGap | null = null;
  for (const s of starters) {
    if (!hasPlayed(s)) continue;
    const alt = bestEligibleBench(s, bench);
    if (!alt) continue;
    const gap = s.points - alt.points;
    if (!best || gap > best.gap) best = { starter: s, bench: alt, gap };
  }
  return best;
}
