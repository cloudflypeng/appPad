import toolsRaw from '@/data/catalog/tools.json'
import CatalogTab from '@/components/catalog/CatalogTab'
import { type CatalogSeed } from '@/lib/catalog'

const TOOLS = toolsRaw as CatalogSeed[]

function ToolsManager(): React.JSX.Element {
  return (
    <CatalogTab
      catalogKey="tools"
      title="Tool"
      seeds={TOOLS}
      defaultBrewType="formula"
    />
  )
}

export default ToolsManager
