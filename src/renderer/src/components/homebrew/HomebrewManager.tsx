import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowUpCircle, CheckCircle2, Package, Rocket, XCircle } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  appendToGlobalTerminal,
  executeWithGlobalTerminal,
  openGlobalTerminal
} from '@/lib/globalTerminal'

type BrewStatus = {
  installed: boolean
  currentVersion: string | null
  latestVersion: string | null
  installedAppCount: number | null
}

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function HomebrewManager(): React.JSX.Element {
  const [status, setStatus] = useState<BrewStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [runningAction, setRunningAction] = useState<'install' | 'update' | 'upgradeAll' | null>(null)
  const [runningTerminalCommand, setRunningTerminalCommand] = useState(false)
  const [cleanupToken, setCleanupToken] = useState('applite')
  const [runningCleanup, setRunningCleanup] = useState(false)
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const installLabel = useMemo(() => {
    return runningAction === 'install' ? 'Installing...' : 'Install Homebrew'
  }, [runningAction])

  const updateLabel = useMemo(() => {
    return runningAction === 'update' ? 'Updating...' : 'Update Homebrew'
  }, [runningAction])

  const upgradeAllLabel = useMemo(() => {
    return runningAction === 'upgradeAll' ? 'Upgrading...' : 'Upgrade All Packages'
  }, [runningAction])

  const executeCommandSilently = async (
    command: string
  ): Promise<{
    success: boolean
    stdout: string
    stderr: string
    code: number | null
    error?: string
  }> => {
    const execute =
      (
        window.api as typeof window.api & {
          executeTerminalCommand?: (cmd: string) => Promise<{
            success: boolean
            code: number | null
            stdout: string
            stderr: string
            error?: string
          }>
        }
      ).executeTerminalCommand ??
      ((cmd: string) =>
        window.electron.ipcRenderer.invoke('terminal:exec', { command: cmd }) as Promise<{
          success: boolean
          code: number | null
          stdout: string
          stderr: string
          error?: string
        }>)

    return execute(command)
  }

  const applyStatus = async (nextStatus: BrewStatus, enableDiagnose: boolean): Promise<void> => {
    setStatus(nextStatus)

    if (
      nextStatus.installed &&
      (nextStatus.installedAppCount === null || nextStatus.installedAppCount === undefined)
    ) {
      try {
        const caskCountResult = await executeCommandSilently('brew list --cask 2>/dev/null | wc -l')
        const caskCount = Number.parseInt(caskCountResult.stdout.trim(), 10)
        const safeCaskCount = Number.isFinite(caskCount) ? caskCount : 0
        setStatus((prev) => (prev ? { ...prev, installedAppCount: safeCaskCount } : prev))
      } catch {
        // keep N/A if fallback commands fail
      }
    }

    if (enableDiagnose && nextStatus.installed && !nextStatus.currentVersion && !nextStatus.latestVersion) {
      const diagnose = (
        window.api as typeof window.api & { diagnoseBrewVersion?: () => Promise<any> }
      ).diagnoseBrewVersion
      if (diagnose) {
        const diag = await diagnose()
        openGlobalTerminal()
        appendToGlobalTerminal('[diagnose] brew path')
        appendToGlobalTerminal(String(diag.brewPath))
        appendToGlobalTerminal('[diagnose] brew --version stdout')
        appendToGlobalTerminal(diag.version.stdout || '<empty>')
        appendToGlobalTerminal('[diagnose] brew --version stderr')
        appendToGlobalTerminal(diag.version.stderr || '<empty>')
        appendToGlobalTerminal('[diagnose] brew info --json=v2 brew stdout')
        appendToGlobalTerminal(diag.infoJson.stdout || '<empty>')
        appendToGlobalTerminal('[diagnose] brew info --json=v2 brew stderr')
        appendToGlobalTerminal(diag.infoJson.stderr || '<empty>')
      }
    }
  }

  const refreshStatus = async (showLoading = false): Promise<void> => {
    if (showLoading) setLoadingStatus(true)
    try {
      const refreshed = await window.api.refreshBrewStatusCache()
      if (refreshed.status) {
        await applyStatus(refreshed.status, true)
      }
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
        await applyStatus(cached.status, false)
        setLoadingStatus(false)
      }

      void refreshStatus(!cached.status).catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to refresh Homebrew status.')
        setLoadingStatus(false)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read Homebrew status.')
      setLoadingStatus(false)
    }
  }

  const runAction = async (action: 'install' | 'update' | 'upgradeAll'): Promise<void> => {
    setRunningAction(action)
    setError(null)
    try {
      const command =
        action === 'install'
          ? '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
          : action === 'update'
            ? 'brew update'
            : 'brew update && brew upgrade --formula && brew upgrade --cask'
      setRunningTerminalCommand(true)
      await executeWithGlobalTerminal(command)
      await window.api.syncInstalledAppsCache()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed to execute.')
    } finally {
      setRunningTerminalCommand(false)
      setRunningAction(null)
    }
  }

  const runForceCleanup = async (): Promise<void> => {
    const token = cleanupToken.trim()
    if (!token) {
      setError('Please input a cask token.')
      return
    }

    setRunningCleanup(true)
    setError(null)
    setCleanupMessage(null)
    try {
      const result = await window.api.forceCleanBrewCask(token)
      if (!result.success) {
        setError(result.error ?? 'Failed to force clean cask residue.')
      } else {
        setCleanupMessage(result.message ?? `Force cleanup completed for ${token}.`)
      }
      await window.api.syncInstalledAppsCache()
      await refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to force clean cask residue.')
    } finally {
      setRunningCleanup(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    const handler = (): void => {
      void refreshStatus()
    }
    window.addEventListener(APP_TOPBAR_REFRESH_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(APP_TOPBAR_REFRESH_EVENT, handler as EventListener)
    }
  }, [])

  return (
    <main className="px-6 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {loadingStatus ? (
          <div className="space-y-3">
            <Skeleton className="h-80 w-full rounded-md" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Installation</p>
                <p className="text-xs text-muted-foreground">
                  Homebrew installation detection status
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {status?.installed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <Badge variant={status?.installed ? 'default' : 'destructive'}>
                  {status?.installed ? 'Installed' : 'Not Installed'}
                </Badge>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Current Version</p>
                <p className="text-xs text-muted-foreground">Detected local brew version</p>
              </div>
              <p className="shrink-0 font-mono text-sm">{status?.currentVersion ?? 'N/A'}</p>
            </div>

            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Latest Version</p>
                <p className="text-xs text-muted-foreground">
                  Available release from Homebrew metadata
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm">{status?.latestVersion ?? 'N/A'}</p>
            </div>

            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Installed Cask Apps</p>
                <p className="text-xs text-muted-foreground">
                  Number of installed cask applications
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm">
                {status?.installedAppCount !== null && status?.installedAppCount !== undefined
                  ? status.installedAppCount
                  : 'N/A'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Action</p>
                <p className="text-xs text-muted-foreground">
                  {status?.installed
                    ? 'Update Homebrew itself, or upgrade all installed formula and cask packages.'
                    : 'Install Homebrew using official install script.'}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {status?.installed ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void runAction('upgradeAll')
                      }}
                      disabled={loadingStatus || runningAction !== null || runningTerminalCommand}
                    >
                      <Rocket className="mr-2 h-4 w-4" />
                      {upgradeAllLabel}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        void runAction('update')
                      }}
                      disabled={loadingStatus || runningAction !== null || runningTerminalCommand}
                    >
                      <ArrowUpCircle className="mr-2 h-4 w-4" />
                      {updateLabel}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      void runAction('install')
                    }}
                    disabled={loadingStatus || runningAction !== null || runningTerminalCommand}
                  >
                    <Package className="mr-2 h-4 w-4" />
                    {installLabel}
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t bg-background px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Force Clean Residue</p>
                <p className="text-xs text-muted-foreground">
                  Remove stale Homebrew caskroom metadata when a cask appears installed but is actually removed.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Input
                  value={cleanupToken}
                  onChange={(event) => setCleanupToken(event.target.value)}
                  placeholder="cask token (e.g. applite)"
                  className="h-8 w-52"
                  disabled={runningCleanup || loadingStatus || runningAction !== null || runningTerminalCommand}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void runForceCleanup()
                  }}
                  disabled={
                    runningCleanup ||
                    loadingStatus ||
                    runningAction !== null ||
                    runningTerminalCommand ||
                    cleanupToken.trim().length === 0
                  }
                >
                  {runningCleanup ? 'Cleaning...' : 'Force Clean'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {cleanupMessage ? (
          <Alert>
            <AlertDescription>{cleanupMessage}</AlertDescription>
          </Alert>
        ) : null}

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

export default HomebrewManager
