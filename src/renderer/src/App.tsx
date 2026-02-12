import { useRef, useState } from 'react'
import { Compass, Package, PackageCheck, Wrench } from 'lucide-react'

import EssentialsManager from '@/components/essentials/EssentialsManager'
import BrowserCatalog from '@/components/homebrew/BrowserCatalog'
import HomebrewManager from '@/components/homebrew/HomebrewManager'
import FixedTopBar from '@/components/layout/FixedTopBar'
import ToolsManager from '@/components/tools/ToolsManager'
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
  SidebarProvider
} from '@/components/ui/sidebar'

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'homebrew' | 'browser' | 'essentials' | 'tools'>('homebrew')
  const insetContentRef = useRef<HTMLDivElement | null>(null)

  const tabs = [
    {
      key: 'homebrew' as const,
      title: 'Homebrew',
      description: 'Manage Homebrew installation and status.',
      icon: Package
    },
    {
      key: 'browser' as const,
      title: 'Browser',
      description: 'Common browser packages with install commands and status.',
      icon: Compass
    },
    {
      key: 'essentials' as const,
      title: '装机必备',
      description: '用于管理常用软件的一键安装清单。',
      icon: PackageCheck
    },
    {
      key: 'tools' as const,
      title: 'Tool',
      description: '常用可通过 Homebrew 安装的工具列表。',
      icon: Wrench
    }
  ]

  const activeTabConfig = tabs.find((tab) => tab.key === activeTab)
  const activeTitle = activeTabConfig?.title ?? 'appPad'
  const activeDescription = activeTabConfig?.description ?? ''

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
        <div ref={insetContentRef} className="relative flex-1">
          <FixedTopBar
            title={activeTitle}
            description={activeDescription}
            containerRef={insetContentRef}
            onRefresh={() => {
              window.dispatchEvent(new CustomEvent(APP_TOPBAR_REFRESH_EVENT))
            }}
          />
          <div className="pt-16">
            {activeTab === 'homebrew' ? <HomebrewManager /> : null}
            {activeTab === 'browser' ? <BrowserCatalog /> : null}
            {activeTab === 'essentials' ? <EssentialsManager /> : null}
            {activeTab === 'tools' ? <ToolsManager /> : null}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
