import { type CSSProperties, useRef, useState } from 'react'
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
import FixedTopBar from '@/components/layout/FixedTopBar'
import GlobalTerminalPanel from '@/components/layout/GlobalTerminalPanel'
import MoleManager from '@/components/mole/MoleManager'
import TerminalManager from '@/components/terminal/TerminalManager'
import ToolsManager from '@/components/tools/ToolsManager'
import AppUpdateManager from '@/components/update/AppUpdateManager'
import { Button } from '@/components/ui/button'
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
  const insetContentRef = useRef<HTMLDivElement | null>(null)

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
  const tabs = [...navigationTabs, ...updateTabs]

  const activeTabConfig = tabs.find((tab) => tab.key === activeTab)
  const activeTitle = activeTabConfig?.title ?? 'appPad'
  const activeDescription = activeTabConfig?.description ?? ''

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
    <SidebarProvider>
      <div
        className="fixed inset-x-0 top-0 z-[60] h-8"
        style={{ WebkitAppRegion: 'drag' } as CSSProperties}
      />
      <Sidebar className="select-none">
        <SidebarHeader className="px-3 pt-10">
          <div className="mr-8 text-3xl">APPAD</div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.08em]">
              Navigation
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1 px-2">
                {navigationTabs.map((tab) => (
                  <SidebarMenuItem key={tab.key}>
                    <SidebarMenuButton
                      className="h-9 rounded-lg px-3 text-[13px] font-medium"
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
          <SidebarGroup>
            <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.08em]">
              Updates
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1 px-2">
                {updateTabs.map((tab) => (
                  <SidebarMenuItem key={tab.key}>
                    <SidebarMenuButton
                      className="h-9 rounded-lg px-3 text-[13px] font-medium"
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
        <SidebarFooter className="px-3 pb-3">
          <Button
            variant="secondary"
            className="h-9 w-full justify-start gap-2 rounded-lg text-[13px] font-medium"
            onClick={() => {
              void handleRefreshInstalledState()
            }}
            disabled={syncingInstalledApps}
          >
            {syncingInstalledApps ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span>{syncingInstalledApps ? 'Refreshing...' : 'Refresh Install Status'}</span>
          </Button>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="pt-8">
        <div ref={insetContentRef} className="relative flex-1">
          <FixedTopBar
            title={activeTitle}
            description={activeDescription}
            containerRef={insetContentRef}
          />
          <div className="pt-10">
            {activeTab === 'homebrew' ? <HomebrewManager /> : null}
            {activeTab === 'browser' ? <BrowserCatalog /> : null}
            {activeTab === 'terminal' ? <TerminalManager /> : null}
            {activeTab === 'installed' ? <InstalledManager /> : null}
            {activeTab === 'search' ? <HomebrewSearchManager /> : null}
            {activeTab === 'essentials' ? <EssentialsManager /> : null}
            {activeTab === 'tools' ? <ToolsManager /> : null}
            {activeTab === 'mole' ? <MoleManager /> : null}
            {activeTab === 'appUpdate' ? <AppUpdateManager /> : null}
          </div>
        </div>
      </SidebarInset>
      <GlobalTerminalPanel />
    </SidebarProvider>
  )
}

export default App
