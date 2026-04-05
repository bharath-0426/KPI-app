import { useState, useEffect, useCallback } from 'react';
import { useSearchParamState } from '../lib/useSearchParamState';
import {
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getRoles, createRole, updateRole, deleteRole,
} from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import EmployeeList from './employees/EmployeeList';
import OrgChart from './OrgChart';
import Breadcrumb from '../components/Breadcrumb';
import { Plus, Pencil, Trash2, ChevronRight, ChevronDown, Users, Building2, GitBranch, Shield, Info } from 'lucide-react';

// ── Tree builders ─────────────────────────────────────────────────────────────

function buildDeptTree(depts) {
  const map = {};
  depts.forEach(d => { map[d.id] = { ...d, children: [] }; });
  const roots = [];
  depts.forEach(d => {
    if (d.parent_dept_id && map[d.parent_dept_id]) {
      map[d.parent_dept_id].children.push(map[d.id]);
    } else {
      roots.push(map[d.id]);
    }
  });
  return roots;
}

function buildRoleTree(roles) {
  const map = {};
  roles.forEach(r => { map[r.id] = { ...r, children: [] }; });
  const roots = [];
  roles.forEach(r => {
    if (r.parent_role_id && map[r.parent_role_id]) {
      map[r.parent_role_id].children.push(map[r.id]);
    } else {
      roots.push(map[r.id]);
    }
  });
  return roots;
}

function getDescendantIds(id, items, parentKey) {
  const ids = new Set();
  function walk(cur) {
    ids.add(cur);
    items.filter(x => x[parentKey] === cur).forEach(x => walk(x.id));
  }
  walk(id);
  return ids;
}

// ── Tree node components ──────────────────────────────────────────────────────

function RoleNode({ role, depth, onEdit, onDelete, selectedId, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = role.children.length > 0;
  const isSelected  = role.id === selectedId;
  const isChild     = role.parent_role_id === selectedId;
  const tier        = isSelected ? 'selected' : isChild ? 'child' : 'other';
  const dimmed      = tier === 'other';

  return (
    <div className="flex items-start">
      {/* ── Card ── */}
      <div
        onClick={() => onSelect(role.id)}
        className={[
          'shrink-0 flex items-center gap-2 rounded-lg border cursor-pointer transition-all group px-3 py-2',
          dimmed ? 'opacity-40 hover:opacity-70' : '',
          tier === 'selected'
            ? 'bg-white border-2 border-gray-900 shadow-md'
            : 'bg-white border border-gray-200 shadow-sm hover:border-gray-300 hover:shadow',
        ].join(' ')}
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Shield size={12} className={`shrink-0 ${tier === 'selected' ? 'text-gray-900' : 'text-gray-400'}`} />
        <span className={`font-medium text-sm truncate max-w-[180px] ${tier === 'selected' ? 'text-gray-900' : 'text-gray-700'}`}>
          {role.name}
        </span>
        {role.employee_count > 0 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
            {role.employee_count}
          </span>
        )}
        {!dimmed && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
            <button
              onClick={e => { e.stopPropagation(); onEdit(role); }}
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(role); }}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* ── Connector + Children ── */}
      {expanded && hasChildren && (
        <>
          {/* Horizontal stem from card to vertical trunk */}
          <div className="self-start mt-[19px] w-5 h-px bg-gray-200 shrink-0" />
          {/* Children column — trunk drawn per-child so it never overruns */}
          <div className="flex flex-col shrink-0">
            {role.children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast  = idx === role.children.length - 1;
              return (
                <div key={child.id} className={`relative pl-5 ${!isLast ? 'pb-3' : ''}`}>
                  {/* Trunk segment: starts at first branch, ends at last branch */}
                  <div
                    className="absolute left-0 w-0.5 bg-gray-200"
                    style={{
                      top:    isFirst ? '19px' : '0',
                      bottom: isLast  ? 'calc(100% - 19px)' : '0',
                    }}
                  />
                  {/* Horizontal branch from trunk to child */}
                  <div className="absolute left-0 top-[19px] w-5 h-px bg-gray-200" />
                  <RoleNode
                    role={child}
                    depth={depth + 1}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DeptNode({ dept, depth, onEdit, onDelete, selectedId, onSelect }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = dept.children.length > 0;
  const isSelected  = dept.id === selectedId;
  const isChild     = dept.parent_dept_id === selectedId;
  const tier        = isSelected ? 'selected' : isChild ? 'child' : 'other';
  const dimmed      = tier === 'other';

  return (
    <div className="flex items-start">
      {/* ── Card ── */}
      <div
        onClick={() => onSelect(dept.id)}
        className={[
          'shrink-0 flex items-center gap-2 rounded-lg border cursor-pointer transition-all group px-3 py-2',
          dimmed ? 'opacity-40 hover:opacity-70' : '',
          tier === 'selected'
            ? 'bg-white border-2 border-gray-900 shadow-md'
            : 'bg-white border border-gray-200 shadow-sm hover:border-gray-300 hover:shadow',
        ].join(' ')}
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Building2 size={12} className={`shrink-0 ${tier === 'selected' ? 'text-gray-900' : 'text-gray-400'}`} />
        <span className={`font-medium text-sm truncate max-w-[180px] ${tier === 'selected' ? 'text-gray-900' : 'text-gray-700'}`}>
          {dept.name}
        </span>
        {(dept.employee_count > 0 || hasChildren) && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
            {[
              dept.employee_count > 0 && `${dept.employee_count}`,
              hasChildren && `${dept.children.length} sub`,
            ].filter(Boolean).join(' · ')}
          </span>
        )}
        {!dimmed && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
            <button
              onClick={e => { e.stopPropagation(); onEdit(dept); }}
              className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(dept); }}
              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* ── Connector + Children ── */}
      {expanded && hasChildren && (
        <>
          {/* Horizontal stem from card to vertical trunk */}
          <div className="self-start mt-[19px] w-5 h-px bg-gray-200 shrink-0" />
          {/* Children column — trunk drawn per-child so it never overruns */}
          <div className="flex flex-col shrink-0">
            {dept.children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast  = idx === dept.children.length - 1;
              return (
                <div key={child.id} className={`relative pl-5 ${!isLast ? 'pb-3' : ''}`}>
                  {/* Trunk segment: starts at first branch, ends at last branch */}
                  <div
                    className="absolute left-0 w-0.5 bg-gray-200"
                    style={{
                      top:    isFirst ? '19px' : '0',
                      bottom: isLast  ? 'calc(100% - 19px)' : '0',
                    }}
                  />
                  {/* Horizontal branch from trunk to child */}
                  <div className="absolute left-0 top-[19px] w-5 h-px bg-gray-200" />
                  <DeptNode
                    dept={child}
                    depth={depth + 1}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    selectedId={selectedId}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tabs config ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'employees',  label: 'Employees',  icon: Users },
  { key: 'org-chart',  label: 'Org Chart',  icon: GitBranch },
  { key: 'structure',  label: 'Structure',  icon: Shield },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Organization() {
  const { addToast } = useToast();
  const [tab, setTab] = useSearchParamState('tab', 'employees');
  const [depts, setDepts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [selectedDeptId, setSelectedDeptId] = useState(null);

  // Dept modal
  const [deptModal, setDeptModal] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: '', parent_dept_id: '' });
  const [deptSaving, setDeptSaving] = useState(false);
  const [deptError, setDeptError] = useState('');
  const [confirmDeleteDept, setConfirmDeleteDept] = useState(null);
  const [deletingDept, setDeletingDept] = useState(false);

  // Role modal
  const [roleModal, setRoleModal] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', parent_role_id: '' });
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [confirmDeleteRole, setConfirmDeleteRole] = useState(null);
  const [deletingRole, setDeletingRole] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r] = await Promise.all([getDepartments(), getRoles()]);
      setDepts(d);
      setRoles(r);
      const rootRole = r.find(role => !role.parent_role_id);
      if (rootRole) setSelectedRoleId(prev => prev ?? rootRole.id);
      const rootDept = d.find(dept => !dept.parent_dept_id);
      if (rootDept) setSelectedDeptId(prev => prev ?? rootDept.id);
    } catch {
      addToast('Failed to load organization data.', 'error');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Dept handlers ──────────────────────────────────────────────────────────
  function openCreateDept() {
    setDeptForm({ name: '', parent_dept_id: '' });
    setDeptError('');
    setDeptModal({ mode: 'create' });
  }

  function openEditDept(dept) {
    setDeptForm({ name: dept.name, parent_dept_id: dept.parent_dept_id != null ? String(dept.parent_dept_id) : '' });
    setDeptError('');
    setDeptModal({ mode: 'edit', dept });
  }

  async function handleSaveDept(e) {
    e.preventDefault();
    setDeptError('');
    setDeptSaving(true);
    try {
      const payload = {
        name: deptForm.name,
        parent_dept_id: deptForm.parent_dept_id !== '' ? parseInt(deptForm.parent_dept_id) : null,
      };
      if (deptModal.mode === 'create') {
        await createDepartment(payload);
        addToast('Department created.');
      } else {
        await updateDepartment(deptModal.dept.id, payload);
        addToast('Department updated.');
      }
      setDeptModal(null);
      await load();
    } catch (err) {
      setDeptError(err?.response?.data?.error || 'Failed to save department.');
    } finally {
      setDeptSaving(false);
    }
  }

  async function handleDeleteDept() {
    if (!confirmDeleteDept) return;
    setDeletingDept(true);
    try {
      await deleteDepartment(confirmDeleteDept.id);
      addToast(`"${confirmDeleteDept.name}" deleted.`);
      setConfirmDeleteDept(null);
      await load();
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to delete department.', 'error');
      setConfirmDeleteDept(null);
    } finally {
      setDeletingDept(false);
    }
  }

  // ── Role handlers ──────────────────────────────────────────────────────────
  function openCreateRole() {
    setRoleForm({ name: '', parent_role_id: '' });
    setRoleError('');
    setRoleModal({ mode: 'create' });
  }

  function openEditRole(role) {
    setRoleForm({
      name: role.name,
      parent_role_id: role.parent_role_id != null ? String(role.parent_role_id) : '',
    });
    setRoleError('');
    setRoleModal({ mode: 'edit', role });
  }

  async function handleSaveRole(e) {
    e.preventDefault();
    setRoleError('');
    setRoleSaving(true);
    try {
      const payload = {
        name: roleForm.name,
        parent_role_id: roleForm.parent_role_id !== '' ? parseInt(roleForm.parent_role_id) : null,
      };
      if (roleModal.mode === 'create') {
        await createRole(payload);
        addToast('Role created.');
      } else {
        await updateRole(roleModal.role.id, payload);
        addToast('Role updated.');
      }
      setRoleModal(null);
      await load();
    } catch (err) {
      setRoleError(err?.response?.data?.error || 'Failed to save role.');
    } finally {
      setRoleSaving(false);
    }
  }

  async function handleDeleteRole() {
    if (!confirmDeleteRole) return;
    setDeletingRole(true);
    try {
      await deleteRole(confirmDeleteRole.id);
      addToast(`"${confirmDeleteRole.name}" deleted.`);
      setConfirmDeleteRole(null);
      await load();
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to delete role.', 'error');
      setConfirmDeleteRole(null);
    } finally {
      setDeletingRole(false);
    }
  }

  const deptTree = buildDeptTree(depts);
  const roleTree = buildRoleTree(roles);

  const parentDeptOptions = deptModal?.mode === 'edit'
    ? depts.filter(d => !getDescendantIds(deptModal.dept.id, depts, 'parent_dept_id').has(d.id))
    : depts;

  const parentRoleOptions = roleModal?.mode === 'edit'
    ? roles.filter(r => !getDescendantIds(roleModal.role.id, roles, 'parent_role_id').has(r.id))
    : roles;

  return (
    <div className="flex flex-col h-full">
      <ConfirmModal
        open={!!confirmDeleteDept}
        title={`Delete "${confirmDeleteDept?.name}"?`}
        message="Cannot delete if it has employees, roles, or child departments."
        confirmLabel={deletingDept ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={handleDeleteDept}
        onCancel={() => setConfirmDeleteDept(null)}
      />
      <ConfirmModal
        open={!!confirmDeleteRole}
        title={`Delete role "${confirmDeleteRole?.name}"?`}
        message="Cannot delete if it has active employees or child roles."
        confirmLabel={deletingRole ? 'Deleting…' : 'Delete'}
        danger
        onConfirm={handleDeleteRole}
        onCancel={() => setConfirmDeleteRole(null)}
      />

      {/* Page header */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white shrink-0">
        <Breadcrumb items={[
          { label: 'Admin' },
          { label: 'Organization', to: '/organization' },
          { label: TABS.find(t => t.key === tab)?.label || 'Employees' },
        ]} />
        <h1 className="text-sm font-semibold text-gray-900">Organization</h1>
        <p className="text-xs text-gray-400 mt-0.5">Manage your team, reporting lines, roles, and departments</p>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-5 shrink-0">
        <div className="flex gap-1">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className={`flex-1 min-h-0 ${tab === 'org-chart' ? 'overflow-hidden' : 'overflow-y-auto'}`}>

        {/* ── Employees tab ── */}
        {tab === 'employees' && <EmployeeList />}

        {/* ── Structure tab (Roles + Departments combined) ── */}
        {tab === 'structure' && (
          <div className="p-6 space-y-6">
            {loading ? (
              <div className="text-gray-400 text-sm">Loading…</div>
            ) : (
              <>
                {/* Hint */}
                <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                  <Info size={13} className="text-gray-400 shrink-0 mt-0.5" />
                  Click any card to highlight its direct children. Use the pencil icon to edit or the trash icon to delete.
                </div>

                {/* Roles */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <Shield size={14} /> Roles
                      <span className="font-normal text-gray-400">({roles.length})</span>
                    </span>
                    <button
                      onClick={openCreateRole}
                      className="flex items-center gap-1.5 text-xs border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-900 font-medium px-2.5 py-1 rounded-md transition-colors"
                    >
                      <Plus size={12} /> Add Role
                    </button>
                  </div>
                  {roleTree.length === 0 ? (
                    <div className="p-10 text-center text-gray-400 text-sm">
                      No roles yet.
                      <button onClick={openCreateRole} className="block mx-auto mt-2 text-gray-700 hover:underline text-xs">
                        Create one →
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 overflow-x-auto">
                      <div className="inline-flex flex-col gap-3 min-w-max">
                        {roleTree.map(role => (
                          <RoleNode
                            key={role.id}
                            role={role}
                            depth={0}
                            onEdit={openEditRole}
                            onDelete={r => setConfirmDeleteRole(r)}
                            selectedId={selectedRoleId}
                            onSelect={setSelectedRoleId}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Departments */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                      <Building2 size={14} /> Departments
                      <span className="font-normal text-gray-400">({depts.length})</span>
                    </span>
                    <button
                      onClick={openCreateDept}
                      className="flex items-center gap-1.5 text-xs border border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-900 font-medium px-2.5 py-1 rounded-md transition-colors"
                    >
                      <Plus size={12} /> Add Department
                    </button>
                  </div>
                  {deptTree.length === 0 ? (
                    <div className="p-10 text-center text-gray-400 text-sm">
                      No departments yet.
                      <button onClick={openCreateDept} className="block mx-auto mt-2 text-gray-700 hover:underline text-xs">
                        Create one →
                      </button>
                    </div>
                  ) : (
                    <div className="p-6 overflow-x-auto">
                      <div className="inline-flex flex-col gap-3 min-w-max">
                        {deptTree.map(dept => (
                          <DeptNode
                            key={dept.id}
                            dept={dept}
                            depth={0}
                            onEdit={openEditDept}
                            onDelete={d => setConfirmDeleteDept(d)}
                            selectedId={selectedDeptId}
                            onSelect={setSelectedDeptId}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Org Chart tab ── */}
        {tab === 'org-chart' && (
          <div className="h-full">
            <OrgChart />
          </div>
        )}
      </div>

      {/* ── Department Modal ── */}
      {deptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">
                {deptModal.mode === 'create' ? 'Add Department' : `Edit — ${deptModal.dept.name}`}
              </h2>
            </div>
            <form onSubmit={handleSaveDept} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={deptForm.name}
                  onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g. Engineering"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Parent Department</label>
                <select
                  value={deptForm.parent_dept_id}
                  onChange={e => setDeptForm(f => ({ ...f, parent_dept_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">None (top level)</option>
                  {parentDeptOptions
                    .filter(d => deptModal.mode === 'edit' ? d.id !== deptModal.dept.id : true)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
              </div>
              {deptError && <p className="text-sm text-red-600">{deptError}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={deptSaving}
                  className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {deptSaving ? 'Saving…' : deptModal.mode === 'create' ? 'Create' : 'Save'}
                </button>
                <button type="button" onClick={() => setDeptModal(null)} className="text-sm text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Role Modal ── */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-800">
                {roleModal.mode === 'create' ? 'Add Role' : `Edit — ${roleModal.role.name}`}
              </h2>
            </div>
            <form onSubmit={handleSaveRole} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
                <input
                  type="text"
                  value={roleForm.name}
                  onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="e.g. Senior Engineer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Parent Role</label>
                <select
                  value={roleForm.parent_role_id}
                  onChange={e => setRoleForm(f => ({ ...f, parent_role_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="">None (root level)</option>
                  {parentRoleOptions
                    .filter(r => roleModal.mode === 'edit' ? r.id !== roleModal.role.id : true)
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        {'  '.repeat(Math.max(0, r.hierarchy_level - 1))}{r.name}
                      </option>
                    ))}
                </select>
              </div>
              {roleError && <p className="text-sm text-red-600">{roleError}</p>}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={roleSaving}
                  className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  {roleSaving ? 'Saving…' : roleModal.mode === 'create' ? 'Create' : 'Save'}
                </button>
                <button type="button" onClick={() => setRoleModal(null)} className="text-sm text-gray-500 hover:text-gray-700">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
