import essentialsSeedsRaw from '@/data/catalog/essentials.json'
import CatalogTab from '@/components/catalog/CatalogTab'
import { type CatalogSeed } from '@/lib/catalog'

const ESSENTIAL_SEEDS = essentialsSeedsRaw as CatalogSeed[]

function EssentialsManager(): React.JSX.Element {
  return (
    <CatalogTab
      catalogKey="essentials"
      title="装机必备"
      seeds={ESSENTIAL_SEEDS}
      defaultBrewType="cask"
    />
  )
}

export default EssentialsManager
