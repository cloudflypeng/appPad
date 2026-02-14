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

type NodeVersionItem = {
  formula: string
  installedVersion: string | null
  installed: boolean
  active: boolean
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
  const [nodeVersions, setNodeVersions] = useState<NodeVersionItem[]>([])
  const [loadingNodeVersions, setLoadingNodeVersions] = useState(false)
  const [runningNodeFormula, setRunningNodeFormula] = useState<string | null>(null)
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

  const loadNodeVersions = async (): Promise<void> => {
    if (!status?.installed) {
      setNodeVersions([])
      return
    }

    setLoadingNodeVersions(true)
    try {
      const search = await executeCommandSilently("brew search '/^node(@[0-9]+)?$/'")
      const nodeExecPathResult = await executeCommandSilently('node -p "process.execPath" 2>/dev/null || true')
      const activeExecPath = nodeExecPathResult.stdout.trim()

      const formulas = [...new Set(
        search.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => /^node(?:@\d+)?$/.test(line))
      )]

      formulas.sort((a, b) => {
        if (a === 'node') return -1
        if (b === 'node') return 1
        const aMajor = Number.parseInt(a.replace('node@', ''), 10)
        const bMajor = Number.parseInt(b.replace('node@', ''), 10)
        if (Number.isNaN(aMajor) || Number.isNaN(bMajor)) return a.localeCompare(b)
        return bMajor - aMajor
      })

      const next: NodeVersionItem[] = []
      for (const formula of formulas) {
        const versionResult = await executeCommandSilently(`brew list --versions ${formula} 2>/dev/null || true`)
        const tokens = versionResult.stdout.trim().split(/\s+/).filter(Boolean)
        const installedVersion = tokens.length > 1 ? tokens[1] : null
        const installed = installedVersion !== null
        const active =
          installed &&
          activeExecPath.length > 0 &&
          (activeExecPath.includes(`/Cellar/${formula}/`) ||
            activeExecPath.includes(`/opt/homebrew/opt/${formula}/`) ||
            activeExecPath.includes(`/usr/local/opt/${formula}/`))

        next.push({
          formula,
          installedVersion,
          installed,
          active
        })
      }

      setNodeVersions(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Node versions.')
    } finally {
      setLoadingNodeVersions(false)
    }
  }

  const runSwitchNodeVersion = async (targetFormula: string): Promise<void> => {
    if (!status?.installed || runningNodeFormula) return
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
      await refreshStatus()
      await loadNodeVersions()
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
    void loadNodeVersions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.installed])

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

        {status?.installed ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Node Version Switch</h3>
                <p className="text-xs text-muted-foreground">
                  List Homebrew Node formulas and switch active version.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  void loadNodeVersions()
                }}
                disabled={loadingNodeVersions || runningNodeFormula !== null}
              >
                {loadingNodeVersions ? 'Loading...' : 'Refresh'}
              </Button>
            </div>

            {loadingNodeVersions && nodeVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading Node versions...</p>
            ) : nodeVersions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Homebrew Node formulas found.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {nodeVersions.map((item) => (
                  <li key={item.formula} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm">{item.formula}</p>
                        {item.active ? <Badge>Active</Badge> : null}
                        <Badge variant={item.installed ? 'default' : 'secondary'}>
                          {item.installed ? `Installed ${item.installedVersion ?? ''}`.trim() : 'Not Installed'}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={item.active ? 'secondary' : 'default'}
                      disabled={
                        item.active ||
                        runningNodeFormula !== null ||
                        loadingNodeVersions ||
                        loadingStatus ||
                        runningAction !== null ||
                        runningTerminalCommand
                      }
                      onClick={() => {
                        void runSwitchNodeVersion(item.formula)
                      }}
                    >
                      {runningNodeFormula === item.formula
                        ? 'Switching...'
                        : item.installed
                          ? 'Switch'
                          : 'Install & Switch'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
