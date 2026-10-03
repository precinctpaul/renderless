import { useDashboard } from './dashboard/useDashboard'
import { ExplorerPanel } from './dashboard/ExplorerPanel'
import { LibraryPanel } from './dashboard/LibraryPanel'
import { DetailsPanel } from './dashboard/DetailsPanel'

/** Dashboard: the asset library (templates, media, fonts). State lives in useDashboard; each column is its own panel. */
export function DashboardPage() {
  const d = useDashboard()

  return (
    <section className="screen screen--dashboard">
      <div className="dashboard-layout">
        <ExplorerPanel d={d} />

        <LibraryPanel d={d} />

        <DetailsPanel d={d} />
      </div>
    </section>
  )
}
