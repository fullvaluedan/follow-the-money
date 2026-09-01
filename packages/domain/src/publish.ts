import type { TradeStatus } from './types';
import { AUTO_PUBLISH_CONFIDENCE } from './schema';
import type { ExtractedTrade } from './schema';

export interface PublishableTrade {
  status: TradeStatus;
  ticker: string | null;
  confidence: number;
}

/**
 * Publish guard: a trade may only be auto-published from `extracted` status
 * when confidence >= threshold AND ticker resolved.
 * `pending_review` trades must go through approve() (HITL) first — never silent.
 */
export function canAutoPublish(t: PublishableTrade): boolean {
  return t.status === 'extracted' && t.ticker !== null && t.confidence >= AUTO_PUBLISH_CONFIDENCE;
}

export function publishTrade(t: PublishableTrade): TradeStatus {
  if (!canAutoPublish(t)) {
    throw new Error(
      `refusing to publish trade in status=${t.status} ticker=${t.ticker ?? 'none'} confidence=${t.confidence} — route through HITL approve()`,
    );
  }
  return 'published';
}

/** HITL approval path: pending_review → published, explicitly, by a human. */
export function approveTrade(t: PublishableTrade & { edited_ticker?: string | null }): TradeStatus {
  if (t.status !== 'pending_review') {
    throw new Error(`approve() requires status=pending_review, got ${t.status}`);
  }
  const ticker = t.edited_ticker ?? t.ticker;
  if (!ticker) {
    throw new Error('cannot approve a trade with no ticker — edit the row first or reject');
  }
  return 'published';
}
