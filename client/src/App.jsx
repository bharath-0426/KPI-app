import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from './pages/ChangePassword';
import EmployeeForm from './pages/employees/EmployeeForm';
import Periods from './pages/Periods';
import Scoring from './pages/Scoring';
import Review from './pages/Review';
import Reconcile from './pages/Reconcile';
import RatingsForTeam from './pages/RatingsForTeam';
import Distribution from './pages/Distribution';
import KpiTemplates from './pages/KpiTemplates';
import Reports from './pages/Reports';
import Organization from './pages/Organization';
import Placeholder from './pages/Placeholder';

function RequireAuth({ children }) {
  const { employee, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  if (!employee) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { employee } = useAuth();
  if (!employee?.is_admin) return <Navigate to="/dashboard" replace />;
  return children;
}

function PasswordGuard({ children }) {
  const { needsPasswordChange } = useAuth();
  if (needsPasswordChange) return <Navigate to="/change-password" replace />;
  return children;
}

function AppRoutes() {
  const { employee, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={employee ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/change-password" element={
        <RequireAuth><ChangePassword /></RequireAuth>
      } />

      <Route path="/*" element={
        <RequireAuth>
          <PasswordGuard>
            <Layout>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/scoring" element={<Scoring />} />
                <Route path="/review" element={<Review />} />
                <Route path="/reconcile" element={<Reconcile />} />
                <Route path="/ratings" element={<RatingsForTeam />} />
                <Route path="/distribution" element={<Distribution />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/periods" element={
                  <RequireAdmin><Periods /></RequireAdmin>
                } />
                <Route path="/employees/new" element={
                  <RequireAdmin><EmployeeForm /></RequireAdmin>
                } />
                <Route path="/employees/:id/edit" element={
                  <RequireAdmin><EmployeeForm /></RequireAdmin>
                } />
                <Route path="/kpi-templates" element={
                  <RequireAdmin><KpiTemplates /></RequireAdmin>
                } />
                <Route path="/organization" element={
                  <RequireAdmin><Organization /></RequireAdmin>
                } />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Layout>
          </PasswordGuard>
        </RequireAuth>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
