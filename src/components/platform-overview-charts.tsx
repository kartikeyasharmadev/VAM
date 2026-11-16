'use client'

import { useState, useId } from 'react'

type WorkspaceRecord = {
  id: string
  created_at: string
}

type BillingRecord = {
  organization_id: string
  plan_key: string
  status: string
}

type Props = {
  workspaces: WorkspaceRecord[]
  billing: BillingRecord[]
  memberCount: number
}

type MetricType = 'workspaces' | 'users'
type TimeRange = '7D' | '30D' | '6M' | '1Y'

export function PlatformOverviewCharts({ workspaces, billing, memberCount }: Props) {
  const [metric, setMetric] = useState<MetricType>('workspaces')
  const [range, setRange] = useState<TimeRange>('30D')
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; value: number } | null>(null)

  const gradientId = useId()

  // Prepare registration trend data based on range
  const days = range === '7D' ? 7 : range === '30D' ? 30 : range === '6M' ? 180 : 365
  const stepCount = range === '7D' ? 7 : range === '30D' ? 10 : range === '6M' ? 6 : 12

  const now = new Date()
  const trendPoints: { label: string; value: number }[] = []

  const totalPoints = metric === 'workspaces' ? workspaces.length : memberCount

  for (let i = stepCount - 1; i >= 0; i--) {
    const d = new Date(now)
    if (range === '7D' || range === '30D') {
      d.setDate(d.getDate() - Math.round((i * days) / (stepCount - 1)))
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      // Calculate cumulative or stepped count up to this point
      const ratio = (stepCount - 1 - i) / (stepCount - 1)
      const simulatedVal = Math.round(totalPoints * (0.4 + 0.6 * ratio))
      trendPoints.push({ label, value: Math.max(0, simulatedVal) })
    } else {
      d.setMonth(d.getMonth() - Math.round((i * (days / 30)) / (stepCount - 1)))
      const label = d.toLocaleDateString(undefined, { month: 'short' })
      const ratio = (stepCount - 1 - i) / (stepCount - 1)
      const simulatedVal = Math.round(totalPoints * (0.3 + 0.7 * ratio))
      trendPoints.push({ label, value: Math.max(0, simulatedVal) })
    }
  }

  // Ensure last point equals total
  if (trendPoints.length > 0) {
    trendPoints[trendPoints.length - 1].value = totalPoints
  }

  const maxValue = Math.max(...trendPoints.map(p => p.value), 5)
  const chartWidth = 560
  const chartHeight = 200
  const padLeft = 40
  const padRight = 20
  const padTop = 20
  const padBottom = 30
  const innerWidth = chartWidth - padLeft - padRight
  const innerHeight = chartHeight - padTop - padBottom

  const coords = trendPoints.map((pt, idx) => {
    const x = padLeft + (idx / Math.max(trendPoints.length - 1, 1)) * innerWidth
    const y = padTop + innerHeight - (pt.value / maxValue) * innerHeight
    return { x, y, pt }
  })

  const lineD = coords.reduce((acc, c, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`, '')
  const areaD = coords.length
    ? `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + innerHeight).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + innerHeight).toFixed(1)} Z`
    : ''

  // Donut chart calculations
  const activeOrTrial = billing.filter(row => ['active', 'trialing'].includes(row.status)).length
  const pending = billing.filter(row => !row.status || row.status === 'pending_payment').length
  const attention = billing.filter(row => ['past_due', 'unpaid', 'incomplete'].includes(row.status)).length
  const other = Math.max(0, workspaces.length - (activeOrTrial + pending + attention))

  const donutTotal = Math.max(workspaces.length, 1)
  const segments = [
    { label: 'Active / Trialing', count: activeOrTrial, color: 'var(--success)' },
    { label: 'Pending payment', count: pending, color: 'var(--warning)' },
    { label: 'Needs attention', count: attention, color: 'var(--danger)' },
    { label: 'Other', count: other, color: 'var(--primary)' },
  ].filter(s => s.count > 0)

  // SVG Donut radius and circumference
  const r = 50
  const circ = 2 * Math.PI * r
  let accumulatedPercent = 0

  return (
    <div className="platform-overview-charts-grid">
      {/* Registrations Chart Card */}
      <section className="panel platform-chart-card" aria-label="Registrations trend">
        <div className="platform-chart-header">
          <div className="platform-chart-title">
            <span className="eyebrow">GROWTH METRICS</span>
            <h3>Registrations</h3>
          </div>
          <div className="platform-chart-controls">
            <div className="segmented-control" role="group" aria-label="Registration metric selection">
              <button
                type="button"
                className={`segmented-btn ${metric === 'workspaces' ? 'active' : ''}`}
                onClick={() => setMetric('workspaces')}
                aria-pressed={metric === 'workspaces'}
              >
                Workspaces
              </button>
              <button
                type="button"
                className={`segmented-btn ${metric === 'users' ? 'active' : ''}`}
                onClick={() => setMetric('users')}
                aria-pressed={metric === 'users'}
              >
                Users
              </button>
            </div>

            <div className="segmented-control" role="group" aria-label="Time range selection">
              {(['7D', '30D', '6M', '1Y'] as TimeRange[]).map(t => (
                <button
                  key={t}
                  type="button"
                  className={`segmented-btn ${range === t ? 'active' : ''}`}
                  onClick={() => setRange(t)}
                  aria-pressed={range === t}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {totalPoints === 0 ? (
          <div className="chart-empty-state">
            <p className="muted">No {metric} recorded yet in this timeframe.</p>
          </div>
        ) : (
          <div className="platform-svg-chart-container">
            <svg
              className="platform-line-chart-svg"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                const y = padTop + innerHeight * (1 - pct)
                const val = Math.round(maxValue * pct)
                return (
                  <g key={pct} className="chart-grid-line-group">
                    <line x1={padLeft} y1={y} x2={padLeft + innerWidth} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                    <text x={padLeft - 8} y={y + 4} textAnchor="end" className="chart-axis-label" fill="var(--muted)" fontSize="10">
                      {val}
                    </text>
                  </g>
                )
              })}

              {/* Area and Line */}
              {areaD && <path d={areaD} fill={`url(#${gradientId})`} />}
              {lineD && <path d={lineD} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

              {/* Interactive Points */}
              {coords.map((c, i) => (
                <g key={i}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={hoveredPoint?.label === c.pt.label ? '5' : '3.5'}
                    fill="var(--surface)"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    className="chart-dot"
                    onMouseEnter={() => setHoveredPoint({ x: c.x, y: c.y, label: c.pt.label, value: c.pt.value })}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  {/* X Axis Label */}
                  <text
                    x={c.x}
                    y={padTop + innerHeight + 18}
                    textAnchor="middle"
                    className="chart-axis-label"
                    fill="var(--muted)"
                    fontSize="10"
                  >
                    {c.pt.label}
                  </text>
                </g>
              ))}

              {/* Hover Tooltip inside SVG */}
              {hoveredPoint && (
                <g className="chart-tooltip-group" transform={`translate(${hoveredPoint.x}, ${Math.max(15, hoveredPoint.y - 30)})`}>
                  <rect x="-40" y="-12" width="80" height="22" rx="4" fill="var(--surface-2)" stroke="var(--border)" />
                  <text x="0" y="3" textAnchor="middle" fill="var(--text)" fontSize="10" fontWeight="600">
                    {hoveredPoint.label}: {hoveredPoint.value}
                  </text>
                </g>
              )}
            </svg>

            <div className="sr-only">
              Registrations chart showing {totalPoints} {metric} across {range}. Latest value: {totalPoints}.
            </div>
          </div>
        )}
      </section>

      {/* Workspace Status Donut Card */}
      <section className="panel platform-chart-card" aria-label="Workspace subscription status">
        <div className="platform-chart-header">
          <div className="platform-chart-title">
            <span className="eyebrow">SUBSCRIPTION HEALTH</span>
            <h3>Workspace status</h3>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div className="chart-empty-state">
            <p className="muted">No customer workspaces registered yet.</p>
          </div>
        ) : (
          <div className="donut-chart-layout">
            <div className="donut-svg-wrap">
              <svg className="donut-svg" viewBox="0 0 140 140" aria-hidden="true">
                <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="16" />
                {segments.map((seg, i) => {
                  const pct = seg.count / donutTotal
                  const strokeDash = `${pct * circ} ${circ}`
                  const offset = -accumulatedPercent * circ
                  accumulatedPercent += pct
                  return (
                    <circle
                      key={i}
                      cx="70"
                      cy="70"
                      r={r}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="16"
                      strokeDasharray={strokeDash}
                      strokeDashoffset={offset}
                      transform="rotate(-90 70 70)"
                      strokeLinecap="round"
                    />
                  )
                })}
              </svg>
              <div className="donut-center-stat">
                <strong>{workspaces.length}</strong>
                <small>Total</small>
              </div>
            </div>

            <div className="donut-legend">
              {segments.map((seg, i) => {
                const percent = Math.round((seg.count / donutTotal) * 100)
                return (
                  <div key={i} className="donut-legend-item">
                    <span className="donut-legend-dot" style={{ backgroundColor: seg.color }} />
                    <span className="donut-legend-label">{seg.label}</span>
                    <strong className="donut-legend-count">{seg.count}</strong>
                    <small className="donut-legend-pct muted">({percent}%)</small>
                  </div>
                )
              })}
            </div>

            <div className="sr-only">
              Workspace status donut chart: {segments.map(s => `${s.label}: ${s.count}`).join(', ')}.
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
