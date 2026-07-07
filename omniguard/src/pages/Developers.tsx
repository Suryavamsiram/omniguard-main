import { useAuth } from '../hooks/useAuth'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Users, UserCheck, UserX, Shield, TriangleAlert, CircleCheck as CheckCircle2, Clock, ChevronRight, Search, ListFilter as Filter, TrendingUp, ChartBar as BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface Developer {
  id: string
  email: string
  first_name?: string
  last_name?: string
  open_findings: number
  resolved_week: number
  mttr_hours: number
  status: 'active' | 'blocked' | 'inactive'
}

export function Developers() {
  const { currentOrganizationId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'blocked' | 'active'>('all')

  useEffect(() => {
    if (!currentOrganizationId) return

    async function fetchDevelopers() {
      setLoading(true)

      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, profiles!inner(*)')
        .eq('organization_id', currentOrganizationId)
        .eq('status', 'active')

      const { data: findings } = await supabase
        .from('findings')
        .select('assigned_to, severity, status, created_at, resolved_at')
        .eq('organization_id', currentOrganizationId)

      if (members && findings) {
        const devData: Developer[] = members.map((m: any) => {
          const userFindings = findings.filter(f => f.assigned_to === m.user_id)
          const open = userFindings.filter(f => !['resolved', 'suppressed'].includes(f.status)).length
          const resolved = userFindings.filter(f => f.status === 'resolved').length
          const blocked = open > 5
          return {
            id: m.user_id,
            email: m.profiles?.email || 'unknown',
            first_name: m.profiles?.first_name,
            last_name: m.profiles?.last_name,
            open_findings: open,
            resolved_week: resolved,
            mttr_hours: 4.2,
            status: blocked ? 'blocked' : 'active',
          }
        })
        setDevelopers(devData)
      }

      setLoading(false)
    }

    fetchDevelopers()
  }, [currentOrganizationId])

  const filteredDevelopers = developers.filter((dev) => {
    const matchesSearch = !searchQuery ||
      dev.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `${dev.first_name} ${dev.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || dev.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const summary = {
    total: developers.length,
    active: developers.filter(d => d.status === 'active').length,
    blocked: developers.filter(d => d.status === 'blocked').length,
    totalFindings: developers.reduce((sum, d) => sum + d.open_findings, 0),
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Developers</h1>
          <p className="text-slate-400 mt-1">Security metrics and workload across your development team</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-400">Total Developers</span>
              </div>
              <div className="text-3xl font-bold text-white">{summary.total}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-slate-400">Active</span>
              </div>
              <div className="text-3xl font-bold text-emerald-400">{summary.active}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserX className="w-4 h-4 text-red-400" />
                <span className="text-sm text-slate-400">Blocked</span>
              </div>
              <div className="text-3xl font-bold text-red-400">{summary.blocked}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <TriangleAlert className="w-4 h-4 text-orange-400" />
                <span className="text-sm text-slate-400">Open Findings</span>
              </div>
              <div className="text-3xl font-bold text-white">{summary.totalFindings}</div>
            </div>
          </div>

          <div className="card p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search developers..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-500" />
                {(['all', 'active', 'blocked'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === status
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Developer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Open Findings</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Resolved (7d)</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">MTTR</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredDevelopers.map((dev) => {
                    const name = `${dev.first_name || ''} ${dev.last_name || ''}`.trim() || dev.email
                    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
                    return (
                      <tr key={dev.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                              {initials}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-slate-200">{name}</div>
                              <div className="text-xs text-slate-500">{dev.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            dev.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' :
                            dev.status === 'blocked' ? 'bg-red-400/10 text-red-400' :
                            'bg-slate-400/10 text-slate-400'
                          }`}>
                            {dev.status === 'active' && <CheckCircle2 className="w-3 h-3" />}
                            {dev.status === 'blocked' && <UserX className="w-3 h-3" />}
                            {dev.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-mono ${dev.open_findings > 5 ? 'text-red-400 font-bold' : 'text-slate-300'}`}>
                            {dev.open_findings}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">{dev.resolved_week}</td>
                        <td className="px-4 py-3 text-right font-mono text-slate-300">{dev.mttr_hours}h</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/findings?assignee=${dev.id}`}
                            className="text-slate-500 hover:text-slate-300"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredDevelopers.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                <Users className="w-12 h-12 mx-auto mb-3" />
                <p className="text-lg font-medium text-slate-300">No developers found</p>
                <p className="text-sm">Try adjusting your search or filter</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
