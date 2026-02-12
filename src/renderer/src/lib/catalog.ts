export type CatalogSeed = {
  token: string
  brewType?: 'cask' | 'formula'
  name?: string
  description?: string
  fallbackDomain?: string
  iconKey?: string | null
  installCommand?: string
  uninstallCommand?: string
}

export type CatalogItem = {
  token: string
  brewType?: 'cask' | 'formula'
  name: string
  description: string
  homepage: string | null
  iconUrl: string | null
  fallbackIconUrl: string | null
  installed: boolean
  iconKey: string | null
  installCommand?: string
  uninstallCommand?: string
}

export function formatNameFromToken(token: string): string {
  return token
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function defaultDescriptionFromToken(token: string): string {
  return `Homebrew package: ${token}`
}

export function toDuckDuckGoFavicon(domainOrHomepage: string): string | null {
  try {
    const hostname = domainOrHomepage.includes('://')
      ? new URL(domainOrHomepage).hostname
      : domainOrHomepage.replace(/^www\./, '')
    if (!hostname) return null
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`
  } catch {
    return null
  }
}

export function buildFallbackItems(seeds: CatalogSeed[]): CatalogItem[] {
  return seeds.map((seed) => ({
    token: seed.token,
    brewType: seed.brewType,
    name: seed.name ?? formatNameFromToken(seed.token),
    description: seed.description ?? defaultDescriptionFromToken(seed.token),
    homepage: null,
    iconUrl: seed.fallbackDomain ? toDuckDuckGoFavicon(seed.fallbackDomain) : null,
    fallbackIconUrl: seed.fallbackDomain ? toDuckDuckGoFavicon(seed.fallbackDomain) : null,
    installed: false,
    iconKey: seed.iconKey ?? null,
    installCommand: seed.installCommand,
    uninstallCommand: seed.uninstallCommand
  }))
}

export function normalizeCachedItems(cachedItems: CatalogItem[], seeds: CatalogSeed[]): CatalogItem[] {
  const byToken = new Map(cachedItems.map((item) => [item.token, item]))

  return seeds.map((seed) => {
    const cached = byToken.get(seed.token)
    if (!cached) {
      return {
        token: seed.token,
        brewType: seed.brewType,
        name: seed.name ?? formatNameFromToken(seed.token),
        description: seed.description ?? defaultDescriptionFromToken(seed.token),
        homepage: null,
        iconUrl: seed.fallbackDomain ? toDuckDuckGoFavicon(seed.fallbackDomain) : null,
        fallbackIconUrl: seed.fallbackDomain ? toDuckDuckGoFavicon(seed.fallbackDomain) : null,
        installed: false,
        iconKey: seed.iconKey ?? null,
        installCommand: seed.installCommand,
        uninstallCommand: seed.uninstallCommand
      }
    }
    return {
      ...cached,
      brewType: cached.brewType ?? seed.brewType,
      name: cached.name || seed.name || formatNameFromToken(seed.token),
      description: cached.description || seed.description || defaultDescriptionFromToken(seed.token),
      iconKey: cached.iconKey ?? seed.iconKey ?? null,
      installCommand: cached.installCommand ?? seed.installCommand,
      uninstallCommand: cached.uninstallCommand ?? seed.uninstallCommand
    }
  })
}
