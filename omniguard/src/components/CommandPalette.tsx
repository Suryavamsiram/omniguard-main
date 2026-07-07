import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Command, Search, LayoutDashboard, GitBranch, Shield, FileText, Settings, Users, Key, History, Bell, Building2, Scan, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, Clock, Activity, Lock, Cloud, Terminal, BookOpen, ChartBar as BarChart3, Zap, Globe, Layers, Package, Bug, Server, FileCode, Database, ArrowRight, Command as CommandIcon, Keyboard } from 'lucide-react'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: any
  path?: string
  action?: () => void
  category: string
  keywords?: string[]
  shortcut?: string
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()

  const commands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'dashboard', label: 'Dashboard', description: 'Security overview and posture', icon: LayoutDashboard, path: '/', category: 'Navigation', keywords: ['home', 'main', 'overview'] },
    { id: 'repositories', label: 'Repositories', description: 'Manage connected repositories', icon: GitBranch, path: '/repositories', category: 'Navigation', keywords: ['repos', 'github', 'gitlab'] },
    { id: 'findings', label: 'Findings', description: 'Security findings and vulnerabilities', icon: Shield, path: '/findings', category: 'Navigation', keywords: ['issues', 'vulnerabilities', 'alerts'] },
    { id: 'scans', label: 'Scans', description: 'Scan history and status', icon: Activity, path: '/scans', category: 'Navigation', keywords: ['jobs', 'tasks', 'running'] },
    { id: 'policies', label: 'Policies', description: 'Security policies and rules', icon: FileText, path: '/policies', category: 'Navigation', keywords: ['rules', 'compliance'] },
    { id: 'compliance', label: 'Compliance', description: 'Compliance frameworks and status', icon: CheckCircle2, path: '/compliance', category: 'Navigation', keywords: ['soc2', 'iso27001', 'hipaa', 'pci'] },
    { id: 'teams', label: 'Teams', description: 'Manage teams and members', icon: Users, path: '/teams', category: 'Navigation', keywords: ['members', 'users'] },
    { id: 'settings', label: 'Settings', description: 'Organization settings', icon: Settings, path: '/settings', category: 'Navigation', keywords: ['config', 'preferences'] },
    { id: 'audit-logs', label: 'Audit Logs', description: 'Activity history', icon: History, path: '/audit-logs', category: 'Navigation', keywords: ['logs', 'history'] },

    // Actions
    { id: 'new-scan', label: 'New Scan', description: 'Start a new security scan', icon: Scan, path: '/scans?new=true', category: 'Actions', keywords: ['run', 'start'], shortcut: 'S' },
    { id: 'new-repo', label: 'Connect Repository', description: 'Add a new repository', icon: GitBranch, path: '/repositories?connect=true', category: 'Actions', keywords: ['add', 'github'] },
    { id: 'new-policy', label: 'Create Policy', description: 'Define a new security policy', icon: FileText, path: '/policies?new=true', category: 'Actions', keywords: ['rule', 'add'] },
    { id: 'invite-member', label: 'Invite Member', description: 'Invite a team member', icon: Users, path: '/teams?invite=true', category: 'Actions', keywords: ['team', 'user'] },

    // Quick Filters
    { id: 'critical-findings', label: 'Critical Findings', description: 'View all critical issues', icon: AlertTriangle, path: '/findings?severity=critical', category: 'Quick Filters', keywords: ['urgent', 'high risk'] },
    { id: 'open-findings', label: 'Open Findings', description: 'View all open issues', icon: Shield, path: '/findings?status=open', category: 'Quick Filters', keywords: ['unresolved'] },
    { id: 'recent-scans', label: 'Recent Scans', description: 'View latest scan results', icon: Clock, path: '/scans?filter=recent', category: 'Quick Filters' },

    // Settings
    { id: 'api-keys', label: 'API Keys', description: 'Manage API keys', icon: Key, path: '/settings?tab=API Keys', category: 'Settings', keywords: ['tokens'] },
    { id: 'integrations', label: 'Integrations', description: 'Manage integrations', icon: Globe, path: '/settings?tab=Integrations', category: 'Settings', keywords: ['github', 'slack', 'jira'] },
    { id: 'ai-provider', label: 'AI Provider', description: 'Configure AI provider', icon: Zap, path: '/settings?tab=AI Provider', category: 'Settings', keywords: ['anthropic', 'openai'] },
    { id: 'notifications', label: 'Notifications', description: 'Manage notifications', icon: Bell, path: '/settings?tab=Notifications', category: 'Settings' },

    // Documentation
    { id: 'docs-api', label: 'API Documentation', description: 'API reference and guides', icon: BookOpen, path: 'https://docs.omniguard.io/api', category: 'Help', keywords: ['reference', 'endpoints'] },
    { id: 'docs-scanners', label: 'Scanner Documentation', description: 'Scanner configuration guides', icon: Bug, path: 'https://docs.omniguard.io/scanners', category: 'Help', keywords: ['sast', 'secrets'] },
  ], [])

  const filteredCommands = useMemo(() => {
    if (!query) return commands

    const lowerQuery = query.toLowerCase()
    return commands.filter(cmd => {
      const matchesLabel = cmd.label.toLowerCase().includes(lowerQuery)
      const matchesDesc = cmd.description?.toLowerCase().includes(lowerQuery)
      const matchesKeywords = cmd.keywords?.some(k => k.includes(lowerQuery))
      const matchesCategory = cmd.category.toLowerCase().includes(lowerQuery)
      return matchesLabel || matchesDesc || matchesKeywords || matchesCategory
    })
  }, [commands, query])

  // Group by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {}
    filteredCommands.forEach(cmd => {
      if (!groups[cmd.category]) groups[cmd.category] = []
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [filteredCommands])

  const handleSelect = useCallback((cmd: CommandItem) => {
    if (cmd.path) {
      if (cmd.path.startsWith('http')) {
        window.open(cmd.path, '_blank')
      } else {
        navigate(cmd.path)
      }
    }
    if (cmd.action) cmd.action()
    onClose()
    setQuery('')
  }, [navigate, onClose])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        setQuery('')
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = filteredCommands[selectedIndex]
        if (cmd) handleSelect(cmd)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredCommands, selectedIndex, handleSelect, onClose])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Command Palette */}
      <div className="relative mx-auto max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <Search className="w-5 h-5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, pages, and actions..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-base"
            autoFocus
          />
          <kbd className="hidden md:flex items-center gap-1 px-2 py-1 bg-slate-800 rounded text-xs text-slate-400">
            <span>ESC</span>
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto py-2">
          {Object.entries(groupedCommands).map(([category, items]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {category}
              </div>
              {items.map((cmd, idx) => {
                const globalIndex = filteredCommands.indexOf(cmd)
                const isSelected = globalIndex === selectedIndex
                return (
                  <button
                    key={cmd.id}
                    onClick={() => handleSelect(cmd)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSelected ? 'bg-blue-600/20' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <cmd.icon className={`w-5 h-5 ${isSelected ? 'text-blue-400' : 'text-slate-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                        {cmd.label}
                      </div>
                      {cmd.description && (
                        <div className="text-xs text-slate-500 truncate">{cmd.description}</div>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className="px-2 py-0.5 bg-slate-800 rounded text-xs text-slate-400">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}

          {filteredCommands.length === 0 && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-sm text-slate-500">No results for "{query}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 bg-slate-900/50 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">↵</kbd>
              select
            </span>
          </div>
          <span>{filteredCommands.length} commands</span>
        </div>
      </div>
    </div>
  )
}

// Global Command Palette Trigger - add to Layout
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
      // Global slash command
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          setIsOpen(true)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }
}
