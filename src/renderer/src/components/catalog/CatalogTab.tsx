import { useEffect, useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import CatalogItemRow from '@/components/catalog/CatalogItemRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  buildFallbackItems,
  defaultDescriptionFromToken,
  formatNameFromToken,
  normalizeCachedItems,
  toDuckDuckGoFavicon,
  type CatalogItem,
  type CatalogSeed
} from '@/lib/catalog'

type BrewInfoCask = {
  token?: string
  name?: string[]
  desc?: string
  homepage?: string
}

type BrewInfoFormula = {
  name?: string
  desc?: string
  homepage?: string
}

type CatalogTabProps = {
  catalogKey: string
  title: string
  seeds: CatalogSeed[]
  defaultBrewType: 'cask' | 'formula'
}

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function chunkTokens(tokens: string[], size = 50): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < tokens.length; i += size) {
    chunks.push(tokens.slice(i, i + size))
  }
  return chunks
}

function CatalogTab({ catalogKey, title, seeds, defaultBrewType }: CatalogTabProps): React.JSX.Element {
  const [brewInstalled, setBrewInstalled] = useState<boolean | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [runningToken, setRunningToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const normalizedSeeds = useMemo(
    () => seeds.map((seed) => ({ ...seed, brewType: seed.brewType ?? defaultBrewType })),
    [seeds, defaultBrewType]
  )

  const loadCatalog = async (forceRefresh = false): Promise<void> => {
    setError(null)
    const shouldShowLoading = items.length === 0
    if (forceRefresh || shouldShowLoading) {
      setLoading(shouldShowLoading)
    }

    try {
      if (!forceRefresh) {
        const cachedPayload = await window.api.getCatalogItemsCache(catalogKey)
        const cachedMap = new Set(cachedPayload.items.map((item) => item.token))
        const hasFullCache = normalizedSeeds.every((seed) => cachedMap.has(seed.token))
        if (hasFullCache && cachedPayload.items.length > 0) {
          setItems(normalizeCachedItems(cachedPayload.items as CatalogItem[], normalizedSeeds))
          setBrewInstalled(cachedPayload.brewInstalled)
          setLoading(false)
          return
        }
      }

      if (items.length === 0) {
        setLoading(true)
      }

      const status = await window.api.getBrewStatus()
      setBrewInstalled(status.installed)

      if (!status.installed) {
        const fallbackItems = buildFallbackItems(normalizedSeeds)
        setItems(fallbackItems)
        await window.api.setCatalogItemsCache(catalogKey, {
          brewInstalled: false,
          items: fallbackItems
        })
        return
      }

      const caskSeeds = normalizedSeeds.filter((seed) => (seed.brewType ?? defaultBrewType) === 'cask')
      const formulaSeeds = normalizedSeeds.filter((seed) => (seed.brewType ?? defaultBrewType) === 'formula')

      const installedCaskSet = new Set<string>()
      const installedFormulaSet = new Set<string>()
      const caskMeta = new Map<string, BrewInfoCask>()
      const formulaMeta = new Map<string, BrewInfoFormula>()

      if (caskSeeds.length > 0) {
        const caskListResult = await window.api.executeTerminalCommand('brew list --cask')
        caskListResult.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((token) => installedCaskSet.add(token))

        for (const tokenChunk of chunkTokens(caskSeeds.map((seed) => seed.token))) {
          const infoResult = await window.api.executeTerminalCommand(`brew info --json=v2 ${tokenChunk.join(' ')}`)
          if (!infoResult.success || !infoResult.stdout.trim()) continue
          try {
            const parsed = JSON.parse(infoResult.stdout) as { casks?: BrewInfoCask[] }
            ;(parsed.casks ?? []).forEach((entry) => {
              if (entry.token) caskMeta.set(entry.token, entry)
            })
          } catch {
            // skip parse failure for chunk
          }
        }
      }

      if (formulaSeeds.length > 0) {
        const formulaListResult = await window.api.executeTerminalCommand('brew list --formula')
        formulaListResult.stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((token) => installedFormulaSet.add(token))

        for (const tokenChunk of chunkTokens(formulaSeeds.map((seed) => seed.token))) {
          const infoResult = await window.api.executeTerminalCommand(`brew info --json=v2 ${tokenChunk.join(' ')}`)
          if (!infoResult.success || !infoResult.stdout.trim()) continue
          try {
            const parsed = JSON.parse(infoResult.stdout) as { formulae?: BrewInfoFormula[] }
            ;(parsed.formulae ?? []).forEach((entry) => {
              const key = entry.name?.trim()
              if (key) formulaMeta.set(key, entry)
            })
          } catch {
            // skip parse failure for chunk
          }
        }
      }

      const nextItems: CatalogItem[] = normalizedSeeds.map((seed) => {
        const brewType = seed.brewType ?? defaultBrewType
        const cask = caskMeta.get(seed.token)
        const formula = formulaMeta.get(seed.token)

        const name =
          (brewType === 'cask' ? cask?.name?.[0] : formula?.name) ||
          seed.name ||
          formatNameFromToken(seed.token)
        const description =
          (brewType === 'cask' ? cask?.desc : formula?.desc) ||
          seed.description ||
          defaultDescriptionFromToken(seed.token)
        const homepage = (brewType === 'cask' ? cask?.homepage : formula?.homepage) || null

        const iconUrl = homepage
          ? toDuckDuckGoFavicon(homepage)
          : seed.fallbackDomain
            ? toDuckDuckGoFavicon(seed.fallbackDomain)
            : null

        const installed =
          brewType === 'cask' ? installedCaskSet.has(seed.token) : installedFormulaSet.has(seed.token)

        return {
          token: seed.token,
          name,
          description,
          homepage,
          iconUrl,
          fallbackIconUrl: iconUrl,
          installed,
          iconKey: seed.iconKey ?? null,
          installCommand:
            seed.installCommand ??
            (brewType === 'cask' ? `brew install --cask ${seed.token}` : `brew install ${seed.token}`),
          uninstallCommand:
            seed.uninstallCommand ??
            (brewType === 'cask' ? `brew uninstall --cask ${seed.token}` : `brew uninstall ${seed.token}`),
          brewType
        }
      })

      setItems(nextItems)
      await window.api.setCatalogItemsCache(catalogKey, {
        brewInstalled: true,
        items: nextItems
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${title} list.`)
      setItems(buildFallbackItems(normalizedSeeds))
    } finally {
      setLoading(false)
    }
  }

  const toggleInstall = async (item: CatalogItem): Promise<void> => {
    setRunningToken(item.token)
    setError(null)

    try {
      const command = item.installed
        ? (item.uninstallCommand ?? `brew uninstall ${item.token}`)
        : (item.installCommand ?? `brew install ${item.token}`)
      const result = await window.api.executeTerminalCommand(command)
      if (!result.success) {
        setError(result.error || result.stderr || `${item.installed ? 'Uninstall' : 'Install'} failed for ${item.token}.`)
      }
      await window.api.syncInstalledAppsCache()
      await loadCatalog(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : `${item.installed ? 'Uninstall' : 'Install'} failed for ${item.token}.`)
    } finally {
      setRunningToken(null)
    }
  }

  useEffect(() => {
    void loadCatalog()
  }, [])

  useEffect(() => {
    const handler = (): void => {
      void loadCatalog(true)
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
          <CardContent className="space-y-3">
            {brewInstalled === false ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Homebrew is not installed. Install Homebrew in the Homebrew tab before installing {title}.
                </AlertDescription>
              </Alert>
            ) : null}

            {loading && items.length === 0 ? (
              <div className="space-y-3">
                {normalizedSeeds.map((seed) => (
                  <Skeleton key={seed.token} className="h-20 w-full rounded-md" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <CatalogItemRow
                    key={item.token}
                    item={item}
                    disabled={brewInstalled !== true || runningToken !== null}
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
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

export default CatalogTab
