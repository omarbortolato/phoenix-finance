import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { api, Account, PhaseTemplate } from '../api/client'

const COLORS = ['#7C3AED', '#06B6D4', '#F59E0B', '#10B981', '#F97316', '#EC4899', '#14B8A6', '#6B7280']

export default function ProjectSettings() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [templates, setTemplates] = useState<PhaseTemplate[]>([])
  const [newName, setNewName] = useState('')
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
    await api.createPhaseTemplate(name, color)
    setNewName('')
    load()
  }

  const renameTemplate = async (t: PhaseTemplate, name: string) => {
    await api.updatePhaseTemplate(t.id, name, t.color || undefined)
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, name } : x))
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

        <button onClick={() => navigate('/projects')}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
          </svg>
          All projects
        </button>

        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight">Phase Templates</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Default phases used to seed every new project's Gantt timeline. Edit freely — changes only affect new projects (or ones you re-sync).
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
              No phase templates yet — add "Phase 1", "Phase 2"… below.
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
            <button onClick={addTemplate} disabled={!newName.trim()}
              className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium transition-colors">
              Add phase
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
