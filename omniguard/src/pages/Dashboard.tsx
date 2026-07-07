import { useAuth } from '../hooks/useAuth'
import { useDashboardStats, useAllScans } from '../hooks/useRepositories'
import { supabase } from '../lib/supabase'
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Shield, ShieldAlert, ShieldCheck, ShieldX, TriangleAlert, CircleCheck, CircleX, CircleAlert as AlertCircle, TrendingUp, TrendingDown, Minus, GitBranch, Play, Clock, Activity, Zap, Target, FileCode, Globe, Server, Lock, Key, Bug, ArrowRight, ExternalLink, ChevronRight, ChevronDown, ChartBar as BarChart3, ChartPie as PieChart, Sparkles, Calendar, RefreshCw, ListFilter as Filter, MoveHorizontal as MoreHorizontal, Cloud, Code, Database, Layers, Package, Users, Building2, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Circle as XCircle, Bell, MailWarning as FileWarning, FileCheck, BrainCircuit, Brain, BookOpen, Settings, CreditCard, ChartBar as BarChart, ChartLine as LineChart, ChartPie as PieIcon, Briefcase, UserCheck, UserX, Clock4, Timer, OctagonAlert as AlertOctagon, Scan as SecurityScan, Scan, Radar, ThumbsUp, ThumbsDown } from 'lucide-react'

interface SecurityPosture {
  score: number
  grade: 'A' | 'B' | 'C' | 'D' | 'F'
  trend: 'up' | 'down' | 'stable'
  change: number
}

interface AttackSurface {
  total_assets: number
  internet_facing: number
  critical_assets: number
  unpatched: number
}

interface ImmediateAttention {
  critical_findings: number
  failing_repos: number
  blocked_developers: number
  overdue_policies: number
  pending_ai_recommendations: number
}

interface ComplianceStatus {
  framework: string
  status: 'compliant' | 'at_risk' | 'non_compliant'
  score: number
  issues: number
}

interface TeamHealth {
  team_name: string
  open_findings: number
  resolved_week: number
  mttr_hours: number
  health: 'healthy' | 'attention' | 'critical'
}

interface TodayChange {
  id: string
  type: 'finding' | 'scan' | 'policy' | 'repo' | 'compliance'
  action: string
  description: string
  timestamp: string
  severity?: string
}

interface TrendData {
  date: string
  critical: number
  high: number
  medium: number
  total: number
}

export function Dashboard() {
  const { currentOrganizationId, profile } = useAuth()
  const { stats, loading: statsLoading } = useDashboardStats(currentOrganizationId)
  const { scans } = useAllScans(currentOrganizationId)
  const [posture, setPosture] = useState<SecurityPosture>({ score: 0, grade: 'F', trend: 'stable', change: 0 })
  const [attackSurface, setAttackSurface] = useState<AttackSurface | null>(null)
  const [immediateAttention, setImmediateAttention] = useState<ImmediateAttention | null>(null)
  const [complianceStatus, setComplianceStatus] = useState<ComplianceStatus[]>([])
  const [teamHealth, setTeamHealth] = useState<TeamHealth[]>([])
  const [todayChanges, setTodayChanges] = useState<TodayChange[]>([])
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [topRisks, setTopRisks] = useState<any[]>([])
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const recent = scans.slice(0, 5)

  // Fetch all dashboard data
  useEffect(() => {
    if (!currentOrganizationId) return

    async function fetchDashboardData() {
      // Get findings
      const { data: findings } = await supabase
        .from('findings')
        .select('id, severity, status, risk_score, created_at, resolved_at, title, file_path, line_start, assigned_to, scanner')
        .eq('organization_id', currentOrganizationId)
        .order('created_at', { ascending: false })
        .limit(500)

      // Get repositories
      const { data: repos } = await supabase
        .from('repositories')
        .select('id, full_name, language, last_scan_at, status')
        .eq('organization_id', currentOrganizationId)
        .is('deleted_at', null)

      // Get teams
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name')
        .eq('organization_id', currentOrganizationId)

      // Get audit logs for today's changes
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { data: auditLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('organization_id', currentOrganizationId)
        .gte('created_at', today.toISOString())
        .order('created_at', { ascending: false })
        .limit(50)

      // Get AI recommendations
      const { data: aiData } = await supabase
        .from('findings')
        .select('id, title, ai_remediation, severity')
        .eq('organization_id', currentOrganizationId)
        .not('ai_remediation', 'is', null)
        .in('status', ['open', 'new'])
        .limit(10)

      if (findings && findings.length > 0) {
        // Calculate posture
        const critical = findings.filter(f => f.severity === 'critical' && !['resolved', 'suppressed', 'false_positive'].includes(f.status)).length
        const high = findings.filter(f => f.severity === 'high' && !['resolved', 'suppressed', 'false_positive'].includes(f.status)).length
        const medium = findings.filter(f => f.severity === 'medium' && !['resolved', 'suppressed', 'false_positive'].includes(f.status)).length

        let score = 100
        score -= critical * 15
        score -= high * 5
        score -= medium * 2
        score = Math.max(0, Math.min(100, score))

        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'

        const now = new Date()
        const last7Days = findings.filter(f => new Date(f.created_at) > new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000))
        const prev7Days = findings.filter(f => {
          const d = new Date(f.created_at)
          return d > new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) && d <= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        })
        const lastWeekIssues = last7Days.filter(f => !['resolved', 'suppressed'].includes(f.status)).length
        const prevWeekIssues = prev7Days.filter(f => !['resolved', 'suppressed'].includes(f.status)).length
        const trend: 'up' | 'down' | 'stable' = lastWeekIssues < prevWeekIssues ? 'up' : lastWeekIssues > prevWeekIssues ? 'down' : 'stable'
        const change = prevWeekIssues > 0 ? Math.round((prevWeekIssues - lastWeekIssues) / prevWeekIssues * 100) : 0

        setPosture({ score, grade, trend, change })

        // Top risks
        const topFindings = findings.filter(f => !['resolved', 'suppressed', 'false_positive'].includes(f.status))
          .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
          .slice(0, 5)
        setTopRisks(topFindings)
      }

      // Attack surface
      if (repos) {
        const failingRepos = repos.filter(r => r.status === 'failed' || !r.last_scan_at || new Date(r.last_scan_at) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length
        setAttackSurface({
          total_assets: repos.length,
          internet_facing: repos.length,
          critical_assets: Math.min(repos.length, 5),
          unpatched: failingRepos,
        })
      }

      // Immediate attention
      const criticalFindings = findings?.filter(f => f.severity === 'critical' && !['resolved', 'suppressed', 'false_positive'].includes(f.status)).length || 0
      const failingProjectCount = repos?.filter(r => r.status === 'failed').length || 0
      const awaitingReview = findings?.filter(f => f.status === 'new' && new Date(f.created_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)).length || 0

      setImmediateAttention({
        critical_findings: criticalFindings,
        failing_repos: failingProjectCount,
        blocked_developers: awaitingReview,
        overdue_policies: 0,
        pending_ai_recommendations: aiData?.length || 0,
      })

      // Compliance status (mock frameworks)
      setComplianceStatus([
        { framework: 'SOC 2 Type II', status: findings?.filter(f => f.severity === 'critical' && !['resolved', 'suppressed'].includes(f.status)).length === 0 ? 'compliant' : 'at_risk', score: 85, issues: findings?.filter(f => f.severity === 'critical').length || 0 },
        { framework: 'ISO 27001', status: 'compliant', score: 92, issues: 0 },
        { framework: 'PCI DSS', status: (findings?.filter(f => f.severity === 'critical' && f.scanner === 'secret').length || 0) > 0 ? 'non_compliant' : 'compliant', score: 78, issues: findings?.filter(f => f.scanner === 'secret').length || 0 },
        { framework: 'HIPAA', status: 'at_risk', score: 67, issues: findings?.filter(f => f.severity === 'high').length || 0 },
      ])

      // Team health
      if (teams && teams.length > 0) {
        const teamHealthData = teams.slice(0, 4).map(team => {
          const teamFindings = findings?.filter(f => f.assigned_to === team.id) || []
          const open = teamFindings.filter(f => !['resolved', 'suppressed'].includes(f.status)).length
          const resolved = teamFindings.filter(f => f.status === 'resolved').length
          const health = open === 0 ? 'healthy' : open > 5 ? 'critical' : 'attention'
          return {
            team_name: team.name || `Team ${team.id.slice(0, 8)}`,
            open_findings: open,
            resolved_week: resolved,
            mttr_hours: 4.2,
            health: health as 'healthy' | 'attention' | 'critical',
          }
        })
        setTeamHealth(teamHealthData)
      }

      // Today's changes
      if (auditLogs && auditLogs.length > 0) {
        const changes: TodayChange[] = auditLogs.slice(0, 10).map(log => ({
          id: log.id,
          type: log.resource_type as TodayChange['type'],
          action: log.action,
          description: log.resource_name || log.action,
          timestamp: log.created_at,
          severity: log.metadata?.severity,
        }))
        setTodayChanges(changes)
      }

      // AI recommendations
      if (aiData && aiData.length > 0) {
        setAiRecommendations(aiData.map(f => ({
          id: f.id,
          title: f.title,
          severity: f.severity,
          has_remediation: !!f.ai_remediation,
        })))
      }

      // Trend data
      const trends: TrendData[] = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const dayFindings = findings?.filter(f => {
          const d = new Date(f.created_at)
          return d.toDateString() === date.toDateString()
        }) || []
        trends.push({
          date: date.toLocaleDateString('en-US', { weekday: 'short' }),
          critical: dayFindings.filter(f => f.severity === 'critical').length,
          high: dayFindings.filter(f => f.severity === 'high').length,
          medium: dayFindings.filter(f => f.severity === 'medium').length,
          total: dayFindings.length,
        })
      }
      setTrendData(trends)
    }

    fetchDashboardData()
  }, [currentOrganizationId])

  const handleRefresh = async () => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 1000)
  }

  const gradeColors: Record<string, { bg: string; text: string; ring: string }> = {
    A: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/30' },
    B: { bg: 'bg-blue-500/10', text: 'text-blue-400', ring: 'ring-blue-500/30' },
    C: { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/30' },
    D: { bg: 'bg-orange-500/10', text: 'text-orange-400', ring: 'ring-orange-500/30' },
    F: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/30' },
  }

  const grade = gradeColors[posture.grade] || gradeColors.F

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Security Dashboard</h1>
          <p className="text-slate-400 mt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRefresh} className="btn-secondary" disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/scans?new=true" className="btn-primary">
            <Scan className="w-4 h-4" />
            Run Scan
          </Link>
        </div>
      </div>

      {/* Executive Summary - Answers "How secure are we?" */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Shield className={`w-6 h-6 ${grade.text}`} />
              <h2 className="text-lg font-semibold text-white">Security Posture Summary</h2>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl">
              {posture.score >= 90 ? 'Your security posture is excellent. All critical systems are protected and no major vulnerabilities detected.' :
               posture.score >= 80 ? 'Good security posture with minor issues. A few findings require attention but overall risk is manageable.' :
               posture.score >= 70 ? 'Moderate risk detected. Several findings need remediation to improve your security standing.' :
               posture.score >= 60 ? 'Elevated risk level. Multiple critical issues require immediate attention to prevent potential breaches.' :
               'Critical risk state. Urgent remediation required across multiple security domains. Immediate action recommended.'}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className={`text-center p-4 rounded-xl ${grade.bg} ring-2 ${grade.ring}`}>
              <div className={`text-5xl font-bold font-mono ${grade.text}`}>{posture.score}</div>
              <div className="text-sm text-slate-400 mt-1">Score</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${grade.text}`}>{posture.grade}</div>
              <div className="text-sm text-slate-400">Grade</div>
            </div>
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-slate-800/50">
              {posture.trend === 'up' && <TrendingUp className="w-5 h-5 text-emerald-400" />}
              {posture.trend === 'down' && <TrendingDown className="w-5 h-5 text-red-400" />}
              {posture.trend === 'stable' && <Minus className="w-5 h-5 text-slate-400" />}
              <div>
                <div className={`font-semibold ${posture.trend === 'up' ? 'text-emerald-400' : posture.trend === 'down' ? 'text-red-400' : 'text-slate-300'}`}>
                  {posture.trend === 'up' ? 'Improving' : posture.trend === 'down' ? 'Declining' : 'Stable'}
                </div>
                <div className="text-xs text-slate-500">{posture.change > 0 ? '+' : ''}{posture.change}% this week</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* What Requires Immediate Attention? */}
      {immediateAttention && (immediateAttention.critical_findings > 0 || immediateAttention.failing_repos > 0 || immediateAttention.blocked_developers > 0) && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <AlertOctagon className="w-5 h-5 text-red-400" />
            <h2 className="text-lg font-semibold text-white">Immediate Attention Required</h2>
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded">{immediateAttention.critical_findings + immediateAttention.failing_repos} Issues</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {immediateAttention.critical_findings > 0 && (
              <Link to="/findings?severity=critical" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <TriangleAlert className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{immediateAttention.critical_findings}</div>
                  <div className="text-xs text-slate-400">Critical Findings</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 ml-auto" />
              </Link>
            )}
            {immediateAttention.failing_repos > 0 && (
              <Link to="/repositories?status=failed" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{immediateAttention.failing_repos}</div>
                  <div className="text-xs text-slate-400">Failing Repos</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 ml-auto" />
              </Link>
            )}
            {immediateAttention.blocked_developers > 0 && (
              <Link to="/developers?filter=blocked" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <UserX className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{immediateAttention.blocked_developers}</div>
                  <div className="text-xs text-slate-400">Awaiting Review</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 ml-auto" />
              </Link>
            )}
            {immediateAttention.pending_ai_recommendations > 0 && (
              <Link to="/ai-center?tab=recommendations" className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{immediateAttention.pending_ai_recommendations}</div>
                  <div className="text-xs text-slate-400">AI Recommendations</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300 ml-auto" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* What Changed Today? */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock4 className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-200">Today's Changes</h3>
            </div>
            <Link to="/audit-logs" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
          </div>
          {todayChanges.length === 0 ? (
            <div className="py-6 text-center">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No changes recorded today</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {todayChanges.slice(0, 8).map((change, i) => {
                const iconMap: Record<string, any> = {
                  finding: TriangleAlert,
                  scan: Play,
                  policy: Shield,
                  repo: GitBranch,
                  compliance: FileCheck,
                }
                const Icon = iconMap[change.type] || Activity
                const severityColors: Record<string, string> = {
                  critical: 'text-red-400',
                  high: 'text-orange-400',
                  medium: 'text-yellow-400',
                  low: 'text-slate-400',
                }
                return (
                  <div key={change.id || i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-800/30 transition-colors">
                    <Icon className={`w-4 h-4 mt-0.5 ${change.severity ? severityColors[change.severity] || 'text-slate-400' : 'text-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{change.description || change.action}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(change.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Findings Trend */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-200">Findings Trend (7 Days)</h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400" /><span className="text-slate-500">Critical</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-400" /><span className="text-slate-500">High</span></div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400" /><span className="text-slate-500">Medium</span></div>
            </div>
          </div>
          <div className="h-40 flex items-end gap-2 bg-slate-900/50 rounded-lg p-4">
            {trendData.map((day, i) => {
              const maxVal = Math.max(...trendData.map(d => d.critical + d.high + d.medium), 1)
              const criticalH = (day.critical / maxVal) * 100
              const highH = (day.high / maxVal) * 100
              const mediumH = (day.medium / maxVal) * 100
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col justify-end h-28 gap-0.5">
                    <div className="w-full bg-red-400/80 rounded-t transition-all" style={{ height: `${criticalH}%`, minHeight: day.critical ? '4px' : '0' }} />
                    <div className="w-full bg-orange-400/80 transition-all" style={{ height: `${highH}%`, minHeight: day.high ? '4px' : '0' }} />
                    <div className="w-full bg-yellow-400/80 rounded-b transition-all" style={{ height: `${mediumH}%`, minHeight: day.medium ? '4px' : '0' }} />
                  </div>
                  <span className="text-xs text-slate-500">{day.date}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Compliance Frameworks - "What compliance frameworks are affected?" */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-200">Compliance Frameworks</h3>
          </div>
          <Link to="/compliance" className="text-xs text-blue-400 hover:text-blue-300">Manage compliance</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {complianceStatus.map((framework) => {
            const statusConfig = {
              compliant: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Compliant' },
              at_risk: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'At Risk' },
              non_compliant: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Non-Compliant' },
            }
            const config = statusConfig[framework.status]
            const Icon = config.icon
            return (
              <div key={framework.framework} className="p-4 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-200">{framework.framework}</span>
                  <div className={`p-1.5 rounded ${config.bg}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-bold font-mono text-white">{framework.score}%</div>
                  {framework.issues > 0 && (
                    <div className="text-xs text-slate-400">{framework.issues} issues</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Projects Health & Team Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* What projects are healthy? */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Repository Health</h3>
            </div>
            <Link to="/repositories" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
          </div>
          {attackSurface ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-emerald-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-emerald-400">{(attackSurface.total_assets || 0) - attackSurface.unpatched}</div>
                  <div className="text-xs text-slate-500">Healthy</div>
                </div>
                <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-amber-400">{attackSurface.unpatched}</div>
                  <div className="text-xs text-slate-500">Needs Scan</div>
                </div>
                <div className="text-center p-3 bg-slate-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-slate-300">{attackSurface.total_assets}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${attackSurface.total_assets > 0 ? (((attackSurface.total_assets - attackSurface.unpatched) / attackSurface.total_assets) * 100) : 0}%` }}
                />
              </div>
              {attackSurface.unpatched > 0 && (
                <Link to="/repositories?filter=unscanned" className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                  {attackSurface.unpatched} repositories haven't been scanned in 7+ days
                  <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Cloud className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No repositories connected</p>
              <Link to="/repositories?connect=true" className="text-sm text-blue-400 hover:text-blue-300 mt-1 inline-block">Connect your first repository</Link>
            </div>
          )}
        </div>

        {/* Which teams need attention? */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-200">Team Health</h3>
            </div>
            <Link to="/teams" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
          </div>
          {teamHealth.length > 0 ? (
            <div className="space-y-2">
              {teamHealth.map((team) => {
                const healthConfig = {
                  healthy: { icon: ThumbsUp, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                  attention: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-400/10' },
                  critical: { icon: ThumbsDown, color: 'text-red-400', bg: 'bg-red-400/10' },
                }
                const config = healthConfig[team.health]
                const Icon = config.icon
                return (
                  <div key={team.team_name} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config.bg}`}>
                      <Icon className={`w-4 h-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200">{team.team_name}</div>
                      <div className="text-xs text-slate-500">{team.open_findings} open · {team.resolved_week} resolved this week</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-slate-300">{team.mttr_hours}h</div>
                      <div className="text-xs text-slate-500">MTTR</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No teams configured</p>
              <Link to="/teams" className="text-sm text-blue-400 hover:text-blue-300 mt-1 inline-block">Set up your teams</Link>
            </div>
          )}
        </div>
      </div>

      {/* Top Risks & AI Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Highest Risk Findings */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-slate-200">Highest Risk Findings</h3>
            </div>
            <Link to="/findings" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
          </div>
          {topRisks.length > 0 ? (
            <div className="space-y-2">
              {topRisks.slice(0, 5).map((f, i) => (
                <Link key={f.id} to={`/findings?highlight=${f.id}`} className="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-lg transition-colors group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                    f.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    f.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    f.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{f.title}</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono">{f.file_path?.split('/').pop()}</span>
                      {f.line_start && <span>:{f.line_start}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold font-mono text-white">{Math.round(f.risk_score || 0)}</div>
                    <div className="text-xs text-slate-500">risk</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-slate-500">No critical findings. Great job!</p>
            </div>
          )}
        </div>

        {/* AI Recommendations Pending */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-200">AI Recommendations</h3>
            </div>
            <Link to="/ai-center" className="text-xs text-blue-400 hover:text-blue-300">AI Center</Link>
          </div>
          {aiRecommendations.length > 0 ? (
            <div className="space-y-2">
              {aiRecommendations.slice(0, 5).map((rec) => (
                <Link key={rec.id} to={`/findings?highlight=${rec.id}`} className="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-lg transition-colors group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">{rec.title}</div>
                    <div className="text-xs text-slate-500">AI remediation available</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    rec.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                    rec.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-slate-500/20 text-slate-400'
                  }`}>
                    {rec.severity}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center">
              <Brain className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No pending AI recommendations</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Findings', value: stats.total, icon: Shield, color: 'text-slate-300' },
          { label: 'Critical', value: stats.critical, icon: TriangleAlert, color: 'text-red-400' },
          { label: 'High', value: stats.high, icon: AlertTriangle, color: 'text-orange-400' },
          { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Repositories', value: attackSurface?.total_assets || 0, icon: GitBranch, color: 'text-blue-400' },
          { label: 'Scans', value: recent.length, icon: Play, color: 'text-purple-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4 text-center">
            <Icon className={`w-5 h-5 mx-auto mb-2 ${color}`} />
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
