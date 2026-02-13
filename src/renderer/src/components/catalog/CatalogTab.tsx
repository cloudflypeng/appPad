import { useEffect, useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'

import CatalogItemRow from '@/components/catalog/CatalogItemRow'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { executeWithGlobalTerminal } from '@/lib/globalTerminal'
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
  discoverInstalled?: boolean
}

const APP_TOPBAR_REFRESH_EVENT = 'app:topbar-refresh'

function chunkTokens(tokens: string[], size = 50): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < tokens.length; i += size) {
    chunks.push(tokens.slice(i, i + size))
  }
  return chunks
}

function CatalogTab({
  catalogKey,
  title,
  seeds,
  defaultBrewType,
  discoverInstalled = false
}: CatalogTabProps): React.JSX.Element {
  const [brewInstalled, setBrewInstalled] = useState<boolean | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(false)
  const [runningToken, setRunningToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const normalizedSeeds = useMemo(
    () => seeds.map((seed) => ({ ...seed, brewType: seed.brewType ?? defaultBrewType })),
    [seeds, defaultBrewType]
  )
  const installedCasks = useMemo(
    () => (discoverInstalled ? items.filter((item) => item.brewType === 'cask') : []),
    [discoverInstalled, items]
  )
  const installedFormulae = useMemo(
    () => (discoverInstalled ? items.filter((item) => item.brewType === 'formula') : []),
    [discoverInstalled, items]
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

        if (discoverInstalled) {
          if (cachedPayload.items.length > 0) {
            setItems(cachedPayload.items as CatalogItem[])
            setBrewInstalled(cachedPayload.brewInstalled)
            setLoading(false)
            return
          }
        } else {
          const cachedMap = new Set(cachedPayload.items.map((item) => item.token))
          const hasFullCache = normalizedSeeds.every((seed) => cachedMap.has(seed.token))
          if (hasFullCache && cachedPayload.items.length > 0) {
            setItems(normalizeCachedItems(cachedPayload.items as CatalogItem[], normalizedSeeds))
            setBrewInstalled(cachedPayload.brewInstalled)
            setLoading(false)
            return
          }
        }
      }

      if (items.length === 0) {
        setLoading(true)
      }

      const status = await window.api.getBrewStatus()
      setBrewInstalled(status.installed)

      if (!status.installed) {
        const fallbackItems = discoverInstalled ? [] : buildFallbackItems(normalizedSeeds)
        setItems(fallbackItems)
        await window.api.setCatalogItemsCache(catalogKey, {
          brewInstalled: false,
          items: fallbackItems
        })
        return
      }

      const caskMeta = new Map<string, BrewInfoCask>()
      const formulaMeta = new Map<string, BrewInfoFormula>()

      const caskListResult = await window.api.executeTerminalCommand('brew list --cask')
      const formulaListResult = await window.api.executeTerminalCommand('brew list --formula')

      const installedCaskTokens = caskListResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const installedFormulaTokens = formulaListResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)

      const installedCaskSet = new Set(installedCaskTokens)
      const installedFormulaSet = new Set(installedFormulaTokens)

      for (const tokenChunk of chunkTokens(installedCaskTokens)) {
        if (tokenChunk.length === 0) continue
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

      for (const tokenChunk of chunkTokens(installedFormulaTokens)) {
        if (tokenChunk.length === 0) continue
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

      const nextItems: CatalogItem[] = discoverInstalled
        ? [
            ...installedCaskTokens.map((token) => {
              const cask = caskMeta.get(token)
              const homepage = cask?.homepage || null
              return {
                token,
                brewType: 'cask' as const,
                name: cask?.name?.[0] || formatNameFromToken(token),
                description: cask?.desc || defaultDescriptionFromToken(token),
                homepage,
                iconUrl: homepage ? toDuckDuckGoFavicon(homepage) : null,
                fallbackIconUrl: homepage ? toDuckDuckGoFavicon(homepage) : null,
                installed: true,
                iconKey: null,
                installCommand: `brew install --cask ${token}`,
                uninstallCommand: `brew uninstall --cask ${token}`
              }
            }),
            ...installedFormulaTokens.map((token) => {
              const formula = formulaMeta.get(token)
              const homepage = formula?.homepage || null
              return {
                token,
                brewType: 'formula' as const,
                name: formula?.name || formatNameFromToken(token),
                description: formula?.desc || defaultDescriptionFromToken(token),
                homepage,
                iconUrl: homepage ? toDuckDuckGoFavicon(homepage) : null,
                fallbackIconUrl: homepage ? toDuckDuckGoFavicon(homepage) : null,
                installed: true,
                iconKey: null,
                installCommand: `brew install ${token}`,
                uninstallCommand: `brew uninstall ${token}`
              }
            })
          ].sort((a, b) => a.name.localeCompare(b.name))
        : normalizedSeeds.map((seed) => {
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
              brewType === 'cask'
                ? installedCaskSet.has(seed.token)
                : installedFormulaSet.has(seed.token)

            return {
              token: seed.token,
              brewType,
              name,
              description,
              homepage,
              iconUrl,
              fallbackIconUrl: iconUrl,
              installed,
              iconKey: seed.iconKey ?? null,
              installCommand:
                seed.installCommand ??
                (brewType === 'cask'
                  ? `brew install --cask ${seed.token}`
                  : `brew install ${seed.token}`),
              uninstallCommand:
                seed.uninstallCommand ??
                (brewType === 'cask'
                  ? `brew uninstall --cask ${seed.token}`
                  : `brew uninstall ${seed.token}`)
            }
          })

      setItems(nextItems)
      await window.api.setCatalogItemsCache(catalogKey, {
        brewInstalled: true,
        items: nextItems
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${title} list.`)
      setItems(discoverInstalled ? [] : buildFallbackItems(normalizedSeeds))
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
      const result = await executeWithGlobalTerminal(command)
      if (!result.success) {
        setError(
          result.error ||
            result.stderr ||
            `${item.installed ? 'Uninstall' : 'Install'} failed for ${item.token}.`
        )
      }
      await window.api.syncInstalledAppsCache()
      await loadCatalog()
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

  useEffect(() => {
    void loadCatalog()
  }, [])

  useEffect(() => {
    const handler = (): void => {
      void loadCatalog()
    }
    window.addEventListener(APP_TOPBAR_REFRESH_EVENT, handler as EventListener)
    return () => {
      window.removeEventListener(APP_TOPBAR_REFRESH_EVENT, handler as EventListener)
    }
  }, [])

  return (
    <main className="flex justify-center py-4">
      <div className="mx-auto flex w-4/5 flex-col gap-4">
        <div className="space-y-3">
          {brewInstalled === false ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Homebrew is not installed. Install Homebrew in the Homebrew tab before installing{' '}
                {title}.
              </AlertDescription>
            </Alert>
          ) : null}

          {loading && items.length === 0 ? (
            <div className="space-y-3">
              {Array.from({ length: discoverInstalled ? 8 : normalizedSeeds.length || 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-20 w-full rounded-md" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
              {discoverInstalled ? 'No installed Homebrew formulas or casks found.' : 'No items found.'}
            </div>
          ) : discoverInstalled ? (
            <div className="space-y-4">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Casks
                </h3>
                {installedCasks.length === 0 ? (
                  <div className="rounded-md border bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    No installed casks found.
                  </div>
                ) : (
                  <div className="space-y-2 flex flex-col gap-3">
                    {installedCasks.map((item) => (
                      <CatalogItemRow
                        key={`${item.brewType ?? 'item'}:${item.token}`}
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
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Formulae
                </h3>
                {installedFormulae.length === 0 ? (
                  <div className="rounded-md border bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                    No installed formulae found.
                  </div>
                ) : (
                  <div className="space-y-2 flex flex-col gap-3">
                    {installedFormulae.map((item) => (
                      <CatalogItemRow
                        key={`${item.brewType ?? 'item'}:${item.token}`}
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
              </section>
            </div>
          ) : (
            <div className="space-y-2 flex flex-col gap-3">
              {items.map((item) => (
                <CatalogItemRow
                  key={`${item.brewType ?? 'item'}:${item.token}`}
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
        </div>
      </div>
    </main>
  )
}

export default CatalogTab
