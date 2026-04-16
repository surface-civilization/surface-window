/**
 * GlobeVoice — exported constants and pure sentence-building utilities.
 *
 * Kept separate from GlobeVoice.tsx (react-refresh/only-export-components).
 *
 * Visual metaphor: the globe speaks in full sentences, rarely.
 *
 * The civilization is always legible through its visual state, but once every
 * few minutes it chooses to annotate itself — one sentence, held for nine
 * seconds, then gone. The sentence is always derivable from live data; it never
 * invents. It narrates what is already visible in another register.
 *
 * Sentence categories (cycled via counter % VOICE_CATEGORY_COUNT):
 *   0 — Weather commentary  (WeatherInfo.state + agent counts)
 *   1 — District spotlight  (busiest district at this moment)
 *   2 — High-tier activity  (Tier-4/5 architects in working mode)
 *   3 — Global count summary
 *   4 — Landmark agent      (highest work_score architect)
 *   5 — Geographic neighbor (two close districts simultaneously active)
 *   6 — Zone divergence     (ghost zone or load-carrier outlier)
 *   7 — Full geographic chorus (all zones simultaneously active)
 *   8 — District mastery      (highest avg_work_score zone vs. system mean)
 *
 * Each builder returns null when the data does not support a meaningful
 * sentence; the picker falls forward through categories until it finds one.
 */

import type { Agent } from '../types';
import type { District } from '../types';
import { getTier } from '../types';
import type { WeatherInfo } from '../hooks/useWeatherState';
import { greatCircleDeg } from '../utils/geo';
import { EASE_RISE, EASE_BREATHE } from '../app-constants';

// ─── Timing ───────────────────────────────────────────────────────────────────

/** Minimum seconds between sentences. */
export const VOICE_INTERVAL_MIN_S = 120;

/** Maximum seconds between sentences. */
export const VOICE_INTERVAL_MAX_S = 180;

/** Seconds after mount before the first sentence fires. */
export const VOICE_FIRST_DELAY_S = 35;

/** How long each sentence remains visible (seconds). */
export const VOICE_HOLD_DURATION_S = 9;

/** Fade-in duration (CSS animation, also used for timing guard). */
export const VOICE_FADE_IN_S = 0.8;

/** Fade-out duration (CSS animation). */
export const VOICE_FADE_OUT_S = 1.5;

// ─── Easing ───────────────────────────────────────────────────────────────────

/**
 * Timing function for sentence entrance. Derives from EASE_RISE (style guide §3).
 * Snap-up, ease-out — the sentence arrives with intent and decelerates into legibility.
 */
export const VOICE_EASING_IN = EASE_RISE;

/**
 * Timing function for sentence exit. Derives from EASE_BREATHE (style guide §3).
 * Symmetric S-curve — the sentence departs deliberately, neither abrupt nor lingering.
 */
export const VOICE_EASING_OUT = EASE_BREATHE;

// ─── Rotation ─────────────────────────────────────────────────────────────────

/** Number of sentence categories in the cycle. */
export const VOICE_CATEGORY_COUNT = 9;

/**
 * Maximum great-circle distance (degrees) for two districts to be
 * considered geographic neighbors for the neighbor sentence.
 * Covers the two known close pairs: Crystalline↔Northern Lattice (~21°)
 * and Plasma Coast↔Spire Fields (~33°).
 */
export const NEIGHBOR_THRESHOLD_DEG = 45;

// ─── Chorus constants (category 7) ───────────────────────────────────────────

/**
 * Minimum number of distinct zones required for the full-chorus sentence to fire.
 * Below this count a civilization is too geographically small for "all zones
 * active" to carry meaningful weight. At the current zone count of 7 this
 * threshold allows the sentence to fire while excluding trivial multi-zone
 * test fixtures.
 */
export const CHORUS_MIN_ZONES = 5;

// ─── Mastery constants (category 8) ──────────────────────────────────────────

/**
 * The top district's avg_work_score must be at least this many times
 * the population-weighted system mean to fire the mastery sentence.
 *
 * At 1.5×: the leading zone's average architect is meaningfully more skilled
 * than the civilization at large — not a statistical noise difference.
 * Chosen to make the sentence rare but not vanishingly so (one or two zones
 * typically hold the bulk of high-tier architects in the current roster).
 */
export const MASTERY_DIVERGENCE_RATIO = 1.5;

/**
 * Minimum number of agents a district must have for it to qualify as a
 * mastery leader. A single T5 architect in a 1-agent zone would produce a
 * trivially unrepresentative avg_work_score.
 */
export const MASTERY_MIN_AGENTS = 3;

// ─── Divergence constants (category 6) ───────────────────────────────────────

/**
 * Minimum agent population for a zone to qualify as a "ghost zone".
 * Prevents flagging tiny zones (1–2 agents) as surprisingly dormant.
 */
export const DIVERGENCE_GHOST_MIN_POP = 8;

/**
 * Minimum number of working agents in a zone for it to qualify as a
 * "load carrier" (zone doing more than its share of system work).
 * Prevents 1-agent zones from triggering the load-carrier path.
 */
export const DIVERGENCE_LOAD_MIN_WORKERS = 2;

/**
 * Multiplier threshold for load-carrier detection.
 * A zone's utilization rate (working/agent_count) must be at least this
 * many times the system mean utilization to be considered a load carrier.
 *
 * At 2.0: a zone must be doing 2× the system average share of work.
 * This is intentionally high — the sentence should be rare and meaningful,
 * not fire every session just because one zone is slightly busier.
 */
export const DIVERGENCE_LOAD_MULTIPLIER = 2.0;

// ─── Sentence builders ────────────────────────────────────────────────────────

/**
 * Sentence based on the current weather state.
 *
 * Returns null only when there are no agents (nothing to narrate).
 */
export function buildWeatherSentence(
  info: WeatherInfo,
  agents: Agent[],
): string | null {
  if (agents.length === 0) return null;

  const total   = agents.length;
  const working = agents.filter(a => a.mode === 'working').length;
  const storms  = info.stormDistricts.length;

  switch (info.state) {
    case 'deep_rest':
      return total === 1
        ? 'One architect rests. The civilization holds its breath.'
        : `${total} architects recorded. All sectors below activation threshold.`;

    case 'stirring':
      return working > 0
        ? `${working} of ${total} architects coming online. The network stirs.`
        : `${total} architects present. The network is gathering intent.`;

    case 'in_flow':
      return `${working} builders in motion. The civilization has found its pace.`;

    case 'peak_storm':
      if (storms === 1) {
        return `${working} architects in peak output — ${info.stormDistricts[0]} at maximum load.`;
      }
      if (storms > 1) {
        return `${storms} districts in simultaneous surge. ${working} architects at full capacity.`;
      }
      return `${working} of ${total} architects at peak output.`;

    case 'clearing':
      return working > 0
        ? `The surge is passing. ${working} architects still building through the clearing.`
        : 'The surge has passed. Work returns to baseline across all sectors.';

    default:
      return null;
  }
}

/**
 * Sentence spotlighting the most active district.
 *
 * Chooses the district with the highest working_count. Returns null if
 * no district has any working agents, or no districts are provided.
 */
export function buildDistrictSentence(districts: District[]): string | null {
  if (districts.length === 0) return null;

  // Most active: highest working_count. Tiebreak: highest agent_count.
  const sorted = [...districts].sort((a, b) =>
    b.working_count - a.working_count || b.agent_count - a.agent_count,
  );

  const lead = sorted[0];
  if (lead.agent_count === 0) return null;

  if (lead.working_count === 0) {
    return `${lead.name}: ${lead.agent_count} architect${lead.agent_count !== 1 ? 's' : ''} at rest.`;
  }

  if (lead.working_count === lead.agent_count) {
    return `${lead.name}: ${lead.working_count} architect${lead.working_count !== 1 ? 's' : ''} — full district in simultaneous output.`;
  }

  return `${lead.name}: ${lead.working_count} of ${lead.agent_count} architects building.`;
}

/**
 * Sentence spotlighting high-tier (Tier-4/5) working activity.
 *
 * When agents is provided and exactly one high-tier architect is working,
 * the sentence names that architect specifically (display_name ?? name).
 * Otherwise falls back to count-based phrasing.
 *
 * Returns null when no high-tier architects are currently working.
 */
export function buildHighTierSentence(
  info: WeatherInfo,
  agents?: Agent[],
): string | null {
  if (info.highTierWorking === 0) return null;

  const n = info.highTierWorking;

  // Named path — only when exactly one high-tier architect is working and we
  // have agent data to identify them.
  //
  // Use `a.tier ?? getTier(a.work_score)` — the API may not return the tier
  // field, but work_score is always present and getTier derives the correct
  // tier from it. `(a.tier ?? 0)` would wrongly default to T1 when tier is
  // absent, silently falling through to the generic path.
  if (n === 1 && agents && agents.length > 0) {
    const highTier = agents
      .filter((a) => a.mode === 'working' && (a.tier ?? getTier(a.work_score)) >= 4)
      .sort((a, b) => (b.work_score ?? 0) - (a.work_score ?? 0));
    const top = highTier[0];
    if (top) {
      const label = top.display_name ?? top.name;
      return `${label} is building — monument-class output in progress.`;
    }
  }

  if (n === 1) {
    return 'Monument-class architecture in progress. A Tier-4 or Tier-5 architect is building.';
  }

  if (n <= 3 && agents && agents.length > 0) {
    // Name up to 2 of the working high-tier agents.
    const highTier = agents
      .filter((a) => a.mode === 'working' && (a.tier ?? getTier(a.work_score)) >= 4)
      .sort((a, b) => (b.work_score ?? 0) - (a.work_score ?? 0))
      .slice(0, 2);
    if (highTier.length >= 2) {
      const names = highTier.map((a) => a.display_name ?? a.name).join(' and ');
      return `${names} in simultaneous high-tier output.`;
    }
  }

  return `${n} high-tier architects in simultaneous output — monument-class work across the civilization.`;
}

/**
 * Sentence spotlighting the civilization's highest-scoring architect.
 *
 * Always names a specific agent — the one with the highest work_score.
 * If that agent is working, the sentence emphasises active output.
 * If idle, it reads as ambient recognition.
 *
 * Returns null only when there are no agents.
 */
export function buildLandmarkSentence(agents: Agent[]): string | null {
  if (agents.length === 0) return null;

  const top = [...agents].sort((a, b) => (b.work_score ?? 0) - (a.work_score ?? 0))[0];
  const label = top.display_name ?? top.name;
  const score = Math.round(top.work_score ?? 0).toLocaleString();

  if (top.mode === 'working') {
    return `${label} is building — ${score} work-score. The civilization's foremost architect is at work.`;
  }
  return `${label} holds ${score} work-score. The civilization's foremost presence, at rest.`;
}

/**
 * Sentence summarising the global headcount and activity level.
 *
 * Returns null when there are no agents.
 */
export function buildGlobalSentence(agents: Agent[], districts: District[]): string | null {
  if (agents.length === 0) return null;

  const total   = agents.length;
  const working = agents.filter(a => a.mode === 'working').length;
  const active  = districts.filter(d => d.working_count > 0).length;

  if (working === 0) {
    return `${total} architect${total !== 1 ? 's' : ''} in the civilization. None currently building.`;
  }

  if (active <= 1) {
    return `${working} of ${total} architects building — activity concentrated in a single sector.`;
  }

  return `${working} architects building across ${active} sectors. ${total - working} at rest.`;
}

/**
 * Sentence narrating zone-level utilization divergence.
 *
 * Two cases:
 *
 *   A. Ghost zone — a populous zone (≥ DIVERGENCE_GHOST_MIN_POP agents) has
 *      zero working agents while at least one other zone is active. The story:
 *      a settled territory is silent while the system hums elsewhere.
 *      Picks the most populous dormant zone to maximise geographic impact.
 *
 *   B. Load carrier — a zone whose utilization rate (working/agent_count) is
 *      ≥ DIVERGENCE_LOAD_MULTIPLIER × the system mean, AND has at least
 *      DIVERGENCE_LOAD_MIN_WORKERS working agents. The story: one zone is
 *      pulling disproportionately more weight than the system average.
 *
 * Ghost zone is evaluated first; if no qualified ghost zone exists, load
 * carrier is tried. Returns null when neither condition is met.
 */
export function buildDivergenceSentence(districts: District[]): string | null {
  if (districts.length === 0) return null;

  const totalWorking  = districts.reduce((s, d) => s + d.working_count, 0);
  const totalAgents   = districts.reduce((s, d) => s + d.agent_count, 0);
  if (totalAgents === 0) return null;

  // Case A — Ghost zone: populous zone with 0 workers, while system has workers.
  if (totalWorking > 0) {
    const candidates = districts
      .filter((d) => d.working_count === 0 && d.agent_count >= DIVERGENCE_GHOST_MIN_POP)
      .sort((a, b) => b.agent_count - a.agent_count);

    if (candidates.length > 0) {
      const ghost = candidates[0];
      return `${ghost.name} — ${ghost.agent_count} architect${ghost.agent_count !== 1 ? 's' : ''} at rest. The zone holds its presence in silence.`;
    }
  }

  // Case B — Load carrier: zone with utilization ≥ DIVERGENCE_LOAD_MULTIPLIER × mean.
  if (totalWorking >= DIVERGENCE_LOAD_MIN_WORKERS) {
    const systemMean = totalWorking / totalAgents;
    let bestZone: District | null = null;
    let bestRate = 0;

    for (const d of districts) {
      if (d.agent_count === 0 || d.working_count < DIVERGENCE_LOAD_MIN_WORKERS) continue;
      const rate = d.working_count / d.agent_count;
      if (rate >= DIVERGENCE_LOAD_MULTIPLIER * systemMean && rate > bestRate) {
        bestRate = rate;
        bestZone = d;
      }
    }

    if (bestZone) {
      const pct = Math.round(bestRate * 100);
      return `${bestZone.name} carries the load — ${bestZone.working_count} of ${bestZone.agent_count} architects working (${pct}% of zone capacity).`;
    }
  }

  return null;
}

/**
 * Sentence spotlighting a geographic cluster: two districts that are
 * geographically adjacent and simultaneously active (both have working agents).
 *
 * Picks the closest active pair within NEIGHBOR_THRESHOLD_DEG degrees.
 * Returns null when no such pair exists — rare enough to feel significant
 * when it fires.
 */
export function buildNeighborSentence(districts: District[]): string | null {
  const active = districts.filter((d) => d.working_count > 0);
  if (active.length < 2) return null;

  let bestA: District | null = null;
  let bestB: District | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const d = greatCircleDeg(
        active[i].center_lat, active[i].center_lon,
        active[j].center_lat, active[j].center_lon,
      );
      if (d < NEIGHBOR_THRESHOLD_DEG && d < bestDist) {
        bestDist = d;
        bestA = active[i];
        bestB = active[j];
      }
    }
  }

  if (!bestA || !bestB) return null;
  return `${bestA.name} and ${bestB.name} — neighboring zones in simultaneous output.`;
}

/**
 * Sentence celebrating full geographic coverage.
 *
 * Fires when every zone in the civilization has at least one working agent
 * simultaneously. This is a rare alignment — all sectors online at once.
 * From 5km it is the most meaningful geographic event: the civilization
 * occupies every corner of the world it has staked a claim on.
 *
 * Returns null unless:
 *   - districts.length ≥ CHORUS_MIN_ZONES (civilization is geographically mature)
 *   - every district has working_count > 0 (none dormant)
 */
export function buildChorusSentence(districts: District[]): string | null {
  if (districts.length < CHORUS_MIN_ZONES) return null;
  if (!districts.every((d) => d.working_count > 0)) return null;

  const n = districts.length;
  const totalWorking = districts.reduce((s, d) => s + d.working_count, 0);
  return `All ${n} sectors active simultaneously — ${totalWorking} architects building at full geographic reach.`;
}

/**
 * Sentence narrating district-level skill stratification.
 *
 * Compares the highest-avg_work_score district against the population-weighted
 * system mean. When the top zone's average exceeds MASTERY_DIVERGENCE_RATIO ×
 * the mean, the sentence names the zone and contrasts the two figures.
 *
 * This is the only voice category that narrates *quality* of expertise rather
 * than *quantity* of output. A zone may be quiet in activity (few workers) yet
 * hold the civilization's deepest technical capability. That geographic
 * concentration of expertise is worth annotating.
 *
 * Returns null when:
 *   - Fewer than 2 districts have enough agents (MASTERY_MIN_AGENTS)
 *   - System mean avg_work_score is 0 (no score data available)
 *   - No district exceeds MASTERY_DIVERGENCE_RATIO × mean
 */
export function buildMasterySentence(districts: District[]): string | null {
  // Only consider districts with enough agents to produce a meaningful average
  const qualified = districts.filter(
    (d) => d.agent_count >= MASTERY_MIN_AGENTS && d.avg_work_score > 0
  );
  if (qualified.length < 2) return null;

  // Population-weighted system mean avg_work_score across qualified districts
  const totalAgents = qualified.reduce((s, d) => s + d.agent_count, 0);
  const weightedSum = qualified.reduce((s, d) => s + d.avg_work_score * d.agent_count, 0);
  const systemMean = weightedSum / totalAgents;
  if (systemMean <= 0) return null;

  // Find the district with the highest avg_work_score
  const top = [...qualified].sort((a, b) => b.avg_work_score - a.avg_work_score)[0];
  if (!top) return null;

  // Only fire when the gap is meaningful
  if (top.avg_work_score < MASTERY_DIVERGENCE_RATIO * systemMean) return null;

  const topScore  = Math.round(top.avg_work_score).toLocaleString();
  const meanScore = Math.round(systemMean).toLocaleString();
  return `${top.name} concentrates the civilization's deepest expertise — average work-score ${topScore}, against a system mean of ${meanScore}.`;
}

/**
 * Pick one sentence for the current frame.
 *
 * Cycles through VOICE_CATEGORY_COUNT categories in order, starting from
 * `counter % VOICE_CATEGORY_COUNT`. If the chosen category returns null,
 * advances to the next until a non-null sentence is found.
 *
 * Returns null only if no category can produce a sentence (no agents).
 *
 * @param counter  Monotonically incrementing sentence counter (starts at 0).
 */
export function pickVoiceSentence(
  agents: Agent[],
  districts: District[],
  info: WeatherInfo,
  counter: number,
): string | null {
  const builders: Array<() => string | null> = [
    () => buildWeatherSentence(info, agents),
    () => buildDistrictSentence(districts),
    () => buildHighTierSentence(info, agents),
    () => buildGlobalSentence(agents, districts),
    () => buildLandmarkSentence(agents),
    () => buildNeighborSentence(districts),
    () => buildDivergenceSentence(districts),
    () => buildChorusSentence(districts),
    () => buildMasterySentence(districts),
  ];

  const start = ((counter % VOICE_CATEGORY_COUNT) + VOICE_CATEGORY_COUNT) % VOICE_CATEGORY_COUNT;

  for (let i = 0; i < VOICE_CATEGORY_COUNT; i++) {
    const idx = (start + i) % VOICE_CATEGORY_COUNT;
    const sentence = builders[idx]();
    if (sentence !== null) return sentence;
  }

  return null;
}
