import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { api, Account, Transaction, formatUSD, formatCategory, getCategoryColor } from '../api/client'
import { format, parseISO } from 'date-fns'

export default function Categorize() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [uncategorized, setUncategorized] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [allAccounts, txns, cats] = await Promise.all([
      api.accounts(),
      api.transactions({ category: '', limit: 200 }),  // all without category filter
      api.categories(),
    ])
    setAccounts(allAccounts)
    // Client-side filter: keep only those with null mercury_category
    setUncategorized(txns.items.filter(t => !t.mercury_category))
    setCategories(cats)
    setLoading(false)
  }

  useEffect(() => { load().catch(console.error) }, [])

  const sidebarAccounts = accounts.map(a => ({
    id: a.id, name: a.name, legal_business_name: a.legal_business_name || a.name,
  }))

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.legal_business_name || a.name]))
  const fmtDate = (s?: string) => { try { return format(parseISO(s!), 'MMM d, yyyy') } catch { return '—' } }

  return (
    <Layout accounts={sidebarAccounts}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">Categorize</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Transactions without a Mercury category. You can assign them manually here.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : uncategorized.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">All caught up!</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">No uncategorized transactions</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {uncategorized.length} uncategorized transaction{uncategorized.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
              {uncategorized.map(t => (
                <UncategorizedRow
                  key={t.id}
                  txn={t}
                  accountName={accountMap[t.account_id] || '—'}
                  categories={categories}
                  fmtDate={fmtDate}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

function UncategorizedRow({
  txn, accountName, categories, fmtDate,
}: {
  txn: Transaction
  accountName: string
  categories: string[]
  fmtDate: (s?: string) => string
}) {
  const [selected, setSelected] = useState('')
  const [saved, setSaved] = useState(false)

  // Note: Mercury API doesn't have a write endpoint for categories.
  // This UI is a placeholder for when we add custom categorization to the backend.
  const save = async () => {
    if (!selected) return
    // Future: call PATCH /transactions/{id}/category
    setSaved(true)
  }

  if (saved) return null

  return (
    <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
          {txn.counterparty_name || txn.bank_description || '—'}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
          <span>{fmtDate(txn.created_at)}</span>
          <span>·</span>
          <span>{accountName}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:flex-shrink-0">
        <span className={`tabular-nums font-medium text-sm ${txn.amount > 0 ? 'text-emerald-600' : 'text-zinc-900 dark:text-zinc-50'}`}>
          {txn.amount > 0 ? '+' : ''}{formatUSD(txn.amount)}
        </span>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5
            bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
            focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <option value="">Assign category…</option>
          {categories.map(c => (
            <option key={c} value={c}>{formatCategory(c)}</option>
          ))}
        </select>
        <button onClick={save} disabled={!selected}
          className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700
            disabled:opacity-40 text-white font-medium transition-colors">
          Save
        </button>
      </div>
    </div>
  )
}
