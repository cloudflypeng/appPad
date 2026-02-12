import terminalsRaw from '@/data/catalog/terminals.json'
import CatalogTab from '@/components/catalog/CatalogTab'
import { type CatalogSeed } from '@/lib/catalog'

const TERMINAL_SEEDS = terminalsRaw as CatalogSeed[]

function TerminalManager(): React.JSX.Element {
  return (
    <CatalogTab
      catalogKey="terminal"
      title="Terminal"
      seeds={TERMINAL_SEEDS}
      defaultBrewType="cask"
    />
  )
}

export default TerminalManager
