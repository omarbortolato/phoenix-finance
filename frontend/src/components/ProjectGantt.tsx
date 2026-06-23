import { useEffect, useRef, useState } from 'react'
import { ProjectPhase, formatUSD } from '../api/client'
import { differenceInDays, parseISO, format } from 'date-fns'

interface Props {
  phases: ProjectPhase[]
  projectStart?: string | null
  projectEnd?: string | null
  compareMode: boolean
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

function fmtD(d: string | null | undefined): string {
  const sd = safeDate(d)
  return sd ? format(sd, 'MMM d, yyyy') : '—'
}

interface Segment {
  startPct: number
  endPct: number
  solid: boolean
}

function computeBlendedSegments(
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

function bar(seg: Segment, color: string, key: number | string) {
  return (
    <div
      key={key}
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
  )
}

function PhaseTooltip({ phase, pinned, onClose }: { phase: ProjectPhase; pinned: boolean; onClose: () => void }) {
  const estDays = (() => {
    const s = safeDate(phase.planned_start); const e = safeDate(phase.planned_end)
    return s && e ? differenceInDays(e, s) : null
  })()
  const actDays = (() => {
    const s = safeDate(phase.actual_start)
    if (!s) return null
    const e = safeDate(phase.actual_end) ?? new Date()
    return differenceInDays(e, s)
  })()

  return (
    <div
      onClick={e => e.stopPropagation()}
      className="absolute z-30 bottom-full mb-2 left-0 w-64 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-xs space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{phase.name}</span>
        {pinned && (
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex justify-between gap-2">
          <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0">Estimated</span>
          <span className="text-zinc-700 dark:text-zinc-300 text-right">{fmtD(phase.planned_start)} – {fmtD(phase.planned_end)}</span>
        </div>
        {estDays != null && <div className="text-right text-zinc-400 dark:text-zinc-500">{estDays}d planned</div>}
        <div className="flex justify-between gap-2">
          <span className="text-zinc-400 dark:text-zinc-500 flex-shrink-0">Actual</span>
          <span className="text-zinc-700 dark:text-zinc-300 text-right">
            {phase.actual_start ? `${fmtD(phase.actual_start)} – ${phase.actual_end ? fmtD(phase.actual_end) : 'ongoing'}` : '—'}
          </span>
        </div>
        {actDays != null && <div className="text-right text-zinc-400 dark:text-zinc-500">{actDays}d so far</div>}
      </div>

      <div className="border-t border-zinc-100 dark:border-zinc-700 pt-2 space-y-1">
        <div className="flex justify-between">
          <span className="text-zinc-400 dark:text-zinc-500">Budget (estimated)</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatUSD(phase.budget)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-400 dark:text-zinc-500">Spent (actual)</span>
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatUSD(phase.spent_so_far)}</span>
        </div>
      </div>
    </div>
  )
}

export default function ProjectGantt({ phases, projectStart, projectEnd, compareMode }: Props) {
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [pinnedId, setPinnedId] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pinnedId == null) return
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPinnedId(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [pinnedId])

  if (!phases.length) {
    return (
      <div className="text-center py-10 text-sm text-zinc-400 dark:text-zinc-500">
        No phases yet — use "+ Add phase" or "Sync phases from templates" above.
      </div>
    )
  }

  const projectStartDate = safeDate(projectStart)
  const projectEndDate = safeDate(projectEnd)

  const dates = phases
    .flatMap(p => [safeDate(p.planned_start), safeDate(p.planned_end), safeDate(p.actual_start), safeDate(p.actual_end)])
    .concat([projectStartDate, projectEndDate])
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
    <div ref={containerRef} className="space-y-2">
      <div className="flex items-center gap-3 px-1">
        <div className="w-40 flex-shrink-0" />
        <div className="flex-1 relative h-4 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="absolute left-0">{format(minDate, 'MMM d, yyyy')}</span>
          {todayPct !== null && (
            <span
              className="absolute -translate-x-1/2 text-red-400 font-medium"
              style={{ left: `${todayPct}%` }}
            >
              Today
            </span>
          )}
          <span className="absolute right-0">{format(maxDate, 'MMM d, yyyy')}</span>
        </div>
        <span className="w-10 flex-shrink-0 text-left text-xs text-zinc-400 dark:text-zinc-500">Progress</span>
        <span className="w-28 flex-shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500">Bdg vs Act</span>
      </div>

      <div className="relative space-y-3">
        {phases.map(phase => {
          const color = phase.color || '#7C3AED'
          const showTooltip = hoverId === phase.id || pinnedId === phase.id
          const isPinned = pinnedId === phase.id

          const handleClick = () => setPinnedId(prev => (prev === phase.id ? null : phase.id))

          if (compareMode) {
            const pStart = pct(safeDate(phase.planned_start))
            const pEnd = pct(safeDate(phase.planned_end))
            const aStart = pct(safeDate(phase.actual_start))
            let aEnd = pct(safeDate(phase.actual_end))
            if (aStart != null && aEnd == null) aEnd = todayPct ?? aStart

            return (
              <div key={phase.id} className="flex items-center gap-3">
                <div className="w-40 flex-shrink-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{phase.name}</p>
                  <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[phase.status] || STATUS_BADGE.not_started}`}>
                    {STATUS_LABEL[phase.status] || phase.status}
                  </span>
                </div>
                <div
                  className="flex-1 relative h-10 bg-zinc-50 dark:bg-zinc-800/60 rounded cursor-pointer"
                  onMouseEnter={() => setHoverId(phase.id)}
                  onMouseLeave={() => setHoverId(null)}
                  onClick={handleClick}
                >
                  <div className="absolute top-0.5 left-0 right-0 h-4">
                    {aStart != null
                      ? bar({ startPct: aStart, endPct: Math.max(aEnd ?? aStart, aStart + 0.5), solid: true }, color, 'actual')
                      : <span className="absolute inset-0 flex items-center px-2 text-[10px] text-zinc-400 dark:text-zinc-500">Actual: not started</span>}
                  </div>
                  <div className="absolute bottom-0.5 left-0 right-0 h-4">
                    {pStart != null && pEnd != null
                      ? bar({ startPct: pStart, endPct: Math.max(pEnd, pStart + 0.5), solid: false }, color, 'estimate')
                      : <span className="absolute inset-0 flex items-center px-2 text-[10px] text-zinc-400 dark:text-zinc-500">No estimate set</span>}
                  </div>
                  {todayPct !== null && (
                    <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none" style={{ left: `${todayPct}%` }} />
                  )}
                  {showTooltip && <PhaseTooltip phase={phase} pinned={isPinned} onClose={() => setPinnedId(null)} />}
                </div>
                <span className="w-10 flex-shrink-0 text-left text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                  {phase.pct_complete}%
                </span>
                <span className="w-28 flex-shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                  {formatUSD(phase.spent_so_far, true)}/{formatUSD(phase.budget, true)}
                </span>
              </div>
            )
          }

          const segments = computeBlendedSegments(phase, pct, todayPct)

          return (
            <div key={phase.id} className="flex items-center gap-3">
              <div className="w-40 flex-shrink-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{phase.name}</p>
                <span className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_BADGE[phase.status] || STATUS_BADGE.not_started}`}>
                  {STATUS_LABEL[phase.status] || phase.status}
                </span>
              </div>
              <div
                className="flex-1 relative h-6 bg-zinc-50 dark:bg-zinc-800/60 rounded cursor-pointer"
                onMouseEnter={() => setHoverId(phase.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={handleClick}
              >
                {segments.length === 0 ? (
                  <span className="absolute inset-0 flex items-center px-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                    No dates set
                  </span>
                ) : (
                  segments.map((seg, i) => bar(seg, color, i))
                )}
                {todayPct !== null && (
                  <div className="absolute top-0 bottom-0 w-px bg-red-400 z-10 pointer-events-none" style={{ left: `${todayPct}%` }} />
                )}
                {showTooltip && <PhaseTooltip phase={phase} pinned={isPinned} onClose={() => setPinnedId(null)} />}
              </div>
              <span className="w-10 flex-shrink-0 text-left text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                {phase.pct_complete}%
              </span>
              <span className="w-28 flex-shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
                {formatUSD(phase.spent_so_far, true)}/{formatUSD(phase.budget, true)}
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
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <span>Hover a bar for details, click to pin</span>
      </div>
    </div>
  )
}
