import type { CSSProperties } from 'react'
import { useState } from 'react'
import {
  ArrowUpCircle,
  Compass,
  List,
  LoaderCircle,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  TerminalSquare,
  Wrench
} from 'lucide-react'

import EssentialsManager from '@/components/essentials/EssentialsManager'
import BrowserCatalog from '@/components/homebrew/BrowserCatalog'
import HomebrewManager from '@/components/homebrew/HomebrewManager'
import HomebrewSearchManager from '@/components/homebrew/HomebrewSearchManager'
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
  SidebarProvider
} from '@/components/ui/sidebar'

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function App(): React.JSX.Element {
  console.log('apppad')
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
    }
  ]
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
    <section className="min-h-dvh bg-background p-0">
      <SidebarProvider>
        <div className="relative m-3 flex h-full w-full overflow-hidden rounded-2xl bg-background">
          <div
            className="absolute inset-x-0 top-0 z-20 h-8 select-none"
            style={{ WebkitAppRegion: 'drag' } as CSSProperties}
            aria-hidden="true"
          />
          <Sidebar
            collapsible="icon"
            className="select-none [&_[data-slot=sidebar-inner]]:bg-transparent"
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
                          className="h-9 rounded-lg px-3 text-[12px] font-medium transition-all duration-300 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
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
                          className="h-9 rounded-lg px-3 text-[12px] font-medium transition-all duration-300 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center"
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
                className="h-9 w-full justify-start gap-2 overflow-hidden rounded-lg px-3 text-[12px] font-medium transition-all duration-300 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0"
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

          <SidebarInset className="min-w-0 flex-1 p-3 h-screen">
            <div className="relative flex h-screen overflow-hidden flex-1 flex-col rounded-2xl bg-muted/35">
              <SmoothScrollArea className="h-[90vh] min-h-0 flex-1 pt-10">
                {activeTab === 'homebrew' ? <HomebrewManager /> : null}
                {activeTab === 'browser' ? <BrowserCatalog /> : null}
                {activeTab === 'terminal' ? <TerminalManager /> : null}
                {activeTab === 'installed' ? <InstalledManager /> : null}
                {activeTab === 'search' ? <HomebrewSearchManager /> : null}
                {activeTab === 'essentials' ? <EssentialsManager /> : null}
                {activeTab === 'tools' ? <ToolsManager /> : null}
                {activeTab === 'mole' ? <MoleManager /> : null}
                {activeTab === 'appUpdate' ? <AppUpdateManager /> : null}
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
