import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUpCircle,
  CheckCircle2,
  Package,
  RefreshCw,
  TerminalSquare,
  XCircle
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger
} from '@/components/ui/sidebar'

type BrewStatus = {
  installed: boolean
  brewPath: string | null
  version: string | null
}

function HomebrewTab(): React.JSX.Element {
  const [status, setStatus] = useState<BrewStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [runningAction, setRunningAction] = useState<'install' | 'update' | null>(null)
  const [log, setLog] = useState('')
  const [error, setError] = useState<string | null>(null)

  const installLabel = useMemo(() => {
    return runningAction === 'install' ? 'Installing...' : 'Install Homebrew'
  }, [runningAction])

  const updateLabel = useMemo(() => {
    return runningAction === 'update' ? 'Updating...' : 'Update Homebrew'
  }, [runningAction])

  const loadStatus = async (): Promise<void> => {
    setLoadingStatus(true)
    setError(null)
    try {
      const nextStatus = await window.api.getBrewStatus()
      setStatus(nextStatus)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read Homebrew status.')
    } finally {
      setLoadingStatus(false)
    }
  }

  const runAction = async (action: 'install' | 'update'): Promise<void> => {
    setRunningAction(action)
    setError(null)
    setLog('')
    try {
      const result = action === 'install' ? await window.api.installBrew() : await window.api.updateBrew()
      setStatus(result.status)
      const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n')
      setLog(output || 'Command finished without output.')
      if (!result.success) {
        setError(result.error ?? `Command failed with exit code ${result.code ?? 'unknown'}.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed to execute.')
    } finally {
      setRunningAction(null)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  return (
    <main className="px-6 py-6 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col [&>*+*]:mt-5">
        <section className="rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Homebrew Manager</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage Homebrew installation and version updates from one place.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void loadStatus()
              }}
              disabled={loadingStatus || runningAction !== null}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Status
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Current Status
            </h3>
            {loadingStatus ? (
              <p className="mt-3 text-sm text-muted-foreground">Loading Homebrew status...</p>
            ) : (
              <div className="mt-3 [&>*+*]:mt-4">
                <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Installation
                  </span>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {status?.installed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span>{status?.installed ? 'Installed' : 'Not Installed'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Version</p>
                    <p className="mt-1 font-mono">{status?.version ?? 'N/A'}</p>
                  </div>
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Executable</p>
                    <p className="mt-1 break-all font-mono">{status?.brewPath ?? 'N/A'}</p>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  {status?.installed ? (
                    <span>Homebrew is available and ready for package operations.</span>
                  ) : (
                    <span>Homebrew was not detected in standard paths on this machine.</span>
                  )}
                </div>
              </div>
            )}
          </article>

          <article className="rounded-xl border bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Actions
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              {status?.installed
                ? 'Homebrew is installed. Run update to fetch the latest formula metadata and upgrade brew itself.'
                : 'Homebrew is not installed. Run installation to set up brew on this machine.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {status?.installed ? (
                <Button
                  onClick={() => {
                    void runAction('update')
                  }}
                  disabled={runningAction !== null}
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  {updateLabel}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    void runAction('install')
                  }}
                  disabled={runningAction !== null}
                >
                  <Package className="mr-2 h-4 w-4" />
                  {installLabel}
                </Button>
              )}
            </div>
            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </article>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <TerminalSquare className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Command Output
            </h3>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5">
            {log || 'No command executed yet.'}
          </pre>
        </section>
      </div>
    </main>
  )
}

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'homebrew'>('homebrew')

  const tabs = [{ key: 'homebrew' as const, title: 'Homebrew', icon: Package }]

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="px-2 py-3 text-sm font-semibold">appPad</SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {tabs.map((tab) => (
                  <SidebarMenuItem key={tab.key}>
                    <SidebarMenuButton
                      isActive={activeTab === tab.key}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      <tab.icon />
                      <span>{tab.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-14 items-center border-b px-6 md:px-8">
          <SidebarTrigger />
          <h1 className="ml-3 text-sm font-medium">
            {activeTab === 'homebrew' ? 'Homebrew' : 'Dashboard'}
          </h1>
        </header>
        {activeTab === 'homebrew' ? <HomebrewTab /> : null}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
