import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts'
import { api, BurndownPoint, formatUSD } from '../api/client'
import { format, parseISO } from 'date-fns'

interface Props {
  projectId: string
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-zinc-500 dark:text-zinc-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-semibold tabular-nums" style={{ color: p.color }}>
          {p.name}: {formatUSD(p.value)}
        </p>
      ))}
    </div>
  )
}

export default function ProjectBurndownChart({ projectId }: Props) {
  const [data, setData] = useState<BurndownPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.projectBurndown(projectId)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading) return (
    <div className="h-48 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
      No spend data yet
    </div>
  )

  const allValues = data.flatMap(d => [d.spent_actual, d.budget_ideal ?? 0])
  const maxVal = Math.max(...allValues, 1)
  const padding = maxVal * 0.1

  const tickData = data.filter((_, i) => i % Math.ceil(data.length / 6) === 0)

  return (
    <ResponsiveContainer width="100%" height={220}>
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
          domain={[0, maxVal + padding]}
          tickFormatter={v => formatUSD(v, true)}
          tick={{ fontSize: 11, fill: 'currentColor' }}
          className="text-zinc-400 dark:text-zinc-500"
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="budget_ideal"
          name="Budget (ideal pace)"
          stroke="#9CA3AF"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="spent_actual"
          name="Spent (actual)"
          stroke="#7C3AED"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#7C3AED' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
