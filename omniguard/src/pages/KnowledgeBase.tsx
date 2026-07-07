import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, Search, ChevronRight, FileText, Shield, Code, Lock, Bug,
  Key, Server, Cloud, Container, Database, Globe, Zap, ChevronDown,
  ExternalLink, Star, Clock, User
} from 'lucide-react'

interface Article {
  id: string
  title: string
  category: string
  description: string
  read_time: number
  tags: string[]
}

const CATEGORIES = [
  { id: 'all', label: 'All Articles' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'scanners', label: 'Scanners' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'policies', label: 'Policies' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'api', label: 'API Reference' },
]

const ARTICLES: Article[] = [
  {
    id: '1',
    title: 'Getting Started with OmniGuard',
    category: 'getting-started',
    description: 'Learn the basics of connecting repositories and running your first security scan.',
    read_time: 5,
    tags: ['quickstart', 'setup', 'beginner'],
  },
  {
    id: '2',
    title: 'Understanding Security Findings',
    category: 'getting-started',
    description: 'A comprehensive guide to interpreting and prioritizing security findings.',
    read_time: 8,
    tags: ['findings', 'triage', 'severity'],
  },
  {
    id: '3',
    title: 'Secret Scanning Best Practices',
    category: 'scanners',
    description: 'How to detect and remediate leaked secrets in your codebase effectively.',
    read_time: 6,
    tags: ['secrets', 'api-keys', 'credentials'],
  },
  {
    id: '4',
    title: 'SAST Configuration Guide',
    category: 'scanners',
    description: 'Configure static application security testing for your programming language.',
    read_time: 10,
    tags: ['sast', 'code-analysis', 'static'],
  },
  {
    id: '5',
    title: 'GitHub Integration Setup',
    category: 'integrations',
    description: 'Connect GitHub repositories and enable automated PR scanning.',
    read_time: 7,
    tags: ['github', 'pull-request', 'automation'],
  },
  {
    id: '6',
    title: 'Jira Integration for Issue Tracking',
    category: 'integrations',
    description: 'Automatically create Jira tickets for security findings.',
    read_time: 5,
    tags: ['jira', 'issue-tracking', 'workflow'],
  },
  {
    id: '7',
    title: 'Creating Custom Security Policies',
    category: 'policies',
    description: 'Define organization-specific security rules and enforcement.',
    read_time: 12,
    tags: ['policies', 'custom-rules', 'enforcement'],
  },
  {
    id: '8',
    title: 'SOC 2 Compliance with OmniGuard',
    category: 'compliance',
    description: 'Map OmniGuard controls to SOC 2 requirements and generate reports.',
    read_time: 15,
    tags: ['soc2', 'compliance', 'audit'],
  },
  {
    id: '9',
    title: 'API Authentication Guide',
    category: 'api',
    description: 'Secure API key management and authentication methods.',
    read_time: 6,
    tags: ['api', 'authentication', 'security'],
  },
  {
    id: '10',
    title: 'Webhook Configuration',
    category: 'api',
    description: 'Set up webhooks for real-time security event notifications.',
    read_time: 8,
    tags: ['webhooks', 'notifications', 'automation'],
  },
]

export function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null)

  const filteredArticles = ARTICLES.filter((article) => {
    const matchesCategory = activeCategory === 'all' || article.category === activeCategory
    const matchesSearch = !searchQuery ||
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesCategory && matchesSearch
  })

  const categoryIcon: Record<string, any> = {
    'getting-started': BookOpen,
    'scanners': Shield,
    'integrations': Globe,
    'policies': FileText,
    'compliance': Lock,
    'api': Code,
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Knowledge Base</h1>
          <p className="text-slate-400 mt-1">Documentation, guides, and best practices</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 flex-shrink-0">
          <div className="card p-4 sticky top-20">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm"
              />
            </div>
            <nav className="space-y-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex-1">
          <div className="mb-4 text-sm text-slate-500">
            {filteredArticles.length} articles found
          </div>

          <div className="space-y-3">
            {filteredArticles.map((article) => {
              const Icon = categoryIcon[article.category] || FileText
              const isExpanded = expandedArticle === article.id

              return (
                <div key={article.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedArticle(isExpanded ? null : article.id)}
                    className="w-full flex items-center gap-4 p-4 text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200">{article.title}</div>
                      <div className="text-xs text-slate-500 mt-1">{article.description}</div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {article.read_time} min
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-800">
                      <div className="flex flex-wrap gap-2 mb-3">
                        {article.tags.map((tag) => (
                          <span key={tag} className="px-2 py-0.5 bg-slate-800 text-slate-400 text-xs rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <p className="text-sm text-slate-400 mb-4">{article.description}</p>
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/knowledge-base/${article.id}`}
                          className="btn-primary text-sm py-1.5"
                        >
                          Read Article
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                        <button className="btn-secondary text-sm py-1.5">
                          <Star className="w-4 h-4" />
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {filteredArticles.length === 0 && (
              <div className="card p-12 text-center">
                <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                <p className="text-lg font-medium text-slate-300">No articles found</p>
                <p className="text-sm text-slate-500 mt-1">Try adjusting your search or filter</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6 bg-gradient-to-r from-slate-900 to-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Zap className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold text-white">Need more help?</div>
            <p className="text-sm text-slate-400">Contact our support team or join the community.</p>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://docs.omniguard.io" target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <ExternalLink className="w-4 h-4" />
              Full Docs
            </a>
            <Link to="/settings?tab=Support" className="btn-primary">
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
