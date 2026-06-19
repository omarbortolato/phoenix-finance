import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import BalanceChart from '../components/BalanceChart'
import CategoryChart from '../components/CategoryChart'
import TransactionList from '../components/TransactionList'
import { api, Account, AccountAlert, formatUSD } from '../api/client'
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
  const [alert, setAlert] = useState<AccountAlert | null>(null)
  const [alertThreshold, setAlertThreshold] = useState('')
  const [alertEmail, setAlertEmail] = useState('info@phoenixrecapital.us')
  const [alertSaving, setAlertSaving] = useState(false)
  const [alertEditing, setAlertEditing] = useState(false)

  const { start, end } = dateRange(preset)
  const chartDays = preset === 'month' ? 31 : preset === '30d' ? 30 : 90

  useEffect(() => {
    api.accounts().then(all => {
      setAccounts(all)
      setAccount(all.find(a => a.id === id) || null)
    }).catch(console.error)
    if (id) {
      api.getAlert(id).then(a => {
        setAlert(a)
        if (a) {
          setAlertThreshold(String(a.threshold))
          setAlertEmail(a.email)
        }
      }).catch(() => {})
    }
  }, [id])

  const sidebarAccountsMapped = accounts.map(a => ({
    id: a.id, name: a.name, legal_business_name: a.legal_business_name || a.name,
  }))

  return (
    <Layout accounts={sidebarAccountsMapped}>
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

        {/* Balance alert */}
        {account && (
          <AlertPanel
            accountId={account.id}
            alert={alert}
            threshold={alertThreshold}
            email={alertEmail}
            editing={alertEditing}
            saving={alertSaving}
            onEdit={() => {
              setAlertEditing(true)
              if (!alert) setAlertThreshold('')
            }}
            onThresholdChange={setAlertThreshold}
            onEmailChange={setAlertEmail}
            onSave={async () => {
              const val = parseFloat(alertThreshold)
              if (isNaN(val) || val <= 0) return
              setAlertSaving(true)
              try {
                const saved = await api.saveAlert(account.id, val, alertEmail)
                setAlert(saved)
                setAlertEditing(false)
              } finally { setAlertSaving(false) }
            }}
            onDelete={async () => {
              setAlertSaving(true)
              try {
                await api.deleteAlert(account.id)
                setAlert(null)
                setAlertThreshold('')
                setAlertEditing(false)
              } finally { setAlertSaving(false) }
            }}
            onCancel={() => {
              setAlertEditing(false)
              if (alert) { setAlertThreshold(String(alert.threshold)); setAlertEmail(alert.email) }
            }}
          />
        )}

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

function AlertPanel({
  accountId, alert, threshold, email, editing, saving,
  onEdit, onThresholdChange, onEmailChange, onSave, onDelete, onCancel,
}: {
  accountId: string
  alert: AccountAlert | null
  threshold: string
  email: string
  editing: boolean
  saving: boolean
  onEdit: () => void
  onThresholdChange: (v: string) => void
  onEmailChange: (v: string) => void
  onSave: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  if (!editing && !alert) {
    return (
      <button
        onClick={onEdit}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        Imposta soglia di saldo
      </button>
    )
  }

  if (!editing && alert) {
    return (
      <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        <span>Soglia: <strong className="text-zinc-700 dark:text-zinc-300">{formatUSD(alert.threshold)}</strong> → {alert.email}</span>
        <button onClick={onEdit} className="text-zinc-400 hover:text-violet-600 transition-colors">Modifica</button>
        <button onClick={onDelete} disabled={saving} className="text-zinc-400 hover:text-red-500 transition-colors">Rimuovi</button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Soglia:</span>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">$</span>
        <input
          type="number"
          min="1"
          step="100"
          value={threshold}
          onChange={e => onThresholdChange(e.target.value)}
          placeholder="5000"
          className="pl-5 pr-2 py-1.5 w-28 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg
            bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200
            focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
      <span className="text-xs text-zinc-400">→</span>
      <input
        type="email"
        value={email}
        onChange={e => onEmailChange(e.target.value)}
        placeholder="info@phoenixrecapital.us"
        className="px-2.5 py-1.5 w-52 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg
          bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200
          focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <button
        onClick={onSave}
        disabled={saving || !threshold || parseFloat(threshold) <= 0}
        className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-medium transition-colors"
      >
        {saving ? '…' : 'Salva'}
      </button>
      <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
        Annulla
      </button>
    </div>
  )
}
