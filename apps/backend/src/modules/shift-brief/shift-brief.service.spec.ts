/**
 * Unit tests for the Shift Brief deterministic logic (OWN ADDITION).
 * Pure fixtures, no database.
 */
import {
  buildShiftBrief,
  GENERATOR_LABEL,
  money,
  peakHours,
  plural,
  topItemsAnswer,
  type DayStats,
} from './brief.builder';
import { KNOWN_SHAPES, parseQuestion } from './qa.parser';

const baseStats: DayStats = {
  dayLabel: 'today',
  revenue: 570,
  orders: 2,
  paidOrders: 2,
  cancelled: 1,
  topItems: [
    { name: 'Chicken 65', qty: 4, total: 480 },
    { name: 'Coca-Cola', qty: 3, total: 90 },
  ],
  byHour: [
    { hour: 12, orders: 3 },
    { hour: 13, orders: 7 },
    { hour: 19, orders: 7 },
  ],
  channels: { online: 1, offline: 3 },
  wasteCost: 55,
  currency: '₹',
};

describe('buildShiftBrief', () => {
  it('carries the no-AI generator label', () => {
    const brief = buildShiftBrief(baseStats);
    expect(brief.generator).toBe(GENERATOR_LABEL);
    expect(brief.generator).toContain('no AI model');
  });

  it('summarises the day with revenue, orders and average', () => {
    const brief = buildShiftBrief(baseStats);
    const first = brief.sections[0];
    expect(first.heading).toBe('The day in one line');
    expect(first.lines[0]).toContain('570');
    expect(first.lines[0]).toContain('2 paid orders');
    expect(first.lines[0]).toContain('285');
  });

  it('handles an empty day without inventing numbers', () => {
    const brief = buildShiftBrief({
      ...baseStats,
      revenue: 0,
      orders: 0,
      paidOrders: 0,
      topItems: [],
      byHour: [],
      channels: { online: 0, offline: 0 },
      wasteCost: 0,
      cancelled: 0,
    });
    expect(brief.sections[0].lines[0]).toBe('No orders today yet.');
    expect(brief.sections).toHaveLength(1);
  });

  it('lists top items and watch-outs', () => {
    const brief = buildShiftBrief(baseStats);
    const sold = brief.sections.find((s) => s.heading === 'What sold');
    expect(sold?.lines[0]).toContain('Chicken 65');
    const watch = brief.sections.find((s) => s.heading === 'Watch-outs');
    expect(watch?.lines.join(' ')).toContain('1 order cancelled');
    expect(watch?.lines.join(' ')).toContain('55');
  });

  it('uses singular wording for one order and one unit', () => {
    const single: DayStats = {
      ...baseStats,
      orders: 1,
      paidOrders: 1,
      topItems: [{ name: 'Lassi', qty: 1, total: 90 }],
      byHour: [{ hour: 13, orders: 1 }],
      cancelled: 0,
    };
    const brief = buildShiftBrief(single);
    expect(brief.sections[0].lines[0]).toContain('across 1 paid order');
    expect(brief.sections[0].lines[0]).not.toContain('1 orders');
    const sold = brief.sections.find((s) => s.heading === 'What sold');
    expect(sold?.lines[0]).toContain('1 unit sold');
    const busy = brief.sections.find((s) => s.heading === 'When it was busy');
    expect(busy?.lines[0]).toContain('with 1 order');
    expect(busy?.lines.join(' ')).not.toContain('tie');
  });

  it('discloses busy-hour ties instead of implying a unique peak', () => {
    const brief = buildShiftBrief(baseStats);
    const busy = brief.sections.find((s) => s.heading === 'When it was busy');
    expect(busy?.lines).toHaveLength(3);
    expect(busy?.lines[2]).toContain('tie');
  });
});

describe('topItemsAnswer', () => {
  it('discloses a unit tie instead of naming a unique winner', () => {
    const ans = topItemsAnswer(
      [
        { name: 'Butter Chicken', qty: 1, total: 480 },
        { name: 'Coca-Cola', qty: 1, total: 90 },
      ],
      'today',
      '₹',
    );
    expect(ans).toContain('Tie for top seller');
    expect(ans).toContain('Butter Chicken');
    expect(ans).toContain('Coca-Cola');
    expect(ans).not.toContain('sold most');
  });

  it('names a unique top seller only when there is no tie', () => {
    const ans = topItemsAnswer(
      [
        { name: 'Chicken 65', qty: 4, total: 480 },
        { name: 'Coca-Cola', qty: 3, total: 90 },
      ],
      'today',
      '₹',
    );
    expect(ans).toContain('Chicken 65 sold most today');
  });

  it('says honestly when nothing sold', () => {
    expect(topItemsAnswer([], 'today', '₹')).toBe('Nothing sold today yet.');
  });
});

describe('buildShiftBrief paid-order basis', () => {
  it('does not mix paid revenue with unpaid order count', () => {
    const brief = buildShiftBrief({
      ...baseStats,
      orders: 2,
      paidOrders: 1,
      revenue: 570,
    });
    expect(brief.sections[0].lines[0]).toContain('across 1 paid order');
    expect(brief.sections[0].lines[0]).toContain('570 per paid order');
  });

  it('says none paid yet instead of a zero average', () => {
    const brief = buildShiftBrief({ ...baseStats, orders: 3, paidOrders: 0 });
    expect(brief.sections[0].lines[0]).toBe('3 orders today, none paid yet.');
  });
});

describe('plural', () => {
  it('singular and plural forms', () => {
    expect(plural(1, 'order')).toBe('order');
    expect(plural(2, 'order')).toBe('orders');
    expect(plural(0, 'unit')).toBe('units');
  });
});

describe('peakHours', () => {
  it('returns all tied peak hours', () => {
    expect(peakHours(baseStats.byHour).map((p) => p.hour)).toEqual([13, 19]);
  });
  it('returns none for a quiet day', () => {
    expect(peakHours([{ hour: 9, orders: 0 }])).toEqual([]);
  });
});

describe('money', () => {
  it('formats Indian grouping', () => {
    expect(money(1234567, '₹')).toBe('₹12,34,567');
  });
});

describe('parseQuestion', () => {
  it('parses each known shape', () => {
    expect(parseQuestion('what sold best today?')).toEqual({
      type: 'top-items',
      day: 'today',
    });
    expect(parseQuestion('revenue yesterday')).toEqual({
      type: 'revenue',
      day: 'yesterday',
    });
    expect(parseQuestion('How many orders today?')).toEqual({
      type: 'orders-count',
      day: 'today',
    });
    expect(parseQuestion('when were we busiest?')).toEqual({
      type: 'busiest-hour',
      day: 'today',
    });
    expect(parseQuestion('online vs offline orders')).toEqual({
      type: 'channel-split',
      day: 'today',
    });
    expect(parseQuestion('how much did we waste yesterday?')).toEqual({
      type: 'waste',
      day: 'yesterday',
    });
  });

  it('rejects unknown questions honestly', () => {
    expect(parseQuestion('should I fire my chef?')).toEqual({
      type: 'unknown',
    });
    expect(parseQuestion('')).toEqual({ type: 'unknown' });
    expect(KNOWN_SHAPES.length).toBeGreaterThan(0);
  });
});
