import { describe, it, expect } from 'vitest';
import { canAutoPublish, publishTrade, approveTrade } from '../src/publish.js';
import type { TradeStatus } from '../src/types.js';

describe('publish guard', () => {
  const good: Parameters<typeof canAutoPublish>[0] = {
    status: 'extracted',
    ticker: 'MSFT',
    confidence: 0.99,
  };

  it('auto-publishes only from extracted + resolved ticker + high confidence', () => {
    expect(canAutoPublish(good)).toBe(true);
    expect(publishTrade(good)).toBe('published');
  });

  it('never publishes from pending_review silently', () => {
    const t = { status: 'pending_review' as TradeStatus, ticker: 'MSFT', confidence: 0.99 };
    expect(canAutoPublish(t)).toBe(false);
    expect(() => publishTrade(t)).toThrow(/HITL/);
  });

  it('never publishes without a ticker', () => {
    const t = { status: 'extracted' as TradeStatus, ticker: null, confidence: 0.99 };
    expect(canAutoPublish(t)).toBe(false);
    expect(() => publishTrade(t)).toThrow(/HITL|ticker/);
  });

  it('never publishes below confidence threshold', () => {
    const t = { status: 'extracted' as TradeStatus, ticker: 'MSFT', confidence: 0.7 };
    expect(canAutoPublish(t)).toBe(false);
    expect(() => publishTrade(t)).toThrow();
  });

  it('approve() moves pending_review → published explicitly', () => {
    const t = { status: 'pending_review' as TradeStatus, ticker: null, confidence: 0.5 };
    expect(approveTrade({ ...t, edited_ticker: 'MSFT' })).toBe('published');
  });

  it('approve() rejects publishing without any ticker', () => {
    const t = { status: 'pending_review' as TradeStatus, ticker: null, confidence: 0.5 };
    expect(() => approveTrade(t)).toThrow(/ticker/);
  });

  it('approve() only accepts pending_review', () => {
    expect(() =>
      approveTrade({ status: 'extracted', ticker: 'MSFT', confidence: 0.99 }),
    ).toThrow(/pending_review/);
  });
});
