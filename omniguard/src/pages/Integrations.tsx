import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'
import { Globe, GitFork as Github, GitBranch, MessageSquare, CircleCheck as CheckCircle2, TriangleAlert as AlertTriangle, Circle as XCircle, ChevronRight, RefreshCw, ExternalLink, Settings, Zap, Key, BookOpen, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'

interface Integration {
  id: string
  provider: string
  status: 'active' | 'inactive' | 'error'
  connected_at: string
  last_sync?: string
  config?: Record<string, any>
}

const AVAILABLE_INTEGRATIONS = [
  {
    provider: 'github',
    name: 'GitHub',
    description: 'Connect repositories, enable PR scanning, and receive webhook events',
    icon: Github,
    category: 'Source Control',
    docs: 'https://docs.omniguard.io/integrations/github',
  },
  {
    provider: 'gitlab',
    name: 'GitLab',
    description: 'Sync repositories and enable automated security scanning',
    icon: GitBranch,
    category: 'Source Control',
    docs: 'https://docs.omniguard.io/integrations/gitlab',
  },
  {
    provider: 'jira',
    name: 'Jira',
    description: 'Automatically create issues for security findings',
    icon: MessageSquare,
    category: 'Issue Tracking',
    docs: 'https://docs.omniguard.io/integrations/jira',
  },
  {
    provider: 'slack',
    name: 'Slack',
    description: 'Receive security alerts and notifications in Slack channels',
    icon: MessageSquare,
    category: 'Notifications',
    docs: 'https://docs.omniguard.io/integrations/slack',
  },
  {
    provider: 'linear',
    name: 'Linear',
    description: 'Create Linear issues for security findings and track remediation',
    icon: Layers,
    category: 'Issue Tracking',
    docs: 'https://docs.omniguard.io/integrations/linear',
  },
]

export function Integrations() {
  const { currentOrganizationId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    if (!currentOrganizationId) return

    async function fetchIntegrations() {
      setLoading(true)
      const { data } = await supabase
        .from('integrations')
        .select('*')
        .eq('organization_id', currentOrganizationId)
      setIntegrations(data || [])
      setLoading(false)
    }

    fetchIntegrations()
  }, [currentOrganizationId])

  const getIntegrationStatus = (provider: string) => {
    const int = integrations.find(i => i.provider === provider)
    return int?.status || 'inactive'
  }

  const categories = ['all', ...new Set(AVAILABLE_INTEGRATIONS.map(i => i.category))]

  const filteredIntegrations = AVAILABLE_INTEGRATIONS.filter(
    i => selectedCategory === 'all' || i.category === selectedCategory
  )

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Integrations</h1>
          <p className="text-slate-400 mt-1">Connect OmniGuard with your tools and workflows</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/30'
                    : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {cat === 'all' ? 'All Integrations' : cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIntegrations.map((integration) => {
              const status = getIntegrationStatus(integration.provider)
              const Icon = integration.icon
              const statusConfig = {
                active: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Connected' },
                inactive: { icon: XCircle, color: 'text-slate-500', bg: 'bg-slate-500/10', label: 'Not Connected' },
                error: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Error' },
              }
              const config = statusConfig[status as keyof typeof statusConfig]
              const StatusIcon = config.icon

              return (
                <div key={integration.provider} className="card p-5 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-slate-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-200">{integration.name}</div>
                        <div className="text-xs text-slate-500">{integration.category}</div>
                      </div>
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${config.bg}`}>
                      <StatusIcon className={`w-3 h-3 ${config.color}`} />
                      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-400 mb-4">{integration.description}</p>

                  <div className="flex items-center gap-2">
                    {status === 'active' ? (
                      <>
                        <Link
                          to={`/integrations/${integration.provider}`}
                          className="flex-1 btn-secondary text-sm py-2 justify-center"
                        >
                          <Settings className="w-4 h-4" />
                          Configure
                        </Link>
                        <a
                          href={integration.docs}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm py-2"
                        >
                          <BookOpen className="w-4 h-4" />
                        </a>
                      </>
                    ) : (
                      <>
                        <Link
                          to={`/integrations/${integration.provider}?setup=true`}
                          className="flex-1 btn-primary text-sm py-2 justify-center"
                        >
                          <Zap className="w-4 h-4" />
                          Connect
                        </Link>
                        <a
                          href={integration.docs}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary text-sm py-2"
                        >
                          <BookOpen className="w-4 h-4" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card p-6 bg-gradient-to-r from-slate-900 to-slate-800">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Globe className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold text-white">Need a custom integration?</div>
                <p className="text-sm text-slate-400">Contact us to discuss your specific integration requirements.</p>
              </div>
              <Link to="/settings?tab=Support" className="btn-primary">
                Contact Support
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
