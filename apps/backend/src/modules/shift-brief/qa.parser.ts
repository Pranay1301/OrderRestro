/**
 * Shift Brief Q&A - keyword intent parser (OWN ADDITION, not upstream).
 *
 * A deliberately simple, inspectable parser. It is NOT a language model:
 * it recognizes a fixed set of question shapes about the day's numbers
 * and says so. Anything else returns "unknown" with the list of shapes
 * it does understand.
 */
export type DayRef = 'today' | 'yesterday';

export type QaIntent =
  | { type: 'top-items'; day: DayRef }
  | { type: 'revenue'; day: DayRef }
  | { type: 'orders-count'; day: DayRef }
  | { type: 'busiest-hour'; day: DayRef }
  | { type: 'channel-split'; day: DayRef }
  | { type: 'waste'; day: DayRef }
  | { type: 'unknown' };

export const PARSER_LABEL =
  'keyword-parser-v1 (fixed question shapes, no AI model)';

export const KNOWN_SHAPES = [
  'what sold best today?',
  'revenue today / yesterday',
  'how many orders today?',
  'when were we busiest?',
  'online vs offline orders',
  'how much did we waste today?',
];

function dayRef(q: string): DayRef {
  return /\byesterday\b/.test(q) ? 'yesterday' : 'today';
}

export function parseQuestion(input: string): QaIntent {
  const q = input.toLowerCase().trim();
  if (q.length === 0) return { type: 'unknown' };

  if (/(top|best|most popular|most sold|best.?sell)/.test(q)) {
    return { type: 'top-items', day: dayRef(q) };
  }
  if (/(revenue|sales|earn|turnover|income)/.test(q)) {
    return { type: 'revenue', day: dayRef(q) };
  }
  if (/(how many orders|order count|number of orders|orders (did we get|today|yesterday))/.test(q)) {
    return { type: 'orders-count', day: dayRef(q) };
  }
  if (/(busiest|peak|rush)/.test(q)) {
    return { type: 'busiest-hour', day: dayRef(q) };
  }
  if (/(online|offline|channel|qr|kiosk)/.test(q)) {
    return { type: 'channel-split', day: dayRef(q) };
  }
  if (/waste/.test(q)) {
    return { type: 'waste', day: dayRef(q) };
  }
  return { type: 'unknown' };
}
