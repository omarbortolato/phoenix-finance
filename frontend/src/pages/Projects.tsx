import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { api, Account, Project, ProjectCreateInput, ProjectStatus, ProjectType, formatUSD } from '../api/client'
import { format, parseISO } from 'date-fns'

const TYPE_LABEL: Record<ProjectType, string> = {
  entitlement: 'Entitlement',
  minor_subdivision: 'Minor Subdivision',
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const DOT_COLOR: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
  gray: 'bg-zinc-300 dark:bg-zinc-600',
}

export default function Projects() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showNew, setShowNew] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([api.accounts(), api.projects()])
      .then(([acc, proj]) => { setAccounts(acc); setProjects(proj) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const sidebarAccounts = accounts.map(a => ({
    id: a.id, name: a.name, legal_business_name: a.legal_business_name || a.name,
  }))

  const filtered = statusFilter === 'all' ? projects : projects.filter(p => p.status === statusFilter)

  return (
    <Layout accounts={sidebarAccounts}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">Projects</h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Land entitlement and minor subdivision deals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/projects/settings')}
              className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Configure phases
            </button>
            <button
              onClick={() => setShowNew(true)}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
            >
              + New Project
            </button>
          </div>
        </div>

        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5 w-fit">
          {['all', 'active', 'on_hold', 'completed', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${statusFilter === s
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
              {s === 'all' ? 'All' : STATUS_LABEL[s as ProjectStatus]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-zinc-400 dark:text-zinc-500">
            No projects yet — create your first deal.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => (
              <button key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="text-left bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800
                  p-5 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{p.code}</p>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 truncate mt-0.5">{p.name}</p>
                  </div>
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${DOT_COLOR[p.status_color]}`} title={p.status_color} />
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300">
                    {TYPE_LABEL[p.project_type]}
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    <span>{formatUSD(p.spent_so_far, true)} spent</span>
                    <span>{formatUSD(p.budget_total, true)} budget</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${DOT_COLOR[p.status_color]}`}
                      style={{ width: `${Math.min(p.pct_budget_used ?? 0, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-3 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>ROI {p.roi_estimate_pct != null ? `${p.roi_estimate_pct.toFixed(0)}%` : '—'}</span>
                  <span>
                    {p.end_date_estimated ? `Due ${format(parseISO(p.end_date_estimated), 'MMM yyyy')}` : 'No due date'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <NewProjectModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); load() }}
        />
      )}
    </Layout>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<ProjectCreateInput>({
    code: '', name: '', project_type: 'entitlement', status: 'active',
    budget_total: 0, revenue_estimate: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.createProject(form)
      onCreated()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg.includes('409') ? 'A project with this code already exists.' : 'Failed to create project.')
    } finally {
      setSaving(false)
    }
  }

  const field = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500'
  const label = 'block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1'

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">New Project</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Code</label>
            <input className={field} placeholder="PHX-001" value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <label className={label}>Type</label>
            <select className={field} value={form.project_type}
              onChange={e => setForm({ ...form, project_type: e.target.value as ProjectType })}>
              <option value="entitlement">Entitlement</option>
              <option value="minor_subdivision">Minor Subdivision</option>
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Name</label>
          <input className={field} placeholder="Deal name" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Start date</label>
            <input type="date" className={field} value={form.start_date || ''}
              onChange={e => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div>
            <label className={label}>Est. end date</label>
            <input type="date" className={field} value={form.end_date_estimated || ''}
              onChange={e => setForm({ ...form, end_date_estimated: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Budget total ($)</label>
            <input type="number" className={field} value={form.budget_total}
              onChange={e => setForm({ ...form, budget_total: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className={label}>Revenue estimate ($)</label>
            <input type="number" className={field} value={form.revenue_estimate}
              onChange={e => setForm({ ...form, revenue_estimate: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>

        <div>
          <label className={label}>Location</label>
          <input className={field} placeholder="County, State" value={form.location || ''}
            onChange={e => setForm({ ...form, location: e.target.value })} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !form.code.trim() || !form.name.trim()}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-medium transition-colors">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
