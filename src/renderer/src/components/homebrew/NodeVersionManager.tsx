import { useEffect, useState } from 'react'

import { AlertCircle, ArrowRightLeft, Download, RefreshCw } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { executeWithGlobalTerminal } from '@/lib/globalTerminal'

type NodeVersionItem = {
  formula: string
  installedVersion: string | null
  installed: boolean
  active: boolean
}

type BrewStatus = {
  installed: boolean
  currentVersion: string | null
  latestVersion: string | null
  installedAppCount: number | null
}

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function NodeVersionManager(): React.JSX.Element {
  const [brewStatus, setBrewStatus] = useState<BrewStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [nodeVersions, setNodeVersions] = useState<NodeVersionItem[]>([])
  const [loadingNodeVersions, setLoadingNodeVersions] = useState(false)
  const [runningNodeFormula, setRunningNodeFormula] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const actionIconButtonClass =
    'h-7 w-7 border-0 bg-transparent text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white'

  const refreshBrewStatus = async (showLoading = false): Promise<BrewStatus | null> => {
    if (showLoading) setLoadingStatus(true)
    try {
      const refreshed = await window.api.refreshBrewStatusCache()
      if (refreshed.status) {
        setBrewStatus(refreshed.status)
        return refreshed.status
      }
      return null
    } finally {
      if (showLoading) setLoadingStatus(false)
    }
  }

  const loadStatus = async (): Promise<void> => {
    setLoadingStatus(true)
    setError(null)
    try {
      const cached = await window.api.getCachedBrewStatus()
      if (cached.status) {
        setBrewStatus(cached.status)
        setLoadingStatus(false)
        void refreshBrewStatus(false).catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to refresh Homebrew status.')
        })
      } else {
        const next = await refreshBrewStatus(false)
        if (!next) {
          setBrewStatus({
            installed: false,
            currentVersion: null,
            latestVersion: null,
            installedAppCount: null
          })
        }
        setLoadingStatus(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read Homebrew status.')
      setLoadingStatus(false)
    }
  }

  const refreshAll = async (): Promise<void> => {
    setError(null)
    try {
      const refreshed = await refreshBrewStatus(true)
      if (!refreshed?.installed) {
        setNodeVersions([])
        return
      }
      await loadNodeVersions(true, refreshed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh Node versions.')
    }
  }

  const loadNodeVersions = async (
    forceRefresh = false,
    statusOverride?: BrewStatus | null
  ): Promise<void> => {
    const nextStatus = statusOverride ?? brewStatus
    if (!nextStatus?.installed) {
      setNodeVersions([])
      return
    }

    const shouldShowLoading = forceRefresh || nodeVersions.length === 0
    if (shouldShowLoading) {
      setLoadingNodeVersions(true)
      setError(null)
    }
    let hasCached = false
    try {
      if (!forceRefresh) {
        const cached = await window.api.getCachedNodeVersions()
        if (cached.status) {
          hasCached = true
          setNodeVersions(cached.status)
          if (shouldShowLoading) {
            setLoadingNodeVersions(false)
          }
        }
      }

      const refreshed = await window.api.refreshNodeVersionsCache()
      if (refreshed.status) {
        setNodeVersions(refreshed.status)
      } else if (!hasCached) {
        setNodeVersions([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Node versions.')
      if (!hasCached) {
        setNodeVersions([])
      }
    } finally {
      setLoadingNodeVersions(false)
    }
  }

  const runSwitchNodeVersion = async (targetFormula: string): Promise<void> => {
    if (!brewStatus?.installed || runningNodeFormula) return
    if (!/^node(?:@\d+)?$/.test(targetFormula)) {
      setError(`Invalid Node formula: ${targetFormula}`)
      return
    }

    setRunningNodeFormula(targetFormula)
    setError(null)
    try {
      const unlinkTargets = nodeVersions
        .map((item) => item.formula.trim())
        .filter((formula) => /^node(?:@\d+)?$/.test(formula))
      const target = nodeVersions.find((item) => item.formula === targetFormula)
      const commands: string[] = []

      if (!target?.installed) {
        commands.push(`brew install ${targetFormula}`)
      }
      if (unlinkTargets.length > 0) {
        commands.push(unlinkTargets.map((formula) => `brew unlink ${formula} >/dev/null 2>&1 || true`).join(' && '))
      }
      commands.push(`brew link --overwrite --force ${targetFormula}`)

      const result = await executeWithGlobalTerminal(commands.join(' && '))
      if (!result.success) {
        setError(result.error || result.stderr || `Failed to switch to ${targetFormula}.`)
        return
      }

      await window.api.syncInstalledAppsCache()
      const refreshedStatus = await refreshBrewStatus()
      await loadNodeVersions(true, refreshedStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to switch to ${targetFormula}.`)
    } finally {
      setRunningNodeFormula(null)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    if (!brewStatus?.installed) {
      setNodeVersions([])
      return
    }
    void loadNodeVersions(false, brewStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brewStatus?.installed])

  useEffect(() => {
    const handler = (): void => {
      void loadStatus()
    }
    window.addEventListener(APP_TOPBAR_REFRESH_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(APP_TOPBAR_REFRESH_EVENT, handler as EventListener)
    }
  }, [])

  return (
    <main className="px-6 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Node Version Switch</h2>
              <p className="text-sm text-muted-foreground">
                List Homebrew Node formulas and switch active version.
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className={actionIconButtonClass}
                  onClick={() => {
                    void refreshAll()
                  }}
                  disabled={loadingStatus || loadingNodeVersions || runningNodeFormula !== null}
                  aria-label={loadingStatus || loadingNodeVersions ? 'Refreshing...' : 'Refresh'}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingStatus || loadingNodeVersions ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={8}>
                <p>{loadingStatus || loadingNodeVersions ? 'Refreshing...' : 'Refresh'}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {!loadingStatus && !brewStatus?.installed ? (
            <p className="text-sm text-muted-foreground">
              Homebrew is not installed. Please install Homebrew in the Homebrew tab first.
            </p>
          ) : null}

          {loadingNodeVersions && nodeVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading Node versions...</p>
          ) : null}

          {!loadingNodeVersions && brewStatus?.installed && nodeVersions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Homebrew Node formulas found.</p>
          ) : null}

          {nodeVersions.length > 0 ? (
            <ul className="divide-y divide-white/[0.06]">
              {nodeVersions.map((item) => (
                <li key={item.formula} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm">{item.formula}</p>
                      {item.active ? <Badge>Active</Badge> : null}
                      <Badge variant={item.installed ? 'default' : 'secondary'}>
                        {item.installed ? `Installed ${item.installedVersion ?? ''}`.trim() : 'Not Installed'}
                      </Badge>
                    </div>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className={actionIconButtonClass}
                        disabled={item.active || runningNodeFormula !== null || loadingNodeVersions || loadingStatus}
                        onClick={() => {
                          void runSwitchNodeVersion(item.formula)
                        }}
                        aria-label={
                          runningNodeFormula === item.formula
                            ? 'Switching...'
                            : item.active
                              ? 'Already Active'
                              : item.installed
                                ? 'Switch'
                                : 'Install & Switch'
                        }
                      >
                        {runningNodeFormula === item.formula ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : item.installed ? (
                          <ArrowRightLeft className="h-4 w-4" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent sideOffset={8}>
                      <p>
                        {runningNodeFormula === item.formula
                          ? 'Switching...'
                          : item.active
                            ? 'Already Active'
                            : item.installed
                              ? 'Switch'
                              : 'Install & Switch'}
                      </p>
                      <p className="font-mono text-[11px]">
                        {item.installed
                          ? `brew link --overwrite --force ${item.formula}`
                          : `brew install ${item.formula} && brew link --overwrite --force ${item.formula}`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  )
}

export default NodeVersionManager
