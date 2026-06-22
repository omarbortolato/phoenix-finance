import { useEffect, useState } from 'react'
import Layout from '../components/Layout'
import { api, Account, PhaseTemplate } from '../api/client'

const COLORS = ['#7C3AED', '#06B6D4', '#F59E0B', '#10B981', '#F97316', '#EC4899', '#14B8A6', '#6B7280']

export default function Configuration() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [newName, setNewName] = useState('')
  const [newDuration, setNewDuration] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.phaseTemplates().then(setTemplates).finally(() => setLoading(false))
  }

  useEffect(() => {
    api.accounts().then(setAccounts).catch(console.error)
    load()
  }, [])

  const sidebarAccounts = accounts.map(a => ({
    id: a.id, name: a.name, legal_business_name: a.legal_business_name || a.name,
  }))

  const addTemplate = async () => {
    const name = newName.trim()
    if (!name) return
    const color = COLORS[templates.length % COLORS.length]
    await api.createPhaseTemplate(name, color, parseInt(newDuration) || 30)
    setNewName('')
    setNewDuration('')
    load()
  }

  const renameTemplate = async (t: PhaseTemplate, name: string) => {
    await api.updatePhaseTemplate(t.id, name, t.color || undefined, t.duration_days)
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, name } : x))
  }

  const redurateTemplate = async (t: PhaseTemplate, durationDays: number) => {
    await api.updatePhaseTemplate(t.id, t.name, t.color || undefined, durationDays)
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, duration_days: durationDays } : x))
  }

  const move = async (idx: number, dir: 'up' | 'down') => {
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= templates.length) return
    const next = [...templates]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setTemplates(next)
    await api.reorderPhaseTemplates(next.map((t, i) => ({ id: t.id, sort_order: i })))
  }

  const remove = async (id: number) => {
    await api.deletePhaseTemplate(id)
    load()
  }

  return (
    <Layout accounts={sidebarAccounts}>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">Configuration</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Global settings shared across all projects.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">Phase Templates</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
            Default phases and their typical duration (days), used to pre-fill every new project's estimated
            timeline — so you only need to correct dates, not build them from scratch. Budget stays per-project,
            set it on each phase once the deal is created. Editing a template only affects projects you sync afterward.
          </p>

          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
                No phase templates yet — add "Due Diligence", "Entitlement Process"… below.
              </div>
            ) : (
              <div className="divide-y divide-zinc-50 dark:divide-zinc-800/60">
                {templates.map((t, idx) => (
                  <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#7C3AED' }} />
                    <input
                      defaultValue={t.name}
                      onBlur={e => e.target.value.trim() && e.target.value !== t.name && renameTemplate(t, e.target.value.trim())}
                      className="flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-violet-500 rounded px-1 text-zinc-800 dark:text-zinc-200"
                    />
                    <div className="relative flex-shrink-0">
                      <input
                        type="number"
                        min="0"
                        defaultValue={t.duration_days || ''}
                        placeholder="30"
                        onBlur={e => redurateTemplate(t, parseInt(e.target.value) || 0)}
                        title="Estimated duration in days"
                        className="w-20 pr-9 pl-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg
                          bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
                          focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400">days</span>
                    </div>
                    <button onClick={() => move(idx, 'up')} disabled={idx === 0}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7"/>
                      </svg>
                    </button>
                    <button onClick={() => move(idx, 'down')} disabled={idx === templates.length - 1}
                      className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    <button onClick={() => remove(t.id)} className="p-1 text-zinc-400 hover:text-red-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTemplate() }}
                placeholder="e.g. Due Diligence"
                className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5
                  bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200
                  focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <input
                type="number"
                min="0"
                value={newDuration}
                onChange={e => setNewDuration(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addTemplate() }}
                placeholder="Days"
                className="w-24 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5
                  bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200
                  focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button onClick={addTemplate} disabled={!newName.trim()}
                className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium transition-colors">
                Add phase
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
