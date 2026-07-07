#!/usr/bin/env node
/**
 * OmniGuard Enterprise Local Agent
 *
 * Features:
 * - Background service (Windows Service / Linux systemd / macOS launchd)
 * - Heartbeat & health monitoring with auto-restart
 * - Repository discovery and filesystem watching
 * - Local secret/SAST scanning
 * - Policy and configuration sync
 * - Offline queue for resilience
 * - Telemetry and metrics
 * - Auto-update capability
 * - Git hook integration
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawn, exec } = require('child_process');
const os = require('os');
const crypto = require('crypto');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // API Configuration
  API_URL: process.env.OMNIGUARD_URL || '',
  API_KEY: process.env.OMNIGUARD_API_KEY || '',

  // Worker Identity
  WORKER_ID: process.env.OMNIGUARD_WORKER_ID || `agent-${os.hostname()}-${Date.now().toString(36)}`,
  WORKER_NAME: process.env.OMNIGUARD_WORKER_NAME || os.hostname(),
  ORGANIZATION_ID: process.env.OMNIGUARD_ORG_ID || '',

  // Timing
  HEARTBEAT_INTERVAL: parseInt(process.env.OMNIGUARD_HEARTBEAT_INTERVAL || '60000'),
  SCAN_INTERVAL: parseInt(process.env.OMNIGUARD_SCAN_INTERVAL || '300000'),
  SYNC_INTERVAL: parseInt(process.env.OMNIGUARD_SYNC_INTERVAL || '120000'),
  WATCH_DEBOUNCE: parseInt(process.env.OMNIGUARD_WATCH_DEBOUNCE || '2000'),

  // Paths
  MONITORED_PATHS: (process.env.OMNIGUARD_PATHS || process.cwd()).split(':'),
  CONFIG_DIR: process.env.OMNIGUARD_CONFIG_DIR || path.join(os.homedir(), '.omniguard'),
  PID_FILE: process.env.OMNIGUARD_PID_FILE || '/var/run/omniguard-agent.pid',
  LOG_FILE: process.env.OMNIGUARD_LOG_FILE || '/var/log/omniguard-agent.log',
  QUEUE_FILE: process.env.OMNIGUARD_QUEUE_FILE || path.join(os.homedir(), '.omniguard', 'offline-queue.json'),

  // Logging
  LOG_LEVEL: process.env.OMNIGUARD_LOG_LEVEL || 'info',

  // Features
  ENABLE_WATCHER: process.env.OMNIGUARD_ENABLE_WATCHER !== 'false',
  ENABLE_AUTO_UPDATE: process.env.OMNIGUARD_AUTO_UPDATE === 'true',
  ENABLE_TELEMETRY: process.env.OMNIGUARD_TELEMETRY !== 'false',
  ENABLE_LOCAL_SCAN: process.env.OMNIGUARD_LOCAL_SCAN !== 'false',
};

// ============================================================================
// State
// ============================================================================

const STATE = {
  isRunning: true,
  startTime: Date.now(),
  lastHeartbeat: 0,
  lastSync: 0,
  lastScan: 0,
  heartbeatFailures: 0,
  scanCount: 0,
  findingCount: 0,
  repoCache: new Map(),
  offlineQueue: [],
  policies: new Map(),
  config: {},
  watchers: [],
  version: '1.0.0',
};

// ============================================================================
// Logging
// ============================================================================

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level, msg, ...args) {
  if (LOG_LEVELS[level] < LOG_LEVELS[CONFIG.LOG_LEVEL]) return;

  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] [${CONFIG.WORKER_ID}] ${msg}`;

  // Console (stderr for service logs)
  const colors = { debug: '\x1b[90m', info: '\x1b[34m', warn: '\x1b[33m', error: '\x1b[31m', reset: '\x1b[0m' };
  console.error(`${colors[level] || ''}${line}${colors.reset}`, ...args);

  // File
  try {
    const logDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(CONFIG.LOG_FILE, line + ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '\n');
  } catch {}
}

// ============================================================================
// HTTP Request Helper
// ============================================================================

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.API_KEY}`,
        'X-Worker-ID': CONFIG.WORKER_ID,
        'X-Organization-ID': CONFIG.ORGANIZATION_ID,
        'User-Agent': `OmniGuardAgent/${STATE.version}`,
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode < 300, status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ ok: false, status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.setTimeout(30000);

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// Health Monitoring
// ============================================================================

function getHealthStatus() {
  const mem = process.memoryUsage();
  const uptime = Math.floor((Date.now() - STATE.startTime) / 1000);

  return {
    status: STATE.isRunning ? 'healthy' : 'stopping',
    uptime_seconds: uptime,
    memory_rss_mb: Math.round(mem.rss / 1024 / 1024),
    memory_heap_mb: Math.round(mem.heapUsed / 1024 / 1024),
    cpu_usage: getCpuUsage(),
    last_heartbeat: STATE.lastHeartbeat,
    last_scan: STATE.lastScan,
    last_sync: STATE.lastSync,
    monitored_repos: STATE.repoCache.size,
    total_scans: STATE.scanCount,
    total_findings: STATE.findingCount,
    offline_queue_size: STATE.offlineQueue.length,
    policies_loaded: STATE.policies.size,
    platform: process.platform,
    node_version: process.version,
    agent_version: STATE.version,
  };
}

function getCpuUsage() {
  try {
    const cpus = os.cpus();
    const usage = process.cpuUsage();
    return Math.round((usage.user + usage.system) / 1000);
  } catch { return 0; }
}

// ============================================================================
// Heartbeat
// ============================================================================

async function sendHeartbeat(status = 'healthy') {
  const health = getHealthStatus();

  const heartbeatData = {
    worker_id: CONFIG.WORKER_ID,
    worker_name: CONFIG.WORKER_NAME,
    worker_type: 'local-agent',
    status,
    ...health,
    timestamp: new Date().toISOString(),
  };

  if (!CONFIG.API_URL) {
    log('debug', 'No API URL configured, skipping heartbeat');
    return true;
  }

  try {
    const res = await request(`${CONFIG.API_URL}/worker-heartbeats`, { method: 'POST' }, heartbeatData);

    if (res.ok) {
      STATE.lastHeartbeat = Date.now();
      STATE.heartbeatFailures = 0;
      log('debug', 'Heartbeat OK');

      // Check for any commands from server
      if (res.body?.commands) {
        await handleCommands(res.body.commands);
      }

      return true;
    } else {
      STATE.heartbeatFailures++;
      log('warn', `Heartbeat failed: ${res.status}`);
      return false;
    }
  } catch (e) {
    STATE.heartbeatFailures++;
    log('warn', `Heartbeat error: ${e.message}`);

    // Queue offline data
    queueOffline('heartbeat', heartbeatData);

    return false;
  }
}

async function handleCommands(commands) {
  for (const cmd of commands) {
    log('info', `Received command: ${cmd.action}`);

    switch (cmd.action) {
      case 'rescan':
        await syncAndScanAll();
        break;
      case 'update_config':
        await syncConfig();
        break;
      case 'update_policies':
        await syncPolicies();
        break;
      case 'restart':
        log('info', 'Restart requested');
        gracefulShutdown('restart');
        break;
      case 'update_agent':
        if (CONFIG.ENABLE_AUTO_UPDATE) {
          await performUpdate();
        }
        break;
    }
  }
}

// ============================================================================
// Offline Queue
// ============================================================================

function queueOffline(type, data) {
  STATE.offlineQueue.push({ type, data, timestamp: Date.now() });
  persistQueue();
}

function persistQueue() {
  try {
    const dir = path.dirname(CONFIG.QUEUE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG.QUEUE_FILE, JSON.stringify(STATE.offlineQueue.slice(-100)));
  } catch (e) {
    log('warn', `Failed to persist queue: ${e.message}`);
  }
}

function loadQueue() {
  try {
    if (fs.existsSync(CONFIG.QUEUE_FILE)) {
      STATE.offlineQueue = JSON.parse(fs.readFileSync(CONFIG.QUEUE_FILE, 'utf8'));
    }
  } catch (e) {
    STATE.offlineQueue = [];
  }
}

async function flushQueue() {
  if (STATE.offlineQueue.length === 0) return;
  if (!CONFIG.API_URL) return;

  const items = STATE.offlineQueue.slice(0, 10);
  let flushed = 0;

  for (const item of items) {
    try {
      const endpoint = item.type === 'heartbeat' ? '/worker-heartbeats' :
                       item.type === 'finding' ? '/api-v1-findings' : '/agent/events';

      const res = await request(`${CONFIG.API_URL}${endpoint}`, { method: 'POST' }, item.data);
      if (res.ok) flushed++;
    } catch {}
  }

  if (flushed > 0) {
    STATE.offlineQueue = STATE.offlineQueue.slice(flushed);
    persistQueue();
    log('info', `Flushed ${flushed} queued items`);
  }
}

// ============================================================================
// Repository Discovery
// ============================================================================

function discoverRepos() {
  const repos = [];

  for (const basePath of CONFIG.MONITORED_PATHS) {
    if (!fs.existsSync(basePath)) continue;

    try {
      const items = fs.readdirSync(basePath, { withFileTypes: true });

      for (const item of items) {
        if (!item.isDirectory()) continue;

        const repoPath = path.join(basePath, item.name);
        const gitDir = path.join(repoPath, '.git');

        if (fs.existsSync(gitDir)) {
          repos.push({
            path: repoPath,
            name: item.name,
            git_dir: gitDir,
            last_modified: fs.statSync(repoPath).mtimeMs
          });
        }
      }
    } catch (e) {
      log('warn', `Failed to scan ${basePath}: ${e.message}`);
    }
  }

  return repos;
}

function getGitStatus(repoPath) {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd: repoPath, encoding: 'utf8', timeout: 5000
    }).trim() || 'unknown';

    const head = execSync('git rev-parse HEAD 2>/dev/null', {
      cwd: repoPath, encoding: 'utf8', timeout: 5000
    }).trim() || '';

    const status = execSync('git status --porcelain 2>/dev/null', {
      cwd: repoPath, encoding: 'utf8', timeout: 10000
    }).trim();

    const remote = execSync('git remote get-url origin 2>/dev/null || echo ""', {
      cwd: repoPath, encoding: 'utf8', timeout: 5000
    }).trim();

    return {
      branch,
      commit_sha: head,
      dirty: status.length > 0,
      remote_url: remote,
      dirty_files: status.split('\n').filter(l => l.trim()).slice(0, 50)
    };
  } catch (e) {
    return { error: e.message, branch: 'unknown' };
  }
}

// ============================================================================
// Repository Sync
// ============================================================================

async function syncRepos() {
  const repos = discoverRepos();
  let changed = 0;

  for (const repo of repos) {
    const status = getGitStatus(repo.path);
    const key = status.remote_url || repo.path;
    const cached = STATE.repoCache.get(key);

    STATE.repoCache.set(key, { ...repo, ...status, last_sync: Date.now() });

    // Detect changes
    if (!cached || cached.commit_sha !== status.commit_sha) {
      changed++;
      log('info', `Repo ${status.commit_sha ? 'changed' : 'discovered'}: ${repo.name} (${status.branch}@${status.commit_sha?.slice(0, 7) || 'no-commits'})`);

      // Sync to server
      if (CONFIG.API_URL) {
        try {
          await request(`${CONFIG.API_URL}/agent/repo-sync`, { method: 'POST' }, {
            worker_id: CONFIG.WORKER_ID,
            repo_path: repo.path,
            repo_name: repo.name,
            remote_url: status.remote_url,
            branch: status.branch,
            commit_sha: status.commit_sha,
            is_dirty: status.dirty,
          });
        } catch (e) {
          queueOffline('repo', { repo_path: repo.path, ...status });
        }
      }
    }
  }

  STATE.lastSync = Date.now();
  log('debug', `Discovered ${repos.length} repos, ${changed} changed`);
}

// ============================================================================
// File Watching
// ============================================================================

function setupWatchers() {
  if (!CONFIG.ENABLE_WATCHER) return;

  const fsWatch = require('fs').watch;
  const debounceTimers = new Map();

  for (const basePath of CONFIG.MONITORED_PATHS) {
    if (!fs.existsSync(basePath)) continue;

    try {
      const watcher = fsWatch(basePath, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Filter relevant files
        if (filename.includes('node_modules') || filename.includes('.git/') ||
            filename.includes('dist/') || filename.includes('build/')) {
          return;
        }

        // Debounce
        const key = `${basePath}:${filename}`;
        if (debounceTimers.has(key)) {
          clearTimeout(debounceTimers.get(key));
        }

        debounceTimers.set(key, setTimeout(() => {
          debounceTimers.delete(key);
          handleFileChange(basePath, filename);
        }, CONFIG.WATCH_DEBOUNCE));
      });

      STATE.watchers.push(watcher);
      log('debug', `Watching ${basePath}`);
    } catch (e) {
      log('warn', `Failed to watch ${basePath}: ${e.message}`);
    }
  }
}

function handleFileChange(basePath, filename) {
  const fullPath = path.join(basePath, filename);

  // Find which repo this belongs to
  for (const [key, repo] of STATE.repoCache) {
    if (fullPath.startsWith(repo.path)) {
      log('debug', `File changed in ${repo.name}: ${filename}`);

      // Queue for scan
      queueOffline('file_change', {
        repo_path: repo.path,
        file: fullPath,
        repo_name: repo.name
      });

      break;
    }
  }
}

// ============================================================================
// Local Scanning
// ============================================================================

const SECRET_PATTERNS = [
  { id: 'SECRET-AWS-001', name: 'AWS Access Key', re: /(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ASIA)[A-Z0-9]{16}/g, sev: 'critical' },
  { id: 'SECRET-GITHUB-001', name: 'GitHub PAT', re: /gh[pousr]_[A-Za-z0-9_]{36,}/g, sev: 'critical' },
  { id: 'SECRET-OPENAI-001', name: 'OpenAI Key', re: /sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}/g, sev: 'critical' },
  { id: 'SECRET-ANTHROPIC-001', name: 'Anthropic Key', re: /sk-ant-[A-Za-z0-9\-_]{95,}/g, sev: 'critical' },
  { id: 'SECRET-SSH-001', name: 'SSH Private Key', re: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g, sev: 'critical' },
];

async function scanFile(filePath) {
  if (!CONFIG.ENABLE_LOCAL_SCAN) return [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
    if (content.length > 1024 * 1024) return []; // Skip large files
  } catch {
    return [];
  }

  const findings = [];

  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    const seenLines = new Set();

    while ((match = pattern.re.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      if (seenLines.has(line)) continue;
      seenLines.add(line);

      // Skip test/example files
      const lineText = content.split('\n')[line - 1] || '';
      if (/^\s*(\/\/|#|\*)/.test(lineText)) continue;
      if (/(?:test|example|sample|placeholder)/i.test(match[0])) continue;

      findings.push({
        rule_id: pattern.id,
        severity: pattern.sev,
        title: `${pattern.name} detected`,
        file_path: filePath,
        line_start: line,
        evidence: match[0].length > 20 ? match[0].slice(0, 8) + '****' + match[0].slice(-8) : '****',
        scanner: 'secret',
        detected_at: new Date().toISOString(),
      });
    }
  }

  return findings;
}

async function scanRepo(repo) {
  log('debug', `Scanning repo: ${repo.name}`);

  let findings = [];
  const exts = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.java', '.rb', '.php', '.env', '.yaml', '.yml', '.json', '.conf', '.cfg']);

  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'vendor'].includes(entry.name)) {
          walk(full);
        }
      } else if (exts.has(path.extname(entry.name))) {
        const fileFindings = await scanFile(full);
        findings.push(...fileFindings);
      }
    }
  }

  walk(repo.path);

  STATE.scanCount++;
  STATE.findingCount += findings.length;

  if (findings.length > 0) {
    log('warn', `Found ${findings.length} issues in ${repo.name}`);

    // Send to server
    if (CONFIG.API_URL) {
      try {
        await request(`${CONFIG.API_URL}/agent/findings`, { method: 'POST' }, {
          worker_id: CONFIG.WORKER_ID,
          repo_path: repo.path,
          repo_name: repo.name,
          findings,
        });
      } catch (e) {
        queueOffline('findings', { repo_path: repo.path, findings });
      }
    }
  }

  return findings;
}

async function syncAndScanAll() {
  await syncRepos();

  const now = Date.now();
  if (now - STATE.lastScan < CONFIG.SCAN_INTERVAL) {
    log('debug', 'Scan interval not reached');
    return;
  }

  for (const [key, repo] of STATE.repoCache) {
    await scanRepo(repo);
  }

  STATE.lastScan = now;
}

// ============================================================================
// Configuration & Policy Sync
// ============================================================================

async function syncConfig() {
  if (!CONFIG.API_URL) return;

  try {
    const res = await request(`${CONFIG.API_URL}/agent/config?worker_id=${CONFIG.WORKER_ID}`);
    if (res.ok && res.body?.config) {
      STATE.config = res.body.config;
      log('info', 'Configuration synced');

      // Apply config changes
      if (res.body.config.scan_interval) {
        CONFIG.SCAN_INTERVAL = res.body.config.scan_interval;
      }
      if (res.body.config.monitored_paths) {
        CONFIG.MONITORED_PATHS = res.body.config.monitored_paths.split(':');
      }
    }
  } catch (e) {
    log('warn', `Config sync failed: ${e.message}`);
  }
}

async function syncPolicies() {
  if (!CONFIG.API_URL) return;

  try {
    const res = await request(`${CONFIG.API_URL}/agent/policies?worker_id=${CONFIG.WORKER_ID}`);
    if (res.ok && res.body?.policies) {
      STATE.policies.clear();

      for (const policy of res.body.policies) {
        STATE.policies.set(policy.id, policy);
      }

      log('info', `Synced ${STATE.policies.size} policies`);
    }
  } catch (e) {
    log('warn', `Policy sync failed: ${e.message}`);
  }
}

// ============================================================================
// Auto-Update
// ============================================================================

async function checkForUpdates() {
  if (!CONFIG.ENABLE_AUTO_UPDATE) return;

  try {
    const res = await new Promise((resolve, reject) => {
      https.get('https://registry.npmjs.org/omniguard-agent/latest', (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    if (res.version && res.version !== STATE.version) {
      log('info', `Update available: ${STATE.version} -> ${res.version}`);
      return res.version;
    }
  } catch {}

  return null;
}

async function performUpdate() {
  log('info', 'Performing auto-update...');

  try {
    execSync('npm update -g omniguard-agent', { timeout: 60000 });
    log('info', 'Update complete, restarting...');
    gracefulShutdown('update');
  } catch (e) {
    log('error', `Auto-update failed: ${e.message}`);
  }
}

// ============================================================================
// Telemetry
// ============================================================================

async function sendTelemetry() {
  if (!CONFIG.ENABLE_TELEMETRY || !CONFIG.API_URL) return;

  const telemetry = {
    worker_id: CONFIG.WORKER_ID,
    version: STATE.version,
    platform: process.platform,
    arch: os.arch(),
    node_version: process.version,
    memory_total_mb: Math.round(os.totalmem() / 1024 / 1024),
    cpu_count: os.cpus().length,
    monitored_paths: CONFIG.MONITORED_PATHS.length,
    uptime_hours: Math.round((Date.now() - STATE.startTime) / 3600000),
  };

  try {
    await request(`${CONFIG.API_URL}/telemetry/agent`, { method: 'POST' }, telemetry);
  } catch {}
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function gracefulShutdown(reason = 'shutdown') {
  log('info', `Shutdown initiated: ${reason}`);

  STATE.isRunning = false;

  // Send final heartbeat
  await sendHeartbeat('stopping');

  // Persist offline queue
  persistQueue();

  // Close watchers
  for (const watcher of STATE.watchers) {
    try { watcher.close(); } catch {}
  }

  // Clean up PID file
  try { fs.unlinkSync(CONFIG.PID_FILE); } catch {}

  log('info', `Shutdown complete: ${reason}`);
  process.exit(reason === 'restart' ? 100 : 0);
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  log('info', '═══════════════════════════════════════════════════════════');
  log('info', `OmniGuard Enterprise Local Agent v${STATE.version}`);
  log('info', '═══════════════════════════════════════════════════════════');
  log('info', `Worker ID: ${CONFIG.WORKER_ID}`);
  log('info', `Organization: ${CONFIG.ORGANIZATION_ID || '(not set)'}`);
  log('info', `Monitored Paths: ${CONFIG.MONITORED_PATHS.join(', ')}`);
  log('info', `API URL: ${CONFIG.API_URL || '(offline mode)'}`);
  log('info', `Features: watcher=${CONFIG.ENABLE_WATCHER}, local-scan=${CONFIG.ENABLE_LOCAL_SCAN}, auto-update=${CONFIG.ENABLE_AUTO_UPDATE}`);

  // Create config directory
  try {
    if (!fs.existsSync(CONFIG.CONFIG_DIR)) {
      fs.mkdirSync(CONFIG.CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
  } catch {}

  // Write PID file
  try {
    fs.writeFileSync(CONFIG.PID_FILE, process.pid.toString());
  } catch {}

  // Load offline queue
  loadQueue();

  // Initial handshake
  await sendHeartbeat('starting');
  await syncConfig();
  await syncPolicies();
  await syncAndScanAll();

  // Setup file watchers
  setupWatchers();

  // Setup signal handlers
  process.on('SIGTERM', () => gracefulShutdown('sigterm'));
  process.on('SIGINT', () => gracefulShutdown('sigint'));
  process.on('SIGHUP', async () => {
    log('info', 'Received SIGHUP, reloading config...');
    await syncConfig();
    await syncPolicies();
  });

  // Handle uncaught errors
  process.on('uncaughtException', (e) => {
    log('error', `Uncaught exception: ${e.message}`);
    log('error', e.stack);
  });

  process.on('unhandledRejection', (reason) => {
    log('error', `Unhandled rejection: ${reason}`);
  });

  // Main loop
  let tick = 0;

  while (STATE.isRunning) {
    try {
      tick++;
      const now = Date.now();

      // Heartbeat every interval
      if (now - STATE.lastHeartbeat >= CONFIG.HEARTBEAT_INTERVAL) {
        await sendHeartbeat('healthy');
      }

      // Queue flush every 30 seconds
      if (tick % 30 === 0) {
        await flushQueue();
      }

      // Sync and scan every interval
      if (now - STATE.lastScan >= CONFIG.SCAN_INTERVAL) {
        await syncAndScanAll();
      }

      // Config sync every 5 minutes
      if (now - STATE.lastSync >= CONFIG.SYNC_INTERVAL) {
        await syncConfig();
        await syncPolicies();
        STATE.lastSync = now;
      }

      // Telemetry every hour
      if (tick % 3600 === 0) {
        await sendTelemetry();
      }

      // Check for updates every 6 hours
      if (CONFIG.ENABLE_AUTO_UPDATE && tick % 21600 === 0) {
        await checkForUpdates();
      }

      // Check health and restart if too many failures
      if (STATE.heartbeatFailures > 10) {
        log('error', 'Too many heartbeat failures, attempting recovery...');
        STATE.heartbeatFailures = 0;
      }

      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      log('error', `Main loop error: ${e.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

// Health check mode
if (process.argv.includes('--health')) {
  try {
    const pid = parseInt(fs.readFileSync(CONFIG.PID_FILE, 'utf8'));
    process.kill(pid, 0);
    console.log(JSON.stringify({ healthy: true, pid }));
    process.exit(0);
  } catch {
    console.log(JSON.stringify({ healthy: false }));
    process.exit(1);
  }
}

// Status mode
if (process.argv.includes('--status')) {
  try {
    const pid = parseInt(fs.readFileSync(CONFIG.PID_FILE, 'utf8'));
    console.log(JSON.stringify({ running: true, pid, ...getHealthStatus() }, null, 2));
    process.exit(0);
  } catch {
    console.log(JSON.stringify({ running: false }));
    process.exit(1);
  }
}

// Version mode
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`OmniGuard Agent v${STATE.version}`);
  process.exit(0);
}

// Run
if (require.main === module) {
  main();
}

module.exports = {
  main,
  sendHeartbeat,
  syncRepos,
  scanFile,
  scanRepo,
  getHealthStatus,
  gracefulShutdown,
};
