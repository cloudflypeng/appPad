import { useMemo, useState } from 'react'
import { AlertCircle, Search } from 'lucide-react'

import CatalogItemRow from '@/components/catalog/CatalogItemRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { executeWithGlobalTerminal } from '@/lib/globalTerminal'
import {
  type CatalogItem,
  defaultDescriptionFromToken,
  formatNameFromToken,
  toDuckDuckGoFavicon
} from '@/lib/catalog'

type SearchResultItem = CatalogItem

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function parseTokens(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => line.split(/\s+/g))
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !token.startsWith('==>') && token !== 'Formulae' && token !== 'Casks')
}

function chunkTokens(tokens: string[], size = 50): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < tokens.length; i += size) {
    chunks.push(tokens.slice(i, i + size))
  }
  return chunks
}

function normalizeSearchKeyword(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]/g, '')
}

function HomebrewSearchManager(): React.JSX.Element {
  const [keyword, setKeyword] = useState('')
  const [items, setItems] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [runningToken, setRunningToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSearch = useMemo(() => keyword.trim().length > 0, [keyword])

  const runSearch = async (): Promise<void> => {
    const q = keyword.trim()
    if (!q) {
      setItems([])
      return
    }

    setLoading(true)
    setError(null)

    try {
      const brewStatus = await window.api.getBrewStatus()
      if (!brewStatus.installed) {
        setItems([])
        setError('Homebrew is not installed.')
        return
      }

      const quoted = shellQuote(q)
      const [formulaResult, caskResult] = await Promise.all([
        window.api.executeTerminalCommand(`brew search --formula ${quoted}`),
        window.api.executeTerminalCommand(`brew search --cask ${quoted}`)
      ])

      const formulaTokens = parseTokens(formulaResult.stdout)
      const caskTokens = parseTokens(caskResult.stdout)

      const formulaSet = new Set(formulaTokens)
      const caskSet = new Set(caskTokens)
      const dedupedTokens = [...new Set([...formulaTokens, ...caskTokens])]

      if (dedupedTokens.length === 0) {
        setItems([])
        return
      }

      const installedStatus = await window.api.getInstalledAppsStatus(dedupedTokens)
      const installedMap = new Map(installedStatus.items.map((entry) => [entry.token, entry.installed]))
      const iconCachePayload = await window.api.getSearchIconCache(dedupedTokens)
      const iconMap = new Map(
        iconCachePayload.items.map((item) => [
          item.token,
          {
            iconUrl: item.iconUrl,
            fallbackIconUrl: item.fallbackIconUrl
          }
        ])
      )

      const missingIconTokens = dedupedTokens.filter((token) => {
        const icon = iconMap.get(token)
        return !icon?.iconUrl && !icon?.fallbackIconUrl
      })

      if (missingIconTokens.length > 0) {
        const fetchedIcons = new Map<string, { iconUrl: string | null; fallbackIconUrl: string | null }>()

        for (const tokenChunk of chunkTokens(missingIconTokens)) {
          const infoResult = await window.api.executeTerminalCommand(
            `brew info --json=v2 ${tokenChunk.join(' ')}`
          )
          if (!infoResult.success || !infoResult.stdout.trim()) continue

          try {
            const parsed = JSON.parse(infoResult.stdout) as {
              casks?: Array<{ token?: string; homepage?: string }>
              formulae?: Array<{ name?: string; homepage?: string }>
            }

            ;(parsed.casks ?? []).forEach((entry) => {
              const token = entry.token?.trim()
              if (!token) return
              const homepage = entry.homepage?.trim() || null
              const iconUrl = `https://formulae.brew.sh/assets/icons/${encodeURIComponent(token)}.png`
              fetchedIcons.set(token, {
                iconUrl,
                fallbackIconUrl: homepage ? toDuckDuckGoFavicon(homepage) : iconUrl
              })
            })

            ;(parsed.formulae ?? []).forEach((entry) => {
              const token = entry.name?.trim()
              if (!token) return
              const homepage = entry.homepage?.trim() || null
              const iconUrl = homepage ? toDuckDuckGoFavicon(homepage) : null
              fetchedIcons.set(token, {
                iconUrl,
                fallbackIconUrl: iconUrl
              })
            })
          } catch {
            // ignore parsing failure for this chunk
          }
        }

        if (fetchedIcons.size > 0) {
          const toUpsert = [...fetchedIcons.entries()].map(([token, icon]) => ({
            token,
            iconUrl: icon.iconUrl,
            fallbackIconUrl: icon.fallbackIconUrl
          }))
          await window.api.upsertSearchIconCache(toUpsert)
          toUpsert.forEach((item) => {
            iconMap.set(item.token, {
              iconUrl: item.iconUrl,
              fallbackIconUrl: item.fallbackIconUrl
            })
          })
        }
      }

      const nextItems: SearchResultItem[] = dedupedTokens.map((token) => {
        const brewType = caskSet.has(token) && !formulaSet.has(token) ? 'cask' : 'formula'
        const cachedIcon = iconMap.get(token)
        return {
          token,
          brewType,
          name: formatNameFromToken(token),
          description: defaultDescriptionFromToken(token),
          homepage: null,
          iconUrl: cachedIcon?.iconUrl ?? null,
          fallbackIconUrl: cachedIcon?.fallbackIconUrl ?? null,
          installed: installedMap.get(token) === true,
          iconKey: null,
          installCommand: brewType === 'cask' ? `brew install --cask ${token}` : `brew install ${token}`,
          uninstallCommand:
            brewType === 'cask' ? `brew uninstall --cask ${token}` : `brew uninstall ${token}`
        }
      })

      setItems(nextItems)
    } catch (err) {
      setItems([])
      setError(err instanceof Error ? err.message : 'Failed to search Homebrew packages.')
    } finally {
      setLoading(false)
    }
  }

  const toggleInstall = async (item: SearchResultItem): Promise<void> => {
    setRunningToken(item.token)
    setError(null)
    try {
      const command = item.installed
        ? (item.uninstallCommand ?? `brew uninstall ${item.token}`)
        : (item.installCommand ?? `brew install ${item.token}`)
      const result = await executeWithGlobalTerminal(command)
      if (!result.success) {
        setError(
          result.error ||
            result.stderr ||
            `${item.installed ? 'Uninstall' : 'Install'} failed for ${item.token}.`
        )
      }
      await window.api.syncInstalledAppsCache()
      await runSearch()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${item.installed ? 'Uninstall' : 'Install'} failed for ${item.token}.`
      )
    } finally {
      setRunningToken(null)
    }
  }

  return (
    <main className="flex justify-center py-4">
      <div className="mx-auto flex w-4/5 flex-col gap-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(normalizeSearchKeyword(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void runSearch()
              }
            }}
            placeholder="Search Homebrew package, e.g. wget"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            pattern="[A-Za-z0-9]*"
            className="h-10 rounded-xl border-white/[0.16] bg-white/[0.04] px-3.5 text-zinc-100 placeholder:text-zinc-500 focus-visible:border-white/[0.3] focus-visible:bg-white/[0.06] focus-visible:ring-white/[0.22]"
            disabled={loading || runningToken !== null}
          />
          <Button
            onClick={() => {
              void runSearch()
            }}
            disabled={!canSearch || loading || runningToken !== null}
          >
            <Search className="h-4 w-4" />
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {items.length === 0 && !loading ? (
          <div className="rounded-md border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
            {keyword.trim()
              ? 'No matching Homebrew packages found.'
              : 'Type a keyword and click Search.'}
          </div>
        ) : (
          <div className="space-y-2 flex flex-col gap-3">
            {items.map((item) => (
              <CatalogItemRow
                key={`${item.brewType ?? 'item'}:${item.token}`}
                item={item}
                disabled={runningToken !== null || loading}
                running={runningToken === item.token}
                onToggle={(next) => {
                  void toggleInstall(next)
                }}
              />
            ))}
          </div>
        )}

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

export default HomebrewSearchManager
