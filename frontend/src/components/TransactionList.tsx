import { useEffect, useState } from 'react'
import { api, Transaction, TransactionList as TList, formatCategory, getCategoryColor, formatUSD } from '../api/client'
import { format, parseISO } from 'date-fns'

interface Props {
  accountId?: string
  start?: string
  end?: string
  category?: string
  search?: string
  limit?: number
  showAccount?: boolean
  accounts?: { id: string; legal_business_name: string }[]
}

function CategoryPill({ cat }: { cat?: string }) {
  const label = formatCategory(cat)
  const color = getCategoryColor(cat || 'Uncategorized')
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}18`, color }}>
      {label}
    </span>
  )
}

function AmountCell({ amount }: { amount: number }) {
  const positive = amount > 0
  return (
    <span className={`tabular-nums font-medium text-sm ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-900 dark:text-zinc-50'}`}>
      {positive ? '+' : ''}{formatUSD(amount)}
    </span>
  )
}

export default function TransactionList({ accountId, start, end, category, search, limit = 50, showAccount = false, accounts = [] }: Props) {
  const [data, setData] = useState<TList | null>(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.legal_business_name]))

  useEffect(() => {
    setOffset(0)
  }, [accountId, start, end, category, search])

  useEffect(() => {
    setLoading(true)
    api.transactions({ account_id: accountId, start, end, category, search, limit, offset })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [accountId, start, end, category, search, limit, offset])

  if (loading && !data) return (
    <div className="flex items-center justify-center py-12">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!data?.items.length) return (
    <div className="text-center py-12 text-sm text-zinc-400 dark:text-zinc-500">
      No transactions found
    </div>
  )

  const fmtDate = (s?: string) => {
    if (!s) return '—'
    try { return format(parseISO(s), 'MMM d, yyyy') } catch { return s.slice(0, 10) }
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800">
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Date</th>
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Description</th>
              {showAccount && <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Account</th>}
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Category</th>
              <th className="text-right py-2.5 px-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {data.items.map((t: Transaction) => (
              <tr key={t.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs">
                  {fmtDate(t.created_at)}
                </td>
                <td className="py-3 px-3 text-zinc-800 dark:text-zinc-200 max-w-xs">
                  <p className="truncate font-medium">{t.counterparty_name || t.bank_description || '—'}</p>
                  {t.external_memo && <p className="text-xs text-zinc-400 truncate">{t.external_memo}</p>}
                </td>
                {showAccount && (
                  <td className="py-3 px-3 text-zinc-500 dark:text-zinc-400 text-xs whitespace-nowrap">
                    {accountMap[t.account_id] || t.account_id.slice(0, 8)}
                  </td>
                )}
                <td className="py-3 px-3">
                  <CategoryPill cat={t.mercury_category} />
                </td>
                <td className="py-3 px-3 text-right whitespace-nowrap">
                  <AmountCell amount={t.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
        {data.items.map((t: Transaction) => (
          <div key={t.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50 truncate">
                {t.counterparty_name || t.bank_description || '—'}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{fmtDate(t.created_at)}</span>
                <CategoryPill cat={t.mercury_category} />
              </div>
            </div>
            <AmountCell amount={t.amount} />
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data.total > limit && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-zinc-100 dark:border-zinc-800">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
          </p>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700
                text-zinc-600 dark:text-zinc-400 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              Previous
            </button>
            <button disabled={offset + limit >= data.total} onClick={() => setOffset(offset + limit)}
              className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700
                text-zinc-600 dark:text-zinc-400 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
