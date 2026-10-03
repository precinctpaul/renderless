import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ControlRoomPage } from './pages/ControlRoomPage'
import { DataPage } from './pages/DataPage'
import { DashboardPage } from './pages/DashboardPage'
import { DesignPage } from './pages/DesignPage'
import { MakePage } from './pages/MakePage'
import { OutputFeedPage } from './pages/OutputFeedPage'

function NotFoundPage() {
  return (
    <section className="screen screen--not-found">
      <h1>Route not found</h1>
      <p>Use Make, a Studio page (Library, Design, Data, Control Room), or the canonical output-feed URL.</p>
    </section>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/output-feed" element={<OutputFeedPage />} />

      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/make" replace />} />
        <Route path="/make" element={<MakePage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/design" element={<DesignPage />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/data-engine" element={<Navigate to="/data" replace />} />
        <Route path="/control-room" element={<ControlRoomPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
