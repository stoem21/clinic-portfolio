import { lazy } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'

import { useAuthStore } from '@/stores/authStore'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import ChangePasswordPage from '@/pages/ChangePasswordPage'

// Lazily loaded so each route ships in its own chunk — shrinks the initial bundle.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const UsersPage = lazy(() => import('@/pages/UsersPage'))
const DentistsPage = lazy(() => import('@/pages/DentistsPage'))
const ClientsPage = lazy(() => import('@/pages/ClientsPage'))
const ClientDetailPage = lazy(() => import('@/pages/ClientDetailPage'))
const TreatmentsPage = lazy(() => import('@/pages/TreatmentsPage'))
const TrashPage = lazy(() => import('@/pages/TrashPage'))
const AuditPage = lazy(() => import('@/pages/AuditPage'))
const HnCounterPage = lazy(() => import('@/pages/HnCounterPage'))
const BackupsPage = lazy(() => import('@/pages/BackupsPage'))
const ReceiptsPage = lazy(() => import('@/pages/ReceiptsPage'))
const LabWorkPage = lazy(() => import('@/pages/LabWorkPage'))
const DentistReportPage = lazy(() => import('@/pages/DentistReportPage'))
const AccountPage = lazy(() => import('@/pages/AccountPage'))

// Requires a logged-in user. Sends users who must change their password
// to the change-password screen before anything else.
function ProtectedRoute() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />
  }
  if (user.mustChangePassword) {
    return <Navigate to="/change-password" replace />
  }
  return <Outlet />
}

// Manager-only area: USER role is redirected back to the dashboard.
function ManagerRoute() {
  const user = useAuthStore((s) => s.user)
  if (user?.role === 'USER') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

// Super-admin-only area: any other role is redirected back to the dashboard.
function SuperAdminRoute() {
  const user = useAuthStore((s) => s.user)
  if (user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

// Guard for the change-password page: requires auth, but bounces users who
// don't actually need to change their password back to the app.
function ChangePasswordRoute() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />
  }
  if (!user.mustChangePassword) {
    return <Navigate to="/" replace />
  }
  return <ChangePasswordPage />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/dashboard/dentist/:dentistId" element={<DentistReportPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/treatments" element={<TreatmentsPage />} />
          <Route element={<ManagerRoute />}>
            <Route path="/users" element={<UsersPage />} />
            <Route path="/dentists" element={<DentistsPage />} />
            <Route path="/lab-work" element={<LabWorkPage />} />
          </Route>
          <Route element={<SuperAdminRoute />}>
            <Route path="/trash" element={<TrashPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/hn-counter" element={<HnCounterPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/receipts" element={<ReceiptsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
