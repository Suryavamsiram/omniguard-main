#!/usr/bin/env node
/**
 * OmniGuard Enterprise CLI
 * Docker/GitHub/AWS CLI-style interface
 *
 * Commands:
 *   omniguard login [--sso] [--api-key] [--device-flow]
 *   omniguard logout
 *   omniguard init [--profile <name>]
 *   omniguard scan [files...] [--staged] [--fail-on <sev>] [--json|--yaml]
 *   omniguard watch [--interval <sec>]
 *   omniguard daemon start|stop|status|logs
 *   omniguard policies list|get|create|update
 *   omniguard findings list|get|suppress|resolve
 *   omniguard ai explain <finding-id>
 *   omniguard ai remediate <finding-id>
 *   omniguard doctor
 *   omniguard update [--check]
 *   omniguard status
 *   omniguard logs [--follow] [--tail <n>]
 *   omniguard configure set|get|list
 *   omniguard integrations list|connect|disconnect
 *   omniguard version
 */

'use strict'
const { execSync, spawnSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const http = require('http')
const readline = require('readline')
const crypto = require('crypto')

// ============================================================================
// Configuration & Profiles
// ============================================================================

const CONFIG_DIR = path.join(os.homedir(), '.omniguard')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials')
const LOG_FILE = path.join(CONFIG_DIR, 'omniguard.log')

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  }
}

function loadConfig() {
  ensureConfigDir()
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch {}
  return { profiles: {}, activeProfile: 'default' }
}

function saveConfig(config) {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

function getProfile(name) {
  const config = loadConfig()
  return config.profiles[name || config.activeProfile] || {}
}

function setProfile(name, data) {
  const config = loadConfig()
  config.profiles[name] = { ...config.profiles[name], ...data }
  saveConfig(config)
}

function getActiveProfile() {
  const config = loadConfig()
  return config.activeProfile || 'default'
}

function setActiveProfile(name) {
  const config = loadConfig()
  if (!config.profiles[name]) {
    throw new Error(`Profile '${name}' does not exist`)
  }
  config.activeProfile = name
  saveConfig(config)
}

// ============================================================================
// Credentials (Secure Storage)
// ============================================================================

function saveCredentials(profileName, apiKey, token) {
  ensureConfigDir()
  const credStore = path.join(CREDENTIALS_FILE, `${profileName}.cred`)
  const data = JSON.stringify({ apiKey, token, updated: new Date().toISOString() })
  fs.writeFileSync(credStore, data, { mode: 0o600 })
}

function loadCredentials(profileName) {
  try {
    const credStore = path.join(CREDENTIALS_FILE, `${profileName || getActiveProfile()}.cred`)
    if (fs.existsSync(credStore)) {
      return JSON.parse(fs.readFileSync(credStore, 'utf8'))
    }
  } catch {}
  return null
}

function deleteCredentials(profileName) {
  const credStore = path.join(CREDENTIALS_FILE, `${profileName}.cred`)
  if (fs.existsSync(credStore)) {
    fs.unlinkSync(credStore)
  }
}

// ============================================================================
// Output Formatting
// ============================================================================

const args = process.argv.slice(2)
const jsonOutput = args.includes('--json') || args.includes('-j')
const yamlOutput = args.includes('--yaml') || args.includes('-y')
const quietMode = args.includes('--quiet') || args.includes('-q')
const verboseMode = args.includes('--verbose') || args.includes('-v')
const noColor = args.includes('--no-color') || process.env.NO_COLOR

function colors(c) {
  if (noColor || jsonOutput || yamlOutput) return (s) => s
  const m = { red: '\x1b[31m', orange: '\x1b[33m', yellow: '\x1b[33m', green: '\x1b[32m', blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m', reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', underline: '\x1b[4m' }
  return (s) => `${m[c] || ''}${s}${m.reset}`
}
const red = colors('red'), orange = colors('orange'), yellow = colors('yellow'), green = colors('green')
const blue = colors('blue'), cyan = colors('cyan'), magenta = colors('magenta')
const bold = colors('bold'), dim = colors('dim'), underline = colors('underline')

function output(data) {
  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2))
  } else if (yamlOutput) {
    console.log(require('yaml').stringify(data))
  } else if (!quietMode) {
    if (typeof data === 'string') {
      console.log(data)
    }
  }
}

function log(level, message) {
  if (quietMode) return
  const prefix = { error: red('✗'), warn: orange('!'), info: blue('ℹ'), success: green('✓'), debug: dim('⋅') }[level] || ''
  console.log(`${prefix} ${message}`)

  if (verboseMode || level === 'error') {
    const timestamp = new Date().toISOString()
    fs.appendFileSync(LOG_FILE, `[${timestamp}] [${level.toUpperCase()}] ${message}\n`)
  }
}

function table(rows, headers) {
  if (jsonOutput || yamlOutput) return
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || '').length)))
  console.log(dim(headers.map((h, i) => h.padEnd(widths[i])).join('  ')))
  rows.forEach(row => {
    console.log(row.map((cell, i) => String(cell || '').padEnd(widths[i])).join('  '))
  })
}

// ============================================================================
// Progress Indicator
// ============================================================================

class Progress {
  constructor(total, label = 'Processing') {
    this.total = total
    this.current = 0
    this.label = label
    this.startTime = Date.now()
  }

  update(inc = 1) {
    this.current += inc
    if (!quietMode && !jsonOutput && process.stdout.isTTY) {
      const pct = Math.round((this.current / this.total) * 100)
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1)
      process.stdout.write(`\r${blue('▸')} ${this.label} ${pct}% (${this.current}/${this.total}) ${dim(`${elapsed}s`)}    `)
      if (this.current >= this.total) {
        process.stdout.write('\n')
      }
    }
  }
}

// ============================================================================
// HTTP Client
// ============================================================================

function getApiConfig() {
  const profile = getProfile(getActiveProfile())
  const creds = loadCredentials()
  return {
    url: profile.url || process.env.OMNIGUARD_URL || '',
    apiKey: creds?.apiKey || process.env.OMNIGUARD_API_KEY || '',
    token: creds?.token || '',
  }
}

function request(endpoint, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const { url, apiKey, token } = getApiConfig()
    if (!url) {
      reject(new Error('Not configured. Run `omniguard login` or set OMNIGUARD_URL.'))
      return
    }
    const fullUrl = `${url}${endpoint}`
    const u = new URL(fullUrl)
    const lib = u.protocol === 'https:' ? https : http
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': `OmniGuardCLI/${CLI_VERSION}`,
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    }
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers,
    }, (res) => {
      let data = ''
      res.on('data', (c) => data += c)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve({ ok: res.statusCode < 300, status: res.statusCode, body: json })
        } catch {
          resolve({ ok: false, status: res.statusCode, body: data })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

// ============================================================================
// Local Scanners (Offline Mode)
// ============================================================================

const SECRETS = [
  { id: 'SECRET-AWS-001', name: 'AWS Access Key ID', re: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g, sev: 'critical' },
  { id: 'SECRET-GITHUB-001', name: 'GitHub PAT', re: /gh[pousr]_[A-Za-z0-9_]{36,}/g, sev: 'critical' },
  { id: 'SECRET-OPENAI-001', name: 'OpenAI Key', re: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, sev: 'critical' },
  { id: 'SECRET-ANTHROPIC-001', name: 'Anthropic Key', re: /sk-ant-[A-Za-z0-9\-_]{95,}/g, sev: 'critical' },
  { id: 'SECRET-STRIPE-001', name: 'Stripe Live Key', re: /sk_live_[0-9a-zA-Z]{24,}/g, sev: 'critical' },
  { id: 'SECRET-SSH-001', name: 'SSH Private Key', re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, sev: 'critical' },
  { id: 'SECRET-DB-001', name: 'Database Credentials', re: /(postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s'"]{5,}/gi, sev: 'critical' },
  { id: 'SECRET-PASS-001', name: 'Hardcoded Password', re: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{8,})["']/gim, sev: 'high' },
]

const SAST = [
  { id: 'SAST-SQL-001', name: 'SQL Injection', re: /(?:execute|query)\s*\([^)]*(?:SELECT|INSERT|UPDATE|DELETE)[^)]*\+/gi, sev: 'critical' },
  { id: 'SAST-XSS-001', name: 'XSS via innerHTML', re: /\.innerHTML\s*[+]?=\s*[^"';\n]{1,80}(?:req\.|request\.|params\.|query\.|\$\{)/gm, sev: 'high' },
  { id: 'SAST-CMD-001', name: 'Command Injection', re: /\beval\s*\([^)]*(?:req\.|request\.|params\.|query\.)/gi, sev: 'critical' },
  { id: 'SAST-SSRF-001', name: 'SSRF', re: /(?:fetch|axios\.get)\s*\([^)]*(?:req\.|request\.|params\.|query\.)/gi, sev: 'critical' },
]

function mask(v) { return v.length <= 8 ? '****' : v.slice(0, 4) + '****' + v.slice(-4) }

function localScan(filePath, content) {
  const findings = []
  const lines = content.split('\n')
  const scanners = [...SECRETS, ...SAST]

  for (const r of scanners) {
    r.re.lastIndex = 0
    let m
    const seen = new Set()
    while ((m = r.re.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length
      if (seen.has(line)) continue
      seen.add(line)
      const lineText = lines[line - 1]?.trim() || ''
      if (/^\s*(\/\/|#|\*)/.test(lineText)) continue
      if (/(?:test|example|sample|placeholder|changeme|your[-_])/i.test(m[0])) continue
      findings.push({
        scanner: SECRETS.includes(r) ? 'secret' : 'sast',
        rule_id: r.id,
        severity: r.sev,
        title: `${r.name} detected`,
        evidence: mask(m[0]),
        file_path: filePath,
        line_start: line,
        confidence: 0.9,
      })
    }
  }
  return findings
}

// ============================================================================
// File Discovery
// ============================================================================

function getStagedFiles() {
  try {
    return execSync('git diff --cached --name-only', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .split('\n')
      .filter(f => f.trim() && !f.includes('node_modules') && !f.includes('.git/'))
  } catch { return [] }
}

function getAllTrackedFiles(dir = '.') {
  try {
    return execSync('git ls-files', { encoding: 'utf8', cwd: dir })
      .split('\n')
      .filter(f => f.trim())
  } catch {
    const exts = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rb', '.php', '.cs', '.rs', '.env', '.yaml', '.yml', '.json'])
    const files = []
    function walk(d) {
      if (!fs.existsSync(d)) return
      for (const entry of fs.readdirSync(d)) {
        const full = path.join(d, entry)
        const stat = fs.statSync(full)
        if (stat.isDirectory() && !['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv'].includes(entry)) {
          walk(full)
        } else if (exts.has(path.extname(entry))) {
          files.push(full)
        }
      }
    }
    walk(dir)
    return files
  }
}

// ============================================================================
// Commands
// ============================================================================

const CLI_VERSION = '1.0.0'

const commands = {
  // Authentication
  async login(cmdArgs) {
    const sso = cmdArgs.includes('--sso')
    const apiKeyMode = cmdArgs.includes('--api-key')
    const deviceFlow = cmdArgs.includes('--device-flow')
    const profileIdx = cmdArgs.indexOf('--profile')
    const profileName = profileIdx > -1 ? cmdArgs[profileIdx + 1] : 'default'

    log('info', `Logging in${profileName !== 'default' ? ` to profile '${profileName}'` : ''}...`)

    if (apiKeyMode) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const apiKey = await new Promise(resolve => rl.question('API Key: ', resolve))
      const url = await new Promise(resolve => rl.question('OmniGuard URL (e.g. https://xyz.supabase.co/functions/v1): ', resolve))
      rl.close()

      const profile = getProfile(profileName)
      setProfile(profileName, { ...profile, url })
      saveCredentials(profileName, apiKey.trim(), null)
      log('success', `Credentials saved to profile '${profileName}'`)
      return 0
    }

    if (sso) {
      log('info', 'Opening browser for SSO login...')
      const { url } = getApiConfig()
      const authUrl = `${url.replace('/functions/v1', '')}/auth/sso?cli=true&profile=${profileName}`
      spawnSync('open', [authUrl], { stdio: 'ignore' })
      log('info', 'Complete authentication in your browser. Then run: omniguard configure set token <your-token>')
      return 0
    }

    if (deviceFlow) {
      log('info', 'Device code flow...')
      const { url } = getApiConfig()
      try {
        const res = await request('/auth/device/start', { method: 'POST' }, { profile: profileName })
        if (res.ok && res.body.device_code) {
          log('info', `Enter code ${bold(res.body.user_code)} at ${res.body.verification_uri}`)
          log('info', 'Waiting for authentication...')

          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 2000))
            const pollRes = await request('/auth/device/poll', { method: 'POST' }, { device_code: res.body.device_code })
            if (pollRes.ok && pollRes.body.token) {
              saveCredentials(profileName, null, pollRes.body.token)
              log('success', 'Authentication complete!')
              return 0
            }
          }
          log('error', 'Authentication timed out')
          return 1
        }
      } catch (e) {
        log('error', e.message)
        return 1
      }
    }

    // Default: prompt for API key
    console.log(bold('\nOmniGuard Login\n'))
    console.log('Methods:')
    console.log('  --api-key      Authenticate with an API key (recommended for CI/CD)')
    console.log('  --sso          Authenticate via SSO (browser)')
    console.log('  --device-flow  Device authorization flow (headless)')
    console.log('\nExample: omniguard login --api-key --profile work\n')
    return 0
  },

  async logout(cmdArgs) {
    const profileIdx = cmdArgs.indexOf('--profile')
    const profileName = profileIdx > -1 ? cmdArgs[profileIdx + 1] : getActiveProfile()
    deleteCredentials(profileName)
    log('success', `Logged out from profile '${profileName}'`)
    return 0
  },

  async init(cmdArgs) {
    const profileIdx = cmdArgs.indexOf('--profile')
    const profileName = profileIdx > -1 ? cmdArgs[profileIdx + 1] : 'default'
    const cwd = process.cwd()

    log('info', `Initializing OmniGuard in ${cwd}...`)

    // Create .omniguard directory
    const omniDir = path.join(cwd, '.omniguard')
    if (!fs.existsSync(omniDir)) {
      fs.mkdirSync(omniDir, { recursive: true })
    }

    // Create config file
    const projectConfig = {
      profile: profileName,
      scanners: ['secret', 'sast', 'dependency', 'iac'],
      fail_on: 'critical',
      exclude: ['node_modules/**', 'dist/**', 'build/**', '.git/**'],
      created: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(omniDir, 'config.json'), JSON.stringify(projectConfig, null, 2))

    // Install git hooks
    if (fs.existsSync('.git')) {
      const hooksDir = path.join('.git', 'hooks')
      const preCommit = `#!/bin/sh
# OmniGuard pre-commit hook
npx omniguard scan --staged --fail-on critical
exit $?
`
      fs.writeFileSync(path.join(hooksDir, 'pre-commit'), preCommit, { mode: 0o755 })
      log('success', 'Git pre-commit hook installed')
    }

    log('success', 'Project initialized')
    console.log(dim(`\nCreated: ${omniDir}/config.json`))
    console.log('Run `omniguard scan` to start security scanning.\n')
    return 0
  },

  async scan(cmdArgs) {
    const staged = cmdArgs.includes('--staged')
    const failOnIdx = cmdArgs.indexOf('--fail-on')
    const failOn = failOnIdx > -1 ? cmdArgs[failOnIdx + 1] : 'critical'
    const filesArg = cmdArgs.filter(a => !a.startsWith('-') && !['staged', 'critical', 'high', 'medium', 'low', 'info'].includes(a))

    let files = staged ? getStagedFiles() : filesArg.length > 0 ? filesArg.flatMap(a => {
      if (fs.existsSync(a) && fs.statSync(a).isDirectory()) return getAllTrackedFiles(a)
      return fs.existsSync(a) ? [a] : []
    }) : getAllTrackedFiles()

    if (!files.length) {
      log('success', 'No files to scan')
      return 0
    }

    if (!quietMode && !jsonOutput) {
      console.log(blue(`\n  OmniGuard Security Scan`))
      console.log(dim(`  ${files.length} files │ profile: ${getActiveProfile()}\n`))
    }

    const progress = new Progress(files.length, 'Scanning')
    const allFindings = []

    for (const f of files) {
      let content
      try { content = fs.readFileSync(f, 'utf8') } catch { progress.update(); continue }
      if (!content.trim()) { progress.update(); continue }

      // Try remote scan
      const { url, apiKey } = getApiConfig()
      if (url && apiKey) {
        try {
          const res = await request('/scan-quick', { method: 'POST' }, { path: f, content })
          if (res.ok && res.body.findings) {
            allFindings.push(...res.body.findings)
            progress.update()
            continue
          }
        } catch {}
      }

      // Local scan
      allFindings.push(...localScan(f, content))
      progress.update()
    }

    // Filter by severity
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
    const threshold = severityOrder[failOn] || 4
    const activeFindings = allFindings.filter(f => (severityOrder[f.severity] || 0) >= threshold)

    if (jsonOutput) {
      output({ findings: allFindings, total: allFindings.length, files_scanned: files.length })
      return activeFindings.length > 0 ? 1 : 0
    }

    if (activeFindings.length === 0) {
      console.log(green('\n✓ No security issues found\n'))
      return 0
    }

    // Print findings
    console.log(red(`\n⚠ Found ${activeFindings.length} security issue${activeFindings.length > 1 ? 's' : ''}:\n`))

    const severityColors = { critical: red, high: orange, medium: yellow, low: dim, info: dim }
    for (const f of activeFindings.sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))) {
      const color = severityColors[f.severity] || dim
      console.log(`  ${color(`[${f.severity.toUpperCase()}]`)} ${bold(f.title)}`)
      console.log(`    ${dim('File:')} ${f.file_path}:${f.line_start}  ${dim('Rule:')} ${f.rule_id}`)
      if (f.evidence) console.log(`    ${dim('Evidence:')} ${f.evidence}`)
      console.log()
    }

    const summary = {
      critical: activeFindings.filter(f => f.severity === 'critical').length,
      high: activeFindings.filter(f => f.severity === 'high').length,
      medium: activeFindings.filter(f => f.severity === 'medium').length,
    }

    console.log(`  Summary: ${summary.critical > 0 ? red(`${summary.critical} critical`) : ''}${summary.high > 0 ? ` ${orange(`${summary.high} high`)}` : ''}${summary.medium > 0 ? ` ${yellow(`${summary.medium} medium`)}` : ''}`)

    if (activeFindings.some(f => (severityOrder[f.severity] || 0) >= threshold)) {
      console.log(red(`\n  Scan failed (--fail-on ${failOn})\n`))
      return 1
    }

    return 0
  },

  async watch(cmdArgs) {
    const intervalIdx = cmdArgs.indexOf('--interval')
    const interval = intervalIdx > -1 ? parseInt(cmdArgs[intervalIdx + 1]) || 5 : 5

    console.log(bold('\nOmniguard Watch Mode\n'))
    console.log(dim(`Watching for file changes every ${interval}s. Press Ctrl+C to stop.\n`))

    const watchedFiles = new Set()
    let lastScan = Date.now()

    async function scan() {
      console.log(blue(`\n${new Date().toLocaleTimeString()} - Scanning...`))
      await commands.scan(['--json', ...cmdArgs.filter(a => !a.startsWith('--interval'))])
    }

    // Initial scan
    await scan()

    // Watch loop
    const intervalId = setInterval(async () => {
      const files = getAllTrackedFiles()
      let changed = false
      for (const f of files) {
        try {
          const stat = fs.statSync(f)
          if (stat.mtimeMs > lastScan) {
            changed = true
            break
          }
        } catch {}
      }
      if (changed) {
        lastScan = Date.now()
        await scan()
      }
    }, interval * 1000)

    process.on('SIGINT', () => {
      clearInterval(intervalId)
      console.log(dim('\nWatch mode stopped.\n'))
      process.exit(0)
    })
  },

  async daemon(cmdArgs) {
    const [action, ...rest] = cmdArgs.filter(a => !a.startsWith('-'))

    if (action === 'start') {
      log('info', 'Starting OmniGuard daemon...')
      const node = process.execPath
      const script = __filename
      const agent = spawn(node, [script, 'daemon', 'run'], { detached: true, stdio: 'ignore' })
      agent.unref()
      log('success', 'Daemon started')
      return 0
    }

    if (action === 'stop') {
      log('info', 'Stopping daemon...')
      try {
        if (fs.existsSync('/tmp/omniguard-daemon.pid')) {
          const pid = parseInt(fs.readFileSync('/tmp/omniguard-daemon.pid', 'utf8'))
          process.kill(pid, 'SIGTERM')
          fs.unlinkSync('/tmp/omniguard-daemon.pid')
          log('success', 'Daemon stopped')
        } else {
          log('warn', 'No daemon PID file found')
        }
      } catch (e) {
        log('error', e.message)
      }
      return 0
    }

    if (action === 'status') {
      try {
        if (fs.existsSync('/tmp/omniguard-daemon.pid')) {
          const pid = parseInt(fs.readFileSync('/tmp/omniguard-daemon.pid', 'utf8'))
          process.kill(pid, 0)
          console.log(green(`✓ Daemon running (PID: ${pid})`))
        } else {
          console.log(dim('● Daemon not running'))
        }
      } catch {
        console.log(dim('● Daemon not running'))
      }
      return 0
    }

    if (action === 'logs') {
      const follow = rest.includes('--follow') || rest.includes('-f')
      if (fs.existsSync(LOG_FILE)) {
        if (follow) {
          spawn('tail', ['-f', LOG_FILE], { stdio: 'inherit' })
        } else {
          console.log(fs.readFileSync(LOG_FILE, 'utf8'))
        }
      } else {
        console.log(dim('No logs found'))
      }
      return 0
    }

    if (action === 'run') {
      // Background daemon loop
      fs.writeFileSync('/tmp/omniguard-daemon.pid', String(process.pid))
      log('info', 'Daemon started')

      setInterval(async () => {
        await commands.scan(['--json', '--quiet'])
      }, 60000)

      return 0
    }

    console.log('Usage: omniguard daemon start|stop|status|logs')
    return 1
  },

  async policies(cmdArgs) {
    const [action, ...rest] = cmdArgs.filter(a => !a.startsWith('-'))

    if (action === 'list') {
      const { url, apiKey } = getApiConfig()
      if (!url || !apiKey) {
        log('error', 'Not configured. Run `omniguard login`.')
        return 1
      }

      const res = await request('/api-v1-policies')
      if (res.ok && res.body.data) {
        table(res.body.data.map(p => [p.id, p.name, p.severity, p.enabled ? '✓' : '✗']), ['ID', 'NAME', 'SEVERITY', 'ENABLED'])
      }
      return 0
    }

    console.log('Usage: omniguard policies list|get|create|update')
    return 1
  },

  async findings(cmdArgs) {
    const [action, id, ...rest] = cmdArgs.filter(a => !a.startsWith('-'))

    if (action === 'list') {
      const { url, apiKey } = getApiConfig()
      if (!url || !apiKey) {
        log('error', 'Not configured')
        return 1
      }

      const res = await request('/api-v1-findings')
      if (res.ok && res.body.data) {
        const severityColors = { critical: red, high: orange, medium: yellow, low: dim }
        table(res.body.data.slice(0, 20).map(f => [
          f.id.slice(0, 8),
          f.title.slice(0, 40),
          severityColors[f.severity](`[${f.severity.toUpperCase()}]`),
          f.status,
        ]), ['ID', 'TITLE', 'SEVERITY', 'STATUS'])
      }
      return 0
    }

    if (action === 'suppress' && id) {
      const reason = rest.join(' ') || 'Suppressed via CLI'
      const res = await request(`/api-v1-findings/${id}/suppress`, { method: 'POST' }, { reason })
      if (res.ok) {
        log('success', `Finding ${id} suppressed`)
      } else {
        log('error', res.body?.error || 'Failed to suppress')
      }
      return res.ok ? 0 : 1
    }

    if (action === 'resolve' && id) {
      const res = await request(`/api-v1-findings/${id}/resolve`, { method: 'POST' }, {})
      if (res.ok) {
        log('success', `Finding ${id} resolved`)
      } else {
        log('error', res.body?.error || 'Failed to resolve')
      }
      return res.ok ? 0 : 1
    }

    console.log('Usage: omniguard findings list|get <id>|suppress <id>|resolve <id>')
    return 1
  },

  async ai(cmdArgs) {
    const [action, id] = cmdArgs.filter(a => !a.startsWith('-'))

    if (action === 'explain' && id) {
      log('info', `Getting AI explanation for ${id}...`)
      const res = await request(`/api-v1-findings/${id}/ai/explain`, { method: 'POST' })
      if (res.ok && res.body.explanation) {
        console.log(bold('\nAI Explanation:\n'))
        console.log(res.body.explanation)
        console.log()
      } else {
        log('error', 'Failed to get explanation')
      }
      return res.ok ? 0 : 1
    }

    if (action === 'remediate' && id) {
      log('info', `Getting AI remediation for ${id}...`)
      const res = await request(`/api-v1-findings/${id}/ai/remediate`, { method: 'POST' })
      if (res.ok && res.body.remediation) {
        console.log(bold('\nAI Remediation:\n'))
        console.log(res.body.remediation)
        if (res.body.code) {
          console.log(dim('\nSuggested Code:'))
          console.log(res.body.code)
        }
        console.log()
      } else {
        log('error', 'Failed to get remediation')
      }
      return res.ok ? 0 : 1
    }

    console.log('Usage: omniguard ai explain <finding-id>|remediate <finding-id>')
    return 1
  },

  async doctor() {
    console.log(bold('\nOmniGuard Doctor\n'))
    const checks = []

    // Node version
    const nodeVersion = process.version
    checks.push(['Node.js', nodeVersion, true])

    // Config directory
    checks.push(['Config Dir', CONFIG_DIR, fs.existsSync(CONFIG_DIR)])

    // Configuration
    const config = loadConfig()
    checks.push(['Config File', fs.existsSync(CONFIG_FILE) ? 'present' : 'missing', fs.existsSync(CONFIG_FILE)])

    // Active profile
    checks.push(['Active Profile', getActiveProfile(), !!config.profiles[getActiveProfile()]])

    // API configuration
    const { url, apiKey } = getApiConfig()
    checks.push(['API URL', url ? 'configured' : 'not set', !!url])
    checks.push(['API Key', apiKey ? 'configured' : 'not set', !!apiKey])

    // Git
    let gitOk = false
    try { execSync('git --version', { stdio: 'pipe' }); gitOk = true } catch {}
    checks.push(['Git', gitOk ? 'installed' : 'not found', gitOk])

    table(checks, ['CHECK', 'VALUE', 'STATUS'])

    if (url && apiKey) {
      console.log(dim('\nTesting API connection...'))
      try {
        const res = await request('/api-v1-status')
        if (res.ok) {
          console.log(green('✓ API connection successful'))
          console.log(dim(`  Status: ${res.body.status}`))
          console.log(dim(`  AI Provider: ${res.body.checks?.ai?.provider || 'none'}`))
        } else {
          console.log(red(`✗ API returned ${res.status}`))
        }
      } catch (e) {
        console.log(red(`✗ Connection failed: ${e.message}`))
      }
    }

    console.log()
    return 0
  },

  async update(cmdArgs) {
    const checkOnly = cmdArgs.includes('--check')

    log('info', 'Checking for updates...')

    try {
      const res = await new Promise((resolve, reject) => {
        https.get('https://registry.npmjs.org/omniguard/latest', (res) => {
          let data = ''
          res.on('data', (c) => data += c)
          res.on('end', () => resolve(JSON.parse(data)))
        }).on('error', reject)
      })

      if (res.version === CLI_VERSION) {
        log('success', `Already up to date (v${CLI_VERSION})`)
      } else {
        console.log(yellow(`\n  Update available: v${CLI_VERSION} → v${res.version}\n`))
        if (!checkOnly) {
          console.log('Run: npm install -g omniguard@latest')
        }
      }
    } catch (e) {
      log('warn', 'Could not check for updates')
    }
    return 0
  },

  async status() {
    const { url, apiKey } = getApiConfig()
    if (!url || !apiKey) {
      console.log(orange('\n  OmniGuard not configured'))
      console.log(dim('\n  Run `omniguard login` to get started.\n'))
      return 1
    }

    try {
      const res = await request('/api-v1-status')
      if (res.ok) {
        console.log(green('\n✓ OmniGuard connected'))
        console.log(dim(`  Status: ${res.body.status}`))
        console.log(dim(`  Profile: ${getActiveProfile()}`))
        console.log(dim(`  AI: ${res.body.checks?.ai?.provider || 'none'}`))
        console.log(dim(`  Database: ${res.body.checks?.database?.status || 'unknown'}`))
        console.log()
      } else {
        log('error', `Connection failed (${res.status})`)
      }
    } catch (e) {
      log('error', e.message)
    }
    return 0
  },

  async logs(cmdArgs) {
    const follow = cmdArgs.includes('--follow') || cmdArgs.includes('-f')
    const tailIdx = cmdArgs.indexOf('--tail')
    const lines = tailIdx > -1 ? parseInt(cmdArgs[tailIdx + 1]) || 50 : 50

    if (fs.existsSync(LOG_FILE)) {
      if (follow) {
        spawn('tail', ['-f', '-n', String(lines), LOG_FILE], { stdio: 'inherit' })
      } else {
        console.log(execSync(`tail -n ${lines} "${LOG_FILE}"`, { encoding: 'utf8' }))
      }
    } else {
      console.log(dim('No logs found'))
    }
    return 0
  },

  async configure(cmdArgs) {
    const [action, key, value] = cmdArgs.filter(a => !a.startsWith('-'))

    if (action === 'set' && key && value) {
      const config = loadConfig()
      const profile = config.profiles[getActiveProfile()] || {}
      if (key === 'url') {
        profile.url = value
      } else if (key === 'token') {
        saveCredentials(getActiveProfile(), null, value)
        log('success', 'Token saved')
        return 0
      } else if (key === 'api-key') {
        saveCredentials(getActiveProfile(), value, null)
        log('success', 'API key saved')
        return 0
      } else {
        profile[key] = value
      }
      config.profiles[getActiveProfile()] = profile
      saveConfig(config)
      log('success', `${key} set`)
      return 0
    }

    if (action === 'get' && key) {
      const profile = getProfile()
      console.log(profile[key] || 'not set')
      return 0
    }

    if (action === 'list') {
      const config = loadConfig()
      console.log(bold('\nProfiles:\n'))
      for (const [name, profile] of Object.entries(config.profiles || {})) {
        const active = name === config.activeProfile ? green(' (active)') : ''
        console.log(`  ${name}${active}`)
        console.log(dim(`    URL: ${profile.url || 'not set'}`))
      }
      console.log()
      return 0
    }

    console.log('Usage: omniguard configure set <key> <value>|get <key>|list')
    return 1
  },

  async integrations(cmdArgs) {
    const [action, provider] = cmdArgs.filter(a => !a.startsWith('-'))

    if (action === 'list') {
      const res = await request('/enterprise-integrations')
      if (res.ok && res.body.data) {
        table(res.body.data.map(i => [i.provider, i.status, new Date(i.created_at).toLocaleDateString()]), ['PROVIDER', 'STATUS', 'CONNECTED'])
      }
      return 0
    }

    console.log('Usage: omniguard integrations list|connect <provider>|disconnect <provider>')
    return 1
  },

  version() {
    console.log(`OmniGuard CLI v${CLI_VERSION}`)
    console.log(dim(`Node.js ${process.version}`))
    console.log(dim(`Profile: ${getActiveProfile()}`))
    return 0
  },

  help() {
    console.log(bold('\nOmniGuard - AI-Powered DevSecOps Platform\n'))
    console.log('Usage: omniguard <command> [options]\n')
    console.log('Commands:')
    console.log('  login [--api-key|--sso|--device-flow]   Authenticate with OmniGuard')
    console.log('  logout [--profile <name>]               Sign out')
    console.log('  init [--profile <name>]                  Initialize project')
    console.log('  scan [files...] [--staged]               Run security scan')
    console.log('  watch [--interval <sec>]                 Watch mode')
    console.log('  daemon start|stop|status|logs            Manage background daemon')
    console.log('  policies list                            List security policies')
    console.log('  findings list|suppress|resolve           Manage findings')
    console.log('  ai explain|remediate <id>                AI-powered analysis')
    console.log('  doctor                                   Diagnostic check')
    console.log('  update [--check]                         Update CLI')
    console.log('  status                                   Connection status')
    console.log('  logs [--follow]                          View logs')
    console.log('  configure set|get|list                   Manage configuration')
    console.log('  integrations list                        List integrations')
    console.log('  version                                  Show version')
    console.log('  help                                     Show this help\n')
    console.log('Output Formats:')
    console.log('  --json        JSON output')
    console.log('  --yaml        YAML output')
    console.log('  --quiet, -q   Suppress output')
    console.log('  --verbose, -v Verbose logging\n')
    console.log('Profiles:')
    console.log('  --profile <name>   Use a specific profile')
    console.log('  omniguard configure list   List profiles\n')
    console.log('Environment Variables:')
    console.log('  OMNIGUARD_URL      API endpoint')
    console.log('  OMNIGUARD_API_KEY  API key\n')
    console.log('Documentation: https://docs.omniguard.io\n')
  },
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  const [cmd, ...cmdArgs] = args

  const commandMap = {
    login: commands.login,
    logout: commands.logout,
    init: commands.init,
    scan: commands.scan,
    watch: commands.watch,
    daemon: commands.daemon,
    policies: commands.policies,
    findings: commands.findings,
    ai: commands.ai,
    doctor: commands.doctor,
    update: commands.update,
    status: commands.status,
    logs: commands.logs,
    configure: commands.configure,
    integrations: commands.integrations,
    version: commands.version,
    help: commands.help,
    '--help': commands.help,
    '-h': commands.help,
  }

  const fn = commandMap[cmd]

  if (!fn) {
    if (cmd && !cmd.startsWith('-')) {
      log('error', `Unknown command: ${cmd}`)
    }
    commands.help()
    process.exit(cmd ? 1 : 0)
  }

  try {
    const result = await fn(cmdArgs)
    process.exit(typeof result === 'number' ? result : 0)
  } catch (e) {
    log('error', e.message)
    process.exit(1)
  }
}

main()
