import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout'
import { api, Account, Transaction, formatUSD, formatCategory } from '../api/client'
import { format, parseISO } from 'date-fns'

export default function Categorize() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [uncategorized, setUncategorized] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)

  const load = async () => {
    setLoading(true)
    const [allAccounts, txns, cats] = await Promise.all([
      api.accounts(),
      api.transactions({ limit: 500 }),
      api.categories(),
    ])
    setAccounts(allAccounts)
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

  const addCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    setAddingCat(true)
    try {
      await api.createCategory(name)
      setNewCatName('')
      const cats = await api.categories()
      setCategories(cats)
    } finally {
      setAddingCat(false)
    }
  }

  const onSaved = (txnId: string) => {
    setUncategorized(prev => prev.filter(t => t.id !== txnId))
  }

  return (
    <Layout accounts={sidebarAccounts}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">Categorize</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Assign categories to uncategorized transactions. To edit already-categorized ones, click the category pill in any transaction list.
          </p>
        </div>

        {/* New category */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
            Custom categories
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map(c => (
              <span key={c} className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full
                bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-800">
                {formatCategory(c)}
              </span>
            ))}
            {categories.length === 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">No categories yet</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
              placeholder="New category name…"
              className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 w-52
                bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200
                focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button
              onClick={addCategory}
              disabled={!newCatName.trim() || addingCat}
              className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700
                disabled:opacity-40 text-white font-medium transition-colors"
            >
              Add
            </button>
          </div>
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
                  onSaved={() => onSaved(t.id)}
                  onCategoryAdded={name => setCategories(prev => [...new Set([...prev, name])].sort())}
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
  txn, accountName, categories, fmtDate, onSaved, onCategoryAdded,
}: {
  txn: Transaction
  accountName: string
  categories: string[]
  fmtDate: (s?: string) => string
  onSaved: () => void
  onCategoryAdded: (name: string) => void
}) {
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingNew) inputRef.current?.focus()
  }, [addingNew])

  const save = async (cat: string) => {
    setSaving(true)
    try {
      await api.setCategory(txn.id, cat)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const saveNew = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      await api.createCategory(name)
      onCategoryAdded(name)
      await api.setCategory(txn.id, name)
      onSaved()
    } finally {
      setSaving(false)
      setAddingNew(false)
    }
  }

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
      <div className="flex items-center gap-2 sm:flex-shrink-0 flex-wrap">
        <span className={`tabular-nums font-medium text-sm ${txn.amount > 0 ? 'text-emerald-600' : 'text-zinc-900 dark:text-zinc-50'}`}>
          {txn.amount > 0 ? '+' : ''}{formatUSD(txn.amount)}
        </span>
        {addingNew ? (
          <>
            <input
              ref={inputRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') setAddingNew(false) }}
              placeholder="Category name…"
              className="text-xs border border-violet-400 rounded-lg px-2 py-1.5 w-32
                bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
                focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            <button onClick={saveNew} disabled={!newName.trim() || saving}
              className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700
                disabled:opacity-40 text-white font-medium transition-colors">
              Save
            </button>
            <button onClick={() => setAddingNew(false)}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              Cancel
            </button>
          </>
        ) : (
          <>
            <select
              value={selected}
              onChange={e => {
                if (e.target.value === '__new__') { setAddingNew(true); return }
                setSelected(e.target.value)
              }}
              className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5
                bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
                focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Assign category…</option>
              {categories.map(c => (
                <option key={c} value={c}>{formatCategory(c)}</option>
              ))}
              <option value="__new__">+ New category…</option>
            </select>
            <button onClick={() => save(selected)} disabled={!selected || saving}
              className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700
                disabled:opacity-40 text-white font-medium transition-colors">
              {saving ? '…' : 'Save'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
