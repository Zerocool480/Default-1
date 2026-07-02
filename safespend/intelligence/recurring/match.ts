/**
 * Bill↔payment matching — pure core (the "already paid" dedup from
 * DATABASE.md). When a synced transaction is recognized as a stream's
 * payment, the stream's next expected date advances past it, so the engine
 * never counts a bill that's already been paid this period.
 *
 * Deliberately conservative: a false link hides a real upcoming bill from
 * the engine (dangerous), while a missed link merely leaves the bill counted
 * (safe). Every heuristic errs toward not matching.
 */
import { addDays, compareISO, diffDays } from '../../shared/dates';
import { expandOccurrences, type Frequency } from '../forecast/expand';

export interface MatchableStream {
  id: string;
  direction: 'inflow' | 'outflow';
  merchantName: string | null;
  description: string;
  frequency: Frequency;
  averageAmountCents: number; // magnitude
  nextExpectedDateISO: string | null;
}

export interface MatchableTxn {
  id: string;
  dateISO: string;
  /** Plaid sign: positive = outflow. */
  amountCents: number;
  merchantName: string | null;
  name: string;
}

export interface StreamMatch {
  streamId: string;
  txnId: string;
  /** New anchor: the first expected occurrence strictly after the payment. */
  newNextExpectedDateISO: string | null;
  lastAmountCents: number;
}

/** Days of slack around an expected occurrence date. */
const DATE_TOLERANCE_DAYS = 7;
/** Amount slack: within 25% of the typical amount, or within $2 absolute. */
function amountMatches(expectedCents: number, actualCents: number): boolean {
  const diff = Math.abs(expectedCents - actualCents);
  return diff <= Math.max(200, Math.round(expectedCents * 0.25));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function merchantMatches(stream: MatchableStream, txn: MatchableTxn): boolean {
  const streamKeys = [stream.merchantName, stream.description]
    .filter((v): v is string => Boolean(v))
    .map(normalize)
    .filter((v) => v.length >= 3);
  const txnKeys = [txn.merchantName, txn.name]
    .filter((v): v is string => Boolean(v))
    .map(normalize)
    .filter((v) => v.length >= 3);
  return streamKeys.some((s) => txnKeys.some((t) => t.includes(s) || s.includes(t)));
}

/**
 * Match unlinked transactions to a stream's expected occurrences.
 * Occurrences considered: one period back through one period ahead of the
 * anchor, each with ±DATE_TOLERANCE_DAYS slack. At most one transaction per
 * occurrence (closest date wins).
 */
export function matchStream(
  stream: MatchableStream,
  candidates: MatchableTxn[],
): StreamMatch | null {
  if (!stream.nextExpectedDateISO) return null;

  const directional = candidates.filter((t) =>
    stream.direction === 'outflow' ? t.amountCents > 0 : t.amountCents < 0,
  );

  // Expected occurrences around the anchor: the anchor itself plus the next
  // one (payments can arrive a little early for the following period too).
  const windowStart = addDays(stream.nextExpectedDateISO, -DATE_TOLERANCE_DAYS);
  const windowEnd = addDays(stream.nextExpectedDateISO, 45);
  const occurrences = expandOccurrences(
    stream.nextExpectedDateISO,
    stream.frequency,
    windowStart,
    windowEnd,
    4,
  );

  let best: { txn: MatchableTxn; occurrence: string; distance: number } | null = null;
  for (const txn of directional) {
    if (!merchantMatches(stream, txn)) continue;
    if (!amountMatches(stream.averageAmountCents, Math.abs(txn.amountCents))) continue;
    for (const occ of occurrences) {
      const distance = Math.abs(diffDays(occ, txn.dateISO));
      if (distance > DATE_TOLERANCE_DAYS) continue;
      if (!best || distance < best.distance) best = { txn, occurrence: occ, distance };
    }
  }
  if (!best) return null;

  // Advance the anchor past the OCCURRENCE that was paid (not merely past the
  // payment date — an early payment settles its upcoming occurrence), so the
  // engine stops counting the paid bill immediately.
  const paidThrough =
    compareISO(best.txn.dateISO, best.occurrence) > 0 ? best.txn.dateISO : best.occurrence;
  const future = expandOccurrences(
    stream.nextExpectedDateISO,
    stream.frequency,
    stream.nextExpectedDateISO,
    addDays(paidThrough, 400),
    30,
  );
  const next = future.find((d) => compareISO(d, paidThrough) > 0) ?? null;

  return {
    streamId: stream.id,
    txnId: best.txn.id,
    newNextExpectedDateISO: next,
    lastAmountCents: Math.abs(best.txn.amountCents),
  };
}
