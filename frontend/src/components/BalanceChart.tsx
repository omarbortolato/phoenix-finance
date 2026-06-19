import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api, BalancePoint, formatUSD } from '../api/client'
import { format, parseISO } from 'date-fns'

interface Props {
  accountId?: string
  days?: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-zinc-500 dark:text-zinc-400 mb-0.5">{label}</p>
      <p className="font-semibold text-zinc-900 dark:text-zinc-50 tabular-nums">
        {formatUSD(payload[0].value)}
      </p>
    </div>
  )
}

export default function BalanceChart({ accountId, days = 90 }: Props) {
  const [data, setData] = useState<BalancePoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.balanceHistory(accountId, days)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [accountId, days])

  if (loading) return (
    <div className="h-48 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const minVal = Math.min(...data.map(d => d.balance))
  const maxVal = Math.max(...data.map(d => d.balance))
  const padding = (maxVal - minVal) * 0.1 || 1000

  // Show fewer ticks on mobile by sampling every N-th date
  const tickData = data.filter((_, i) => i % Math.ceil(data.length / 6) === 0)

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-100 dark:text-zinc-800" />
        <XAxis
          dataKey="date"
          ticks={tickData.map(d => d.date)}
          tickFormatter={d => { try { return format(parseISO(d), 'MMM d') } catch { return d } }}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="text-zinc-400 dark:text-zinc-500"
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[minVal - padding, maxVal + padding]}
          tickFormatter={v => formatUSD(v, true)}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="text-zinc-400 dark:text-zinc-500"
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="#7C3AED"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#7C3AED' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
