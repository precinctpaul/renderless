import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { buildOutputPath, withBasePath } from '../lib/outputUrls'
import { usePlayoutStore } from '../store/playoutStore'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/design', label: 'Design' },
  { to: '/data-engine', label: 'Data Engine' },
  { to: '/control-room', label: 'Control Room' },
  // The Output href is built at render time so it carries this browser's relay room.
  { to: '', label: 'Output', external: true },
]

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function AppShell() {
  const onAir = usePlayoutStore((state) => state.onAir)
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)

  // On narrow screens the tab strip scrolls sideways; keep the current page's tab in view.
  useEffect(() => {
    const activeTab = navRef.current?.querySelector<HTMLElement>('.nav-tab--active')
    activeTab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [pathname])
  const take = usePlayoutStore((state) => state.take)
  const resetDemo = usePlayoutStore((state) => state.resetDemo)
  const [clock, setClock] = useState(() => formatTime(new Date()))

  useEffect(() => {
    const handle = window.setInterval(() => {
      setClock(formatTime(new Date()))
    }, 1000)

    return () => window.clearInterval(handle)
  }, [])

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand-row">
          <Link to="/dashboard" className="brand-link" aria-label="RenderLess home">
            <img className="brand-wordmark" src={`${import.meta.env.BASE_URL}brand/wordmark.png`} alt="Majority Democrats" />
            <span className="brand-product">RENDERLESS</span>
          </Link>

          <nav ref={navRef} className="nav-tabs" aria-label="Main">
            {NAV_ITEMS.map((item) =>
              item.external ? (
                <a key={item.label} href={withBasePath(buildOutputPath('program'))} className="nav-tab" target="_blank" rel="noreferrer">
                  {item.label}
                </a>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab--active' : ''}`.trim()}
                >
                  {item.label}
                </NavLink>
              ),
            )}
          </nav>
        </div>

        <div className="header-actions">
          <span className="badge badge--ready">READY</span>
          <span className="badge badge--mono">PROGRAM {onAir ? 'LOCKED' : 'CLEAR'} | {clock}</span>

          <button type="button" className="btn btn--warning" onClick={resetDemo}>
            <RotateCcw size={16} />
            Reset Demo
          </button>

          <button type="button" className="btn btn--take" onClick={take}>
            TAKE
          </button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
