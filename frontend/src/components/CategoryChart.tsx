import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { api, CategoryBreakdown, getCategoryColor, formatCategory, formatUSD } from '../api/client'

interface Props {
  accountId?: string
  start?: string
  end?: string
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as CategoryBreakdown
  return (
    <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-zinc-900 dark:text-zinc-50">{formatCategory(d.category)}</p>
      <p className="text-zinc-500 dark:text-zinc-400">{formatUSD(d.total)} · {d.count} txn</p>
    </div>
  )
}

const CustomLegend = ({ payload }: any) => (
  <ul className="flex flex-wrap gap-x-3 gap-y-1.5 justify-center mt-2">
    {payload?.map((entry: any) => (
      <li key={entry.value} className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
        {formatCategory(entry.value)}
      </li>
    ))}
  </ul>
)

export default function CategoryChart({ accountId, start, end }: Props) {
  const [data, setData] = useState<CategoryBreakdown[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.categoryBreakdown({ account_id: accountId, start, end })
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [accountId, start, end])

  if (loading) return (
    <div className="h-48 flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!data.length) return (
    <div className="h-48 flex items-center justify-center text-sm text-zinc-400 dark:text-zinc-500">
      No expense data for this period
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          cx="50%"
          cy="45%"
          innerRadius="45%"
          outerRadius="65%"
          paddingAngle={2}
        >
          {data.map(entry => (
            <Cell key={entry.category} fill={getCategoryColor(entry.category)} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend content={<CustomLegend />} />
      </PieChart>
    </ResponsiveContainer>
  )
}
