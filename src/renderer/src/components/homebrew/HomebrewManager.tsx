import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Package,
  TerminalSquare,
  XCircle
} from 'lucide-react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type BrewStatus = {
  installed: boolean
  currentVersion: string | null
  latestVersion: string | null
  installedAppCount: number | null
}

const PROMPT = '$ '
const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function HomebrewManager(): React.JSX.Element {
  const [status, setStatus] = useState<BrewStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [runningAction, setRunningAction] = useState<'install' | 'update' | null>(null)
  const [runningTerminalCommand, setRunningTerminalCommand] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const terminalContainerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const currentInputRef = useRef('')
  const runningTerminalCommandRef = useRef(false)

  const installLabel = useMemo(() => {
    return runningAction === 'install' ? 'Installing...' : 'Install Homebrew'
  }, [runningAction])

  const updateLabel = useMemo(() => {
    return runningAction === 'update' ? 'Updating...' : 'Update Homebrew'
  }, [runningAction])

  const writeToTerminal = (message: string): void => {
    if (!terminalRef.current) return
    const normalized = message.replace(/\r?\n/g, '\r\n')
    terminalRef.current.write(normalized)
    if (!normalized.endsWith('\r\n')) {
      terminalRef.current.write('\r\n')
    }
  }

  const printPrompt = (): void => {
    terminalRef.current?.write(PROMPT)
  }

  const executeCommand = async (command: string): Promise<void> => {
    if (!terminalRef.current) return
    setRunningTerminalCommand(true)
    runningTerminalCommandRef.current = true
    try {
      const execute =
        (window.api as typeof window.api & {
          executeTerminalCommand?: (cmd: string) => Promise<{
            success: boolean
            code: number | null
            stdout: string
            stderr: string
            error?: string
          }>
        }).executeTerminalCommand ??
        ((cmd: string) =>
          window.electron.ipcRenderer.invoke('terminal:exec', { command: cmd }) as Promise<{
            success: boolean
            code: number | null
            stdout: string
            stderr: string
            error?: string
          }>)

      const result = await execute(command)
      if (result.stdout.trim()) {
        writeToTerminal(result.stdout)
      }
      if (result.stderr.trim()) {
        writeToTerminal(result.stderr)
      }
      if (!result.success) {
        writeToTerminal(`[exit ${result.code ?? 'unknown'}] ${result.error ?? 'command failed'}`)
      }
    } catch (err) {
      writeToTerminal(err instanceof Error ? err.message : 'command execution failed')
    } finally {
      setRunningTerminalCommand(false)
      runningTerminalCommandRef.current = false
      currentInputRef.current = ''
      printPrompt()
    }
  }

  const executeCommandSilently = async (
    command: string
  ): Promise<{ success: boolean; stdout: string; stderr: string; code: number | null; error?: string }> => {
    const execute =
      (window.api as typeof window.api & {
        executeTerminalCommand?: (cmd: string) => Promise<{
          success: boolean
          code: number | null
          stdout: string
          stderr: string
          error?: string
        }>
      }).executeTerminalCommand ??
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

  const loadStatus = async (): Promise<void> => {
    setLoadingStatus(true)
    setError(null)
    try {
      const nextStatus = await window.api.getBrewStatus()
      setStatus(nextStatus)

      if (nextStatus.installed && (nextStatus.installedAppCount === null || nextStatus.installedAppCount === undefined)) {
        try {
          const caskCountResult = await executeCommandSilently('brew list --cask 2>/dev/null | wc -l')
          const caskCount = Number.parseInt(caskCountResult.stdout.trim(), 10)
          const safeCaskCount = Number.isFinite(caskCount) ? caskCount : 0
          setStatus((prev) => (prev ? { ...prev, installedAppCount: safeCaskCount } : prev))
        } catch {
          // keep N/A if fallback commands fail
        }
      }

      if (nextStatus.installed && !nextStatus.currentVersion && !nextStatus.latestVersion) {
        const diagnose = (window.api as typeof window.api & { diagnoseBrewVersion?: () => Promise<any> })
          .diagnoseBrewVersion
        if (diagnose) {
          const diag = await diagnose()
          writeToTerminal('[diagnose] brew path')
          writeToTerminal(String(diag.brewPath))
          writeToTerminal('[diagnose] brew --version stdout')
          writeToTerminal(diag.version.stdout || '<empty>')
          writeToTerminal('[diagnose] brew --version stderr')
          writeToTerminal(diag.version.stderr || '<empty>')
          writeToTerminal('[diagnose] brew info --json=v2 brew stdout')
          writeToTerminal(diag.infoJson.stdout || '<empty>')
          writeToTerminal('[diagnose] brew info --json=v2 brew stderr')
          writeToTerminal(diag.infoJson.stderr || '<empty>')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read Homebrew status.')
    } finally {
      setLoadingStatus(false)
    }
  }

  const runAction = async (action: 'install' | 'update'): Promise<void> => {
    setRunningAction(action)
    setError(null)
    try {
      const command =
        action === 'install'
          ? '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
          : 'brew update'
      writeToTerminal(`${PROMPT}${command}`)
      await executeCommand(command)
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed to execute.')
    } finally {
      setRunningAction(null)
    }
  }

  useEffect(() => {
    if (!terminalContainerRef.current || terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#0b1020',
        foreground: '#e6edf3'
      }
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalContainerRef.current)
    fitAddon.fit()
    term.focus()

    terminalRef.current = term
    fitAddonRef.current = fitAddon
    term.writeln('Shell ready. Type commands and press Enter.')
    printPrompt()

    const resizeHandler = (): void => {
      fitAddonRef.current?.fit()
    }
    window.addEventListener('resize', resizeHandler)

    const dataDisposable = term.onData((data) => {
      if (runningTerminalCommandRef.current) return

      if (data === '\r') {
        term.write('\r\n')
        const command = currentInputRef.current.trim()
        if (command.length === 0) {
          printPrompt()
          return
        }
        void executeCommand(command)
        return
      }

      if (data === '\u007f') {
        if (currentInputRef.current.length > 0) {
          currentInputRef.current = currentInputRef.current.slice(0, -1)
          term.write('\b \b')
        }
        return
      }

      if (data >= ' ') {
        currentInputRef.current += data
        term.write(data)
      }
    })

    return () => {
      window.removeEventListener('resize', resizeHandler)
      dataDisposable.dispose()
      fitAddon.dispose()
      term.dispose()
      fitAddonRef.current = null
      terminalRef.current = null
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [])

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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            {loadingStatus ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Installation</p>
                    <p className="text-xs text-muted-foreground">Homebrew installation detection status</p>
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
                    <p className="text-xs text-muted-foreground">Available release from Homebrew metadata</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm">{status?.latestVersion ?? 'N/A'}</p>
                </div>

                <div className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Installed Cask Apps</p>
                    <p className="text-xs text-muted-foreground">Number of installed cask applications</p>
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
                        ? 'Refresh Homebrew metadata and core.'
                        : 'Install Homebrew using official install script.'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {status?.installed ? (
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
              </div>
            )}

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TerminalSquare className="h-4 w-4 text-muted-foreground" />
              Terminal
            </CardTitle>
            <CardDescription>
              {runningTerminalCommand ? 'Running command...' : 'Ready (type commands directly)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-[#0b1020] p-2">
              <div
                ref={terminalContainerRef}
                className="h-80 w-full overflow-hidden"
                onClick={() => terminalRef.current?.focus()}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default HomebrewManager
