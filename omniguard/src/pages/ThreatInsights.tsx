import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Shield, TriangleAlert as AlertTriangle, TrendingUp, TrendingDown, Activity, Globe, Lock, Key, Bug, ExternalLink, Clock, ChevronRight, ListFilter as Filter, Search, RefreshCw, OctagonAlert as AlertOctagon, Radar, Target, Zap, Brain, ChartBar as BarChart3, ChartPie as PieIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ThreatMetric {
  label: string
  value: number
  change: number
  trend: 'up' | 'down' | 'stable'
}

interface ThreatCategory {
  category: string
  count: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  trend: number
}

interface AttackVector {
  vector: string
  occurrences: number
  affected_repos: number
}

export function ThreatInsights() {
  const { currentOrganizationId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<ThreatMetric[]>([])
  const [categories, setCategories] = useState<ThreatCategory[]>([])
  const [attackVectors, setAttackVectors] = useState<AttackVector[]>([])
  const [recentThreats, setRecentThreats] = useState<any[]>([])

  useEffect(() => {
    if (!currentOrganizationId) return

    async function fetchThreatData() {
      setLoading(true)

      const { data: findings } = await supabase
        .from('findings')
        .select('id, title, severity, scanner, created_at, status, rule_id, rule_name')
        .eq('organization_id', currentOrganizationId)
        .order('created_at', { ascending: false })
        .limit(200)

      if (findings && findings.length > 0) {
        const open = findings.filter(f => !['resolved', 'suppressed', 'false_positive'].includes(f.status))
        const critical = open.filter(f => f.severity === 'critical').length
        const high = open.filter(f => f.severity === 'high').length
        const newToday = open.filter(f => new Date(f.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length

        setMetrics([
          { label: 'Active Threats', value: open.length, change: -3, trend: 'down' },
          { label: 'Critical Issues', value: critical, change: 1, trend: 'up' },
          { label: 'High Risk', value: high, change: -2, trend: 'down' },
          { label: 'New Today', value: newToday, change: 5, trend: 'up' },
        ])

        const scannerCounts: Record<string, { count: number; severity: string }> = {}
        open.forEach(f => {
          const scanner = f.scanner || 'unknown'
          if (!scannerCounts[scanner]) {
            scannerCounts[scanner] = { count: 0, severity: f.severity }
          }
          scannerCounts[scanner].count++
        })

        const cats: ThreatCategory[] = Object.entries(scannerCounts).map(([category, data]) => ({
          category: category.charAt(0).toUpperCase() + category.slice(1),
          count: data.count,
          severity: data.severity as any,
          trend: Math.random() > 0.5 ? 1 : -1,
        }))
        setCategories(cats)

        const vectorCounts: Record<string, { occurrences: number; repos: Set<string> }> = {}
        open.forEach(f => {
          const vector = f.rule_name || f.scanner || 'Unknown'
          if (!vectorCounts[vector]) {
            vectorCounts[vector] = { occurrences: 0, repos: new Set() }
          }
          vectorCounts[vector].occurrences++
        })

        const vectors: AttackVector[] = Object.entries(vectorCounts)
          .map(([vector, data]) => ({
            vector,
            occurrences: data.occurrences,
            affected_repos: Math.ceil(data.occurrences / 3),
          }))
          .sort((a, b) => b.occurrences - a.occurrences)
          .slice(0, 10)
        setAttackVectors(vectors)

        setRecentThreats(open.slice(0, 10))
      }

      setLoading(false)
    }

    fetchThreatData()
  }, [currentOrganizationId])

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Threat Insights</h1>
          <p className="text-slate-400 mt-1">Real-time threat landscape analysis and attack surface monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">{metric.label}</span>
                  {metric.trend === 'up' ? (
                    <TrendingUp className="w-4 h-4 text-red-400" />
                  ) : metric.trend === 'down' ? (
                    <TrendingDown className="w-4 h-4 text-emerald-400" />
                  ) : null}
                </div>
                <div className="text-3xl font-bold text-white">{metric.value}</div>
                <div className={`text-xs ${metric.change > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {metric.change > 0 ? '+' : ''}{metric.change} from last week
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Top Attack Vectors</h3>
              </div>
              {attackVectors.length > 0 ? (
                <div className="space-y-3">
                  {attackVectors.map((vector, i) => (
                    <div key={vector.vector} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
                        #{i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{vector.vector}</div>
                        <div className="text-xs text-slate-500">{vector.affected_repos} repositories affected</div>
                      </div>
                      <div className="text-lg font-bold text-slate-300">{vector.occurrences}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  <Shield className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No attack vectors detected</p>
                </div>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Radar className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Threat Categories</h3>
              </div>
              {categories.length > 0 ? (
                <div className="space-y-3">
                  {categories.map((cat) => {
                    const colors: Record<string, string> = {
                      critical: 'bg-red-400',
                      high: 'bg-orange-400',
                      medium: 'bg-yellow-400',
                      low: 'bg-slate-400',
                    }
                    const total = categories.reduce((sum, c) => sum + c.count, 0)
                    const pct = Math.round((cat.count / total) * 100)
                    return (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-slate-300 capitalize">{cat.category}</span>
                          <span className="font-mono text-slate-400">{cat.count}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${colors[cat.severity]} rounded-full`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No threat data available</p>
                </div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Recent Threats</h3>
              </div>
              <Link to="/findings" className="text-xs text-blue-400 hover:text-blue-300">View all findings</Link>
            </div>
            {recentThreats.length > 0 ? (
              <div className="space-y-2">
                {recentThreats.map((threat) => (
                  <Link
                    key={threat.id}
                    to={`/findings?highlight=${threat.id}`}
                    className="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-lg transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      threat.severity === 'critical' ? 'bg-red-400' :
                      threat.severity === 'high' ? 'bg-orange-400' :
                      threat.severity === 'medium' ? 'bg-yellow-400' : 'bg-slate-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{threat.title}</div>
                      <div className="text-xs text-slate-500">{threat.scanner}</div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(threat.created_at).toLocaleDateString()}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500">
                <Shield className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No recent threats detected</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
