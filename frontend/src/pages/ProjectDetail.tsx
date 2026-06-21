import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer } from 'recharts'
import Layout from '../components/Layout'
import ProjectGantt from '../components/ProjectGantt'
import ProjectBurndownChart from '../components/ProjectBurndownChart'
import TransactionList from '../components/TransactionList'
import {
  api, Account, Project, ProjectPhase, ProjectAlert, ManualExpense, CategoryBreakdown,
  ProjectStatus, ProjectType, getCategoryColor, formatCategory, formatUSD,
} from '../api/client'
import { format, parseISO } from 'date-fns'

const TYPE_LABEL: Record<ProjectType, string> = {
  entitlement: 'Entitlement',
  minor_subdivision: 'Minor Subdivision',
}
const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: 'Active', on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled',
}
const DOT_COLOR: Record<string, string> = {
  green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500', gray: 'bg-zinc-300 dark:bg-zinc-600',
}

type Tab = 'gantt' | 'burndown' | 'transactions'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [phases, setPhases] = useState<ProjectPhase[]>([])
  const [tab, setTab] = useState<Tab>('gantt')
  const [editing, setEditing] = useState(false)

  const load = () => {
    if (!id) return
    api.project(id).then(setProject).catch(console.error)
    api.projectPhases(id).then(setPhases).catch(console.error)
  }

  useEffect(() => {
    api.accounts().then(setAccounts).catch(console.error)
    load()
  }, [id])

  const sidebarAccounts = accounts.map(a => ({
    id: a.id, name: a.name, legal_business_name: a.legal_business_name || a.name,
  }))

  if (!project || !id) {
    return (
      <Layout accounts={sidebarAccounts}>
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="h-12 w-48 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout accounts={sidebarAccounts}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <button onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          All projects
        </button>

        <ProjectHeader project={project} editing={editing} setEditing={setEditing}
          onSaved={p => setProject(p)} />

        <KpiGrid project={project} />

        <ProjectAlertPanel projectId={id} />

        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5 w-fit">
          {(['gantt', 'burndown', 'transactions'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize
                ${tab === t
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'gantt' && <GanttTab projectId={id} phases={phases} onChange={load} />}
        {tab === 'burndown' && <BurndownTab projectId={id} />}
        {tab === 'transactions' && <TransactionsTab projectId={id} accounts={sidebarAccounts} phases={phases} />}
      </div>
    </Layout>
  )
}

// ─── Header ─────────────────────────────────────────────────────────────────

function ProjectHeader({
  project, editing, setEditing, onSaved,
}: { project: Project; editing: boolean; setEditing: (v: boolean) => void; onSaved: (p: Project) => void }) {
  const [form, setForm] = useState({
    name: project.name,
    status: project.status,
    location: project.location || '',
    acreage: project.acreage ?? '',
    start_date: project.start_date?.slice(0, 10) || '',
    end_date_estimated: project.end_date_estimated?.slice(0, 10) || '',
    budget_total: project.budget_total,
    revenue_estimate: project.revenue_estimate,
  })
  const [saving, setSaving] = useState(false)

  const field = 'w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-violet-500'
  const label = 'block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1'

  const save = async () => {
    setSaving(true)
    try {
      const updated = await api.updateProject(project.id, {
        name: form.name,
        status: form.status as ProjectStatus,
        location: form.location,
        acreage: form.acreage === '' ? undefined : Number(form.acreage),
        start_date: form.start_date || undefined,
        end_date_estimated: form.end_date_estimated || undefined,
        budget_total: form.budget_total,
        revenue_estimate: form.revenue_estimate,
      })
      onSaved(updated)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${DOT_COLOR[project.status_color]}`} />
            <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{project.code}</p>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight mt-0.5">
            {project.name}
          </h1>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300">
              {TYPE_LABEL[project.project_type]}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
              {STATUS_LABEL[project.status]}
            </span>
            {project.location && (
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{project.location}</span>
            )}
          </div>
        </div>
        <button onClick={() => setEditing(true)}
          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
          Edit
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Name</label>
          <input className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Status</label>
          <select className={field} value={form.status} onChange={e => setForm({ ...form, status: e.target.value as ProjectStatus })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Start date</label>
          <input type="date" className={field} value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div>
          <label className={label}>Est. end date</label>
          <input type="date" className={field} value={form.end_date_estimated} onChange={e => setForm({ ...form, end_date_estimated: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Budget total ($)</label>
          <input type="number" className={field} value={form.budget_total} onChange={e => setForm({ ...form, budget_total: parseFloat(e.target.value) || 0 })} />
        </div>
        <div>
          <label className={label}>Revenue estimate ($)</label>
          <input type="number" className={field} value={form.revenue_estimate} onChange={e => setForm({ ...form, revenue_estimate: parseFloat(e.target.value) || 0 })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Location</label>
          <input className={field} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
        </div>
        <div>
          <label className={label}>Acreage</label>
          <input type="number" className={field} value={form.acreage} onChange={e => setForm({ ...form, acreage: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          Cancel
        </button>
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ─── KPI grid ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">{label}</p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function KpiGrid({ project: p }: { project: Project }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <KpiCard label="Budget total" value={formatUSD(p.budget_total)} />
      <KpiCard label="Spent so far" value={formatUSD(p.spent_so_far)}
        sub={p.pct_budget_used != null ? `${p.pct_budget_used.toFixed(0)}% of budget` : undefined} />
      <KpiCard label="Remaining" value={formatUSD(p.budget_remaining)} />
      <KpiCard label="Revenue estimate" value={formatUSD(p.revenue_estimate)} />
      <KpiCard label="Margin estimate" value={formatUSD(p.margin_estimate)} />
      <KpiCard label="ROI estimate" value={p.roi_estimate_pct != null ? `${p.roi_estimate_pct.toFixed(1)}%` : '—'} />
      <KpiCard label="Est. IRR" value={p.estimated_irr_pct != null ? `${p.estimated_irr_pct.toFixed(1)}%` : '—'}
        sub="Projected, pre-exit" />
      <KpiCard label="Revenue collected" value={formatUSD(p.revenue_actual)}
        sub={`${formatUSD(p.revenue_remaining)} remaining`} />
    </div>
  )
}

// ─── Budget alert ───────────────────────────────────────────────────────────

function ProjectAlertPanel({ projectId }: { projectId: string }) {
  const [alert, setAlert] = useState<ProjectAlert | null>(null)
  const [editing, setEditing] = useState(false)
  const [threshold, setThreshold] = useState('')
  const [email, setEmail] = useState('info@phoenixrecapital.us')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getProjectAlert(projectId).then(a => {
      setAlert(a)
      if (a) { setThreshold(String(a.threshold_pct)); setEmail(a.email) }
    }).catch(() => {})
  }, [projectId])

  if (!editing && !alert) {
    return (
      <button onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        Set budget alert
      </button>
    )
  }

  if (!editing && alert) {
    return (
      <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        <span>Alert at <strong className="text-zinc-700 dark:text-zinc-300">{alert.threshold_pct}%</strong> of budget → {alert.email}</span>
        <button onClick={() => setEditing(true)} className="text-zinc-400 hover:text-violet-600 transition-colors">Edit</button>
        <button onClick={async () => { await api.deleteProjectAlert(projectId); setAlert(null) }}
          className="text-zinc-400 hover:text-red-500 transition-colors">Remove</button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Alert at</span>
      <div className="relative">
        <input type="number" min="1" max="100" value={threshold} onChange={e => setThreshold(e.target.value)}
          placeholder="90"
          className="pr-6 pl-2 py-1.5 w-20 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">%</span>
      </div>
      <span className="text-xs text-zinc-400">→</span>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
        className="px-2.5 py-1.5 w-52 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500" />
      <button
        onClick={async () => {
          const val = parseFloat(threshold)
          if (isNaN(val) || val <= 0) return
          setSaving(true)
          try {
            const saved = await api.saveProjectAlert(projectId, val, email)
            setAlert(saved)
            setEditing(false)
          } finally { setSaving(false) }
        }}
        disabled={saving || !threshold}
        className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium transition-colors">
        {saving ? '…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        Cancel
      </button>
    </div>
  )
}

// ─── Gantt tab ──────────────────────────────────────────────────────────────

function GanttTab({ projectId, phases, onChange }: { projectId: string; phases: ProjectPhase[]; onChange: () => void }) {
  const navigate = useNavigate()
  const [syncing, setSyncing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', budget: '', planned_start: '', planned_end: '' })

  const syncTemplates = async () => {
    setSyncing(true)
    try {
      const res = await api.syncPhasesFromTemplates(projectId)
      if (res.created === 0) {
        setAdding(true) // no templates configured (or all already added) — nudge straight into manual add
      }
      onChange()
    } finally { setSyncing(false) }
  }

  const addPhase = async () => {
    if (!form.name.trim()) return
    await api.createPhase(projectId, {
      name: form.name.trim(),
      budget: parseFloat(form.budget) || 0,
      planned_start: form.planned_start || undefined,
      planned_end: form.planned_end || undefined,
    })
    setForm({ name: '', budget: '', planned_start: '', planned_end: '' })
    setAdding(false)
    onChange()
  }

  const updatePhase = async (phase: ProjectPhase, patch: Partial<ProjectPhase>) => {
    await api.updatePhase(projectId, phase.id, patch)
    onChange()
  }

  const field = 'text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Timeline</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/projects/settings')}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-medium">
              Configure phase templates
            </button>
            <button onClick={syncTemplates} disabled={syncing}
              className="text-xs text-violet-600 hover:text-violet-700 disabled:opacity-40 font-medium">
              {syncing ? 'Syncing…' : 'Sync phases from templates'}
            </button>
            <button onClick={() => setAdding(v => !v)}
              className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              {adding ? 'Cancel' : '+ Add phase'}
            </button>
          </div>
        </div>

        {adding && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-800/60">
            <input className={field} placeholder="Phase name" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <input type="number" className={`${field} w-28`} placeholder="Budget $" value={form.budget}
              onChange={e => setForm({ ...form, budget: e.target.value })} />
            <input type="date" className={field} title="Planned start" value={form.planned_start}
              onChange={e => setForm({ ...form, planned_start: e.target.value })} />
            <input type="date" className={field} title="Planned end" value={form.planned_end}
              onChange={e => setForm({ ...form, planned_end: e.target.value })} />
            <button onClick={addPhase} disabled={!form.name.trim()}
              className="px-3 py-1 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium transition-colors">
              Add
            </button>
          </div>
        )}

        <ProjectGantt phases={phases} />
      </div>

      {phases.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Phase details</h2>
          </div>
          <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
            {phases.map(phase => (
              <div key={phase.id} className="px-5 py-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 w-32 flex-shrink-0 truncate">{phase.name}</span>
                <select value={phase.status} onChange={e => updatePhase(phase, { status: e.target.value as ProjectPhase['status'] })}
                  className={field}>
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
                <input type="date" value={phase.planned_start?.slice(0, 10) || ''}
                  onChange={e => updatePhase(phase, { planned_start: e.target.value || undefined })}
                  title="Planned start" className={field} />
                <input type="date" value={phase.planned_end?.slice(0, 10) || ''}
                  onChange={e => updatePhase(phase, { planned_end: e.target.value || undefined })}
                  title="Planned end" className={field} />
                <input type="number" min="0" max="100" value={phase.pct_complete}
                  onChange={e => updatePhase(phase, { pct_complete: parseInt(e.target.value) || 0 })}
                  title="% complete" className={`${field} w-16`} />
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
                  <input type="number" value={phase.budget}
                    onChange={e => updatePhase(phase, { budget: parseFloat(e.target.value) || 0 })}
                    title="Phase budget" className={`${field} w-24 pl-4`} />
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  {formatUSD(phase.spent_so_far, true)} spent
                </span>
                <button onClick={async () => { await api.deletePhase(projectId, phase.id); onChange() }}
                  className="text-xs text-zinc-400 hover:text-red-500 ml-auto">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Burndown tab ───────────────────────────────────────────────────────────

function BurndownTab({ projectId }: { projectId: string }) {
  const [breakdown, setBreakdown] = useState<CategoryBreakdown[]>([])

  useEffect(() => {
    api.projectCategoryBreakdown(projectId).then(setBreakdown).catch(() => setBreakdown([]))
  }, [projectId])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Budget burndown</h2>
        <ProjectBurndownChart projectId={projectId} />
      </div>
      <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Cost breakdown</h2>
        {breakdown.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
            No cost data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={breakdown} dataKey="total" nameKey="category" cx="50%" cy="45%" innerRadius="45%" outerRadius="65%" paddingAngle={2}>
                {breakdown.map(entry => <Cell key={entry.category} fill={getCategoryColor(entry.category)} />)}
              </Pie>
              <RTooltip formatter={(v: number) => formatUSD(v)} />
              <Legend formatter={(v: string) => formatCategory(v)} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

// ─── Transactions tab ───────────────────────────────────────────────────────

function TransactionsTab({
  projectId, accounts, phases,
}: { projectId: string; accounts: { id: string; legal_business_name: string }[]; phases: ProjectPhase[] }) {
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Mercury transactions</h2>
        </div>
        <TransactionList projectId={projectId} phases={phases} limit={100} showAccount accounts={accounts} />
      </div>

      <ManualExpensesSection projectId={projectId} phases={phases} />
    </div>
  )
}

function ManualExpensesSection({ projectId, phases }: { projectId: string; phases: ProjectPhase[] }) {
  const [expenses, setExpenses] = useState<ManualExpense[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: '', category: '', phase_id: '' })

  const load = () => { api.manualExpenses(projectId).then(setExpenses).catch(() => {}) }
  useEffect(load, [projectId])

  const submit = async () => {
    const amount = parseFloat(form.amount)
    if (!form.description.trim() || isNaN(amount)) return
    await api.createManualExpense(projectId, {
      date: form.date, description: form.description, amount,
      category: form.category || undefined,
      phase_id: form.phase_id ? parseInt(form.phase_id) : undefined,
    })
    setForm({ date: format(new Date(), 'yyyy-MM-dd'), description: '', amount: '', category: '', phase_id: '' })
    setAdding(false)
    load()
  }

  const phaseName = (id?: number | null) => phases.find(p => p.id === id)?.name

  const field = 'px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Manual expenses</h2>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Costs incurred before this Mercury account existed, or paid through other means
          </p>
        </div>
        <button onClick={() => setAdding(v => !v)} className="text-xs text-violet-600 hover:text-violet-700 font-medium">
          {adding ? 'Cancel' : '+ Add expense'}
        </button>
      </div>

      {adding && (
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2">
          <input type="date" className={field} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <input className={field} placeholder="Description" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
          <input type="number" className={`${field} w-28`} placeholder="Amount (-/+)" value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })} />
          <input className={`${field} w-32`} placeholder="Category" value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })} />
          {phases.length > 0 && (
            <select className={field} value={form.phase_id} onChange={e => setForm({ ...form, phase_id: e.target.value })}>
              <option value="">No phase</option>
              {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button onClick={submit}
            className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors">
            Save
          </button>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="text-center py-8 text-sm text-zinc-400 dark:text-zinc-500">No manual expenses recorded</div>
      ) : (
        <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
          {expenses.map(e => (
            <div key={e.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
              <span className="text-xs text-zinc-400 dark:text-zinc-500 w-24 flex-shrink-0">
                {format(parseISO(e.date), 'MMM d, yyyy')}
              </span>
              <span className="flex-1 text-zinc-700 dark:text-zinc-300 truncate">{e.description}</span>
              {e.category && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                  {e.category}
                </span>
              )}
              {phaseName(e.phase_id) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300">
                  {phaseName(e.phase_id)}
                </span>
              )}
              <span className={`tabular-nums font-medium ${e.amount > 0 ? 'text-emerald-600' : 'text-zinc-900 dark:text-zinc-50'}`}>
                {e.amount > 0 ? '+' : ''}{formatUSD(e.amount)}
              </span>
              <button onClick={async () => { await api.deleteManualExpense(e.id); load() }}
                className="text-xs text-zinc-400 hover:text-red-500">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
