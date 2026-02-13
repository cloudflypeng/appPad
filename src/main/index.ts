import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'fs'
import Database from 'better-sqlite3'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import electronUpdater from 'electron-updater'
import { spawn as spawnPty, type IPty } from 'node-pty'
import icon from '../renderer/src/assets/logo.png?asset'

const { autoUpdater } = electronUpdater

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'appPad',
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    ...(process.platform !== 'darwin' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

type BrewStatus = {
  installed: boolean
  currentVersion: string | null
  latestVersion: string | null
  installedAppCount: number | null
}

type MoleStatus = {
  installed: boolean
  currentVersion: string | null
  installMethod: string | null
}

type CachedStatusPayload<T> = {
  status: T | null
  updatedAt: number | null
}

type SearchIconCacheItem = {
  token: string
  iconUrl: string | null
  fallbackIconUrl: string | null
}

type CommandResult = {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: string
}

type BrowserCatalogCacheItem = {
  token: string
  name: string
  description: string
  homepage: string | null
  iconUrl: string | null
  fallbackIconUrl: string | null
  installed: boolean
}

type BrowserCatalogCachePayload = {
  brewInstalled: boolean | null
  items: BrowserCatalogCacheItem[]
}

type InstalledAppCacheItem = {
  token: string
  name: string
  description: string
  homepage: string | null
  iconUrl: string | null
  fallbackIconUrl: string | null
  iconKey: string | null
  brewType: 'cask' | 'formula'
  installed: boolean
}

type InstalledAppStatus = {
  token: string
  installed: boolean
  name: string | null
  description: string | null
  homepage: string | null
}

type CatalogCacheItem = {
  token: string
  name: string
  description: string
  homepage: string | null
  iconUrl: string | null
  fallbackIconUrl: string | null
  installed: boolean
  iconKey: string | null
  installCommand?: string
  uninstallCommand?: string
  brewType?: 'cask' | 'formula'
}

type CatalogCachePayload = {
  brewInstalled: boolean | null
  items: CatalogCacheItem[]
}

type TerminalSessionState = {
  pty: IPty
  flowPaused: boolean
}

const COMMON_BREW_PATHS = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']
let nextTerminalSessionId = 1
const terminalSessions = new Map<number, TerminalSessionState>()
let cacheDb: Database.Database | null = null
let currentUpdateInfo: any = null
let downloadedDmgPath: string | null = null

if (!app.isPackaged) {
  autoUpdater.forceDevUpdateConfig = true
}
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

function getCacheDb(): Database.Database {
  if (cacheDb) return cacheDb

  const dbPath = join(app.getPath('userData'), 'apppad-cache.sqlite')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_catalog_cache (
      token TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      homepage TEXT,
      icon_url TEXT,
      fallback_icon_url TEXT,
      installed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS installed_apps_cache (
      token TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      homepage TEXT,
      installed INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_cache_kv (
      cache_key TEXT PRIMARY KEY,
      cache_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalog_items_cache (
      catalog_key TEXT NOT NULL,
      token TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      homepage TEXT,
      icon_url TEXT,
      fallback_icon_url TEXT,
      installed INTEGER NOT NULL DEFAULT 0,
      icon_key TEXT,
      install_command TEXT,
      uninstall_command TEXT,
      brew_type TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (catalog_key, token)
    );
  `)

  cacheDb = db
  return db
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function toDuckDuckGoFavicon(domainOrHomepage: string | null | undefined): string | null {
  if (!domainOrHomepage) return null
  try {
    const normalized = domainOrHomepage.includes('://')
      ? domainOrHomepage
      : `https://${domainOrHomepage}`
    const hostname = new URL(normalized).hostname
    if (!hostname) return null
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`
  } catch {
    return null
  }
}

function toHomebrewIcon(token: string, brewType: 'cask' | 'formula'): string | null {
  if (!token || brewType !== 'cask') return null
  return `https://formulae.brew.sh/assets/icons/${encodeURIComponent(token)}.png`
}

function getBrowserCatalogCache(): BrowserCatalogCachePayload {
  const db = getCacheDb()
  const rows = db
    .prepare(
      `
      SELECT token, name, description, homepage, icon_url, fallback_icon_url, installed
      FROM browser_catalog_cache
      ORDER BY token ASC
    `
    )
    .all() as Array<{
    token: string
    name: string
    description: string
    homepage: string | null
    icon_url: string | null
    fallback_icon_url: string | null
    installed: number
  }>

  const brewInstalledRow = db
    .prepare(
      `
      SELECT cache_value
      FROM app_cache_kv
      WHERE cache_key = 'browser_catalog_brew_installed'
      LIMIT 1
    `
    )
    .get() as { cache_value?: string } | undefined

  const brewInstalled =
    brewInstalledRow?.cache_value === '1'
      ? true
      : brewInstalledRow?.cache_value === '0'
        ? false
        : null

  return {
    brewInstalled,
    items: rows.map((row) => ({
      token: row.token,
      name: row.name,
      description: row.description,
      homepage: row.homepage,
      iconUrl: row.icon_url,
      fallbackIconUrl: row.fallback_icon_url,
      installed: row.installed === 1
    }))
  }
}

function setBrowserCatalogCache(payload: BrowserCatalogCachePayload): { success: true } {
  const db = getCacheDb()
  const now = Date.now()

  const transaction = db.transaction((input: BrowserCatalogCachePayload) => {
    db.prepare('DELETE FROM browser_catalog_cache').run()

    const insertStmt = db.prepare(
      `
      INSERT INTO browser_catalog_cache (
        token, name, description, homepage, icon_url, fallback_icon_url, installed, updated_at
      ) VALUES (
        @token, @name, @description, @homepage, @icon_url, @fallback_icon_url, @installed, @updated_at
      )
    `
    )

    input.items.forEach((item) => {
      insertStmt.run({
        token: item.token,
        name: item.name,
        description: item.description,
        homepage: item.homepage,
        icon_url: item.iconUrl,
        fallback_icon_url: item.fallbackIconUrl,
        installed: item.installed ? 1 : 0,
        updated_at: now
      })
    })

    db.prepare(
      `
      INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
      VALUES ('browser_catalog_brew_installed', @cache_value, @updated_at)
      ON CONFLICT(cache_key) DO UPDATE SET
        cache_value = excluded.cache_value,
        updated_at = excluded.updated_at
    `
    ).run({
      cache_value: input.brewInstalled === null ? 'null' : input.brewInstalled ? '1' : '0',
      updated_at: now
    })
  })

  transaction(payload)
  return { success: true }
}

function getCatalogItemsCache(catalogKey: string): CatalogCachePayload {
  const db = getCacheDb()
  const rows = db
    .prepare(
      `
      SELECT
        token, name, description, homepage, icon_url, fallback_icon_url, installed,
        icon_key, install_command, uninstall_command, brew_type
      FROM catalog_items_cache
      WHERE catalog_key = ?
      ORDER BY token ASC
    `
    )
    .all(catalogKey) as Array<{
    token: string
    name: string
    description: string
    homepage: string | null
    icon_url: string | null
    fallback_icon_url: string | null
    installed: number
    icon_key: string | null
    install_command: string | null
    uninstall_command: string | null
    brew_type: 'cask' | 'formula' | null
  }>

  const brewInstalledRow = db
    .prepare(
      `
      SELECT cache_value
      FROM app_cache_kv
      WHERE cache_key = ?
      LIMIT 1
    `
    )
    .get(`catalog_${catalogKey}_brew_installed`) as { cache_value?: string } | undefined

  const brewInstalled =
    brewInstalledRow?.cache_value === '1'
      ? true
      : brewInstalledRow?.cache_value === '0'
        ? false
        : null

  return {
    brewInstalled,
    items: rows.map((row) => ({
      token: row.token,
      name: row.name,
      description: row.description,
      homepage: row.homepage,
      iconUrl: row.icon_url,
      fallbackIconUrl: row.fallback_icon_url,
      installed: row.installed === 1,
      iconKey: row.icon_key,
      installCommand: row.install_command ?? undefined,
      uninstallCommand: row.uninstall_command ?? undefined,
      brewType: row.brew_type ?? undefined
    }))
  }
}

function setCatalogItemsCache(catalogKey: string, payload: CatalogCachePayload): { success: true } {
  const db = getCacheDb()
  const now = Date.now()

  const transaction = db.transaction((input: CatalogCachePayload) => {
    db.prepare('DELETE FROM catalog_items_cache WHERE catalog_key = ?').run(catalogKey)

    const insertStmt = db.prepare(
      `
      INSERT INTO catalog_items_cache (
        catalog_key, token, name, description, homepage, icon_url, fallback_icon_url, installed,
        icon_key, install_command, uninstall_command, brew_type, updated_at
      ) VALUES (
        @catalog_key, @token, @name, @description, @homepage, @icon_url, @fallback_icon_url, @installed,
        @icon_key, @install_command, @uninstall_command, @brew_type, @updated_at
      )
    `
    )

    input.items.forEach((item) => {
      insertStmt.run({
        catalog_key: catalogKey,
        token: item.token,
        name: item.name,
        description: item.description,
        homepage: item.homepage,
        icon_url: item.iconUrl,
        fallback_icon_url: item.fallbackIconUrl,
        installed: item.installed ? 1 : 0,
        icon_key: item.iconKey ?? null,
        install_command: item.installCommand ?? null,
        uninstall_command: item.uninstallCommand ?? null,
        brew_type: item.brewType ?? null,
        updated_at: now
      })
    })

    db.prepare(
      `
      INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
      VALUES (@cache_key, @cache_value, @updated_at)
      ON CONFLICT(cache_key) DO UPDATE SET
        cache_value = excluded.cache_value,
        updated_at = excluded.updated_at
    `
    ).run({
      cache_key: `catalog_${catalogKey}_brew_installed`,
      cache_value: input.brewInstalled === null ? 'null' : input.brewInstalled ? '1' : '0',
      updated_at: now
    })
  })

  transaction(payload)
  return { success: true }
}

function getInstalledAppsStatus(tokens: string[]): { items: InstalledAppStatus[] } {
  if (tokens.length === 0) return { items: [] }

  const db = getCacheDb()
  const selectStatus = db.prepare(
    `
    SELECT token, installed, name, description, homepage
    FROM installed_apps_cache
    WHERE token = ?
    LIMIT 1
  `
  )

  const items = tokens.map((token) => {
    const row = selectStatus.get(token) as
      | { token: string; installed: number; name: string; description: string; homepage: string | null }
      | undefined

    if (!row) {
      return {
        token,
        installed: false,
        name: null,
        description: null,
        homepage: null
      }
    }

    return {
      token: row.token,
      installed: row.installed === 1,
      name: row.name ?? null,
      description: row.description ?? null,
      homepage: row.homepage ?? null
    }
  })

  return { items }
}

function setJsonCacheValue(cacheKey: string, value: unknown): number {
  const db = getCacheDb()
  const updatedAt = Date.now()
  db.prepare(
    `
    INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
    VALUES (@cache_key, @cache_value, @updated_at)
    ON CONFLICT(cache_key) DO UPDATE SET
      cache_value = excluded.cache_value,
      updated_at = excluded.updated_at
  `
  ).run({
    cache_key: cacheKey,
    cache_value: JSON.stringify(value),
    updated_at: updatedAt
  })
  return updatedAt
}

function getJsonCacheValue<T>(cacheKey: string): CachedStatusPayload<T> {
  const db = getCacheDb()
  const row = db
    .prepare(
      `
      SELECT cache_value, updated_at
      FROM app_cache_kv
      WHERE cache_key = ?
      LIMIT 1
    `
    )
    .get(cacheKey) as { cache_value?: string; updated_at?: number } | undefined

  if (!row?.cache_value) {
    return { status: null, updatedAt: null }
  }

  try {
    return {
      status: JSON.parse(row.cache_value) as T,
      updatedAt: row.updated_at ?? null
    }
  } catch {
    return { status: null, updatedAt: row.updated_at ?? null }
  }
}

function getSearchIconCache(tokens: string[]): { items: SearchIconCacheItem[] } {
  if (tokens.length === 0) return { items: [] }
  const payload = getJsonCacheValue<Record<string, { iconUrl: string | null; fallbackIconUrl: string | null }>>(
    'search_icon_cache_v1'
  ).status
  const items = tokens.map((token) => {
    const cached = payload?.[token]
    return {
      token,
      iconUrl: cached?.iconUrl ?? null,
      fallbackIconUrl: cached?.fallbackIconUrl ?? null
    }
  })
  return { items }
}

function upsertSearchIconCache(items: SearchIconCacheItem[]): { success: true } {
  const current =
    getJsonCacheValue<Record<string, { iconUrl: string | null; fallbackIconUrl: string | null }>>(
      'search_icon_cache_v1'
    ).status ?? {}
  const merged = { ...current }
  items.forEach((item) => {
    if (!item.token) return
    merged[item.token] = {
      iconUrl: item.iconUrl ?? null,
      fallbackIconUrl: item.fallbackIconUrl ?? null
    }
  })
  setJsonCacheValue('search_icon_cache_v1', merged)
  return { success: true }
}

function getBaseEnv(): NodeJS.ProcessEnv {
  const normalizedPath = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
    process.env.PATH ?? ''
  ]
    .filter(Boolean)
    .join(':')

  return {
    ...process.env,
    PATH: normalizedPath,
    TERM: process.env.TERM || 'xterm-256color',
    HOMEBREW_NO_ENV_HINTS: '1',
    NONINTERACTIVE: '1'
  }
}

function getTerminalEnv(): NodeJS.ProcessEnv {
  const env = { ...getBaseEnv() }
  delete env.NONINTERACTIVE
  env.COLORTERM = env.COLORTERM || 'truecolor'
  return env
}

function runCommand(bin: string, args: string[], timeoutMs = 1000 * 60 * 20): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      env: getBaseEnv()
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finalize = (result: CommandResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finalize({
        success: false,
        code: null,
        stdout,
        stderr,
        error: `Command timed out after ${Math.round(timeoutMs / 1000)}s`
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      finalize({
        success: false,
        code: null,
        stdout,
        stderr,
        error: error.message
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      finalize({
        success: code === 0,
        code,
        stdout,
        stderr
      })
    })
  })
}

function runShellCommand(command: string, timeoutMs = 1000 * 60 * 20): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn('/bin/zsh', ['-lc', command], {
      env: getBaseEnv()
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const finalize = (result: CommandResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      finalize({
        success: false,
        code: null,
        stdout,
        stderr,
        error: `Command timed out after ${Math.round(timeoutMs / 1000)}s`
      })
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(timer)
      finalize({
        success: false,
        code: null,
        stdout,
        stderr,
        error: error.message
      })
    })

    child.on('close', (code) => {
      clearTimeout(timer)
      finalize({
        success: code === 0,
        code,
        stdout,
        stderr
      })
    })
  })
}

function sendUpdateEvent(channel: string, payload?: unknown): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload)
  })
}

function parseReleaseNotes(raw: unknown): string {
  const toPlainText = (value: string): string => {
    return value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  if (typeof raw === 'string') return toPlainText(raw)
  if (!Array.isArray(raw)) return ''
  return raw
    .map((item) => {
      if (item && typeof item === 'object' && 'note' in item) {
        return toPlainText(String((item as { note?: unknown }).note ?? ''))
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function escapeForDoubleQuotes(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value)
}

function readGithubPublishConfig(): { owner: string; repo: string } {
  const fallback = { owner: 'cloudflypeng', repo: 'appPad' }
  const configPath = app.isPackaged
    ? join(process.resourcesPath, 'app-update.yml')
    : join(process.cwd(), 'dev-app-update.yml')

  try {
    if (!existsSync(configPath)) {
      return fallback
    }

    const content = readFileSync(configPath, 'utf8')
    const ownerMatch = content.match(/^\s*owner:\s*([^\s#]+)\s*$/m)
    const repoMatch = content.match(/^\s*repo:\s*([^\s#]+)\s*$/m)
    const owner = ownerMatch?.[1] ?? fallback.owner
    const repo = repoMatch?.[1] ?? fallback.repo
    return { owner, repo }
  } catch {
    return fallback
  }
}

function resolveMacDmgAssetFromUpdateInfo(updateInfo: any): string | null {
  const files = Array.isArray(updateInfo?.files) ? updateInfo.files : []
  const dmgFile = files.find((item: any) => {
    const rawUrl = String(item?.url ?? '').toLowerCase()
    return rawUrl.endsWith('.dmg')
  })
  const dmgUrl = String(dmgFile?.url ?? '')
  if (dmgUrl) return dmgUrl

  const fallbackPath = String(updateInfo?.path ?? '')
  return fallbackPath.toLowerCase().endsWith('.dmg') ? fallbackPath : null
}

function resolveMacDmgUrlFromUpdateInfo(updateInfo: any): string | null {
  const candidates = resolveMacDmgUrlCandidatesFromUpdateInfo(updateInfo)
  return candidates[0] ?? null
}

function resolveMacDmgUrlCandidatesFromUpdateInfo(updateInfo: any): string[] {
  const dmgAsset = resolveMacDmgAssetFromUpdateInfo(updateInfo)
  if (!dmgAsset) return []
  if (isAbsoluteHttpUrl(dmgAsset)) return [dmgAsset]

  const cleanAsset = dmgAsset.replace(/^\/+/, '')
  if (!cleanAsset) return []

  const version = String(updateInfo?.version ?? '').trim()
  if (!version) return []

  const { owner, repo } = readGithubPublishConfig()
  const encodedAssetPath = cleanAsset.split('/').map(encodeURIComponent).join('/')
  const versionTag = version.startsWith('v') ? version : `v${version}`
  const rawTag = version.startsWith('v') ? version.slice(1) : version

  const candidates = [
    `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(versionTag)}/${encodedAssetPath}`,
    `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(rawTag)}/${encodedAssetPath}`,
    `https://github.com/${owner}/${repo}/releases/latest/download/${encodedAssetPath}`
  ]

  return [...new Set(candidates)]
}

function setupUpdateHandlers(): void {
  ipcMain.handle('check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      if (!result) {
        return {
          success: true,
          updateAvailable: false,
          currentVersion: `v${app.getVersion()}`,
          latestVersion: `v${app.getVersion()}`,
          releaseNotes: ''
        }
      }

      currentUpdateInfo = result.updateInfo
      const latestVersion = `v${result.updateInfo.version}`
      const currentVersion = `v${app.getVersion()}`
      const updateAvailable = result.updateInfo.version !== app.getVersion()
      const dmgDownloadUrl = resolveMacDmgUrlFromUpdateInfo(result.updateInfo)

      return {
        success: true,
        updateAvailable,
        currentVersion,
        latestVersion,
        releaseNotes: parseReleaseNotes((result.updateInfo as any).releaseNotes),
        downloadUrl: dmgDownloadUrl
      }
    } catch (error) {
      return {
        success: false,
        updateAvailable: false,
        error: error instanceof Error ? error.message : 'Failed to check updates.',
        currentVersion: `v${app.getVersion()}`
      }
    }
  })

  ipcMain.handle('download-and-install-update', async () => {
    if (process.platform === 'darwin') {
      try {
        if (!currentUpdateInfo) {
          const result = await autoUpdater.checkForUpdates()
          if (result) currentUpdateInfo = result.updateInfo
        }

        if (!currentUpdateInfo) {
          throw new Error('Unable to resolve update info.')
        }

        const dmgUrlCandidates = resolveMacDmgUrlCandidatesFromUpdateInfo(currentUpdateInfo)
        if (dmgUrlCandidates.length === 0) {
          throw new Error('No downloadable DMG URL resolved from update metadata.')
        }

        const version = currentUpdateInfo.version || app.getVersion()
        const fileNameFromUrl = String(dmgUrlCandidates[0]).split('/').pop()?.split('?')[0]
        const fileName = fileNameFromUrl && fileNameFromUrl.length > 0 ? fileNameFromUrl : `apppad-${version}.dmg`
        const targetPath = join(app.getPath('temp'), fileName)
        downloadedDmgPath = targetPath

        sendUpdateEvent('update-download-progress', { percent: 0 })
        let response: Response | null = null
        let lastError = ''
        for (const candidateUrl of dmgUrlCandidates) {
          try {
            const res = await fetch(candidateUrl)
            if (!res.ok) {
              lastError = `${res.status} ${res.statusText}`.trim()
              continue
            }
            response = res
            break
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error)
          }
        }
        if (!response) {
          throw new Error(
            `Download failed for all DMG URL candidates: ${dmgUrlCandidates.join(', ')}${lastError ? ` (${lastError})` : ''}`
          )
        }
        const arrayBuffer = await response.arrayBuffer()
        writeFileSync(targetPath, Buffer.from(arrayBuffer))
        sendUpdateEvent('update-download-progress', { percent: 100 })
        sendUpdateEvent('update-downloaded')

        return { success: true, message: 'Update downloaded.' }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to download update.'
        }
      }
    }

    try {
      await autoUpdater.downloadUpdate()
      return { success: true, message: 'Update download started.' }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start update download.'
      }
    }
  })

  ipcMain.handle('quit-and-install', () => {
    if (process.platform === 'darwin' && downloadedDmgPath) {
      const currentAppPath = app.getPath('exe').replace(/\.app\/Contents\/MacOS\/.*$/, '.app')
      const installScriptPath = join(app.getPath('temp'), 'apppad-install-update.sh')
      const escapedDmgPath = escapeForDoubleQuotes(downloadedDmgPath)
      const escapedAppPath = escapeForDoubleQuotes(currentAppPath)
      const escapedScriptPath = escapeForDoubleQuotes(installScriptPath)

      const scriptContent = `#!/bin/bash
set -e
LOG_FILE="$HOME/Library/Logs/apppad-update.log"
DMG_PATH="${escapedDmgPath}"
APP_PATH="${escapedAppPath}"
SCRIPT_PATH="${escapedScriptPath}"

echo "[$(date)] Starting update process..." > "$LOG_FILE"
echo "DMG: $DMG_PATH" >> "$LOG_FILE"
echo "Target: $APP_PATH" >> "$LOG_FILE"

sleep 1

MOUNT_POINT=$(mktemp -d /tmp/apppad-update-XXXXXX)
echo "Mounting to $MOUNT_POINT..." >> "$LOG_FILE"

if hdiutil attach -nobrowse -noautoopen -mountpoint "$MOUNT_POINT" "$DMG_PATH" >> "$LOG_FILE" 2>&1; then
  SOURCE_APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -print -quit)
  echo "Source app found: $SOURCE_APP" >> "$LOG_FILE"

  if [ -n "$SOURCE_APP" ] && [ -d "$SOURCE_APP" ]; then
    rm -rf "$APP_PATH"
    cp -R "$SOURCE_APP" "$APP_PATH"
    if [ -d "$APP_PATH" ]; then
      xattr -r -d com.apple.quarantine "$APP_PATH" 2>/dev/null || true
      open "$APP_PATH"
    fi
  fi

  hdiutil detach "$MOUNT_POINT" >> "$LOG_FILE" 2>&1 || true
  rm -rf "$MOUNT_POINT"
fi

rm -f "$SCRIPT_PATH"
`
      writeFileSync(installScriptPath, scriptContent)
      chmodSync(installScriptPath, 0o755)

      spawn(installScriptPath, {
        detached: true,
        stdio: 'ignore'
      }).unref()

      app.quit()
      return { success: true }
    }

    autoUpdater.quitAndInstall()
    return { success: true }
  })

  ipcMain.handle('get-app-version', () => {
    return {
      version: app.getVersion(),
      name: app.getName()
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdateEvent('update-download-progress', progressObj)
  })

  autoUpdater.on('update-downloaded', () => {
    sendUpdateEvent('update-downloaded')
  })

  autoUpdater.on('error', (error) => {
    sendUpdateEvent('update-error', error.message)
  })
}

function normalizeTerminalShell(rawShell?: string): string {
  const candidate = (rawShell || '').trim()
  if (!candidate) return process.env.APPPAD_TERMINAL_SHELL || process.env.SHELL || '/bin/zsh'

  const basename = candidate.split('/').pop()?.toLowerCase() || ''
  if (basename === 'zsh') return '/bin/zsh'
  if (basename === 'bash') return '/bin/bash'
  if (candidate === '/bin/zsh' || candidate === '/bin/bash') return candidate

  return process.env.APPPAD_TERMINAL_SHELL || process.env.SHELL || '/bin/zsh'
}

function createTerminalSession(shell?: string): { sessionId: number } {
  const shellPath = normalizeTerminalShell(shell)
  const shellName = shellPath.split('/').pop()?.toLowerCase() || ''
  const shellArgs = ['zsh', 'bash', 'fish'].includes(shellName) ? ['-l'] : []
  const sessionId = nextTerminalSessionId++
  const pty = spawnPty(shellPath, shellArgs, {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: process.env.HOME || process.cwd(),
    env: getTerminalEnv()
  })

  terminalSessions.set(sessionId, { pty, flowPaused: false })

  pty.onData((data) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('terminal:data', {
        sessionId,
        data
      })
    })
  })

  pty.onExit((event) => {
    terminalSessions.delete(sessionId)
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send('terminal:exit', {
        sessionId,
        code: event.exitCode
      })
    })
  })

  return { sessionId }
}

function writeTerminalSession(sessionId: number, data: string): { success: boolean } {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return { success: false }
  }
  session.pty.write(data)
  return { success: true }
}

function writeTerminalSessionBinary(sessionId: number, dataBase64: string): { success: boolean } {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return { success: false }
  }

  try {
    const data = Buffer.from(dataBase64, 'base64')
    if (data.length === 0) return { success: true }
    session.pty.write(data)
  } catch {
    return { success: false }
  }

  return { success: true }
}

function setTerminalSessionFlowControl(sessionId: number, paused: boolean): { success: boolean } {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return { success: false }
  }

  if (paused && !session.flowPaused) {
    session.pty.pause()
    session.flowPaused = true
    return { success: true }
  }

  if (!paused && session.flowPaused) {
    session.pty.resume()
    session.flowPaused = false
    return { success: true }
  }

  return { success: true }
}

function resizeTerminalSession(sessionId: number, cols: number, rows: number): { success: boolean } {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return { success: false }
  }

  const safeCols = Number.isFinite(cols) ? Math.max(20, Math.floor(cols)) : 120
  const safeRows = Number.isFinite(rows) ? Math.max(5, Math.floor(rows)) : 30
  session.pty.resize(safeCols, safeRows)
  return { success: true }
}

function closeTerminalSession(sessionId: number): { success: boolean } {
  const session = terminalSessions.get(sessionId)
  if (!session) {
    return { success: false }
  }
  session.pty.kill()
  terminalSessions.delete(sessionId)
  return { success: true }
}

function parseCurrentVersionFromOutput(output: string): string | null {
  const firstLine = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (!firstLine) return null

  const match = firstLine.match(/Homebrew\s+([^\s]+)/i)
  if (!match) return null
  return match[1]?.trim() || null
}

function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return raw.slice(start, end + 1)
}

function parseBrewInfoJsonPayload(raw: string): {
  latestVersion: string | null
  installedVersion: string | null
} | null {
  const normalized = raw.trim()
  if (!normalized) return null

  const candidates = [normalized, extractJsonObject(normalized)].filter(
    (candidate): candidate is string => Boolean(candidate)
  )

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        formulae?: Array<{ versions?: { stable?: string }; installed?: Array<{ version?: string }> }>
        casks?: Array<{ version?: string }>
      }
      const formula = parsed.formulae?.[0]
      const cask = parsed.casks?.[0]
      return {
        latestVersion: formula?.versions?.stable?.trim() || cask?.version?.trim() || null,
        installedVersion: formula?.installed?.[0]?.version?.trim() || null
      }
    } catch {
      // Try next candidate payload
    }
  }

  return null
}

function parseMoleStatusFromOutput(raw: string): MoleStatus {
  const output = raw.trim()
  if (!output) {
    return { installed: false, currentVersion: null, installMethod: null }
  }

  const versionMatch = output.match(/Mole version\s+([^\s]+)/i)
  const installMethodMatch = output.match(/^Install:\s*(.+)$/im)

  return {
    installed: true,
    currentVersion: versionMatch?.[1]?.trim() ?? null,
    installMethod: installMethodMatch?.[1]?.trim() ?? null
  }
}

async function resolveBrewPath(): Promise<string | null> {
  for (const brewPath of COMMON_BREW_PATHS) {
    if (existsSync(brewPath)) {
      return brewPath
    }
  }

  const pathResult = await runShellCommand('command -v brew')
  const brewPath = pathResult.success ? pathResult.stdout.trim() : ''

  return brewPath || null
}

async function getBrewStatus(): Promise<BrewStatus> {
  const brewPath = await resolveBrewPath()
  if (!brewPath) {
    return {
      installed: false,
      currentVersion: null,
      latestVersion: null,
      installedAppCount: null
    }
  }

  const versionResult = await runCommand(brewPath, ['--version'])
  let currentVersion = parseCurrentVersionFromOutput(
    `${versionResult.stdout}\n${versionResult.stderr}`.trim()
  )

  const infoResult = await runCommand(brewPath, ['info', '--json=v2', 'brew'])
  let latestVersion: string | null = null
  const parsedStdout = parseBrewInfoJsonPayload(infoResult.stdout)
  const parsedMerged =
    parsedStdout ??
    parseBrewInfoJsonPayload(`${infoResult.stdout}\n${infoResult.stderr}`)
  if (parsedMerged) {
    latestVersion = parsedMerged.latestVersion
    if (!currentVersion) {
      currentVersion = parsedMerged.installedVersion
    }
  }

  if (!latestVersion) {
    const formulaInfoResult = await runCommand(brewPath, ['info', '--json=v2', '--formula', 'brew'])
    const parsedFormulaInfo = parseBrewInfoJsonPayload(formulaInfoResult.stdout)
    if (parsedFormulaInfo?.latestVersion) {
      latestVersion = parsedFormulaInfo.latestVersion
    }
    if (!currentVersion && parsedFormulaInfo?.installedVersion) {
      currentVersion = parsedFormulaInfo.installedVersion
    }
  }

  if (!latestVersion) {
    const infoTextResult = await runCommand(brewPath, ['info', 'brew'])
    const stableMatch = `${infoTextResult.stdout}\n${infoTextResult.stderr}`.match(
      /stable[:\s]+([^\s,]+)/i
    )
    latestVersion = stableMatch?.[1]?.trim() || null
  }

  if (!latestVersion && currentVersion) {
    latestVersion = currentVersion
  }

  const caskListResult = await runCommand(brewPath, ['list', '--cask'])
  const caskCount = caskListResult.success
    ? caskListResult.stdout
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean).length
    : 0

  const installedAppCount = caskListResult.success ? caskCount : null

  return {
    installed: true,
    currentVersion,
    latestVersion,
    installedAppCount
  }
}

function getCachedBrewStatus(): CachedStatusPayload<BrewStatus> {
  return getJsonCacheValue<BrewStatus>('status_brew')
}

async function refreshBrewStatusCache(): Promise<CachedStatusPayload<BrewStatus>> {
  const status = await getBrewStatus()
  const updatedAt = setJsonCacheValue('status_brew', status)
  return { status, updatedAt }
}

function getCachedMoleStatus(): CachedStatusPayload<MoleStatus> {
  return getJsonCacheValue<MoleStatus>('status_mole')
}

async function refreshMoleStatusCache(): Promise<CachedStatusPayload<MoleStatus>> {
  const result = await runShellCommand('mo --version', 1000 * 30)
  const output = `${result.stdout}\n${result.stderr}`
  const status = result.success
    ? parseMoleStatusFromOutput(output)
    : { installed: false, currentVersion: null, installMethod: null }
  const updatedAt = setJsonCacheValue('status_mole', status)
  return { status, updatedAt }
}

async function syncInstalledAppsCache(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const brewPath = await resolveBrewPath()
    const db = getCacheDb()
    const now = Date.now()

    if (!brewPath) {
      db.prepare('UPDATE installed_apps_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      db.prepare('UPDATE browser_catalog_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      db.prepare('UPDATE catalog_items_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      db.prepare('DELETE FROM catalog_items_cache WHERE catalog_key = ?').run('installed')
      db.prepare(
        `
        INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
        VALUES ('installed_apps_last_sync_status', 'brew_not_found', @updated_at)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_value = excluded.cache_value,
          updated_at = excluded.updated_at
      `
      ).run({ updated_at: now })
      db.prepare(
        `
        INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
        VALUES ('catalog_installed_brew_installed', '0', @updated_at)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_value = excluded.cache_value,
          updated_at = excluded.updated_at
      `
      ).run({ updated_at: now })
      return { success: false, count: 0, error: 'Homebrew is not installed.' }
    }

    const caskListResult = await runCommand(brewPath, ['list', '--cask'])
    const formulaListResult = await runCommand(brewPath, ['list', '--formula'])
    if (!caskListResult.success || !formulaListResult.success) {
      db.prepare('UPDATE installed_apps_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      db.prepare('UPDATE browser_catalog_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      db.prepare('UPDATE catalog_items_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      db.prepare(
        `
        INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
        VALUES ('installed_apps_last_sync_status', 'list_failed', @updated_at)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_value = excluded.cache_value,
          updated_at = excluded.updated_at
      `
      ).run({ updated_at: now })
      return {
        success: false,
        count: 0,
        error:
          caskListResult.error ||
          caskListResult.stderr ||
          formulaListResult.error ||
          formulaListResult.stderr ||
          'brew list failed'
      }
    }

    const installedCaskTokens = caskListResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    const installedFormulaTokens = formulaListResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    const installedTokens = [...new Set([...installedCaskTokens, ...installedFormulaTokens])]
    const installedSet = new Set(installedTokens)
    const formulaSet = new Set(installedFormulaTokens)
    const selectCatalogIcon = db.prepare(
      `
      SELECT icon_url, fallback_icon_url, icon_key
      FROM catalog_items_cache
      WHERE token = ? AND catalog_key != 'installed'
      ORDER BY updated_at DESC
      LIMIT 1
    `
    )
    const selectBrowserCatalogIcon = db.prepare(
      `
      SELECT icon_url, fallback_icon_url
      FROM browser_catalog_cache
      WHERE token = ?
      LIMIT 1
    `
    )
    const metadataMap = new Map<
      string,
      { name: string; description: string; homepage: string | null; brewType: 'cask' | 'formula' }
    >()

    for (const tokenChunk of chunkArray(installedCaskTokens, 50)) {
      if (tokenChunk.length === 0) continue
      const infoResult = await runCommand(brewPath, ['info', '--json=v2', ...tokenChunk], 1000 * 60 * 10)
      if (!infoResult.success || !infoResult.stdout.trim()) {
        continue
      }
      try {
        const parsed = JSON.parse(infoResult.stdout) as {
          casks?: Array<{ token?: string; name?: string[]; desc?: string; homepage?: string }>
        }
        for (const cask of parsed.casks ?? []) {
          const token = cask.token?.trim()
          if (!token) continue
          metadataMap.set(token, {
            name: cask.name?.[0]?.trim() || token,
            description: cask.desc?.trim() || '',
            homepage: cask.homepage?.trim() || null,
            brewType: 'cask'
          })
        }
      } catch {
        // Ignore invalid JSON chunk and fallback to token-only records.
      }
    }

    for (const tokenChunk of chunkArray(installedFormulaTokens, 50)) {
      if (tokenChunk.length === 0) continue
      const infoResult = await runCommand(brewPath, ['info', '--json=v2', ...tokenChunk], 1000 * 60 * 10)
      if (!infoResult.success || !infoResult.stdout.trim()) {
        continue
      }
      try {
        const parsed = JSON.parse(infoResult.stdout) as {
          formulae?: Array<{ name?: string; desc?: string; homepage?: string }>
        }
        for (const formula of parsed.formulae ?? []) {
          const token = formula.name?.trim()
          if (!token) continue
          metadataMap.set(token, {
            name: token,
            description: formula.desc?.trim() || '',
            homepage: formula.homepage?.trim() || null,
            brewType: 'formula'
          })
        }
      } catch {
        // Ignore invalid JSON chunk and fallback to token-only records.
      }
    }

    const appRows: InstalledAppCacheItem[] = installedTokens.map((token) => {
      const meta = metadataMap.get(token)
      const brewType = meta?.brewType || (formulaSet.has(token) ? 'formula' : 'cask')
      const catalogIconRow = selectCatalogIcon.get(token) as
        | { icon_url: string | null; fallback_icon_url: string | null; icon_key: string | null }
        | undefined
      const browserIconRow = selectBrowserCatalogIcon.get(token) as
        | { icon_url: string | null; fallback_icon_url: string | null }
        | undefined
      const homebrewIcon = toHomebrewIcon(token, brewType)
      const generatedIcon = toDuckDuckGoFavicon(meta?.homepage || null)
      const iconUrl = homebrewIcon || catalogIconRow?.icon_url || browserIconRow?.icon_url || generatedIcon
      const fallbackIconUrl =
        catalogIconRow?.fallback_icon_url || browserIconRow?.fallback_icon_url || iconUrl

      return {
        token,
        name: meta?.name || token,
        description: meta?.description || '',
        homepage: meta?.homepage || null,
        iconUrl,
        fallbackIconUrl,
        iconKey: catalogIconRow?.icon_key || null,
        brewType,
        installed: true
      }
    })

    const transaction = db.transaction((rows: InstalledAppCacheItem[]) => {
      const upsertInstalledApp = db.prepare(
        `
        INSERT INTO installed_apps_cache (
          token, name, description, homepage, installed, last_seen_at, updated_at
        ) VALUES (
          @token, @name, @description, @homepage, @installed, @last_seen_at, @updated_at
        )
        ON CONFLICT(token) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          homepage = excluded.homepage,
          installed = excluded.installed,
          last_seen_at = excluded.last_seen_at,
          updated_at = excluded.updated_at
      `
      )

      rows.forEach((row) => {
        upsertInstalledApp.run({
          token: row.token,
          name: row.name,
          description: row.description,
          homepage: row.homepage,
          installed: row.installed ? 1 : 0,
          last_seen_at: now,
          updated_at: now
        })
      })

      db.prepare('UPDATE installed_apps_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      for (const token of installedSet) {
        db.prepare('UPDATE installed_apps_cache SET installed = 1, updated_at = @updated_at WHERE token = @token').run({
          token,
          updated_at: now
        })
      }

      db.prepare('UPDATE browser_catalog_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      for (const token of installedSet) {
        db.prepare('UPDATE browser_catalog_cache SET installed = 1, updated_at = @updated_at WHERE token = @token').run({
          token,
          updated_at: now
        })
      }

      db.prepare('UPDATE catalog_items_cache SET installed = 0, updated_at = @updated_at').run({
        updated_at: now
      })
      for (const token of installedSet) {
        db.prepare('UPDATE catalog_items_cache SET installed = 1, updated_at = @updated_at WHERE token = @token').run({
          token,
          updated_at: now
        })
      }

      db.prepare('DELETE FROM catalog_items_cache WHERE catalog_key = ?').run('installed')
      const upsertInstalledCatalogItem = db.prepare(
        `
        INSERT INTO catalog_items_cache (
          catalog_key, token, name, description, homepage, icon_url, fallback_icon_url, installed,
          icon_key, install_command, uninstall_command, brew_type, updated_at
        ) VALUES (
          @catalog_key, @token, @name, @description, @homepage, @icon_url, @fallback_icon_url, @installed,
          @icon_key, @install_command, @uninstall_command, @brew_type, @updated_at
        )
      `
      )

      rows.forEach((row) => {
        upsertInstalledCatalogItem.run({
          catalog_key: 'installed',
          token: row.token,
          name: row.name,
          description: row.description,
          homepage: row.homepage,
          icon_url: row.iconUrl,
          fallback_icon_url: row.fallbackIconUrl,
          installed: 1,
          icon_key: row.iconKey,
          install_command: row.brewType === 'cask' ? `brew install --cask ${row.token}` : `brew install ${row.token}`,
          uninstall_command:
            row.brewType === 'cask' ? `brew uninstall --cask ${row.token}` : `brew uninstall ${row.token}`,
          brew_type: row.brewType,
          updated_at: now
        })
      })

      db.prepare(
        `
        INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
        VALUES (@cache_key, @cache_value, @updated_at)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_value = excluded.cache_value,
          updated_at = excluded.updated_at
      `
      ).run({
        cache_key: 'catalog_installed_brew_installed',
        cache_value: '1',
        updated_at: now
      })

      db.prepare(
        `
        INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
        VALUES ('installed_apps_last_sync_status', 'ok', @updated_at)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_value = excluded.cache_value,
          updated_at = excluded.updated_at
      `
      ).run({ updated_at: now })

      db.prepare(
        `
        INSERT INTO app_cache_kv (cache_key, cache_value, updated_at)
        VALUES ('installed_apps_last_sync_count', @count, @updated_at)
        ON CONFLICT(cache_key) DO UPDATE SET
          cache_value = excluded.cache_value,
          updated_at = excluded.updated_at
      `
      ).run({ count: String(rows.length), updated_at: now })
    })

    transaction(appRows)

    return { success: true, count: appRows.length }
  } catch (error) {
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Failed to sync installed apps cache.'
    }
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.appPad')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  setupUpdateHandlers()
  ipcMain.handle('brew:get-status', async () => {
    const refreshed = await refreshBrewStatusCache()
    return refreshed.status
  })
  ipcMain.handle('terminal:create', async (_, payload?: { shell?: string }) => {
    return createTerminalSession(payload?.shell)
  })
  ipcMain.handle('terminal:write', async (_, payload: { sessionId: number; data: string }) => {
    return writeTerminalSession(payload.sessionId, payload.data)
  })
  ipcMain.handle('terminal:write-binary', async (_, payload: { sessionId: number; dataBase64: string }) => {
    return writeTerminalSessionBinary(payload.sessionId, payload.dataBase64)
  })
  ipcMain.handle('terminal:set-flow-control', async (_, payload: { sessionId: number; paused: boolean }) => {
    return setTerminalSessionFlowControl(payload.sessionId, payload.paused)
  })
  ipcMain.handle('terminal:resize', async (_, payload: { sessionId: number; cols: number; rows: number }) => {
    return resizeTerminalSession(payload.sessionId, payload.cols, payload.rows)
  })
  ipcMain.handle('terminal:close', async (_, payload: { sessionId: number }) => {
    return closeTerminalSession(payload.sessionId)
  })
  ipcMain.handle('terminal:exec', async (_, payload: { command: string }) => {
    return runShellCommand(payload.command, 1000 * 60 * 20)
  })
  ipcMain.handle('cache:get-browser-catalog', async () => {
    return getBrowserCatalogCache()
  })
  ipcMain.handle('cache:set-browser-catalog', async (_, payload: BrowserCatalogCachePayload) => {
    return setBrowserCatalogCache(payload)
  })
  ipcMain.handle('cache:get-installed-apps-status', async (_, payload: { tokens: string[] }) => {
    return getInstalledAppsStatus(payload.tokens)
  })
  ipcMain.handle('cache:get-catalog-items', async (_, payload: { catalogKey: string }) => {
    return getCatalogItemsCache(payload.catalogKey)
  })
  ipcMain.handle(
    'cache:set-catalog-items',
    async (_, payload: { catalogKey: string; data: CatalogCachePayload }) => {
      return setCatalogItemsCache(payload.catalogKey, payload.data)
    }
  )
  ipcMain.handle('cache:sync-installed-apps', async () => {
    return syncInstalledAppsCache()
  })
  ipcMain.handle('cache:get-search-icon-cache', async (_, payload: { tokens: string[] }) => {
    return getSearchIconCache(payload.tokens)
  })
  ipcMain.handle(
    'cache:upsert-search-icon-cache',
    async (_, payload: { items: SearchIconCacheItem[] }) => {
      return upsertSearchIconCache(payload.items)
    }
  )
  ipcMain.handle('cache:get-brew-status', async () => {
    return getCachedBrewStatus()
  })
  ipcMain.handle('cache:refresh-brew-status', async () => {
    return refreshBrewStatusCache()
  })
  ipcMain.handle('cache:get-mole-status', async () => {
    return getCachedMoleStatus()
  })
  ipcMain.handle('cache:refresh-mole-status', async () => {
    return refreshMoleStatusCache()
  })
  ipcMain.handle('brew:diagnose-version', async () => {
    const brewPath = await resolveBrewPath()
    if (!brewPath) {
      return {
        brewPath: null,
        version: { success: false, code: null, stdout: '', stderr: 'brew not found' },
        infoJson: { success: false, code: null, stdout: '', stderr: 'brew not found' },
        infoText: { success: false, code: null, stdout: '', stderr: 'brew not found' }
      }
    }

    const [version, infoJson, infoText] = await Promise.all([
      runCommand(brewPath, ['--version']),
      runCommand(brewPath, ['info', '--json=v2', 'brew']),
      runCommand(brewPath, ['info', 'brew'])
    ])

    return { brewPath, version, infoJson, infoText }
  })
  ipcMain.handle('brew:install', async () => {
    const command =
      'NONINTERACTIVE=1 CI=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    const result = await runShellCommand(command, 1000 * 60 * 30)
    const status = (await refreshBrewStatusCache()).status

    return {
      ...result,
      status
    }
  })
  ipcMain.handle('brew:update', async () => {
    const brewPath = await resolveBrewPath()
    if (!brewPath) {
      return {
        success: false,
        code: null,
        stdout: '',
        stderr: '',
        error: 'Homebrew is not installed.',
        status: (await refreshBrewStatusCache()).status
      }
    }

    const updateResult = await runCommand(brewPath, ['update'], 1000 * 60 * 15)
    const result: CommandResult = {
      success: updateResult.success,
      code: updateResult.code,
      stdout: updateResult.stdout,
      stderr: updateResult.stderr,
      error: updateResult.error
    }
    const status = (await refreshBrewStatusCache()).status

    return {
      ...result,
      status
    }
  })

  createWindow()
  void syncInstalledAppsCache()
  void refreshBrewStatusCache()
  void refreshMoleStatusCache()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  terminalSessions.forEach((session) => {
    session.pty.kill()
  })
  terminalSessions.clear()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (cacheDb) {
    cacheDb.close()
    cacheDb = null
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
