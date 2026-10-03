import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ExternalLink, RotateCcw } from 'lucide-react'
import { buildOutputPath, withBasePath } from '../lib/outputUrls'
import { usePlayoutStore } from '../store/playoutStore'
import { LibraryControl } from './LibraryControl'

/** Studio: the template builder and OBS operator pages, kept out of the staffer's way. */
const STUDIO_ITEMS = [
  { to: '/dashboard', label: 'Library' },
  { to: '/design', label: 'Design' },
  { to: '/data', label: 'Data' },
  { to: '/control-room', label: 'Control Room' },
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
  const take = usePlayoutStore((state) => state.take)
  const resetDemo = usePlayoutStore((state) => state.resetDemo)
  const [clock, setClock] = useState(() => formatTime(new Date()))
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [studioOpenOn, setStudioOpenOn] = useState<string | null>(null)
  const studioOpen = studioOpenOn === pathname
  const setStudioOpen = (open: boolean) => setStudioOpenOn(open ? pathname : null)
  const studioRef = useRef<HTMLDivElement>(null)
  const studioPage = STUDIO_ITEMS.find((item) => pathname.startsWith(item.to))
  const inStudio = Boolean(studioPage)

  useEffect(() => {
    const handle = window.setInterval(() => {
      setClock(formatTime(new Date()))
    }, 1000)

    return () => window.clearInterval(handle)
  }, [])

  // The Studio menu also closes on an outside click or Escape.
  useEffect(() => {
    if (!studioOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!studioRef.current?.contains(event.target as Node)) setStudioOpenOn(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setStudioOpenOn(null)
        studioRef.current?.querySelector<HTMLButtonElement>('.nav-studio__toggle')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [studioOpen])

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand-row">
          <Link to="/make" className="brand-link" aria-label="RenderLess home">
            <img className="brand-wordmark" src={`${import.meta.env.BASE_URL}brand/wordmark.png`} alt="Majority Democrats" />
            <span className="brand-product">RENDERLESS</span>
          </Link>

          <nav className="nav-tabs" aria-label="Main">
            <NavLink to="/make" className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab--active' : ''}`.trim()}>
              Make
            </NavLink>
            <div ref={studioRef} className="nav-studio">
              <button
                type="button"
                className={`nav-tab nav-studio__toggle ${inStudio ? 'nav-tab--active' : ''}`.trim()}
                aria-haspopup="true"
                aria-expanded={studioOpen}
                aria-controls="studio-menu"
                onClick={() => setStudioOpen(!studioOpen)}
              >
                Studio{studioPage ? <span className="nav-studio__page"> · {studioPage.label}</span> : null}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {studioOpen ? (
                <div id="studio-menu" className="nav-studio__menu">
                  <div className="nav-studio__note">For template builders and OBS operators</div>
                  {STUDIO_ITEMS.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `nav-studio__item ${isActive ? 'nav-studio__item--active' : ''}`.trim()}
                    >
                      {item.label}
                    </NavLink>
                  ))}
                  {/* Built at render time so it carries this browser's relay room. */}
                  <a className="nav-studio__item" href={withBasePath(buildOutputPath('program'))} target="_blank" rel="noreferrer">
                    Output <ExternalLink size={12} aria-hidden="true" />
                  </a>
                </div>
              ) : null}
            </div>
          </nav>
        </div>

        <div className="header-actions">
          <LibraryControl />
          {inStudio ? (
            <>
              <span className="badge badge--ready">READY</span>
              <span className="badge badge--mono">PROGRAM {onAir ? 'LOCKED' : 'CLEAR'} | {clock}</span>

              <button type="button" className="btn btn--warning" onClick={resetDemo}>
                <RotateCcw size={16} />
                Reset Demo
              </button>

              <button type="button" className="btn btn--take" onClick={take}>
                TAKE
              </button>
            </>
          ) : null}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
