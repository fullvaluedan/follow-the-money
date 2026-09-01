export const CHAMBERS = ['house', 'senate'] as const;
export const PARTIES = ['democrat', 'republican', 'independent', 'other'] as const;
export const TRADE_TYPES = ['purchase', 'sale', 'exchange', 'unknown'] as const;
export const OWNER_TYPES = ['filer', 'spouse', 'joint', 'dependent_child', 'other'] as const;
export const ASSET_TYPES = ['stock', 'bond', 'fund', 'option', 'commodity_future', 'other'] as const;
export const TRADE_STATUSES = ['extracted', 'pending_review', 'published', 'rejected'] as const;
export const RAW_KINDS = ['pdf', 'html', 'xml', 'json'] as const;

export type Chamber = (typeof CHAMBERS)[number];
export type Party = (typeof PARTIES)[number];
export type TradeType = (typeof TRADE_TYPES)[number];
export type OwnerType = (typeof OWNER_TYPES)[number];
export type AssetType = (typeof ASSET_TYPES)[number];
export type TradeStatus = (typeof TRADE_STATUSES)[number];
export type RawKind = (typeof RAW_KINDS)[number];
