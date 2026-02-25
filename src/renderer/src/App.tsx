import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  ArrowUpCircle,
  Compass,
  GitBranch,
  List,
  LoaderCircle,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  TerminalSquare,
  Wrench
} from 'lucide-react'

import { useNativeTheme } from '@/hooks/use-theme'

import EssentialsManager from '@/components/essentials/EssentialsManager'
import BrowserCatalog from '@/components/homebrew/BrowserCatalog'
import HomebrewManager from '@/components/homebrew/HomebrewManager'
import HomebrewSearchManager from '@/components/homebrew/HomebrewSearchManager'
import NodeVersionManager from '@/components/homebrew/NodeVersionManager'
import InstalledManager from '@/components/installed/InstalledManager'
import GlobalTerminalPanel from '@/components/layout/GlobalTerminalPanel'
import MoleManager from '@/components/mole/MoleManager'
import TerminalManager from '@/components/terminal/TerminalManager'
import ToolsManager from '@/components/tools/ToolsManager'
import AppUpdateManager from '@/components/update/AppUpdateManager'
import { Button } from '@/components/ui/button'
import { SmoothScrollArea } from '@/components/ui/smooth-scroll-area'
import appadLogoPng from '@/assets/logo-a-lines.png'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function App(): React.JSX.Element {
  console.log('apppad')
  useNativeTheme()
  const [activeTab, setActiveTab] = useState<
    | 'homebrew'
    | 'installed'
    | 'search'
    | 'browser'
    | 'terminal'
    | 'essentials'
    | 'tools'
    | 'mole'
    | 'appUpdate'
    | 'nodeSwitch'
  >('homebrew')
  const [syncingInstalledApps, setSyncingInstalledApps] = useState(false)
  const navigationTabs = [
    {
      key: 'installed' as const,
      title: 'Installed',
      description: 'Apps and tools currently installed via Homebrew.',
      icon: List
    },
    {
      key: 'search' as const,
      title: 'Search',
      description: 'Search Homebrew formulae and casks by keyword.',
      icon: Search
    },
    {
      key: 'browser' as const,
      title: 'Browser',
      description: 'Common browser packages with install commands and status.',
      icon: Compass
    },
    {
      key: 'terminal' as const,
      title: 'Terminal',
      description: 'Popular terminal emulators installable via Homebrew casks.',
      icon: TerminalSquare
    },
    {
      key: 'essentials' as const,
      title: 'Essentials',
      description: 'One-click install list for essential software.',
      icon: PackageCheck
    },
    {
      key: 'tools' as const,
      title: 'Tool',
      description: 'Common tools installable via Homebrew.',
      icon: Wrench
    }
  ]

  const updateTabs = [
    {
      key: 'homebrew' as const,
      title: 'Homebrew',
      description: 'Manage Homebrew installation and status.',
      icon: Package
    },
    {
      key: 'mole' as const,
      title: 'Mole',
      description: 'Run and manage Mole commands with GUI controls.',
      icon: Wrench
    },
    {
      key: 'appUpdate' as const,
      title: 'App Update',
      description: 'Check and install app updates.',
      icon: ArrowUpCircle
    },
    {
      key: 'nodeSwitch' as const,
      title: 'Node Switch',
      description: 'Switch Homebrew Node formulas and active version.',
      icon: GitBranch
    }
  ]
  const tabs = [...navigationTabs, ...updateTabs]
  const activeTabConfig = tabs.find((tab) => tab.key === activeTab)
  const activeTitle = activeTabConfig?.title ?? 'appPad'

  const handleRefreshInstalledState = async (): Promise<void> => {
    setSyncingInstalledApps(true)
    try {
      await window.api.syncInstalledAppsCache()
    } finally {
      window.dispatchEvent(new CustomEvent(APP_TOPBAR_REFRESH_EVENT))
      setSyncingInstalledApps(false)
    }
  }

  return (
    <section className="min-h-dvh bg-transparent p-0">
      <SidebarProvider>
        <div className="relative m-3 flex h-full w-full overflow-hidden rounded-2xl bg-transparent">
          <div
            className="absolute inset-x-0 top-0 z-20 h-8 select-none"
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
            aria-hidden="true"
          />
          <Sidebar
            collapsible="icon"
            className="select-none [&_[data-slot=sidebar-container]]:p-3 [&_[data-slot=sidebar-container]]:pr-2 [&_[data-slot=sidebar-container]]:group-data-[collapsible=icon]:pr-3 [&_[data-slot=sidebar-inner]]:rounded-2xl [&_[data-slot=sidebar-inner]]:bg-transparent [&_[data-slot=sidebar-inner]]:shadow-none [&_[data-slot=sidebar-inner]]:backdrop-blur-2xl"
          >
            <SidebarHeader className="px-3 pt-10 group-data-[collapsible=icon]:px-1.5">
              <div className="flex w-full items-center gap-2 overflow-hidden rounded-lg px-1 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
                <div className="size-8 shrink-0">
                  <img src={appadLogoPng} alt="APPAD logo" className="h-full w-full rounded-md" />
                </div>
                <div className="min-w-0 transition-all duration-300 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
                  <p className="text-[13px] font-semibold tracking-[0.06em]">APPAD</p>
                  <p className="text-sidebar-foreground/58 text-[10px] leading-tight tracking-[0.03em]">
                    Software Console
                  </p>
                </div>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup className="group-data-[collapsible=icon]:px-1">
                <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  Navigation
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1 px-2 group-data-[collapsible=icon]:px-1">
                    {navigationTabs.map((tab) => (
                      <SidebarMenuItem key={tab.key}>
                        <SidebarMenuButton
                          className="h-9 rounded-lg bg-transparent px-3 text-[12px] font-medium text-sidebar-foreground transition-all duration-300 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
                          isActive={activeTab === tab.key}
                          tooltip={tab.title}
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
              <SidebarGroup className="group-data-[collapsible=icon]:px-1">
                <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.12em]">
                  Updates
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1 px-2 group-data-[collapsible=icon]:px-1">
                    {updateTabs.map((tab) => (
                      <SidebarMenuItem key={tab.key}>
                        <SidebarMenuButton
                          className="h-9 rounded-md border-0 bg-transparent px-3 text-[12px] font-medium text-muted-foreground transition-[color,background-color] duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-none group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
                          isActive={activeTab === tab.key}
                          tooltip={tab.title}
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
            <SidebarFooter className="px-3 pb-3 group-data-[collapsible=icon]:px-1.5">
              <Button
                variant="secondary"
                className="h-9 w-full justify-start gap-2 overflow-hidden rounded-lg bg-glass-bg px-3 text-[12px] font-medium text-foreground transition-all duration-300 hover:bg-glass-bg-hover group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
                onClick={() => {
                  void handleRefreshInstalledState()
                }}
                disabled={syncingInstalledApps}
                title="Refresh Install Status"
                aria-label="Refresh Install Status"
              >
                {syncingInstalledApps ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="truncate transition-all duration-300 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
                  {syncingInstalledApps ? 'Refreshing...' : 'Refresh Install Status'}
                </span>
              </Button>
            </SidebarFooter>
          </Sidebar>

          <SidebarInset className="min-w-0 h-screen flex-1 p-2">
            <div className="relative flex h-screen flex-1 flex-col overflow-hidden rounded-2xl border border-glass-border bg-transparent backdrop-blur-[18px]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(85%_140%_at_22%_1%,rgba(0,0,0,0.03)_0%,rgba(0,0,0,0.01)_42%,transparent_74%)] dark:bg-[radial-gradient(85%_140%_at_22%_1%,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0.04)_42%,transparent_74%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.015)_20%,transparent_50%,rgba(0,0,0,0.015)_80%,rgba(0,0,0,0.04)_100%)] dark:bg-[linear-gradient(90deg,rgba(0,0,0,0.16)_0%,rgba(0,0,0,0.05)_20%,transparent_50%,rgba(0,0,0,0.05)_80%,rgba(0,0,0,0.16)_100%)]" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.02] dark:opacity-[0.08] [background-image:radial-gradient(rgba(0,0,0,0.22)_0.4px,transparent_0.4px)] dark:[background-image:radial-gradient(rgba(255,255,255,0.22)_0.4px,transparent_0.4px)] [background-size:4px_4px]" />
              <div className="sticky top-0 z-10 rounded-t-2xl border-b border-glass-border bg-glass-bg px-4 py-2.5 backdrop-blur-2xl select-none">
                <div className="flex items-center gap-2.5">
                  <SidebarTrigger className="text-muted-foreground hover:text-foreground size-7 rounded-md bg-glass-bg transition-[color,background-color] duration-200 hover:bg-glass-bg-hover cursor-pointer" />
                  <div>
                    <h1 className="text-[16px] font-semibold leading-none tracking-[-0.01em] text-foreground">
                      {activeTitle}
                    </h1>
                  </div>
                </div>
              </div>
              <SmoothScrollArea className="relative z-10 h-[90vh] min-h-0 flex-1 bg-gradient-to-b from-glass-bg via-transparent to-glass-bg">
                {activeTab === 'homebrew' ? <HomebrewManager /> : null}
                {activeTab === 'browser' ? <BrowserCatalog /> : null}
                {activeTab === 'terminal' ? <TerminalManager /> : null}
                {activeTab === 'installed' ? <InstalledManager /> : null}
                {activeTab === 'search' ? <HomebrewSearchManager /> : null}
                {activeTab === 'essentials' ? <EssentialsManager /> : null}
                {activeTab === 'tools' ? <ToolsManager /> : null}
                {activeTab === 'mole' ? <MoleManager /> : null}
                {activeTab === 'appUpdate' ? <AppUpdateManager /> : null}
                {activeTab === 'nodeSwitch' ? <NodeVersionManager /> : null}
              </SmoothScrollArea>
            </div>
          </SidebarInset>
        </div>
        <GlobalTerminalPanel />
      </SidebarProvider>
    </section>
  )
}

export default App
