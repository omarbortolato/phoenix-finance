// All API calls go through /api (Vite proxy in dev, nginx in prod)
const BASE = '/api'

async function req<T>(path: string, init: RequestInit = {}, skipRedirect = false): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (res.status === 401) {
    // skipRedirect=true per /auth/me: essere non-autenticati sulla login page è normale
    if (!skipRedirect) window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params))
    if (v != null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Account {
  id: string
  name: string
  account_number?: string
  kind: string
  status: string
  legal_business_name?: string
  available_balance: number
  current_balance: number
  dashboard_link?: string
  last_sync_at?: string
  sort_order?: number
  is_excluded?: boolean
}

export interface AccountTotals {
  total_available: number
  total_current: number
  accounts: { id: string; name: string; legal_business_name: string; available_balance: number }[]
}

export interface Transaction {
  id: string
  account_id: string
  amount: number
  created_at?: string
  posted_at?: string
  status?: string
  kind?: string
  bank_description?: string
  counterparty_name?: string
  external_memo?: string
  note?: string
  mercury_category?: string
  dashboard_link?: string
}

export interface TransactionList {
  total: number
  items: Transaction[]
}

export interface BalancePoint {
  date: string
  balance: number
}

export interface CategoryBreakdown {
  category: string
  total: number
  count: number
}

export interface SyncResult {
  accounts_synced: number
  total_transactions_fetched: number
  total_transactions_new: number
  errors: string[]
}

export interface AccountAlert {
  threshold: number
  email: string
  last_sent_at?: string | null
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const api = {
  me: () => req<{ username: string }>('/auth/me', {}, true),
  login: (username: string, password: string) =>
    req<{ username: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  forgotPassword: (identifier: string) =>
    req<{ detail: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ identifier }) }),

  accounts: () => req<Account[]>('/accounts'),
  totals: () => req<AccountTotals>('/accounts/totals'),
  balanceHistory: (accountId?: string, days = 90) =>
    req<BalancePoint[]>(`/accounts/balance-history${qs({ account_id: accountId, days })}`),

  transactions: (p: {
    account_id?: string; start?: string; end?: string
    category?: string; search?: string; limit?: number; offset?: number
  }) => req<TransactionList>(`/transactions${qs(p)}`),

  categories: () => req<string[]>('/categories'),
  createCategory: (name: string) =>
    req<{ id: number; name: string }>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),

  setCategory: (txnId: string, category: string | null) =>
    req<{ id: string; mercury_category: string | null }>(
      `/transactions/${txnId}/category`,
      { method: 'PATCH', body: JSON.stringify({ category }) },
    ),

  categoryBreakdown: (p: { account_id?: string; start?: string; end?: string }) =>
    req<CategoryBreakdown[]>(`/transactions/category-breakdown${qs(p)}`),

  reorderAccounts: (items: { id: string; sort_order: number }[]) =>
    req('/accounts/reorder', { method: 'PATCH', body: JSON.stringify(items) }),
  excludeAccount: (id: string) =>
    req(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify({ is_excluded: true }) }),

  getAlert: (accountId: string) =>
    req<AccountAlert | null>(`/accounts/${accountId}/alert`),
  saveAlert: (accountId: string, threshold: number, email: string) =>
    req<AccountAlert>(`/accounts/${accountId}/alert`, { method: 'PUT', body: JSON.stringify({ threshold, email }) }),
  deleteAlert: (accountId: string) =>
    req(`/accounts/${accountId}/alert`, { method: 'DELETE' }),

  sync: () => req<SyncResult>('/sync', { method: 'POST' }),
}

// ─── Helpers shared across components ─────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  Education: '#8B5CF6',
  ProfessionalServices: '#06B6D4',
  Taxes: '#F59E0B',
  Software: '#10B981',
  Travel: '#F97316',
  Marketing: '#EC4899',
  Payroll: '#14B8A6',
  Transfers: '#6B7280',
  Uncategorized: '#9CA3AF',
}

const FALLBACK = ['#8B5CF6', '#06B6D4', '#F59E0B', '#10B981', '#F97316', '#EC4899', '#14B8A6']
export function getCategoryColor(cat: string): string {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat]
  let h = 0
  for (let i = 0; i < cat.length; i++) h = cat.charCodeAt(i) + ((h << 5) - h)
  return FALLBACK[Math.abs(h) % FALLBACK.length]
}

export function formatCategory(cat: string | null | undefined): string {
  if (!cat) return 'Uncategorized'
  return cat.replace(/([A-Z])/g, ' $1').trim()
}

export function formatUSD(n: number, compact = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
  }).format(n)
}
