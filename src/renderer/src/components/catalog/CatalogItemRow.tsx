import { type ComponentType } from 'react'
import { Download, Globe, RefreshCw, TerminalSquare } from 'lucide-react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
  updating?: boolean
  onToggle: (item: CatalogItem) => void
  onUpdate?: (item: CatalogItem) => void
}

function CatalogItemRow({
  item,
  disabled = false,
  running = false,
  updating = false,
  onToggle,
  onUpdate
}: CatalogItemRowProps): React.JSX.Element {
  const icon = item.iconKey ? ICON_MAP[item.iconKey] : undefined
  const actionIconButtonClass =
    'h-7 w-7 border-0 bg-transparent text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white'
  const toggleLabel = running
    ? item.installed
      ? 'Uninstalling...'
      : 'Installing...'
    : item.installed
      ? 'Uninstall'
      : 'Install'
  const command = item.installed
    ? (item.updateCommand ??
      (item.brewType === 'cask'
        ? `brew upgrade --cask ${item.token}`
        : `brew upgrade ${item.token}`))
    : (item.installCommand ??
      (item.brewType === 'cask'
        ? `brew install --cask ${item.token}`
        : `brew install ${item.token}`))

  return (
    <div className="flex flex-col gap-2 rounded-lg px-3 py-2 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <icon.Component size={32} color={icon.color} className="shrink-0" />
        ) : item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={`${item.name} icon`}
            className="h-8 w-8 shrink-0"
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
          <Globe className="h-7 w-7 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium text-zinc-100">{item.name}</p>
            <Badge
              variant="secondary"
              className={
                item.installed
                  ? 'bg-transparent px-1.5 py-0 text-[10px] text-zinc-100'
                  : 'bg-transparent px-1.5 py-0 text-[10px] text-zinc-300'
              }
            >
              {item.installed ? 'Installed' : 'Not Installed'}
            </Badge>
            {item.installed && item.hasUpdate ? (
              <Badge
                variant="secondary"
                className="bg-transparent px-1.5 py-0 text-[10px] text-zinc-200"
              >
                Update Available
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{item.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className={actionIconButtonClass}
              title="Show command"
              aria-label="Show command"
            >
              <TerminalSquare className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8} className="max-w-[460px]">
            <p className="font-mono text-[11px]">{command}</p>
          </TooltipContent>
        </Tooltip>
        {item.installed && onUpdate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                className={actionIconButtonClass}
                onClick={() => onUpdate(item)}
                disabled={disabled}
                aria-label={updating ? 'Updating...' : 'Update'}
              >
                <RefreshCw className={`h-4 w-4 ${updating ? 'animate-spin' : ''}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8}>
              <p>{updating ? 'Updating...' : 'Update'}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className={actionIconButtonClass}
              onClick={() => onToggle(item)}
              disabled={disabled}
              aria-label={toggleLabel}
            >
              <Download className={`h-4 w-4 ${running ? 'animate-pulse' : ''}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>
            <p>{toggleLabel}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

export default CatalogItemRow
