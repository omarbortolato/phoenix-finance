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

// Guards against corrupted/nonsensical dates (e.g. year 0001 from a date-input typing glitch)
const MIN_REASONABLE_YEAR = 2000
function safeDate(d: string | null | undefined): Date | null {
  if (!d) return null
  const parsed = parseISO(d)
  if (isNaN(parsed.getTime()) || parsed.getFullYear() < MIN_REASONABLE_YEAR) return null
  return parsed
}

interface Segment {
  startPct: number
  endPct: number
  solid: boolean
}

function computeSegments(
  phase: ProjectPhase,
  pct: (d: Date | null) => number | null,
  todayPct: number | null,
): Segment[] {
  const pStart = pct(safeDate(phase.planned_start))
  const pEnd = pct(safeDate(phase.planned_end))
  const aStart = pct(safeDate(phase.actual_start))
  const aEnd = pct(safeDate(phase.actual_end))

  if (phase.status === 'completed') {
    const start = aStart ?? pStart
    const end = aEnd ?? pEnd
    if (start == null || end == null) return []
    return [{ startPct: start, endPct: Math.max(end, start + 0.5), solid: true }]
  }

  if (phase.status === 'not_started') {
    if (pStart == null || pEnd == null) return []
    return [{ startPct: pStart, endPct: Math.max(pEnd, pStart + 0.5), solid: false }]
  }

  // in_progress or blocked: solid up to today, dashed estimate for the remainder
  const start = aStart ?? pStart
  if (start == null) return []
  const end = aEnd ?? pEnd ?? start
  if (todayPct == null || todayPct <= start) {
    return [{ startPct: start, endPct: Math.max(end, start + 0.5), solid: false }]
  }
  if (todayPct >= end) {
    return [{ startPct: start, endPct: Math.max(end, start + 0.5), solid: true }]
  }
  return [
    { startPct: start, endPct: todayPct, solid: true },
    { startPct: todayPct, endPct: end, solid: false },
  ]
}

export default function ProjectGantt({ phases }: Props) {
  if (!phases.length) {
    return (
      <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
        No phases yet — use "+ Add phase" or "Sync phases from templates" above.
      </div>
    )
  }

  const dates = phases
    .flatMap(p => [safeDate(p.planned_start), safeDate(p.planned_end), safeDate(p.actual_start), safeDate(p.actual_end)])
    .filter((d): d is Date => d !== null)

  if (!dates.length) {
    return (
      <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
        Set planned start/end dates on each phase below to see the Gantt timeline.
      </div>
    )
  }

  const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
  const maxDate = new Date(Math.max(...dates.map(d => d.getTime())))
  const totalDays = Math.max(differenceInDays(maxDate, minDate), 1)

  const pct = (d: Date | null): number | null => {
    if (!d) return null
    const days = differenceInDays(d, minDate)
    return Math.max(0, Math.min(100, (days / totalDays) * 100))
  }

  const today = new Date()
  const todayPct = today >= minDate && today <= maxDate ? pct(today) : null

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
          const color = phase.color || '#7C3AED'
          const segments = computeSegments(phase, pct, todayPct)

          return (
            <div key={phase.id} className="flex items-center gap-3">
              <div className="w-40 flex-shrink-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{phase.name}</p>
                <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[phase.status] || STATUS_BADGE.not_started}`}>
                  {STATUS_LABEL[phase.status] || phase.status}
                </span>
              </div>
              <div className="flex-1 relative h-6 bg-zinc-50 dark:bg-zinc-800/60 rounded">
                {segments.length === 0 ? (
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                    No dates set
                  </span>
                ) : (
                  segments.map((seg, i) => (
                    <div
                      key={i}
                      className="absolute top-1 bottom-1 rounded"
                      style={{
                        left: `${seg.startPct}%`,
                        width: `${Math.max(seg.endPct - seg.startPct, 0.5)}%`,
                        backgroundColor: seg.solid ? color : `${color}20`,
                        backgroundImage: seg.solid
                          ? undefined
                          : `repeating-linear-gradient(45deg, ${color}50 0, ${color}50 3px, transparent 3px, transparent 7px)`,
                      }}
                    />
                  ))
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
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #7C3AED50 0, #7C3AED50 3px, transparent 3px, transparent 7px)', backgroundColor: '#7C3AED20' }} />
          Estimated
        </span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-violet-600" /> Actual</span>
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red-400" /> Today</span>
      </div>
    </div>
  )
}
