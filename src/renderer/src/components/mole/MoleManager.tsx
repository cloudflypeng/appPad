import { useEffect, useMemo, useState } from 'react'
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

const DEFAULT_QUERY_COMMAND = 'mo uninstall'
const MOLE_INSTALL_COMMAND = 'brew install mole'

function toNonBlockingQueryCommand(command: string): string {
  const trimmed = command.trim()
  if (!trimmed) return trimmed
  const normalized = trimmed.toLowerCase()
  if (normalized.startsWith('mo uninstall')) {
    return `printf 'q\\n' | (${trimmed})`
  }
  return trimmed
}

function normalizeAppToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function stripAnsiAndControl(text: string): string {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-_]/g, '')
}

function parseUninstallCandidates(output: string): {
  rows: Array<Pick<UninstallCandidate, 'name' | 'size' | 'lastUsed'>>
  selected: number | null
  total: number | null
} {
  const normalized = stripAnsiAndControl(output).replace(/\r/g, '\n')
  const lines = normalized
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)

  const headerIndex = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => item.line.includes('Select Apps to Remove'))
    .at(-1)?.index

  const scanLines = headerIndex !== undefined ? lines.slice(headerIndex) : lines
  const headerLine = scanLines.find((line) => line.includes('selected')) ?? ''
  const selectedMatch = headerLine.match(/(\d+)\/(\d+)\s+selected/i)

  const byName = new Map<string, Pick<UninstallCandidate, 'name' | 'size' | 'lastUsed'>>()
  for (const rawLine of scanLines) {
    const line = rawLine.trim()
    const detailed = line.match(/^(?:➤\s*)?○\s+(.+?)\s{2,}(.+?)\s*\|\s*(.+)$/)
    if (detailed) {
      const name = detailed[1].trim()
      const size = detailed[2].trim()
      const lastUsed = detailed[3].trim()
      byName.set(name, {
        name,
        size: size === '...' ? null : size,
        lastUsed: lastUsed === '...' ? null : lastUsed
      })
      continue
    }

    const simple = line.match(/^(?:➤\s*)?○\s+(.+)$/)
    if (simple) {
      const name = simple[1].trim()
      if (!name || name.includes('|') || name.includes('selected')) continue
      byName.set(name, { name, size: null, lastUsed: null })
    }
  }

  const rows = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
  return {
    rows,
    selected: selectedMatch ? Number.parseInt(selectedMatch[1], 10) : null,
    total: selectedMatch ? Number.parseInt(selectedMatch[2], 10) : null
  }
}

function MoleManager(): React.JSX.Element {
  const [status, setStatus] = useState<MoleStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [runningUpdate, setRunningUpdate] = useState(false)
  const [runningInstall, setRunningInstall] = useState(false)
  const [runningClean, setRunningClean] = useState(false)
  const queryCommand = DEFAULT_QUERY_COMMAND
  const debugEnabled = false
  const [runningQuery, setRunningQuery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<UninstallCandidate[]>([])
  const [lastRawOutput, setLastRawOutput] = useState<string>('')
  const [runningUninstallApp, setRunningUninstallApp] = useState<string | null>(null)

  const effectiveQueryCommand = useMemo(() => {
    const trimmed = queryCommand.trim()
    if (!trimmed) return DEFAULT_QUERY_COMMAND
    const commandWithDebug =
      !debugEnabled || trimmed.includes('--debug') ? trimmed : `${trimmed} --debug`
    return toNonBlockingQueryCommand(commandWithDebug)
  }, [debugEnabled, queryCommand])

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
      await runQuery()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mole clean failed.')
    } finally {
      setRunningClean(false)
    }
  }

  const runQuery = async (): Promise<void> => {
    if (runningQuery) return

    setRunningQuery(true)
    setError(null)

    try {
      const result = await window.api.executeTerminalCommand(effectiveQueryCommand)
      const mixedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n')
      setLastRawOutput(mixedOutput)

      if (!mixedOutput.trim()) {
        setRows([])
        if (!result.success) {
          setError(result.error ?? 'Query command failed.')
        }
        return
      }

      const parsed = parseUninstallCandidates(mixedOutput)
      const installedCache = await window.api.getCatalogItemsCache('installed')
      const brewTokenMap = new Map<string, string>()
      installedCache.items
        .filter((item) => item.installed)
        .forEach((item) => {
          const token = item.token.trim()
          if (!token) return
          brewTokenMap.set(normalizeAppToken(token), token)
          if (item.name?.trim()) {
            brewTokenMap.set(normalizeAppToken(item.name), token)
          }
        })

      const nextRows: UninstallCandidate[] = parsed.rows.map((row) => {
        const matchedBrewToken = brewTokenMap.get(normalizeAppToken(row.name))
        if (matchedBrewToken) {
          return {
            ...row,
            uninstallSource: 'brew',
            uninstallCommand: `brew uninstall --cask ${shellQuote(matchedBrewToken)}`
          }
        }
        return {
          ...row,
          uninstallSource: 'mole',
          uninstallCommand: `mo uninstall ${row.name}`
        }
      })

      setRows(nextRows)

      if (!result.success) {
        setError(result.error ?? 'Query command exited with a non-zero status.')
      } else if (parsed.rows.length === 0) {
        setError('Command completed, but no uninstallable apps were parsed. Adjust the query command.')
      }
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : 'Query failed.')
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
      await runQuery()
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-base font-semibold">Mole Installation</h2>
            <p className="text-sm text-muted-foreground">Detect Mole installation status and run update.</p>
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
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

            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Current Version</p>
                <p className="text-xs text-muted-foreground">Detected local Mole version</p>
              </div>
              <p className="shrink-0 font-mono text-sm">
                {loadingStatus ? 'Checking...' : status?.currentVersion ?? 'N/A'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Install Method</p>
                <p className="text-xs text-muted-foreground">Source reported by Mole</p>
              </div>
              <p className="shrink-0 font-mono text-sm">
                {loadingStatus ? 'Checking...' : status?.installMethod ?? 'N/A'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium">Action</p>
                <p className="text-xs text-muted-foreground">
                  {status?.installed
                    ? 'Update Mole to the latest version.'
                    : 'Install Mole first, then you can update and manage apps.'}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void loadStatus()
                  }}
                  disabled={loadingStatus || runningUpdate || runningInstall || runningClean}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingStatus ? 'animate-spin' : ''}`} />
                  Refresh Status
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void runClean()
                  }}
                  disabled={
                    loadingStatus || runningUpdate || runningInstall || runningClean || !status?.installed
                  }
                >
                  <Trash2 className={`h-4 w-4 ${runningClean ? 'animate-pulse' : ''}`} />
                  {runningClean ? 'Cleaning...' : 'mo clean'}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (status?.installed) {
                      void runUpdate()
                    } else {
                      void runInstall()
                    }
                  }}
                  disabled={loadingStatus || runningUpdate || runningInstall || runningClean}
                >
                  {status?.installed ? <ArrowUpCircle className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {status?.installed
                    ? runningUpdate
                      ? 'Updating...'
                      : 'Update Mole'
                    : runningInstall
                      ? 'Installing...'
                      : 'Install Mole'}
                </Button>
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
                void runQuery()
              }}
              disabled={runningQuery}
            >
              <RefreshCw className={`h-4 w-4 ${runningQuery ? 'animate-spin' : ''}`} />
              {runningQuery ? 'Querying...' : 'Refresh'}
            </Button>
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">App</th>
                  <th className="px-3 py-2 text-left font-medium">Size</th>
                  <th className="px-3 py-2 text-left font-medium">Last Used</th>
                  <th className="px-3 py-2 text-left font-medium">Source</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.name} className="border-t">
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.size ?? 'N/A'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.lastUsed ?? 'N/A'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.uninstallSource === 'brew' ? 'secondary' : 'outline'}>
                          {row.uninstallSource}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            void runUninstall(row)
                          }}
                          disabled={runningQuery || runningUninstallApp !== null}
                        >
                          {runningUninstallApp === row.name ? 'Uninstalling...' : 'Uninstall'}
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-t">
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
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
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs">{lastRawOutput}</pre>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </main>
  )
}

export default MoleManager
