import browserSeedsRaw from '@/data/catalog/browsers.json'
import CatalogTab from '@/components/catalog/CatalogTab'
import { type CatalogSeed } from '@/lib/catalog'

const BROWSER_SEEDS = browserSeedsRaw as CatalogSeed[]

function BrowserCatalog(): React.JSX.Element {
  return (
    <CatalogTab
      catalogKey="browser"
      title="Browser Manager"
      seeds={BROWSER_SEEDS}
      defaultBrewType="cask"
    />
  )
}

export default BrowserCatalog
