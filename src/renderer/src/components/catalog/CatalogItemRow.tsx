import { type ComponentType } from 'react'
import { Download, Globe } from 'lucide-react'
import {
  SiArc,
  SiArcHex,
  SiBrave,
  SiBraveHex,
  SiFirefox,
  SiFirefoxHex,
  SiGooglechrome,
  SiGooglechromeHex,
  SiObsidian,
  SiObsidianHex,
  SiObsstudio,
  SiObsstudioHex,
  SiOpera,
  SiOperaHex,
  SiTorbrowser,
  SiTorbrowserHex,
  SiVivaldi,
  SiVivaldiHex
} from '@icons-pack/react-simple-icons'

import { CatalogItem } from '@/lib/catalog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type IconConfig = {
  Component: ComponentType<{
    size?: number | string
    color?: string
    className?: string
    title?: string
  }>
  color: string
}

const ICON_MAP: Record<string, IconConfig> = {
  googlechrome: { Component: SiGooglechrome, color: SiGooglechromeHex },
  firefox: { Component: SiFirefox, color: SiFirefoxHex },
  brave: { Component: SiBrave, color: SiBraveHex },
  arc: { Component: SiArc, color: SiArcHex },
  opera: { Component: SiOpera, color: SiOperaHex },
  vivaldi: { Component: SiVivaldi, color: SiVivaldiHex },
  torbrowser: { Component: SiTorbrowser, color: SiTorbrowserHex },
  obsstudio: { Component: SiObsstudio, color: SiObsstudioHex },
  obsidian: { Component: SiObsidian, color: SiObsidianHex }
}

const GENERIC_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M2 12h20'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E"

type CatalogItemRowProps = {
  item: CatalogItem
  disabled?: boolean
  running?: boolean
  onToggle: (item: CatalogItem) => void
}

function CatalogItemRow({
  item,
  disabled = false,
  running = false,
  onToggle
}: CatalogItemRowProps): React.JSX.Element {
  const icon = item.iconKey ? ICON_MAP[item.iconKey] : undefined

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <icon.Component size={40} color={icon.color} className="mt-0.5 shrink-0" />
        ) : item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={`${item.name} icon`}
            className="mt-0.5 h-10 w-10 shrink-0"
            onError={(event) => {
              const el = event.currentTarget
              if (el.dataset.fallbackTried !== '1' && item.fallbackIconUrl) {
                el.dataset.fallbackTried = '1'
                el.src = item.fallbackIconUrl
                return
              }
              el.src = GENERIC_ICON
              el.onerror = null
            }}
          />
        ) : (
          <Globe className="mt-0.5 h-8 w-8 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{item.name}</p>
            <Badge variant={item.installed ? 'default' : 'secondary'}>
              {item.installed ? 'Installed' : 'Not Installed'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {item.installCommand ?? `brew install --cask ${item.token}`}
          </p>
        </div>
      </div>

      <Button size="sm" onClick={() => onToggle(item)} disabled={disabled}>
        <Download className="mr-2 h-4 w-4" />
        {running
          ? item.installed
            ? 'Uninstalling...'
            : 'Installing...'
          : item.installed
            ? 'Uninstall'
            : 'Install'}
      </Button>
    </div>
  )
}

export default CatalogItemRow
