/**
 * Shift Brief service (OWN ADDITION, not upstream).
 *
 * Gathers the day's numbers from the POS database and renders them
 * through the deterministic brief builder / keyword parser. No AI
 * model calls are made anywhere in this module.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildShiftBrief,
  GENERATOR_LABEL,
  money,
  peakHours,
  plural,
  topItemsAnswer,
  type DayStats,
  type ShiftBrief,
} from './brief.builder';
import { KNOWN_SHAPES, PARSER_LABEL, parseQuestion } from './qa.parser';

export interface QaAnswer {
  question: string;
  answer: string;
  matched: boolean;
  knownShapes?: string[];
  parser: string;
  generator: string;
}

function dayRange(day: 'today' | 'yesterday'): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  if (day === 'yesterday') {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  }
  return { from, to };
}

@Injectable()
export class ShiftBriefService {
  constructor(private readonly prisma: PrismaService) {}

  private async gather(
    branchId: string,
    day: 'today' | 'yesterday',
  ): Promise<DayStats> {
    const { from, to } = dayRange(day);
    const dayWhere = { gte: from, lt: to };

    const [revenueAgg, orders, cancelled, topItems, paidOrders, channels, waste] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: { branchId, status: 'PAID', billedAt: dayWhere },
          _sum: { totalAmount: true },
        }),
        this.prisma.order.count({
          where: { branchId, createdAt: dayWhere },
        }),
        this.prisma.order.count({
          where: { branchId, status: 'CANCELLED', createdAt: dayWhere },
        }),
        this.prisma.orderItem.groupBy({
          by: ['nameSnapshot'],
          where: {
            order: { branchId, status: 'PAID', billedAt: dayWhere },
          },
          _sum: { quantity: true, lineTotal: true },
          orderBy: { _sum: { quantity: 'desc' } },
          take: 5,
        }),
        this.prisma.order.findMany({
          where: { branchId, status: 'PAID', billedAt: dayWhere },
          select: { billedAt: true },
        }),
        this.prisma.order.groupBy({
          by: ['channel'],
          where: { branchId, createdAt: dayWhere },
          _count: true,
        }),
        this.prisma.wasteLog.findMany({
          where: { branchId, createdAt: dayWhere },
          select: { quantity: true, unitCostAtWaste: true },
        }),
      ]);

    const hourBuckets = new Map<number, number>();
    for (const o of paidOrders) {
      if (!o.billedAt) continue;
      const h = new Date(o.billedAt).getHours();
      hourBuckets.set(h, (hourBuckets.get(h) ?? 0) + 1);
    }

    const channelCounts = channels.reduce(
      (acc, row) => {
        if (row.channel === 'ONLINE') acc.online += row._count;
        else acc.offline += row._count;
        return acc;
      },
      { online: 0, offline: 0 },
    );

    const wasteCost = waste.reduce(
      (sum, w) => sum + Number(w.quantity) * Number(w.unitCostAtWaste),
      0,
    );

    return {
      dayLabel: day,
      revenue: Number(revenueAgg._sum.totalAmount ?? 0),
      orders,
      paidOrders: paidOrders.length,
      cancelled,
      topItems: topItems.map((t) => ({
        name: t.nameSnapshot,
        qty: Number(t._sum.quantity ?? 0),
        total: Number(t._sum.lineTotal ?? 0),
      })),
      byHour: [...hourBuckets.entries()]
        .map(([hour, count]) => ({ hour, orders: count }))
        .sort((a, b) => a.hour - b.hour),
      channels: channelCounts,
      wasteCost,
      currency: '₹', // demo stack is India/GST configured
    };
  }

  async getBrief(branchId: string): Promise<ShiftBrief> {
    const stats = await this.gather(branchId, 'today');
    return buildShiftBrief(stats);
  }

  async ask(branchId: string, question: string): Promise<QaAnswer> {
    const intent = parseQuestion(question);
    if (intent.type === 'unknown') {
      return {
        question,
        answer:
          'I only understand a fixed set of question shapes about the ' +
          "day's numbers. Try one of the examples.",
        matched: false,
        knownShapes: KNOWN_SHAPES,
        parser: PARSER_LABEL,
        generator: GENERATOR_LABEL,
      };
    }
    const stats = await this.gather(branchId, intent.day);
    const cur = stats.currency;
    let answer: string;
    switch (intent.type) {
      case 'top-items': {
        answer = topItemsAnswer(stats.topItems, intent.day, cur);
        break;
      }
      case 'revenue':
        answer = `Revenue ${intent.day}: ${money(stats.revenue, cur)} ` +
          `across ${stats.paidOrders} paid ` +
          `${plural(stats.paidOrders, 'order')}.`;
        break;
      case 'orders-count':
        answer =
          `${stats.orders} ${plural(stats.orders, 'order')} ${intent.day} ` +
          `(${stats.paidOrders} paid` +
          (stats.cancelled > 0
            ? `, ${stats.cancelled} ${plural(stats.cancelled, 'order')} cancelled`
            : '') +
          ').';
        break;
      case 'busiest-hour': {
        const peaks = peakHours(stats.byHour);
        answer = peaks.length
          ? peaks.length > 1
            ? `No single busiest hour ${intent.day}: ` +
              `${peaks
                .map((p) => `${String(p.hour).padStart(2, '0')}:00`)
                .join(' and ')} tied with ${peaks[0].orders} ` +
              `${plural(peaks[0].orders, 'order')} each.`
            : `Busiest ${intent.day}: ` +
              `${String(peaks[0].hour).padStart(2, '0')}:00 with ` +
              `${peaks[0].orders} ${plural(peaks[0].orders, 'order')}.`
          : `No paid orders ${intent.day} yet, so no peak.`;
        break;
      }
      case 'channel-split': {
        const total = stats.channels.online + stats.channels.offline;
        answer = total
          ? `${Math.round((stats.channels.online / total) * 100)}% online, ` +
            `${100 - Math.round((stats.channels.online / total) * 100)}% staff-entered ` +
            `(${total} ${plural(total, 'order')} ${intent.day}).`
          : `No orders ${intent.day} yet.`;
        break;
      }
      case 'waste':
        answer = stats.wasteCost > 0
          ? `Waste ${intent.day} cost about ${money(stats.wasteCost, cur)}.`
          : `No waste logged ${intent.day}.`;
        break;
    }
    return {
      question,
      answer,
      matched: true,
      parser: PARSER_LABEL,
      generator: GENERATOR_LABEL,
    };
  }
}
