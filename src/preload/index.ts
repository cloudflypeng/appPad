import { ipcRenderer } from 'electron'
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getBrewStatus: () => ipcRenderer.invoke('brew:get-status'),
  diagnoseBrewVersion: () => ipcRenderer.invoke('brew:diagnose-version'),
  installBrew: () => ipcRenderer.invoke('brew:install'),
  updateBrew: () => ipcRenderer.invoke('brew:update'),
  createTerminalSession: (payload?: { shell?: string }) =>
    ipcRenderer.invoke('terminal:create', payload) as Promise<{ sessionId: number }>,
  writeTerminalSession: (sessionId: number, data: string) =>
    ipcRenderer.invoke('terminal:write', { sessionId, data }) as Promise<{ success: boolean }>,
  writeTerminalSessionBinary: (sessionId: number, dataBase64: string) =>
    ipcRenderer.invoke('terminal:write-binary', { sessionId, dataBase64 }) as Promise<{ success: boolean }>,
  setTerminalSessionFlowControl: (sessionId: number, paused: boolean) =>
    ipcRenderer.invoke('terminal:set-flow-control', { sessionId, paused }) as Promise<{ success: boolean }>,
  resizeTerminalSession: (sessionId: number, cols: number, rows: number) =>
    ipcRenderer.invoke('terminal:resize', { sessionId, cols, rows }) as Promise<{ success: boolean }>,
  closeTerminalSession: (sessionId: number) =>
    ipcRenderer.invoke('terminal:close', { sessionId }) as Promise<{ success: boolean }>,
  executeTerminalCommand: (command: string) =>
    ipcRenderer.invoke('terminal:exec', { command }) as Promise<{
      success: boolean
      code: number | null
      stdout: string
      stderr: string
      error?: string
    }>,
  getBrowserCatalogCache: () =>
    ipcRenderer.invoke('cache:get-browser-catalog') as Promise<{
      brewInstalled: boolean | null
      items: Array<{
        token: string
        name: string
        description: string
        homepage: string | null
        iconUrl: string | null
        fallbackIconUrl: string | null
        installed: boolean
      }>
    }>,
  setBrowserCatalogCache: (payload: {
    brewInstalled: boolean | null
    items: Array<{
      token: string
      name: string
      description: string
      homepage: string | null
      iconUrl: string | null
      fallbackIconUrl: string | null
      installed: boolean
    }>
  }) => ipcRenderer.invoke('cache:set-browser-catalog', payload) as Promise<{ success: true }>,
  getInstalledAppsStatus: (tokens: string[]) =>
    ipcRenderer.invoke('cache:get-installed-apps-status', { tokens }) as Promise<{
      items: Array<{
        token: string
        installed: boolean
        name: string | null
        description: string | null
        homepage: string | null
      }>
    }>,
  getCatalogItemsCache: (catalogKey: string) =>
    ipcRenderer.invoke('cache:get-catalog-items', { catalogKey }) as Promise<{
      brewInstalled: boolean | null
      items: Array<{
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
      }>
    }>,
  setCatalogItemsCache: (
    catalogKey: string,
    data: {
      brewInstalled: boolean | null
      items: Array<{
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
      }>
    }
  ) => ipcRenderer.invoke('cache:set-catalog-items', { catalogKey, data }) as Promise<{ success: true }>,
  syncInstalledAppsCache: () =>
    ipcRenderer.invoke('cache:sync-installed-apps') as Promise<{
      success: boolean
      count: number
      error?: string
    }>,
  getSearchIconCache: (tokens: string[]) =>
    ipcRenderer.invoke('cache:get-search-icon-cache', { tokens }) as Promise<{
      items: Array<{
        token: string
        iconUrl: string | null
        fallbackIconUrl: string | null
      }>
    }>,
  upsertSearchIconCache: (items: Array<{ token: string; iconUrl: string | null; fallbackIconUrl: string | null }>) =>
    ipcRenderer.invoke('cache:upsert-search-icon-cache', { items }) as Promise<{ success: true }>,
  getCachedBrewStatus: () =>
    ipcRenderer.invoke('cache:get-brew-status') as Promise<{
      status: {
        installed: boolean
        currentVersion: string | null
        latestVersion: string | null
        installedAppCount: number | null
      } | null
      updatedAt: number | null
    }>,
  refreshBrewStatusCache: () =>
    ipcRenderer.invoke('cache:refresh-brew-status') as Promise<{
      status: {
        installed: boolean
        currentVersion: string | null
        latestVersion: string | null
        installedAppCount: number | null
      } | null
      updatedAt: number | null
    }>,
  getCachedMoleStatus: () =>
    ipcRenderer.invoke('cache:get-mole-status') as Promise<{
      status: {
        installed: boolean
        currentVersion: string | null
        installMethod: string | null
      } | null
      updatedAt: number | null
    }>,
  refreshMoleStatusCache: () =>
    ipcRenderer.invoke('cache:refresh-mole-status') as Promise<{
      status: {
        installed: boolean
        currentVersion: string | null
        installMethod: string | null
      } | null
      updatedAt: number | null
    }>,
  checkForUpdates: () =>
    ipcRenderer.invoke('check-for-updates') as Promise<{
      success: boolean
      updateAvailable: boolean
      currentVersion: string
      latestVersion?: string
      releaseNotes?: string
      downloadUrl?: string | null
      error?: string
    }>,
  downloadAndInstallUpdate: () =>
    ipcRenderer.invoke('download-and-install-update') as Promise<{
      success: boolean
      message?: string
      error?: string
    }>,
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install') as Promise<{ success: boolean }>,
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version') as Promise<{ version: string; name: string }>,
  onUpdateDownloadProgress: (callback: (payload: { percent?: number }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { percent?: number }) => {
      callback(payload)
    }
    ipcRenderer.on('update-download-progress', listener)
    return () => ipcRenderer.removeListener('update-download-progress', listener)
  },
  onUpdateDownloaded: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('update-downloaded', listener)
    return () => ipcRenderer.removeListener('update-downloaded', listener)
  },
  onUpdateError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message)
    }
    ipcRenderer.on('update-error', listener)
    return () => ipcRenderer.removeListener('update-error', listener)
  },
  onTerminalData: (callback: (payload: { sessionId: number; data: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { sessionId: number; data: string }) => {
      callback(payload)
    }
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (callback: (payload: { sessionId: number; code: number | null }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: number; code: number | null }
    ) => {
      callback(payload)
    }
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
