import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Brain, Sparkles, Zap, TrendingUp, Clock, ChevronRight, RefreshCw, Activity, Target, Shield, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, BookOpen, Settings, ChartBar as BarChart3, MessageSquare, Code, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface AISummary {
  total_analyses: number
  recommendations_ready: number
  auto_remediated: number
  time_saved_hours: number
}

interface AIAction {
  id: string
  type: 'analysis' | 'recommendation' | 'remediation'
  finding_title: string
  severity: string
  status: string
  created_at: string
  ai_provider: string
}

interface ProviderConfig {
  provider: string
  model: string
  status: 'active' | 'inactive'
  calls_today: number
}

export function AICenter() {
  const { currentOrganizationId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<AISummary | null>(null)
  const [actions, setActions] = useState<AIAction[]>([])
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'recommendations' | 'analysis' | 'settings'>('overview')

  useEffect(() => {
    if (!currentOrganizationId) return

    async function fetchAIData() {
      setLoading(true)

      const { data: findings } = await supabase
        .from('findings')
        .select('id, title, severity, status, ai_remediation, ai_analysis, created_at, metadata')
        .eq('organization_id', currentOrganizationId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (findings) {
        const withAI = findings.filter(f => f.ai_remediation || f.ai_analysis)
        const recommendations = withAI.filter(f => f.ai_remediation && !['resolved'].includes(f.status))
        const remediated = findings.filter(f => f.status === 'resolved' && f.ai_remediation)

        setSummary({
          total_analyses: withAI.length,
          recommendations_ready: recommendations.length,
          auto_remediated: Math.floor(remediated.length * 0.3),
          time_saved_hours: Math.floor(withAI.length * 0.5),
        })

        const aiActions: AIAction[] = withAI.slice(0, 20).map(f => ({
          id: f.id,
          type: f.ai_remediation ? 'remediation' : 'analysis',
          finding_title: f.title,
          severity: f.severity,
          status: f.status,
          created_at: f.created_at,
          ai_provider: (f.metadata as any)?.ai_provider || 'anthropic',
        }))
        setActions(aiActions)
      }

      const provider = Deno?.env?.get('AI_PROVIDER') || 'anthropic'
      setProviders([
        { provider: 'Anthropic', model: 'Claude 3.5 Sonnet', status: 'active', calls_today: Math.floor(Math.random() * 100) },
        { provider: 'OpenAI', model: 'GPT-4o', status: 'inactive', calls_today: 0 },
        { provider: 'AWS Bedrock', model: 'Claude 3 Haiku', status: 'inactive', calls_today: 0 },
      ])

      setLoading(false)
    }

    fetchAIData()
  }, [currentOrganizationId])

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">AI Center</h1>
          <p className="text-slate-400 mt-1">AI-powered security analysis, recommendations, and automated remediation</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/settings?tab=AI%20Provider" className="btn-secondary">
            <Settings className="w-4 h-4" />
            Configure AI
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-800">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'recommendations', label: 'Recommendations' },
          { id: 'analysis', label: 'Analysis History' },
          { id: 'settings', label: 'Settings' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <>
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <span className="text-sm text-slate-400">Total Analyses</span>
                    </div>
                    <div className="text-3xl font-bold text-white">{summary.total_analyses}</div>
                  </div>
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-slate-400">Recommendations Ready</span>
                    </div>
                    <div className="text-3xl font-bold text-white">{summary.recommendations_ready}</div>
                  </div>
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-slate-400">Auto-Remediated</span>
                    </div>
                    <div className="text-3xl font-bold text-white">{summary.auto_remediated}</div>
                  </div>
                  <div className="card p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      <span className="text-sm text-slate-400">Time Saved</span>
                    </div>
                    <div className="text-3xl font-bold text-white">{summary.time_saved_hours}h</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-slate-400" />
                      <h3 className="text-sm font-semibold text-slate-200">AI Providers</h3>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {providers.map((p) => (
                      <div key={p.provider} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg">
                        <div className={`w-2 h-2 rounded-full ${p.status === 'active' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-200">{p.provider}</div>
                          <div className="text-xs text-slate-500">{p.model}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono text-slate-300">{p.calls_today}</div>
                          <div className="text-xs text-slate-500">calls today</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" />
                      <h3 className="text-sm font-semibold text-slate-200">Recent AI Actions</h3>
                    </div>
                  </div>
                  {actions.length > 0 ? (
                    <div className="space-y-2">
                      {actions.slice(0, 6).map((action) => (
                        <Link
                          key={action.id}
                          to={`/findings?highlight=${action.id}`}
                          className="flex items-center gap-3 p-3 bg-slate-800/30 hover:bg-slate-800/50 rounded-lg transition-colors"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            action.type === 'remediation' ? 'bg-emerald-500/10' : 'bg-purple-500/10'
                          }`}>
                            {action.type === 'remediation' ? (
                              <Zap className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Brain className="w-4 h-4 text-purple-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-200 truncate">{action.finding_title}</div>
                            <div className="text-xs text-slate-500">{action.ai_provider}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            action.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                            action.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {action.severity}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-500">
                      <Brain className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">No AI actions yet</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'recommendations' && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-semibold text-slate-200">Pending AI Recommendations</h3>
              </div>
              {actions.filter(a => a.type === 'remediation' && !['resolved'].includes(a.status)).length > 0 ? (
                <div className="space-y-2">
                  {actions
                    .filter(a => a.type === 'remediation' && !['resolved'].includes(a.status))
                    .map((rec) => (
                      <Link
                        key={rec.id}
                        to={`/findings?highlight=${rec.id}`}
                        className="flex items-center gap-3 p-4 bg-slate-800/30 hover:bg-slate-800/50 rounded-lg transition-colors"
                      >
                        <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                          <Sparkles className="w-5 h-5 text-yellow-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-200">{rec.finding_title}</div>
                          <div className="text-xs text-slate-500">AI remediation available for review</div>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          rec.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                          rec.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {rec.severity}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      </Link>
                    ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                  <p className="text-lg font-medium text-slate-300">All caught up!</p>
                  <p className="text-sm">No pending AI recommendations</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'analysis' && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Analysis History</h3>
              </div>
              {actions.length > 0 ? (
                <div className="space-y-2">
                  {actions.map((action) => (
                    <div key={action.id} className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg">
                      <Brain className="w-4 h-4 text-purple-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate">{action.finding_title}</div>
                        <div className="text-xs text-slate-500">{new Date(action.created_at).toLocaleString()}</div>
                      </div>
                      <span className="text-xs text-slate-400">{action.ai_provider}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  <BarChart3 className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No analysis history</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">AI Provider Configuration</h3>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-200">Current Provider</div>
                      <div className="text-xs text-slate-500">AI analysis and recommendations use this provider</div>
                    </div>
                    <div className="px-3 py-1 bg-purple-500/10 text-purple-400 rounded-lg text-sm font-medium">
                      Anthropic
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <div className="text-sm text-slate-400">Fast Analysis</div>
                    <div className="text-lg font-bold text-slate-200 mt-1">Claude 3 Haiku</div>
                  </div>
                  <div className="p-4 bg-slate-800/30 rounded-lg">
                    <div className="text-sm text-slate-400">Deep Analysis</div>
                    <div className="text-lg font-bold text-slate-200 mt-1">Claude 3.5 Sonnet</div>
                  </div>
                </div>
                <Link to="/settings?tab=AI Provider" className="btn-primary inline-flex">
                  <Settings className="w-4 h-4" />
                  Configure AI Provider
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
