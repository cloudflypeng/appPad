import CatalogTab from '@/components/catalog/CatalogTab'

function InstalledManager(): React.JSX.Element {
  return (
    <CatalogTab
      catalogKey="installed"
      title="Installed"
      seeds={[]}
      defaultBrewType="cask"
      discoverInstalled
    />
  )
}

export default InstalledManager
