import { ProjectPhase } from '../api/client'
import { differenceInDays, parseISO, format } from 'date-fns'

interface Props {
  phases: ProjectPhase[]
}

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

const STATUS_BADGE: Record<string, string> = {
  not_started: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  in_progress: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  blocked: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export default function ProjectGantt({ phases }: Props) {
  if (!phases.length) {
    return (
      <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
        No phases yet — use "Sync phases from templates" to populate the default phase list.
      </div>
    )
  }

  const dates = phases
    .flatMap(p => [p.planned_start, p.planned_end, p.actual_start, p.actual_end])
    .filter(Boolean) as string[]

  if (!dates.length) {
    return (
      <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
        Set planned dates on each phase to see the Gantt timeline.
      </div>
    )
  }

  const parsed = dates.map(d => parseISO(d))
  const minDate = new Date(Math.min(...parsed.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...parsed.map(d => d.getTime())))
  const totalDays = Math.max(differenceInDays(maxDate, minDate), 1)

  const pct = (d: string | null | undefined) => {
    if (!d) return null
    const days = differenceInDays(parseISO(d), minDate)
    return Math.max(0, Math.min(100, (days / totalDays) * 100))
  }

  const today = new Date()
  const todayPct = today >= minDate && today <= maxDate
    ? (differenceInDays(today, minDate) / totalDays) * 100
    : null

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 px-1">
        <span>{format(minDate, 'MMM d, yyyy')}</span>
        <span>{format(maxDate, 'MMM d, yyyy')}</span>
      </div>
      <div className="relative space-y-2.5">
        {todayPct !== null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none"
            style={{ left: `${todayPct}%` }}
            title="Today"
          />
        )}
        {phases.map(phase => {
          const plannedStartPct = pct(phase.planned_start)
          const plannedEndPct = pct(phase.planned_end)
          const actualStartPct = pct(phase.actual_start)
          const actualEndPct = pct(phase.actual_end)
          const color = phase.color || '#7C3AED'

          return (
            <div key={phase.id} className="flex items-center gap-3">
              <div className="w-40 flex-shrink-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{phase.name}</p>
                <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[phase.status] || STATUS_BADGE.not_started}`}>
                  {STATUS_LABEL[phase.status] || phase.status}
                </span>
              </div>
              <div className="flex-1 relative h-6 bg-zinc-50 dark:bg-zinc-800/60 rounded">
                {plannedStartPct !== null && plannedEndPct !== null && (
                  <div
                    className="absolute top-1 bottom-1 rounded"
                    style={{
                      left: `${plannedStartPct}%`,
                      width: `${Math.max(plannedEndPct - plannedStartPct, 1)}%`,
                      backgroundColor: `${color}30`,
                    }}
                  />
                )}
                {actualStartPct !== null && (
                  <div
                    className="absolute top-1.5 bottom-1.5 rounded"
                    style={{
                      left: `${actualStartPct}%`,
                      width: `${Math.max((actualEndPct ?? actualStartPct) - actualStartPct, 1.5)}%`,
                      backgroundColor: color,
                    }}
                  />
                )}
              </div>
              <span className="w-10 flex-shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                {phase.pct_complete}%
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 text-xs text-zinc-400 dark:text-zinc-500 px-1 pt-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-violet-600/30" /> Planned</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-violet-600" /> Actual</span>
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red-400" /> Today</span>
      </div>
    </div>
  )
}
