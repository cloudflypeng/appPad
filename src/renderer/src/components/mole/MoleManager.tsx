import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  RefreshCw,
  Trash2,
  XCircle
} from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { executeWithGlobalTerminal } from '@/lib/globalTerminal'

type UninstallCandidate = {
  name: string
  size: string | null
  lastUsed: string | null
  uninstallSource: 'brew' | 'mole'
  uninstallCommand: string
}

type MoleStatus = {
  installed: boolean
  currentVersion: string | null
  installMethod: string | null
}

const MOLE_INSTALL_COMMAND = 'brew install mole'

type MoleUninstallAppsCache = {
  rows: UninstallCandidate[]
  rawOutput: string
  queryCommand: string
  error: string | null
}

function MoleManager(): React.JSX.Element {
  const [status, setStatus] = useState<MoleStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [runningUpdate, setRunningUpdate] = useState(false)
  const [runningInstall, setRunningInstall] = useState(false)
  const [runningClean, setRunningClean] = useState(false)
  const [runningQuery, setRunningQuery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<UninstallCandidate[]>([])
  const [lastRawOutput, setLastRawOutput] = useState<string>('')
  const [runningUninstallApp, setRunningUninstallApp] = useState<string | null>(null)
  const actionIconButtonClass =
    'h-7 w-7 border-0 bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

  const refreshStatus = async (showLoading = false): Promise<void> => {
    if (showLoading) setLoadingStatus(true)
    try {
      const refreshed = await window.api.refreshMoleStatusCache()
      setStatus(
        refreshed.status ?? {
          installed: false,
          currentVersion: null,
          installMethod: null
        }
      )
    } finally {
      if (showLoading) setLoadingStatus(false)
    }
  }

  const loadStatus = async (): Promise<void> => {
    setLoadingStatus(true)
    try {
      const cached = await window.api.getCachedMoleStatus()
      if (cached.status) {
        setStatus(cached.status)
        setLoadingStatus(false)
      } else {
        setStatus({
          installed: false,
          currentVersion: null,
          installMethod: null
        })
      }

      void refreshStatus(!cached.status).catch(() => {
        setLoadingStatus(false)
      })
    } catch {
      setStatus({
        installed: false,
        currentVersion: null,
        installMethod: null
      })
      setLoadingStatus(false)
    }
  }

  const runUpdate = async (): Promise<void> => {
    if (runningUpdate) return
    setRunningUpdate(true)
    setError(null)
    try {
      const result = await executeWithGlobalTerminal('mo update')
      if (!result.success) {
        setError(result.error ?? 'Mole update failed.')
      }
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mole update failed.')
    } finally {
      setRunningUpdate(false)
    }
  }

  const runInstall = async (): Promise<void> => {
    if (runningInstall) return
    setRunningInstall(true)
    setError(null)
    try {
      const result = await executeWithGlobalTerminal(MOLE_INSTALL_COMMAND)
      if (!result.success) {
        setError(result.error ?? 'Mole install failed.')
      }
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mole install failed.')
    } finally {
      setRunningInstall(false)
    }
  }

  const runClean = async (): Promise<void> => {
    if (runningClean) return
    setRunningClean(true)
    setError(null)
    try {
      const result = await executeWithGlobalTerminal('mo clean')
      if (!result.success) {
        setError(result.error ?? 'Mole clean failed.')
        return
      }
      await refreshStatus()
      await window.api.syncInstalledAppsCache()
      await runQuery(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mole clean failed.')
    } finally {
      setRunningClean(false)
    }
  }

  const applyMoleUninstallAppsCache = (cache: MoleUninstallAppsCache): void => {
    setRows(cache.rows)
    setLastRawOutput(cache.rawOutput ?? '')
    setError(cache.error ?? null)
  }

  const runQuery = async (forceRefresh = false): Promise<void> => {
    if (runningQuery) return

    setRunningQuery(true)
    if (forceRefresh || rows.length === 0) {
      setError(null)
    }
    let hasCached = false
    try {
      if (!forceRefresh) {
        const cached = await window.api.getCachedMoleUninstallApps()
        if (cached.status) {
          hasCached = true
          applyMoleUninstallAppsCache(cached.status)
        }
      }

      const refreshed = await window.api.refreshMoleUninstallAppsCache()
      if (refreshed.status) {
        applyMoleUninstallAppsCache(refreshed.status)
      } else if (!hasCached) {
        setRows([])
        setLastRawOutput('')
        setError(null)
      }
    } catch (err) {
      if (!hasCached) {
        setRows([])
        setLastRawOutput('')
      }
      setError(err instanceof Error ? err.message : 'Failed to refresh Mole app cache.')
    } finally {
      setRunningQuery(false)
    }
  }

  const runUninstall = async (row: UninstallCandidate): Promise<void> => {
    if (runningUninstallApp) return
    const confirmed = window.confirm(
      `Confirm uninstall ${row.name}?\n\nCommand: ${row.uninstallCommand}`
    )
    if (!confirmed) return

    setRunningUninstallApp(row.name)
    setError(null)
    try {
      const result = await executeWithGlobalTerminal(row.uninstallCommand)
      if (!result.success) {
        setError(result.error ?? `Failed to uninstall ${row.name}.`)
        return
      }
      await window.api.syncInstalledAppsCache()
      await runQuery(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to uninstall ${row.name}.`)
    } finally {
      setRunningUninstallApp(null)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    void runQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="px-6 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-base font-semibold">Mole Installation</h2>
            <p className="text-sm text-muted-foreground">Detect Mole installation status and run update.</p>
          </div>
          <div className="divide-y divide-glass-divider">
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Installation</p>
                <p className="text-xs text-muted-foreground">Mole command availability</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {loadingStatus ? null : status?.installed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <Badge variant={status?.installed ? 'default' : 'destructive'}>
                  {loadingStatus ? 'Checking...' : status?.installed ? 'Installed' : 'Not Installed'}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Current Version</p>
                <p className="text-xs text-muted-foreground">Detected local Mole version</p>
              </div>
              <p className="shrink-0 font-mono text-sm">
                {loadingStatus ? 'Checking...' : status?.currentVersion ?? 'N/A'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Install Method</p>
                <p className="text-xs text-muted-foreground">Source reported by Mole</p>
              </div>
              <p className="shrink-0 font-mono text-sm">
                {loadingStatus ? 'Checking...' : status?.installMethod ?? 'N/A'}
              </p>
            </div>

            <div className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Action</p>
                <p className="text-xs text-muted-foreground">
                  {status?.installed
                    ? 'Update Mole to the latest version.'
                    : 'Install Mole first, then you can update and manage apps.'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className={actionIconButtonClass}
                      onClick={() => {
                        void loadStatus()
                      }}
                      disabled={loadingStatus || runningUpdate || runningInstall || runningClean}
                      aria-label={loadingStatus ? 'Refreshing status...' : 'Refresh status'}
                    >
                      <RefreshCw className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>
                    <p>{loadingStatus ? 'Refreshing status...' : 'Refresh status'}</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className={actionIconButtonClass}
                      onClick={() => {
                        void runClean()
                      }}
                      disabled={
                        loadingStatus || runningUpdate || runningInstall || runningClean || !status?.installed
                      }
                      aria-label={runningClean ? 'Cleaning...' : 'mo clean'}
                    >
                      <Trash2 className={`h-4 w-4 ${runningClean ? 'animate-pulse' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>
                    <p>{runningClean ? 'Cleaning...' : 'mo clean'}</p>
                    <p className="font-mono text-[11px]">mo clean</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className={actionIconButtonClass}
                      onClick={() => {
                        if (status?.installed) {
                          void runUpdate()
                        } else {
                          void runInstall()
                        }
                      }}
                      disabled={loadingStatus || runningUpdate || runningInstall || runningClean}
                      aria-label={
                        status?.installed
                          ? runningUpdate
                            ? 'Updating...'
                            : 'Update Mole'
                          : runningInstall
                            ? 'Installing...'
                            : 'Install Mole'
                      }
                    >
                      {status?.installed ? (
                        <ArrowUpCircle className={`h-4 w-4 ${runningUpdate ? 'animate-pulse' : ''}`} />
                      ) : (
                        <Download className={`h-4 w-4 ${runningInstall ? 'animate-pulse' : ''}`} />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={8}>
                    <p>
                      {status?.installed
                        ? runningUpdate
                          ? 'Updating...'
                          : 'Update Mole'
                        : runningInstall
                          ? 'Installing...'
                          : 'Install Mole'}
                    </p>
                    <p className="font-mono text-[11px]">
                      {status?.installed ? 'mo update' : 'brew install mole'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <h2 className="text-base font-semibold">Uninstallable Apps</h2>
              <p className="text-sm text-muted-foreground">
                {rows.length > 0
                  ? `${rows.length} apps parsed`
                  : runningQuery
                    ? 'Querying...'
                    : 'No data yet'}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="border-0 shadow-none"
              onClick={() => {
                void runQuery(true)
              }}
              disabled={runningQuery}
            >
              <RefreshCw className={`h-4 w-4 ${runningQuery ? 'animate-spin' : ''}`} />
              {runningQuery ? 'Querying...' : 'Refresh'}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground/90">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">App</th>
                  <th className="px-2 py-1.5 text-left font-medium">Size</th>
                  <th className="px-2 py-1.5 text-left font-medium">Last Used</th>
                  <th className="px-2 py-1.5 text-left font-medium">Source</th>
                  <th className="px-2 py-1.5 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="[&>tr]:border-b [&>tr]:border-glass-divider [&>tr:last-child]:border-0">
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.name}>
                      <td className="px-2 py-2">{row.name}</td>
                      <td className="px-2 py-2 text-muted-foreground">{row.size ?? 'N/A'}</td>
                      <td className="px-2 py-2 text-muted-foreground">{row.lastUsed ?? 'N/A'}</td>
                      <td className="px-2 py-2">
                        <Badge variant={row.uninstallSource === 'brew' ? 'secondary' : 'outline'}>
                          {row.uninstallSource}
                        </Badge>
                      </td>
                      <td className="px-2 py-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className={actionIconButtonClass}
                              onClick={() => {
                                void runUninstall(row)
                              }}
                              disabled={runningQuery || runningUninstallApp !== null}
                              aria-label={runningUninstallApp === row.name ? 'Uninstalling...' : 'Uninstall'}
                            >
                              <Trash2
                                className={`h-4 w-4 ${runningUninstallApp === row.name ? 'animate-pulse' : ''}`}
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={8}>
                            <p>{runningUninstallApp === row.name ? 'Uninstalling...' : 'Uninstall'}</p>
                            <p className="font-mono text-[11px]">{row.uninstallCommand}</p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-2 py-8 text-center text-muted-foreground" colSpan={5}>
                      {runningQuery ? 'Querying, please wait...' : 'No uninstallable apps parsed.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {lastRawOutput && rows.length === 0 ? (
          <Alert>
            <AlertDescription className="space-y-1">
              <p className="font-medium">Raw output snippet when parsing fails:</p>
              <pre className="max-h-40 overflow-auto rounded-md p-2 text-xs">{lastRawOutput}</pre>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  )
}

export default MoleManager
