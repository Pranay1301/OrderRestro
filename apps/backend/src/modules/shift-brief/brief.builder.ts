/**
 * Shift Brief - deterministic brief builder (OWN ADDITION, not upstream).
 *
 * Every line is produced by these templates from POS data. No AI model is
 * involved anywhere in this file; the generator label travels with the
 * output so the UI can say so honestly.
 */
export interface DayStats {
  dayLabel: string; // "today" | "yesterday"
  revenue: number; // PAID orders only
  orders: number; // all orders created that day, any status
  paidOrders: number; // orders actually paid that day (revenue basis)
  cancelled: number;
  topItems: { name: string; qty: number; total: number }[];
  byHour: { hour: number; orders: number }[];
  channels: { online: number; offline: number };
  wasteCost: number;
  currency: string;
}

export interface BriefSection {
  heading: string;
  lines: string[];
}

export interface ShiftBrief {
  title: string;
  generatedAt: string;
  generator: string;
  sections: BriefSection[];
}

export const GENERATOR_LABEL =
  'deterministic-templates-v1 (rules over POS data, no AI model)';

export function money(n: number, currency: string): string {
  return `${currency}${Math.round(n).toLocaleString('en-IN')}`;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00-${String((h + 1) % 24).padStart(2, '0')}:00`;
}

export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? one + 's';
}

export function peakHours(byHour: { hour: number; orders: number }[]): {
  hour: number;
  orders: number;
}[] {
  const max = Math.max(0, ...byHour.map((h) => h.orders));
  if (max === 0) return [];
  return byHour.filter((h) => h.orders === max);
}

export function topItemsAnswer(
  topItems: DayStats['topItems'],
  dayLabel: string,
  currency: string,
): string {
  const top = topItems[0];
  if (!top) return `Nothing sold ${dayLabel} yet.`;
  const leaders = topItems.filter((t) => t.qty === top.qty);
  if (leaders.length > 1) {
    const names = leaders.map((l) => l.name).join(' and ');
    const totals = leaders
      .map((l) => `${l.name} ${money(l.total, currency)}`)
      .join(', ');
    return (
      `Tie for top seller ${dayLabel}: ${names} each sold ` +
      `${top.qty} ${plural(top.qty, 'unit')}. Totals: ${totals}.`
    );
  }
  return (
    `${top.name} sold most ${dayLabel}: ${top.qty} ` +
    `${plural(top.qty, 'unit')} sold for ` +
    `${money(top.total, currency)} in total.`
  );
}

export function buildShiftBrief(stats: DayStats): ShiftBrief {
  const aov = stats.paidOrders > 0 ? stats.revenue / stats.paidOrders : 0;
  const cur = stats.currency;
  const sections: BriefSection[] = [];

  sections.push({
    heading: `The day in one line`,
    lines:
      stats.orders === 0
        ? [`No orders ${stats.dayLabel} yet.`]
        : stats.paidOrders === 0
          ? [
              `${stats.orders} ${plural(stats.orders, 'order')} ` +
                `${stats.dayLabel}, none paid yet.`,
            ]
          : [
              `${money(stats.revenue, cur)} across ${stats.paidOrders} paid ` +
                `${plural(stats.paidOrders, 'order')} ` +
                `(avg ${money(aov, cur)} per paid order) ${stats.dayLabel}.`,
            ],
  });

  if (stats.topItems.length > 0) {
    sections.push({
      heading: 'What sold',
      lines: stats.topItems.map(
        (item, i) =>
          `${i + 1}. ${item.name} - ${item.qty} ` +
          `${plural(item.qty, 'unit')} sold, ` +
          `${money(item.total, cur)}`,
      ),
    });
  }

  const peaks = peakHours(stats.byHour);
  if (peaks.length > 0) {
    const lines = peaks.map(
      (p) => `${hourLabel(p.hour)} with ${p.orders} ${plural(p.orders, 'order')}`,
    );
    if (peaks.length > 1) {
      lines.push('(tie - no single busiest hour)');
    }
    sections.push({
      heading: 'When it was busy',
      lines,
    });
  }

  const total = stats.channels.online + stats.channels.offline;
  if (total > 0) {
    const pct = Math.round((stats.channels.online / total) * 100);
    sections.push({
      heading: 'Channels',
      lines: [
        `${pct}% of orders came in online (QR/kiosk), ` +
          `${100 - pct}% were rung up by staff.`,
      ],
    });
  }

  const watchOuts: string[] = [];
  if (stats.cancelled > 0) {
    watchOuts.push(
      `${stats.cancelled} order${stats.cancelled === 1 ? '' : 's'} cancelled ${stats.dayLabel}.`,
    );
  }
  if (stats.wasteCost > 0) {
    watchOuts.push(
      `Waste logged ${stats.dayLabel} cost about ${money(stats.wasteCost, cur)}.`,
    );
  }
  if (watchOuts.length > 0) {
    sections.push({ heading: 'Watch-outs', lines: watchOuts });
  }

  return {
    title: `Shift Brief - ${stats.dayLabel}`,
    generatedAt: new Date().toISOString(),
    generator: GENERATOR_LABEL,
    sections,
  };
}
