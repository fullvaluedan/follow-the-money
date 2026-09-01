import { getDb } from '@/lib/db';
import { hitlReviewQueue, trades, assets } from '@ftm/db';
import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { approveTrade } from '@ftm/domain';

export const dynamic = 'force-dynamic';

/**
 * HITL admin queue (placeholder auth: ADMIN_PASSCODE env).
 * Replaced by Clerk org-role gate in Phase 3.
 */

async function requireAdmin(formData: FormData): Promise<boolean> {
  const passcode = formData.get('passcode');
  const expected = process.env.ADMIN_PASSCODE;
  return Boolean(expected && passcode && passcode === expected);
}

export default async function AdminReviewPage() {
  const handle = getDb();
  if (!handle) return <p className="text-amber-900">Database not connected.</p>;

  const queue = await handle.db
    .select()
    .from(hitlReviewQueue)
    .where(eq(hitlReviewQueue.status, 'open'))
    .orderBy(desc(hitlReviewQueue.created_at));

  const needsPasscode = !process.env.ADMIN_PASSCODE;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Review Queue</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Rows land here when ticker is unresolved or confidence is low. Correct, approve to
        publish, or reject. Target: under 10 seconds per row.
      </p>

      {needsPasscode && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ADMIN_PASSCODE is not set — approval actions are disabled until it is configured.
        </div>
      )}

      {queue.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600">
          Queue is empty. 🎉
        </p>
      ) : (
        <div className="space-y-4">
          {queue.map((item) => (
            <form
              key={item.id}
              action={approveAction}
              className="rounded-lg border border-neutral-200 p-4"
            >
              <input type="hidden" name="queue_id" value={item.id} />
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
                  {item.flag_reason}
                </span>
                <span className="text-neutral-500">confidence {item.confidence}</span>
              </div>
              {item.raw_excerpt && (
                <pre className="mb-3 overflow-x-auto rounded bg-neutral-100 p-2 text-xs text-neutral-700">
                  {item.raw_excerpt}
                </pre>
              )}
              {(() => {
                const ex = (item.extracted_json ?? {}) as Record<string, unknown>;
                return (
                  <div className="mb-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <Editable label="Asset name" name="asset_name" value={String(ex.asset_name ?? '')} />
                    <Editable label="Ticker" name="ticker" value={String(ex.ticker ?? '')} />
                    <Readonly label="Type" value={String(ex.trade_type ?? '')} />
                    <Readonly label="Tx date" value={String(ex.tx_date ?? '')} />
                    <Readonly label="Range" value={String(ex.range_label ?? '')} />
                    <Readonly label="Owner" value={String(ex.owner_type ?? '')} />
                  </div>
                );
              })()}
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  name="passcode"
                  placeholder="Admin passcode"
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  required
                />
                <button
                  type="submit"
                  name="action"
                  value="approve"
                  className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  disabled={!process.env.ADMIN_PASSCODE}
                >
                  Approve & Publish
                </button>
                <button
                  type="submit"
                  name="action"
                  value="reject"
                  className="rounded bg-neutral-200 px-3 py-1 text-sm font-medium hover:bg-neutral-300 disabled:opacity-50"
                  disabled={!process.env.ADMIN_PASSCODE}
                >
                  Reject
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function Editable({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        name={name}
        defaultValue={value}
        className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
      />
    </label>
  );
}

function Readonly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs uppercase tracking-wide text-neutral-500">{label}</span>
      <div className="font-medium">{value || '—'}</div>
    </div>
  );
}

async function approveAction(formData: FormData) {
  'use server';
  const handle = getDb();
  if (!handle) return;
  if (!(await requireAdmin(formData))) return;

  const queueId = String(formData.get('queue_id'));
  const action = String(formData.get('action'));
  const editedTicker = String(formData.get('ticker') ?? '').trim().toUpperCase() || null;
  const editedName = String(formData.get('asset_name') ?? '').trim();

  const [item] = await handle.db
    .select()
    .from(hitlReviewQueue)
    .where(eq(hitlReviewQueue.id, queueId))
    .limit(1);
  if (!item || item.status !== 'open') return;

  if (action === 'reject') {
    await handle.db
      .update(hitlReviewQueue)
      .set({ status: 'rejected', reviewed_at: new Date(), reviewed_by: 'admin' })
      .where(eq(hitlReviewQueue.id, queueId));
    if (item.trade_id) {
      await handle.db.update(trades).set({ status: 'rejected' }).where(eq(trades.id, item.trade_id));
    }
  } else if (action === 'approve') {
    if (item.trade_id) {
      const [trade] = await handle.db.select().from(trades).where(eq(trades.id, item.trade_id)).limit(1);
      if (trade) {
        // Domain guard: explicit human approval path
        const newStatus = approveTrade({
          status: 'pending_review',
          ticker: editedTicker ?? trade.row_fingerprint, // presence check happens below
          confidence: Number(trade.confidence ?? 0),
          edited_ticker: editedTicker,
        });
        if (editedTicker) {
          const [asset] = await handle.db
            .insert(assets)
            .values({ ticker: editedTicker, name: editedName || `Asset ${editedTicker}` })
            .onConflictDoUpdate({
              target: assets.ticker,
              set: { name: editedName || `Asset ${editedTicker}`, updated_at: new Date() },
            })
            .returning({ id: assets.id });
          await handle.db
            .update(trades)
            .set({ status: newStatus, asset_id: asset.id, confidence: '1.000' })
            .where(eq(trades.id, trade.id));
        }
      }
    }
    await handle.db
      .update(hitlReviewQueue)
      .set({
        status: 'approved',
        reviewed_at: new Date(),
        reviewed_by: 'admin',
        edited_json: { ticker: editedTicker, asset_name: editedName },
      })
      .where(eq(hitlReviewQueue.id, queueId));
  }
  revalidatePath('/admin/review');
  revalidatePath('/');
}
