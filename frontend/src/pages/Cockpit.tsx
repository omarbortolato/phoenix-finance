import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import BalanceChart from '../components/BalanceChart'
import CategoryChart from '../components/CategoryChart'
import TransactionList from '../components/TransactionList'
import { api, Account, AccountTotals, formatUSD } from '../api/client'
import { startOfMonth, startOfYear, subDays, format } from 'date-fns'

type Preset = 'month' | '30d' | '90d' | 'year' | 'all'

function dateRange(preset: Preset): { start?: string; end?: string } {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (preset === 'month') return { start: fmt(startOfMonth(today)) }
  if (preset === '30d') return { start: fmt(subDays(today, 30)) }
  if (preset === '90d') return { start: fmt(subDays(today, 90)) }
  if (preset === 'year') return { start: fmt(startOfYear(today)) }
  return {}
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
]

export default function Cockpit() {
  const navigate = useNavigate()
  const [totals, setTotals] = useState<AccountTotals | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | undefined>()
  const [preset, setPreset] = useState<Preset>('90d')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const { start, end } = dateRange(preset)
  const chartDays = preset === 'month' ? 31 : preset === '30d' ? 30 : preset === 'year' ? 365 : 90

  useEffect(() => {
    api.totals().then(setTotals).catch(console.error)
    api.accounts().then(setAccounts).catch(console.error)
  }, [])

  const doSync = async (full = false) => {
    setSyncing(true)
    setSyncMsg('')
    try {
      const r = await api.sync(full)
      setSyncMsg(`Sync complete: ${r.total_transactions_new} new transactions`)
      api.totals().then(setTotals)
      api.accounts().then(setAccounts)
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  const sidebarAccounts = accounts.map(a => ({
    id: a.id,
    name: a.name,
    legal_business_name: a.legal_business_name || a.name,
  }))

  return (
    <Layout accounts={sidebarAccounts} onSync={doSync} syncing={syncing}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Total available</p>
            <p className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums mt-0.5">
              {totals ? formatUSD(totals.total_available) : '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {syncMsg && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{syncMsg}</span>
            )}
            <button onClick={() => doSync(false)} disabled={syncing}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700
                text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800
                disabled:opacity-50 transition-colors">
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <button onClick={() => doSync(true)} disabled={syncing}
              title="Re-fetch each account's entire transaction history from Mercury"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700
                text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800
                disabled:opacity-50 transition-colors">
              Full resync
            </button>
          </div>
        </div>

        {/* Account cards */}
        <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 lg:grid-cols-5">
          {accounts.map(a => (
            <button key={a.id}
              onClick={() => navigate(`/accounts/${a.id}`)}
              className={`flex-shrink-0 w-44 sm:w-auto bg-white dark:bg-zinc-900 rounded-xl border p-4 text-left
                transition-all hover:shadow-md cursor-pointer
                ${selectedAccount === a.id
                  ? 'border-violet-400 dark:border-violet-600 ring-1 ring-violet-400 dark:ring-violet-600'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate font-medium">
                {a.legal_business_name || a.name}
              </p>
              <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums mt-1">
                {formatUSD(a.available_balance, true)}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                ••{a.account_number?.slice(-4) || '????'}
              </p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5">
            {PRESETS.map(p => (
              <button key={p.key}
                onClick={() => setPreset(p.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${preset === p.key
                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Balance trend</h2>
            <BalanceChart accountId={selectedAccount} days={chartDays} />
          </div>
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Expenses by category</h2>
            <CategoryChart accountId={selectedAccount} start={start} end={end} />
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Recent transactions</h2>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {PRESETS.find(p => p.key === preset)?.label}
            </span>
          </div>
          <TransactionList
            accountId={selectedAccount}
            start={start}
            end={end}
            limit={20}
            showAccount
            accounts={sidebarAccounts}
          />
        </div>

      </div>
    </Layout>
  )
}
