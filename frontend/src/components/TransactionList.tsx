import { useEffect, useRef, useState } from 'react'
import { api, Project, Transaction, TransactionList as TList, formatCategory, getCategoryColor, formatUSD } from '../api/client'
import { format, parseISO } from 'date-fns'

interface Props {
  accountId?: string
  projectId?: string
  start?: string
  end?: string
  category?: string
  search?: string
  limit?: number
  showAccount?: boolean
  accounts?: { id: string; legal_business_name: string }[]
}

function CategoryPill({ cat, onClick }: { cat?: string; onClick?: () => void }) {
  const label = formatCategory(cat)
  const color = getCategoryColor(cat || 'Uncategorized')
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
      style={{ backgroundColor: `${color}18`, color }}
    >
      {label}
      {onClick && <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>}
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

function CategoryCell({
  txnId,
  current,
  categories,
  onSaved,
}: {
  txnId: string
  current?: string
  categories: string[]
  onSaved: (newCat: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCatInput, setNewCatInput] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) selectRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (addingNew) inputRef.current?.focus()
  }, [addingNew])

  const save = async (val: string | null) => {
    setSaving(true)
    try {
      await api.setCategory(txnId, val)
      onSaved(val)
    } finally {
      setSaving(false)
      setEditing(false)
      setAddingNew(false)
      setNewCatInput('')
    }
  }

  const saveNew = async () => {
    const name = newCatInput.trim()
    if (!name) return
    setSaving(true)
    try {
      await api.createCategory(name)
      await api.setCategory(txnId, name)
      onSaved(name)
    } finally {
      setSaving(false)
      setEditing(false)
      setAddingNew(false)
      setNewCatInput('')
    }
  }

  if (saving) {
    return <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
  }

  if (addingNew) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={newCatInput}
          onChange={e => setNewCatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') { setAddingNew(false); setEditing(false) } }}
          placeholder="New category…"
          className="text-xs border border-violet-400 rounded px-2 py-0.5 w-28
            bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200
            focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button onClick={saveNew} className="text-xs text-violet-600 font-medium hover:text-violet-700">Save</button>
        <button onClick={() => { setAddingNew(false); setEditing(false) }} className="text-xs text-zinc-400 hover:text-zinc-600">×</button>
      </div>
    )
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        defaultValue={current || ''}
        onChange={e => {
          const val = e.target.value
          if (val === '__new__') { setAddingNew(true); return }
          save(val || null)
        }}
        onBlur={() => setEditing(false)}
        className="text-xs border border-violet-400 rounded-lg px-2 py-1
          bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
          focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <option value="">Uncategorized</option>
        {categories.map(c => (
          <option key={c} value={c}>{formatCategory(c)}</option>
        ))}
        <option value="__new__">+ New category…</option>
      </select>
    )
  }

  return <CategoryPill cat={current} onClick={() => setEditing(true)} />
}

function ProjectPill({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
        bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400
        ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
    >
      {label}
      {onClick && <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>}
    </span>
  )
}

function ProjectCell({
  txnId, current, projects, onSaved,
}: {
  txnId: string
  current?: string | null
  projects: Project[]
  onSaved: (newProjectId: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (editing) selectRef.current?.focus()
  }, [editing])

  const save = async (val: string | null) => {
    setSaving(true)
    try {
      await api.setTransactionProject(txnId, val)
      onSaved(val)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  if (saving) {
    return <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        defaultValue={current || ''}
        onChange={e => save(e.target.value || null)}
        onBlur={() => setEditing(false)}
        className="text-xs border border-violet-400 rounded-lg px-2 py-1
          bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
          focus:outline-none focus:ring-1 focus:ring-violet-500"
      >
        <option value="">No project</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
        ))}
      </select>
    )
  }

  const project = projects.find(p => p.id === current)
  return <ProjectPill label={project ? project.code : 'No project'} onClick={() => setEditing(true)} />
}

export default function TransactionList({ accountId, projectId, start, end, category, search, limit = 50, showAccount = false, accounts = [] }: Props) {
  const [data, setData] = useState<TList | null>(null)
  const [loading, setLoading] = useState(true)
  const [offset, setOffset] = useState(0)
  const [categories, setCategories] = useState<string[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [localCats, setLocalCats] = useState<Record<string, string | null>>({})
  const [localProjects, setLocalProjects] = useState<Record<string, string | null>>({})

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.legal_business_name]))

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {})
    api.projects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    setOffset(0)
  }, [accountId, projectId, start, end, category, search])

  useEffect(() => {
    setLoading(true)
    api.transactions({ account_id: accountId, project_id: projectId, start, end, category, search, limit, offset })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [accountId, projectId, start, end, category, search, limit, offset])

  const handleCategorySaved = (txnId: string, newCat: string | null) => {
    setLocalCats(prev => ({ ...prev, [txnId]: newCat }))
    // Also refresh categories list in case user added a new one
    api.categories().then(setCategories).catch(() => {})
  }

  const handleProjectSaved = (txnId: string, newProjectId: string | null) => {
    setLocalProjects(prev => ({ ...prev, [txnId]: newProjectId }))
  }

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

  const getCategory = (t: Transaction): string | undefined =>
    localCats.hasOwnProperty(t.id) ? (localCats[t.id] ?? undefined) : (t.mercury_category ?? undefined)

  const getProjectId = (t: Transaction): string | null | undefined =>
    localProjects.hasOwnProperty(t.id) ? localProjects[t.id] : t.project_id

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
              <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Project</th>
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
                  <CategoryCell
                    txnId={t.id}
                    current={getCategory(t)}
                    categories={categories}
                    onSaved={newCat => handleCategorySaved(t.id, newCat)}
                  />
                </td>
                <td className="py-3 px-3">
                  <ProjectCell
                    txnId={t.id}
                    current={getProjectId(t)}
                    projects={projects}
                    onSaved={newProjectId => handleProjectSaved(t.id, newProjectId)}
                  />
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
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm text-zinc-900 dark:text-zinc-50 truncate">
                {t.counterparty_name || t.bank_description || '—'}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{fmtDate(t.created_at)}</span>
                <CategoryCell
                  txnId={t.id}
                  current={getCategory(t)}
                  categories={categories}
                  onSaved={newCat => handleCategorySaved(t.id, newCat)}
                />
                <ProjectCell
                  txnId={t.id}
                  current={getProjectId(t)}
                  projects={projects}
                  onSaved={newProjectId => handleProjectSaved(t.id, newProjectId)}
                />
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
