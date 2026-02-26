import { ElectronAPI } from '@electron-toolkit/preload'

type BrewStatus = {
  installed: boolean
  currentVersion: string | null
  latestVersion: string | null
  installedAppCount: number | null
}

type BrewActionResult = {
  success: boolean
  code: number | null
  stdout: string
  stderr: string
  error?: string
  status: BrewStatus
}

type MoleStatus = {
  installed: boolean
  currentVersion: string | null
  installMethod: string | null
}

type NodeVersionCacheItem = {
  formula: string
  installedVersion: string | null
  installed: boolean
  active: boolean
}

type MoleUninstallCandidate = {
  name: string
  size: string | null
  lastUsed: string | null
  uninstallSource: 'brew' | 'mole'
  uninstallCommand: string
}

type MoleUninstallAppsCache = {
  rows: MoleUninstallCandidate[]
  rawOutput: string
  queryCommand: string
  error: string | null
}

type CachedStatusPayload<T> = {
  status: T | null
  updatedAt: number | null
}

type BrewDiagnoseResult = {
  brewPath: string | null
  version: {
    success: boolean
    code: number | null
    stdout: string
    stderr: string
  }
  infoJson: {
    success: boolean
    code: number | null
    stdout: string
    stderr: string
  }
  infoText: {
    success: boolean
    code: number | null
    stdout: string
    stderr: string
  }
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

type AppAPI = {
  getBrewStatus: () => Promise<BrewStatus>
  diagnoseBrewVersion: () => Promise<BrewDiagnoseResult>
  installBrew: () => Promise<BrewActionResult>
  updateBrew: () => Promise<BrewActionResult>
  forceCleanBrewCask: (token: string) => Promise<{
    success: boolean
    message?: string
    error?: string
    removedPaths?: string[]
  }>
  createTerminalSession: (payload?: { shell?: string }) => Promise<{ sessionId: number }>
  writeTerminalSession: (sessionId: number, data: string) => Promise<{ success: boolean }>
  writeTerminalSessionBinary: (sessionId: number, dataBase64: string) => Promise<{ success: boolean }>
  setTerminalSessionFlowControl: (sessionId: number, paused: boolean) => Promise<{ success: boolean }>
  resizeTerminalSession: (sessionId: number, cols: number, rows: number) => Promise<{ success: boolean }>
  closeTerminalSession: (sessionId: number) => Promise<{ success: boolean }>
  executeTerminalCommand: (command: string) => Promise<{
    success: boolean
    code: number | null
    stdout: string
    stderr: string
    error?: string
  }>
  getBrowserCatalogCache: () => Promise<BrowserCatalogCachePayload>
  setBrowserCatalogCache: (payload: BrowserCatalogCachePayload) => Promise<{ success: true }>
  getInstalledAppsStatus: (tokens: string[]) => Promise<{
    items: Array<{
      token: string
      installed: boolean
      name: string | null
      description: string | null
      homepage: string | null
    }>
  }>
  getCatalogItemsCache: (catalogKey: string) => Promise<CatalogCachePayload>
  setCatalogItemsCache: (catalogKey: string, data: CatalogCachePayload) => Promise<{ success: true }>
  syncInstalledAppsCache: () => Promise<{
    success: boolean
    count: number
    error?: string
  }>
  getSearchIconCache: (tokens: string[]) => Promise<{
    items: Array<{
      token: string
      iconUrl: string | null
      fallbackIconUrl: string | null
    }>
  }>
  upsertSearchIconCache: (items: Array<{ token: string; iconUrl: string | null; fallbackIconUrl: string | null }>) => Promise<{ success: true }>
  getCachedBrewStatus: () => Promise<CachedStatusPayload<BrewStatus>>
  refreshBrewStatusCache: () => Promise<CachedStatusPayload<BrewStatus>>
  getCachedMoleStatus: () => Promise<CachedStatusPayload<MoleStatus>>
  refreshMoleStatusCache: () => Promise<CachedStatusPayload<MoleStatus>>
  getCachedNodeVersions: () => Promise<CachedStatusPayload<NodeVersionCacheItem[]>>
  refreshNodeVersionsCache: () => Promise<CachedStatusPayload<NodeVersionCacheItem[]>>
  getCachedMoleUninstallApps: () => Promise<CachedStatusPayload<MoleUninstallAppsCache>>
  refreshMoleUninstallAppsCache: () => Promise<CachedStatusPayload<MoleUninstallAppsCache>>
  checkForUpdates: () => Promise<{
    success: boolean
    updateAvailable: boolean
    currentVersion: string
    latestVersion?: string
    releaseNotes?: string
    downloadUrl?: string | null
    error?: string
  }>
  downloadAndInstallUpdate: () => Promise<{
    success: boolean
    message?: string
    error?: string
  }>
  quitAndInstall: () => Promise<{ success: boolean }>
  getAppVersion: () => Promise<{ version: string; name: string }>
  onUpdateDownloadProgress: (callback: (payload: { percent?: number }) => void) => () => void
  onUpdateDownloaded: (callback: () => void) => () => void
  onUpdateError: (callback: (message: string) => void) => () => void
  onTerminalData: (callback: (payload: { sessionId: number; data: string }) => void) => () => void
  onTerminalExit: (callback: (payload: { sessionId: number; code: number | null }) => void) => () => void
  getNativeTheme: () => Promise<{ dark: boolean }>
  onNativeThemeChanged: (callback: (isDark: boolean) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppAPI
  }
}
