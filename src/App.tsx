import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { useTradeStore } from '@/store/useTradeStore'

// Pages
import UploadPage from '@/pages/UploadPage'
import DashboardPage from '@/pages/DashboardPage'
import EquityPage from '@/pages/EquityPage'
import TradesPage from '@/pages/TradesPage'
import PairsPage from '@/pages/PairsPage'
import SessionsPage from '@/pages/SessionsPage'
import CommissionsPage from '@/pages/CommissionsPage'
import DrawdownPage from '@/pages/DrawdownPage'
import ConvictionsPage from '@/pages/ConvictionsPage'

function RequireData({ children }: { children: React.ReactNode }) {
  const isLoaded = useTradeStore((s) => s.isLoaded)
  const location = useLocation()
  if (!isLoaded && location.pathname !== '/upload') {
    return <Navigate to="/upload" replace />
  }
  return <>{children}</>
}

function Layout() {
  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <Routes>
            <Route path="/upload" element={<UploadPage />} />
            <Route
              path="/dashboard"
              element={
                <RequireData>
                  <DashboardPage />
                </RequireData>
              }
            />
            <Route
              path="/equity"
              element={
                <RequireData>
                  <EquityPage />
                </RequireData>
              }
            />
            <Route
              path="/trades"
              element={
                <RequireData>
                  <TradesPage />
                </RequireData>
              }
            />
            <Route
              path="/pairs"
              element={
                <RequireData>
                  <PairsPage />
                </RequireData>
              }
            />
            <Route path="/convictions" element={<ConvictionsPage />} />
            <Route
              path="/sessions"
              element={
                <RequireData>
                  <SessionsPage />
                </RequireData>
              }
            />
            <Route
              path="/commissions"
              element={
                <RequireData>
                  <CommissionsPage />
                </RequireData>
              }
            />
            <Route
              path="/drawdown"
              element={
                <RequireData>
                  <DrawdownPage />
                </RequireData>
              }
            />
            <Route path="*" element={<Navigate to="/upload" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
