import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import BalanceChart from '../components/BalanceChart'
import CategoryChart from '../components/CategoryChart'
import TransactionList from '../components/TransactionList'
import { api, Account, formatUSD } from '../api/client'
import { startOfMonth, subDays, format } from 'date-fns'

type Preset = 'month' | '30d' | '90d' | 'all'

function dateRange(preset: Preset): { start?: string; end?: string } {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (preset === 'month') return { start: fmt(startOfMonth(today)) }
  if (preset === '30d') return { start: fmt(subDays(today, 30)) }
  if (preset === '90d') return { start: fmt(subDays(today, 90)) }
  return {}
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
]

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [account, setAccount] = useState<Account | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [preset, setPreset] = useState<Preset>('30d')
  const [search, setSearch] = useState('')

  const { start, end } = dateRange(preset)
  const chartDays = preset === 'month' ? 31 : preset === '30d' ? 30 : 90

  useEffect(() => {
    api.accounts().then(all => {
      setAccounts(all)
      setAccount(all.find(a => a.id === id) || null)
    }).catch(console.error)
  }, [id])

  const sidebarAccounts = accounts.map(a => ({
    id: a.id, name: a.name, legal_business_name: a.legal_business_name || a.name,
  }))

  return (
    <Layout accounts={sidebarAccounts}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Back + header */}
        <div>
          <button onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 mb-4 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
            </svg>
            All accounts
          </button>
          {account ? (
            <div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                {account.legal_business_name} · ••{account.account_number?.slice(-4)}
              </p>
              <p className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums mt-0.5">
                {formatUSD(account.available_balance)}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
                Available · {account.status}
              </p>
            </div>
          ) : (
            <div className="h-12 w-48 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          )}
        </div>

        {/* Filters */}
        <div className="flex bg-zinc-100 dark:bg-zinc-800 rounded-lg p-0.5 gap-0.5 w-fit">
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                ${preset === p.key
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Balance trend</h2>
            <BalanceChart accountId={id} days={chartDays} />
          </div>
          <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">Expenses</h2>
            <CategoryChart accountId={id} start={start} end={end} />
          </div>
        </div>

        {/* Transactions */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 flex-1">Transactions</h2>
            <input
              type="search"
              placeholder="Search counterparty…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-56 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700
                bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-50
                placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
          <TransactionList accountId={id} start={start} end={end} search={search} limit={50} />
        </div>
      </div>
    </Layout>
  )
}
