import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDisputeCount } from '../lib/api';
import {
  LayoutDashboard, LogOut, ChevronLeft, ChevronRight,
  BarChart3, ClipboardCheck, Scale, IndianRupee, FileText, Building2, Star
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import ConfirmModal from './ConfirmModal';

const NAV_ITEMS = [
  { to: '/dashboard',    label: 'Dashboard',         icon: LayoutDashboard, always: true },
  { to: '/scoring',      label: 'KPI Scoring',        icon: ClipboardCheck,  always: true },
  { to: '/review',       label: 'Manager Review',     icon: Scale,           manager: true },
  { to: '/ratings',      label: 'Ratings for Team',   icon: Star,            externalScorer: true },
  { to: '/distribution', label: '₹100 Distribution',  icon: IndianRupee,     distributor: true },
  { to: '/reports',      label: 'Reports',            icon: FileText,        always: true },
  { to: '/organization', label: 'Organization',       icon: Building2,       admin: true },
  { to: '/kpi-templates',label: 'KPI Templates',      icon: BarChart3,       admin: true },
];

export default function Layout({ children }) {
  const { employee, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [disputeCount, setDisputeCount] = useState(0);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    getDisputeCount()
      .then(d => setDisputeCount(d.count))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.always) return true;
    if (employee?.is_admin) return true;
    if (item.manager && employee?.can_manage) return true;
    if (item.externalScorer && employee?.is_external_scorer) return true;
    if (item.distributor && employee?.is_distributor) return true;
    return false;
  });

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden relative">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-gray-900 text-white transition-all duration-300 shrink-0 ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-white">KPI Tracker</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md hover:bg-gray-800 transition-colors ml-auto text-gray-400 hover:text-white"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 space-y-0.5 overflow-y-auto px-2">
          {visibleItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {!collapsed && to === '/review' && disputeCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {disputeCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-800">
          {!collapsed && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-white truncate">{employee?.name}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {employee?.role_name || 'Admin'} · {employee?.department_name || ''}
              </p>
            </div>
          )}
          <div className="mb-2">
            <NotificationBell collapsed={collapsed} />
          </div>
          <button
            onClick={() => setConfirmLogout(true)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
          >
            <LogOut size={14} />
            {!collapsed && 'Logout'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col min-w-0">
        {children}
      </main>

      <ConfirmModal
        open={confirmLogout}
        title="Log out?"
        message="You'll need to sign in again to access the app."
        confirmLabel="Log out"
        onConfirm={() => { setConfirmLogout(false); handleLogout(); }}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
