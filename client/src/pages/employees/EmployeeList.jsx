import React, { useState, useEffect, useRef } from 'react';
import { useSearchParamState } from '../../lib/useSearchParamState';
import { Link, useSearchParams } from 'react-router-dom';
import { getEmployees, deactivateEmployee } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import ConfirmModal from '../../components/ConfirmModal';
import { Users, Plus, Search, UserCheck, UserX, ChevronUp, ChevronDown, SlidersHorizontal, X } from 'lucide-react';

const LEVEL_BADGE = {
  1: 'bg-gray-100 text-gray-700',
  2: 'bg-gray-100 text-gray-700',
  3: 'bg-gray-100 text-gray-700',
  4: 'bg-gray-100 text-gray-700',
};

export default function EmployeeList() {
  const { addToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,       setSearch]       = useSearchParamState('q', '');
  const [roleFilter,   setRoleFilter]   = useSearchParamState('role', 'all');
  const [deptFilter,   setDeptFilter]   = useSearchParamState('dept', 'all');
  const [statusFilter, setStatusFilter] = useSearchParamState('status', 'active');
  const [error, setError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [sortCol, setSortCol] = useSearchParamState('sort', 'name');
  const [sortDir, setSortDir] = useSearchParamState('dir', 'asc');
  const [, setSearchParams]   = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  const load = () => {
    setLoading(true);
    getEmployees()
      .then(setEmployees)
      .catch(e => setError(e.response?.data?.error || 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Close filter panel on outside click
  useEffect(() => {
    function handler(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDeactivate = async () => {
    if (!confirmTarget) return;
    const { id, name } = confirmTarget;
    setConfirmTarget(null);
    try {
      await deactivateEmployee(id);
      addToast(`${name} has been deactivated.`);
      load();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to deactivate', 'error');
    }
  };

  const roles = [...new Set(employees.map(e => e.role_name).filter(Boolean))];
  const departments = [...new Set(employees.map(e => e.department_name).filter(Boolean))].sort();

  const hasActiveFilters = roleFilter !== 'all' || deptFilter !== 'all' || statusFilter !== 'active' || search;

  function clearFilters() {
    setSearch('');
    setRoleFilter('all');
    setDeptFilter('all');
    setStatusFilter('active');
  }

  const filtered = employees.filter(e => {
    const matchSearch = !search ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      (e.employee_code && e.employee_code.toLowerCase().includes(search.toLowerCase()));
    const matchRole = roleFilter === 'all' || e.role_name === roleFilter;
    const matchDept = deptFilter === 'all' || e.department_name === deptFilter;
    const matchStatus =
      statusFilter === 'all' ? true :
      statusFilter === 'active' ? e.is_active :
      !e.is_active;
    return matchSearch && matchRole && matchDept && matchStatus;
  });

  const toggleSort = (col) => {
    // Combine into one setSearchParams call to avoid the two-setter race condition
    // where the second functional update sees stale params and overwrites the first.
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (sortCol === col) {
        const newDir = sortDir === 'asc' ? 'desc' : 'asc';
        newDir === 'asc' ? next.delete('dir') : next.set('dir', newDir);
      } else {
        col === 'name' ? next.delete('sort') : next.set('sort', col);
        next.delete('dir'); // reset direction to default asc
      }
      return next;
    }, { replace: true });
  };

  const SortIcon = ({ col }) => (
    <span className="inline-flex flex-col ml-1 opacity-40 group-hover:opacity-80">
      <ChevronUp size={10} className={sortCol === col && sortDir === 'asc' ? 'opacity-100 text-gray-900' : ''} />
      <ChevronDown size={10} className={sortCol === col && sortDir === 'desc' ? 'opacity-100 text-gray-900' : ''} style={{ marginTop: -3 }} />
    </span>
  );

  const sorted = [...filtered].sort((a, b) => {
    const val = (e) => {
      if (sortCol === 'name') return e.name?.toLowerCase() ?? '';
      if (sortCol === 'code') return e.employee_code?.toLowerCase() ?? '';
      if (sortCol === 'email') return e.email?.toLowerCase() ?? '';
      if (sortCol === 'role') return e.role_name?.toLowerCase() ?? '';
      if (sortCol === 'department') return e.department_name?.toLowerCase() ?? '';
      if (sortCol === 'manager') return e.manager_name?.toLowerCase() ?? '';
      if (sortCol === 'status') return e.is_active ? 0 : 1;
      return '';
    };
    const av = val(a), bv = val(b);
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const activeFilterCount = (roleFilter !== 'all' ? 1 : 0) + (deptFilter !== 'all' ? 1 : 0) + (statusFilter !== 'active' ? 1 : 0);

  return (
    <div className="p-5">
      <ConfirmModal
        open={!!confirmTarget}
        title={`Deactivate ${confirmTarget?.name}?`}
        message="Their scoring history will be preserved. You can reactivate them later by editing their profile."
        confirmLabel="Deactivate"
        danger
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmTarget(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Employees</h1>
        </div>
        <Link
          to="/employees/new"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus size={13} /> Add Employee
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email or code…"
            className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters button */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${
              activeFilterCount > 0
                ? 'border-gray-400 bg-gray-100 text-gray-800'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-gray-900 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          {filterOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-4 min-w-56 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Role</label>
                <select
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="all">All Roles</option>
                  {roles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Department</label>
                <select
                  value={deptFilter}
                  onChange={e => setDeptFilter(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="all">All Departments</option>
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                  <option value="all">All</option>
                </select>
              </div>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setRoleFilter('all'); setDeptFilter('all'); setStatusFilter('active'); setFilterOpen(false); }}
                  className="w-full text-xs text-gray-500 hover:text-gray-800 pt-1 border-t border-gray-100 text-left"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400 mb-2">No employees found.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm text-gray-700 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[['name','Name'],['code','Code'],['email','Email'],['role','Role'],['department','Department'],['manager','Manager'],['status','Status']].map(([col, label]) => (
                  <th key={col} className="text-left px-4 py-3 font-medium text-gray-600">
                    <button onClick={() => toggleSort(col)} className="group flex items-center hover:text-gray-900 transition-colors">
                      {label}<SortIcon col={col} />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {emp.name}
                    {emp.is_admin && (
                      <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Admin</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{emp.employee_code || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{emp.email}</td>
                  <td className="px-4 py-3">
                    {emp.role_name ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_BADGE[emp.hierarchy_level] || 'bg-gray-100 text-gray-700'}`}>
                        {emp.role_name}
                      </span>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.department_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{emp.manager_name || '—'}</td>
                  <td className="px-4 py-3">
                    {emp.is_active ? (
                      <span className="flex items-center gap-1 text-gray-700 text-xs font-medium">
                        <UserCheck size={13} /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400 text-xs font-medium">
                        <UserX size={13} /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <Link
                        to={`/employees/${emp.id}/edit`}
                        className="text-gray-600 hover:text-gray-900 text-xs font-medium"
                      >
                        Edit
                      </Link>
                      {emp.is_active && (
                        <button
                          onClick={() => setConfirmTarget({ id: emp.id, name: emp.name })}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">{sorted.length} employee{sorted.length !== 1 ? 's' : ''}</p>
    </div>
  );
}
