import { useState, useEffect, useMemo } from 'react';
import { useSearchParamState } from '../lib/useSearchParamState';
import {
  getKpiTemplates,
  createKpiTemplate, updateKpiTemplate, deleteKpiTemplate,
  getKpiAttributes, createKpiAttribute, updateKpiAttribute, deleteKpiAttribute,
  createScoreType, updateScoreType, deleteScoreType,
  updateFrequency,
  getScoringWindows, saveScoringWindows,
  getReconciliationThreshold, saveReconciliationThreshold,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import Breadcrumb from '../components/Breadcrumb';
import { Plus, Pencil, Trash2, X, AlertTriangle, Check, ChevronDown, Save, Search, Info } from 'lucide-react';

const BEHAVIOR_LABELS = { scale: 'Scale', distribution: 'Distribution', calculated: 'Calculated' };
const BEHAVIOR_COLORS = {
  scale: 'bg-gray-100 text-gray-600',
  distribution: 'bg-gray-100 text-gray-600',
  calculated: 'bg-gray-100 text-gray-600',
};

const EMPTY_FORM = {
  attribute_id: '',
  sub_metric_name: '',
  measurement_description: '',
  scoring_guide: '',
  frequency: 'monthly',
  formula: '',
  calculation_guide: '',
  score_type: 'scale_2_5',
  display_order: '',
  role_assignments: [],
  dept_ids: [],
  scored_by_role_ids: [],
};

// Chip list with max visible + overflow count
function ChipList({ items, colorClass, emptyClass = 'text-gray-300' }) {
  const MAX = 2;
  const visible = items.slice(0, MAX);
  const extra   = items.length - MAX;
  if (items.length === 0) return <span className={`text-xs ${emptyClass}`}>—</span>;
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {visible.map((label, i) => (
        <span key={i} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${colorClass}`}>{label}</span>
      ))}
      {extra > 0 && <span className="text-xs text-gray-400 font-medium">+{extra}</span>}
    </div>
  );
}

export default function KpiTemplates() {
  const { addToast } = useToast();
  const { employee } = useAuth();
  const isAdmin = employee?.is_admin;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mainTab, setMainTab] = useSearchParamState('tab', 'templates');

  // Scoring windows
  const WIN_FIELDS = [
    { key: 'daily',       label: 'Daily'       },
    { key: 'weekly',      label: 'Weekly'      },
    { key: 'fortnightly', label: 'Fortnightly' },
    { key: 'monthly',     label: 'Monthly'     },
    { key: 'quarterly',   label: 'Quarterly'   },
    { key: 'semi_annual', label: 'Semi Annual' },
    { key: 'yearly',      label: 'Yearly'      },
  ];
  const [windows, setWindows] = useState({
    daily:       { enabled: false, days: 1  },
    weekly:      { enabled: true,  days: 28 },
    fortnightly: { enabled: true,  days: 14 },
    monthly:     { enabled: true,  days: 7  },
    quarterly:   { enabled: false, days: 15 },
    semi_annual: { enabled: false, days: 15 },
    yearly:      { enabled: false, days: 30 },
  });
  const [winSaving,  setWinSaving]  = useState(false);
  const [winSaved,   setWinSaved]   = useState(false);
  const [winError,   setWinError]   = useState('');

  // Reconciliation threshold
  const [threshold,    setThreshold]    = useState(1);
  const [threshSaving, setThreshSaving] = useState(false);
  const [threshSaved,  setThreshSaved]  = useState(false);
  const [threshError,  setThreshError]  = useState('');

  // Templates tab
  const [activeRole,      setActiveRole]      = useSearchParamState('role', 'all');
  const [templateSearch,  setTemplateSearch]  = useSearchParamState('q', '');
  const [modal,           setModal]           = useState(null);
  const [form,            setForm]            = useState(EMPTY_FORM);
  const [formError,       setFormError]       = useState('');
  const [saving,          setSaving]          = useState(false);
  const [confirmDelete,   setConfirmDelete]   = useState(null);
  const [deleting,        setDeleting]        = useState(false);
  const [advancedOpen,    setAdvancedOpen]    = useState(false);

  // Assignment panels
  const [openPanels, setOpenPanels] = useState({ roles: false, depts: false, scoredBy: false });
  function togglePanel(key) { setOpenPanels(p => ({ ...p, [key]: !p[key] })); }

  // Attributes
  const [attrModal,          setAttrModal]          = useState(null);
  const [attrForm,           setAttrForm]           = useState({ name: '', display_order: '' });
  const [attrError,          setAttrError]          = useState('');
  const [attrSaving,         setAttrSaving]         = useState(false);
  const [confirmDeleteAttr,  setConfirmDeleteAttr]  = useState(null);
  const [deletingAttr,       setDeletingAttr]       = useState(false);

  // Score types
  const EMPTY_ST = { key: '', label: '', behavior: 'scale', min_value: '', max_value: '', step: '1', higher_is_better: true, suffix: '', display_order: '' };
  const [stModal,         setStModal]         = useState(null);
  const [stForm,          setStForm]          = useState(EMPTY_ST);
  const [stError,         setStError]         = useState('');
  const [stSaving,        setStSaving]        = useState(false);
  const [confirmDeleteSt, setConfirmDeleteSt] = useState(null);
  const [deletingSt,      setDeletingSt]      = useState(false);

  async function load() {
    setLoading(true); setError('');
    try {
      const d = await getKpiTemplates();
      setData(d);
      if (activeRole === 'all' || !d.roles.find(r => r.id === Number(activeRole))) setActiveRole('all');
    } catch {
      setError('Failed to load KPI templates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    getScoringWindows().then(setWindows).catch(() => {});
    getReconciliationThreshold().then(d => setThreshold(d.threshold)).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleTemplates = useMemo(() => {
    if (!data) return [];
    if (activeRole === 'all') return data.templates;
    return data.templates.filter(t =>
      t.assignments && t.assignments.some(a => a.type === 'role' && a.id === Number(activeRole))
    );
  }, [data, activeRole]);

  const weightSum = useMemo(() => {
    if (activeRole === 'all') return visibleTemplates.reduce((s, t) => s + (t.weight_percentage ?? 0), 0);
    return visibleTemplates.reduce((s, t) => {
      const ra = (t.assignments || []).find(a => a.type === 'role' && a.id === activeRole);
      return s + (ra?.weight_percentage ?? t.weight_percentage ?? 0);
    }, 0);
  }, [visibleTemplates, activeRole]);

  // Templates grouped by attribute
  const grouped = useMemo(() => {
    const map = {};
    for (const t of visibleTemplates) {
      const key = t.attribute_name || 'Unknown';
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [visibleTemplates]);

  // Search-filtered grouped templates
  const filteredGrouped = useMemo(() => {
    if (!templateSearch.trim()) return grouped;
    const q = templateSearch.toLowerCase();
    const result = {};
    for (const [attr, templates] of Object.entries(grouped)) {
      const matching = templates.filter(t =>
        t.sub_metric_name?.toLowerCase().includes(q) ||
        t.measurement_description?.toLowerCase().includes(q) ||
        attr.toLowerCase().includes(q)
      );
      if (matching.length > 0) result[attr] = matching;
    }
    return result;
  }, [grouped, templateSearch]);

  // Template count per role for tab badges
  const templateCountByRole = useMemo(() => {
    if (!data) return {};
    const counts = {};
    for (const t of data.templates) {
      for (const a of t.assignments || []) {
        if (a.type === 'role') counts[a.id] = (counts[a.id] || 0) + 1;
      }
    }
    return counts;
  }, [data]);

  // ── Template modal handlers ───────────────────────────────────────────────
  function openCreate() {
    const initAssignments = activeRole !== 'all'
      ? [{ role_id: activeRole, weight_percentage: '', selected: true }]
      : [];
    setForm({ ...EMPTY_FORM, role_assignments: initAssignments });
    setFormError('');
    setAdvancedOpen(false);
    setOpenPanels({ roles: true, depts: true, scoredBy: false });
    setModal({ mode: 'create' });
  }

  function openEdit(tmpl) {
    const roleAssignments = (tmpl.assignments || [])
      .filter(a => a.type === 'role')
      .map(a => ({
        role_id: a.id,
        weight_percentage: a.weight_percentage > 0 ? a.weight_percentage : (tmpl.weight_percentage || ''),
        selected: true,
      }));
    const deptIds = (tmpl.assignments || []).filter(a => a.type === 'dept').map(a => a.id);
    setForm({
      attribute_id:            tmpl.attribute_id,
      sub_metric_name:         tmpl.sub_metric_name,
      measurement_description: tmpl.measurement_description ?? '',
      scoring_guide:           tmpl.scoring_guide ?? '',
      frequency:               tmpl.frequency,
      formula:                 tmpl.formula ?? '',
      calculation_guide:       tmpl.calculation_guide ?? '',
      score_type:              tmpl.score_type,
      display_order:           tmpl.display_order,
      role_assignments:        roleAssignments,
      dept_ids:                deptIds,
      scored_by_role_ids:      (tmpl.scored_by_roles || []).map(r => r.role_id),
    });
    setFormError('');
    setAdvancedOpen(false);
    setOpenPanels({ roles: true, depts: true, scoredBy: false });
    setModal({ mode: 'edit', template: tmpl });
  }

  function closeModal() { setModal(null); setFormError(''); }
  function setField(key, value) { setForm(prev => ({ ...prev, [key]: value })); }

  function toggleRoleAssignment(id) {
    setForm(prev => {
      const exists = prev.role_assignments.find(ra => ra.role_id === id);
      if (exists) {
        return { ...prev, role_assignments: prev.role_assignments.map(ra => ra.role_id === id ? { ...ra, selected: !ra.selected } : ra) };
      }
      return { ...prev, role_assignments: [...prev.role_assignments, { role_id: id, weight_percentage: '', selected: true }] };
    });
  }

  function handleRoleWeightChange(roleId, value) {
    setForm(prev => {
      const exists = prev.role_assignments.find(ra => ra.role_id === roleId);
      if (value === '') return { ...prev, role_assignments: prev.role_assignments.filter(ra => ra.role_id !== roleId) };
      if (exists) return { ...prev, role_assignments: prev.role_assignments.map(ra => ra.role_id === roleId ? { ...ra, weight_percentage: value, selected: true } : ra) };
      return { ...prev, role_assignments: [...prev.role_assignments, { role_id: roleId, weight_percentage: value, selected: true }] };
    });
  }

  function toggleScoredByRoleId(id) {
    setForm(prev => ({
      ...prev,
      scored_by_role_ids: prev.scored_by_role_ids.includes(id)
        ? prev.scored_by_role_ids.filter(r => r !== id)
        : [...prev.scored_by_role_ids, id],
    }));
  }

  function toggleDeptId(id) {
    setForm(prev => ({
      ...prev,
      dept_ids: prev.dept_ids.includes(id)
        ? prev.dept_ids.filter(d => d !== id)
        : [...prev.dept_ids, id],
    }));
  }

  async function handleSave(e) {
    e.preventDefault(); setFormError('');
    const selectedRoles = form.role_assignments.filter(ra => ra.selected);
    if (selectedRoles.length === 0) { setFormError('Select at least one role.'); setOpenPanels(p => ({ ...p, roles: true })); return; }
    if (form.dept_ids.length === 0) { setFormError('Select at least one department.'); setOpenPanels(p => ({ ...p, depts: true })); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        weight_percentage: 0,
        display_order: form.display_order !== '' ? parseInt(form.display_order) : undefined,
        role_assignments: selectedRoles.map(ra => ({ role_id: ra.role_id, weight_percentage: parseFloat(ra.weight_percentage) || 0 })),
        dept_ids: form.dept_ids,
        scored_by_role_ids: form.scored_by_role_ids,
      };
      if (modal.mode === 'create') { await createKpiTemplate(payload); addToast('KPI template created.'); }
      else { await updateKpiTemplate(modal.template.id, payload); addToast('KPI template updated.'); }
      closeModal(); await load();
    } catch (err) {
      setFormError(err?.response?.data?.error || 'Failed to save template.');
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteKpiTemplate(confirmDelete.id);
      addToast(`"${confirmDelete.sub_metric_name}" deleted.`);
      setConfirmDelete(null); await load();
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to delete.', 'error');
      setConfirmDelete(null);
    } finally { setDeleting(false); }
  }

  // ── Attribute handlers ────────────────────────────────────────────────────
  function openCreateAttr() { setAttrForm({ name: '', display_order: '' }); setAttrError(''); setAttrModal({ mode: 'create' }); }
  function openEditAttr(attr) { setAttrForm({ name: attr.name, display_order: attr.display_order }); setAttrError(''); setAttrModal({ mode: 'edit', attr }); }

  async function handleSaveAttr(e) {
    e.preventDefault(); setAttrError(''); setAttrSaving(true);
    try {
      const payload = { name: attrForm.name, display_order: attrForm.display_order !== '' ? parseInt(attrForm.display_order) : undefined };
      if (attrModal.mode === 'create') { await createKpiAttribute(payload); addToast('Attribute created.'); }
      else { await updateKpiAttribute(attrModal.attr.id, payload); addToast('Attribute updated.'); }
      setAttrModal(null); await load();
    } catch (err) { setAttrError(err?.response?.data?.error || 'Failed to save attribute.'); }
    finally { setAttrSaving(false); }
  }

  async function handleDeleteAttr() {
    if (!confirmDeleteAttr) return;
    setDeletingAttr(true);
    try {
      await deleteKpiAttribute(confirmDeleteAttr.id);
      addToast(`"${confirmDeleteAttr.name}" deleted.`);
      setConfirmDeleteAttr(null); await load();
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to delete attribute.', 'error');
      setConfirmDeleteAttr(null);
    } finally { setDeletingAttr(false); }
  }

  // ── Score type handlers ───────────────────────────────────────────────────
  function openCreateSt() { setStForm(EMPTY_ST); setStError(''); setStModal({ mode: 'create' }); }
  function openEditSt(st) {
    setStForm({ key: st.key, label: st.label, behavior: st.behavior, min_value: st.min_value ?? '', max_value: st.max_value ?? '', step: st.step ?? 1, higher_is_better: st.higher_is_better !== 0, suffix: st.suffix ?? '', display_order: st.display_order });
    setStError(''); setStModal({ mode: 'edit', st });
  }
  async function handleSaveSt(e) {
    e.preventDefault(); setStError(''); setStSaving(true);
    try {
      const stPayload = {
        label: stForm.label, behavior: stForm.behavior,
        min_value: stForm.min_value !== '' ? parseFloat(stForm.min_value) : null,
        max_value: stForm.max_value !== '' ? parseFloat(stForm.max_value) : null,
        step: stForm.step !== '' ? parseFloat(stForm.step) : 1,
        higher_is_better: stForm.higher_is_better,
        suffix: stForm.suffix,
        display_order: stForm.display_order !== '' ? parseInt(stForm.display_order) : undefined,
      };
      if (stModal.mode === 'create') { await createScoreType({ key: stForm.key, ...stPayload }); addToast('Score type created.'); }
      else { await updateScoreType(stModal.st.id, stPayload); addToast('Score type updated.'); }
      setStModal(null); await load();
    } catch (err) { setStError(err?.response?.data?.error || 'Failed to save score type.'); }
    finally { setStSaving(false); }
  }
  async function handleDeleteSt() {
    if (!confirmDeleteSt) return;
    setDeletingSt(true);
    try {
      await deleteScoreType(confirmDeleteSt.id);
      addToast(`"${confirmDeleteSt.label}" deleted.`);
      setConfirmDeleteSt(null); await load();
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to delete.', 'error');
      setConfirmDeleteSt(null);
    } finally { setDeletingSt(false); }
  }

  async function handleSaveWindows() {
    setWinSaving(true); setWinError(''); setWinSaved(false);
    try { const updated = await saveScoringWindows(windows); setWindows(updated); setWinSaved(true); setTimeout(() => setWinSaved(false), 2500); }
    catch (e) { setWinError(e.response?.data?.error || 'Failed to save'); }
    finally { setWinSaving(false); }
  }

  async function handleSaveThreshold() {
    setThreshSaving(true); setThreshError(''); setThreshSaved(false);
    try { const updated = await saveReconciliationThreshold(threshold); setThreshold(updated.threshold); setThreshSaved(true); setTimeout(() => setThreshSaved(false), 2500); }
    catch (e) { setThreshError(e.response?.data?.error || 'Failed to save'); }
    finally { setThreshSaving(false); }
  }

  async function handleToggleFrequency(fc) {
    try { await updateFrequency(fc.id, { is_active: !fc.is_active }); addToast(`"${fc.label}" ${fc.is_active ? 'disabled' : 'enabled'}.`); await load(); }
    catch (err) { addToast(err?.response?.data?.error || 'Failed to update frequency.', 'error'); }
  }

  if (loading) return <div className="p-5 text-gray-400">Loading…</div>;
  if (error)   return <div className="p-5 text-red-600">{error}</div>;
  if (!data)   return null;


  return (
    <div className="max-w-6xl mx-auto p-6 overflow-y-auto flex-1">
      <ConfirmModal open={!!confirmDelete}    title={`Delete "${confirmDelete?.sub_metric_name}"?`}     message="This cannot be undone. Templates with existing scores cannot be deleted."     confirmLabel={deleting ? 'Deleting…' : 'Delete'}     danger onConfirm={handleDelete}     onCancel={() => setConfirmDelete(null)} />
      <ConfirmModal open={!!confirmDeleteAttr} title={`Delete attribute "${confirmDeleteAttr?.name}"?`} message="This cannot be undone. Attributes referenced by templates cannot be deleted." confirmLabel={deletingAttr ? 'Deleting…' : 'Delete'} danger onConfirm={handleDeleteAttr} onCancel={() => setConfirmDeleteAttr(null)} />
      <ConfirmModal open={!!confirmDeleteSt}   title={`Delete score type "${confirmDeleteSt?.label}"?`} message="Cannot be undone. Score types used by templates cannot be deleted."          confirmLabel={deletingSt ? 'Deleting…' : 'Delete'}  danger onConfirm={handleDeleteSt}   onCancel={() => setConfirmDeleteSt(null)} />

      {/* Header */}
      <Breadcrumb items={[
        { label: 'Admin' },
        { label: 'KPI Templates', to: '/kpi-templates' },
        { label: mainTab === 'settings' ? 'Settings' : 'Templates' },
      ]} />
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">KPI Templates</h1>
          <p className="text-xs text-gray-400 mt-0.5">Manage KPI metrics, scoring rules, and attributes</p>
        </div>
        {mainTab === 'templates' && (
          <button onClick={openCreate} className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors">
            <Plus size={13} /> Add Template
          </button>
        )}
      </div>

      {/* Main tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {['templates', 'settings'].map(tab => (
          <button key={tab} onClick={() => setMainTab(tab)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mainTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {tab === 'templates' ? 'KPI Templates' : 'Settings'}
          </button>
        ))}
      </div>

      {/* ── Settings tab ──────────────────────────────────────────────────── */}
      {mainTab === 'settings' && (
        <div className="space-y-8">

          {/* ─ Master Data ─ */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Master Data</p>
            <div className="space-y-4">

              {/* KPI Attributes */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-700 text-sm">KPI Attributes</span>
                    <p className="text-xs text-gray-400 mt-0.5">Top-level groupings for KPI templates (e.g. Quality, Delivery).</p>
                  </div>
                  {isAdmin && (
                    <button onClick={openCreateAttr} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
                      <Plus size={13} /> Add
                    </button>
                  )}
                </div>
                {data.attributes.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">No attributes yet.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-5 py-3">Name</th>
                        <th className="text-right px-5 py-3">Order</th>
                        <th className="px-5 py-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.attributes.map(attr => (
                        <tr key={attr.id} className="hover:bg-gray-50 group">
                          <td className="px-5 py-3 font-medium text-gray-800">{attr.name}</td>
                          <td className="px-5 py-3 text-right text-gray-500">{attr.display_order}</td>
                          <td className="px-5 py-3 text-right">
                            {isAdmin && (
                              <div className="flex items-center gap-2 justify-end opacity-30 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditAttr(attr)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Edit"><Pencil size={14} /></button>
                                <button onClick={() => setConfirmDeleteAttr(attr)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 size={14} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Score Types */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-700 text-sm">Score Types</span>
                    <p className="text-xs text-gray-400 mt-0.5">Define the scoring scale used when evaluating KPIs.</p>
                  </div>
                  {isAdmin && (
                    <button onClick={openCreateSt} className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 font-medium border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors">
                      <Plus size={13} /> Add
                    </button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Label</th>
                      <th className="text-left px-5 py-3">Behavior</th>
                      <th className="text-left px-5 py-3">Range / Step</th>
                      <th className="text-left px-5 py-3">Direction</th>
                      <th className="px-5 py-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(data.scoreTypes || []).map(st => (
                      <tr key={st.id} className="hover:bg-gray-50 group">
                        <td className="px-5 py-3 font-medium text-gray-800">{st.label}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${BEHAVIOR_COLORS[st.behavior] ?? 'bg-gray-100 text-gray-700'}`}>
                            {BEHAVIOR_LABELS[st.behavior] ?? st.behavior}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-500 text-xs">
                          {st.behavior === 'scale'
                            ? <span>{st.min_value} – {st.max_value}{st.step && st.step !== 1 ? `, step ${st.step}` : ''}{st.suffix ? ` (${st.suffix})` : ''}</span>
                            : '—'}
                        </td>
                        <td className="px-5 py-3 text-xs">
                          {st.higher_is_better !== 0
                            ? <span className="text-gray-700">↑ Higher</span>
                            : <span className="text-gray-500">↓ Lower</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {isAdmin && (
                            <div className="flex items-center gap-2 justify-end opacity-30 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditSt(st)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Edit"><Pencil size={14} /></button>
                              {!st.is_system && (
                                <button onClick={() => setConfirmDeleteSt(st)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete"><Trash2 size={14} /></button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ─ Configuration ─ */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Configuration</p>
            <div className="space-y-4">

              {/* Frequencies */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="font-semibold text-gray-700 text-sm">Frequencies</span>
                  <p className="text-xs text-gray-400 mt-0.5">Disabled frequencies are hidden from all dropdowns and filters across the app.</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-3">Label</th>
                      <th className="text-right px-5 py-3">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(data.frequencies || []).map(fc => (
                      <tr key={fc.id} className={`transition-colors ${fc.is_active ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-60'}`}>
                        <td className="px-5 py-3 font-medium text-gray-800">{fc.label}</td>
                        <td className="px-5 py-3 text-right">
                          {isAdmin ? (
                            <button
                              onClick={() => handleToggleFrequency(fc)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${fc.is_active ? 'bg-gray-900' : 'bg-gray-300'}`}
                              title={fc.is_active ? 'Click to disable' : 'Click to enable'}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${fc.is_active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                            </button>
                          ) : (
                            <span className={`text-xs font-medium ${fc.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                              {fc.is_active ? 'Enabled' : 'Disabled'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Scoring Windows */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="font-semibold text-gray-700 text-sm">Scoring Windows</span>
                  <p className="text-xs text-gray-400 mt-0.5">Allow scoring past periods within X days of the period ending.</p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-5 py-2.5">Frequency</th>
                      <th className="px-5 py-2.5 text-center" title="Allow scoring after the period has ended">Enable</th>
                      <th className="px-5 py-2.5 text-left">Days back allowed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {WIN_FIELDS.map(({ key, label }) => {
                      const w = windows[key] ?? { enabled: false, days: 0 };
                      return (
                        <tr key={key} className={w.enabled ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-70'}>
                          <td className="px-5 py-2.5 font-medium text-gray-700">{label}</td>
                          <td className="px-5 py-2.5 text-center">
                            <input type="checkbox" checked={w.enabled} onChange={e => setWindows(prev => ({ ...prev, [key]: { ...prev[key], enabled: e.target.checked } }))} className="w-4 h-4 rounded accent-gray-900 cursor-pointer" />
                          </td>
                          <td className="px-5 py-2.5">
                            <div className="flex items-center gap-2">
                              <input type="number" min={0} max={366} value={w.days} disabled={!w.enabled} onChange={e => setWindows(prev => ({ ...prev, [key]: { ...prev[key], days: parseInt(e.target.value) || 0 } }))} className="w-16 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:opacity-40 disabled:bg-gray-50" />
                              <span className="text-xs text-gray-400">days</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center gap-3">
                  {winError && <p className="text-xs text-red-600 flex-1">{winError}</p>}
                  <button onClick={handleSaveWindows} disabled={winSaving} className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
                    {winSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : winSaved ? <Check size={14} /> : <Save size={14} />}
                    {winSaved ? 'Saved!' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Reconciliation Threshold — simplified single-row layout */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="font-semibold text-gray-700 text-sm">Reconciliation Threshold</span>
                  <p className="text-xs text-gray-400 mt-0.5">Score gap between self-score and manager score that triggers a dispute.</p>
                </div>
                <div className="px-5 py-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-sm text-gray-700 font-medium">Minimum point difference</label>
                    <input
                      type="number" min={0} step={0.5} value={threshold}
                      onChange={e => setThreshold(parseFloat(e.target.value) || 0)}
                      className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                    <span className="text-sm text-gray-400">points</span>
                    <button onClick={handleSaveThreshold} disabled={threshSaving} className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
                      {threshSaving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : threshSaved ? <Check size={14} /> : <Save size={14} />}
                      {threshSaved ? 'Saved!' : 'Save'}
                    </button>
                  </div>
                  {threshError && <p className="text-xs text-red-600 mt-2">{threshError}</p>}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ── Templates tab ─────────────────────────────────────────────────── */}
      {mainTab === 'templates' && (
        <>
          {/* Role tabs — horizontally scrollable, no wrapping */}
          <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl overflow-x-auto">
            <button
              onClick={() => setActiveRole('all')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeRole === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              All
              <span className={`text-xs rounded-full px-1.5 font-semibold ${activeRole === 'all' ? 'bg-gray-100 text-gray-500' : 'bg-gray-200 text-gray-400'}`}>
                {data.templates.length}
              </span>
            </button>
            {data.roles.map(role => (
              <button
                key={role.id}
                onClick={() => setActiveRole(role.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeRole === role.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {role.name}
                {templateCountByRole[role.id] > 0 && (
                  <span className={`text-xs rounded-full px-1.5 font-semibold ${activeRole === role.id ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-400'}`}>
                    {templateCountByRole[role.id]}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search + weight summary row */}
          <div className="flex items-center gap-4 mb-5">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              />
              {templateSearch && (
                <button onClick={() => setTemplateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Weight summary — only when a specific role is selected */}
            {activeRole !== 'all' && (
              <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2 shrink-0">
                <div className="w-32">
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${Math.abs(weightSum - 100) < 0.01 ? 'bg-gray-900' : weightSum > 100 ? 'bg-red-500' : 'bg-gray-400'}`}
                      style={{ width: `${Math.min(weightSum, 100)}%` }}
                    />
                  </div>
                </div>
                <span className={`text-sm font-bold ${Math.abs(weightSum - 100) < 0.01 ? 'text-gray-900' : 'text-gray-600'}`}>
                  {weightSum.toFixed(1)}%
                  {Math.abs(weightSum - 100) < 0.01 ? ' ✓' : ''}
                </span>
                <span className="text-xs text-gray-400">{visibleTemplates.length} templates</span>
              </div>
            )}

            {activeRole === 'all' && (
              <span className="text-xs text-gray-400">{visibleTemplates.length} templates</span>
            )}
          </div>

          {/* Templates by attribute */}
          {Object.keys(filteredGrouped).length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
              {templateSearch ? (
                <>No templates match "<span className="text-gray-600">{templateSearch}</span>".</>
              ) : (
                <>
                  No templates for this selection yet.
                  <button onClick={openCreate} className="block mx-auto mt-3 text-gray-700 text-sm hover:underline">Add the first one →</button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(filteredGrouped).map(([attrName, templates]) => {
                const attrWeight = templates.reduce((s, t) => {
                  if (activeRole !== 'all') {
                    const ra = (t.assignments || []).find(a => a.type === 'role' && a.id === activeRole);
                    return s + (ra?.weight_percentage ?? t.weight_percentage ?? 0);
                  }
                  return s + (t.weight_percentage ?? 0);
                }, 0);
                return (
                  <div key={attrName} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <span className="font-semibold text-gray-700 text-sm">{attrName}</span>
                      {activeRole !== 'all' && <span className="text-xs text-gray-400">{attrWeight.toFixed(1)}%</span>}
                    </div>
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '26%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '7%' }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                          <th className="text-left px-5 py-2">KPI Name</th>
                          <th className="text-left px-3 py-2">Type</th>
                          <th className="text-left px-3 py-2">Freq.</th>
                          <th className="text-left px-3 py-2">Roles</th>
                          <th className="text-left px-3 py-2">Departments</th>
                          <th className="text-right px-3 py-2">Weight</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {templates.map(t => {
                          const roleAssignments = (t.assignments || []).filter(a => a.type === 'role');
                          const deptAssignments = (t.assignments || []).filter(a => a.type === 'dept');
                          return (
                            <tr key={t.id} className="hover:bg-gray-50 group align-middle">
                              <td className="px-5 py-3">
                                <div className="font-medium text-gray-800 truncate">{t.sub_metric_name}</div>
                                {t.measurement_description && (
                                  <div className="text-xs text-gray-400 mt-0.5 truncate">{t.measurement_description}</div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {(() => {
                                  const stConfig = (data?.scoreTypes || []).find(s => s.key === t.score_type);
                                  return (
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${BEHAVIOR_COLORS[stConfig?.behavior] ?? 'bg-gray-100 text-gray-700'}`}>
                                      {stConfig?.label ?? t.score_type}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-3 py-3 text-gray-500 capitalize text-xs">{t.frequency}</td>
                              <td className="px-3 py-3">
                                <ChipList items={roleAssignments.map(a => a.name)} colorClass="bg-gray-100 text-gray-700" />
                              </td>
                              <td className="px-3 py-3">
                                <ChipList items={deptAssignments.map(a => a.name)} colorClass="bg-gray-100 text-gray-600" />
                              </td>
                              <td className="px-3 py-3 text-right font-semibold text-gray-700 text-xs">
                                {activeRole !== 'all'
                                  ? (() => { const ra = roleAssignments.find(a => a.id === activeRole); return `${ra?.weight_percentage ?? t.weight_percentage}%`; })()
                                  : (() => {
                                      if (roleAssignments.length > 1) return <span className="text-xs font-normal text-gray-500">{roleAssignments.map(a => `${a.weight_percentage}%`).join(' / ')}</span>;
                                      return `${t.weight_percentage}%`;
                                    })()
                                }
                              </td>
                              <td className="px-3 py-3 text-right">
                                <div className="flex items-center gap-1 justify-end opacity-30 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Edit"><Pencil size={14} /></button>
                                  <button onClick={() => setConfirmDelete(t)} disabled={deleting} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50" title="Delete"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Template Modal ─────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-800">
                {modal.mode === 'create' ? 'Add KPI Template' : 'Edit KPI Template'}
              </h2>
              <button onClick={closeModal} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"><X size={18} /></button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Attribute */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Attribute *</label>
                <select value={form.attribute_id} onChange={e => setField('attribute_id', parseInt(e.target.value))} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                  <option value="">Select attribute…</option>
                  {data.attributes.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              {/* KPI Name (was "Sub-metric Name") */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">KPI Name *</label>
                <input type="text" value={form.sub_metric_name} onChange={e => setField('sub_metric_name', e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. Customer Retention" />
              </div>

              {/* Measurement description */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Measurement Description</label>
                <input type="text" value={form.measurement_description} onChange={e => setField('measurement_description', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. % customers retained per year" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Score type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Score Type *</label>
                  <select value={form.score_type} onChange={e => setField('score_type', e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                    {(data?.scoreTypes || []).map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
                  </select>
                </div>
                {/* Frequency */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Frequency *</label>
                  <select value={form.frequency} onChange={e => setField('frequency', e.target.value)} required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                    {(data?.frequencies || []).filter(f => f.is_active).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Assignment info banner */}
              <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <Info size={13} className="text-gray-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-700">Roles</strong> define which employees are evaluated on this KPI (and their weight).
                  {' '}<strong className="text-gray-700">Departments</strong> control which departments this KPI applies to.
                  Both are required.
                </span>
              </div>

              {/* Assign to Roles */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => togglePanel('roles')} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className="text-xs font-semibold text-gray-600">
                    Assign to Roles *
                    {form.role_assignments.filter(ra => ra.selected).length > 0 && (
                      <span className="ml-2 text-gray-400 font-normal">({form.role_assignments.filter(ra => ra.selected).length} selected)</span>
                    )}
                  </span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${openPanels.roles ? 'rotate-180' : ''}`} />
                </button>
                {openPanels.roles && (
                  <div className="p-3 space-y-1 max-h-52 overflow-y-auto">
                    {data.roles.map(r => {
                      const ra = form.role_assignments.find(x => x.role_id === r.id);
                      const checked = ra?.selected ?? false;
                      const weightValue = ra?.weight_percentage ?? '';
                      return (
                        <div key={r.id} className="flex items-center gap-2 py-0.5">
                          <label onClick={() => toggleRoleAssignment(r.id)} className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-500'}`}>
                              {checked && <Check size={10} className="text-white" />}
                            </div>
                            <span className={`text-sm select-none truncate ${checked ? 'text-gray-700' : 'text-gray-400'}`}>{r.name}</span>
                          </label>
                          <div className="flex items-center gap-1 shrink-0">
                            <input
                              type="number" min="0" max="100" step="0.5" value={weightValue}
                              onChange={e => handleRoleWeightChange(r.id, e.target.value)}
                              onClick={e => e.stopPropagation()}
                              placeholder="0"
                              className={`w-16 border rounded px-2 py-0.5 text-xs text-right focus:ring-1 focus:ring-gray-900 focus:border-transparent transition-colors ${checked ? 'border-gray-300 bg-white text-gray-700' : 'border-gray-200 bg-gray-50 text-gray-400'}`}
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </div>
                      );
                    })}
                    {data.roles.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No roles available.</p>}
                  </div>
                )}
              </div>

              {/* Assign to Departments */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => togglePanel('depts')} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className="text-xs font-semibold text-gray-600">
                    Assign to Departments *
                    {form.dept_ids.length > 0 && <span className="ml-2 text-gray-400 font-normal">({form.dept_ids.length} selected)</span>}
                  </span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${openPanels.depts ? 'rotate-180' : ''}`} />
                </button>
                {openPanels.depts && (
                  <div className="p-3 space-y-1">
                    {data.departments.map(dept => (
                      <label key={dept.id} onClick={() => toggleDeptId(dept.id)} className="flex items-center gap-2 cursor-pointer group py-0.5">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${form.dept_ids.includes(dept.id) ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-600'}`}>
                          {form.dept_ids.includes(dept.id) && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-sm text-gray-700 select-none">{dept.name}</span>
                      </label>
                    ))}
                    {data.departments.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No departments available.</p>}
                  </div>
                )}
              </div>

              {/* Scored By Roles */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => togglePanel('scoredBy')} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className="text-xs font-semibold text-gray-600">
                    Externally Scored By
                    {form.scored_by_role_ids.length > 0 && <span className="ml-2 text-gray-400 font-normal">({form.scored_by_role_ids.length} selected)</span>}
                  </span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${openPanels.scoredBy ? 'rotate-180' : ''}`} />
                </button>
                {openPanels.scoredBy && (
                  <div className="p-3 space-y-1 max-h-40 overflow-y-auto bg-white">
                    <p className="text-xs text-gray-400 mb-2">These roles rate this KPI — their score is final.</p>
                    {data.roles.map(r => (
                      <label key={r.id} onClick={() => toggleScoredByRoleId(r.id)} className="flex items-center gap-2 cursor-pointer group py-0.5">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${form.scored_by_role_ids.includes(r.id) ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-600'}`}>
                          {form.scored_by_role_ids.includes(r.id) && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-sm text-gray-700 select-none">{r.name}</span>
                      </label>
                    ))}
                    {data.roles.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No roles available.</p>}
                  </div>
                )}
              </div>

              {/* Scoring guide */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Scoring Guide</label>
                <textarea value={form.scoring_guide} onChange={e => setField('scoring_guide', e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none font-mono" placeholder={"5 pts: ≥95%\n4 pts: 90–94%\n3 pts: 80–89%\n2 pts: <80%"} />
              </div>

              {/* Advanced section — formula, calculation guide, display order */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button type="button" onClick={() => setAdvancedOpen(v => !v)} className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className="text-xs font-semibold text-gray-600">Advanced</span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                </button>
                {advancedOpen && (
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Formula</label>
                      <input type="text" value={form.formula} onChange={e => setField('formula', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono" placeholder="e.g. (Billed hrs / Available hrs) × 100" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Calculation Guide</label>
                      <textarea value={form.calculation_guide} onChange={e => setField('calculation_guide', e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none" placeholder="Step-by-step instructions for calculating this metric…" />
                    </div>
                    <div className="w-32">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Display Order</label>
                      <input type="number" min="1" value={form.display_order} onChange={e => setField('display_order', e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="auto" />
                    </div>
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {formError}</p>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors">
                  {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Template' : 'Save Changes'}
                </button>
                <button type="button" onClick={closeModal} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Score Type Modal ───────────────────────────────────────────────── */}
      {stModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-800">{stModal.mode === 'create' ? 'Add Score Type' : 'Edit Score Type'}</h2>
              <button onClick={() => setStModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveSt} className="p-6 space-y-4">
              {stModal.mode === 'create' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Key * <span className="font-normal text-gray-400">(internal, cannot change later)</span></label>
                  <input type="text" value={stForm.key} required autoFocus onChange={e => setStForm(f => ({ ...f, key: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. scale_1_3" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Label *</label>
                <input type="text" value={stForm.label} required autoFocus={stModal.mode === 'edit'} onChange={e => setStForm(f => ({ ...f, label: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. Scale 1–3" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Behavior *</label>
                <select value={stForm.behavior} onChange={e => setStForm(f => ({ ...f, behavior: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                  <option value="scale">Scale — number input within min/max range</option>
                  <option value="distribution">Distribution — ₹ rupee distribution UI</option>
                  <option value="calculated">Calculated — formula-based, not manually entered</option>
                </select>
              </div>
              {stForm.behavior === 'scale' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Min Value *</label>
                      <input type="number" step="any" value={stForm.min_value} required onChange={e => setStForm(f => ({ ...f, min_value: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. 1" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Max Value *</label>
                      <input type="number" step="any" value={stForm.max_value} required onChange={e => setStForm(f => ({ ...f, max_value: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. 5" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Increment (Step) * <span className="font-normal text-gray-400">— e.g. 1 for whole numbers, 0.5 for half-points</span></label>
                    <input type="number" step="any" min="0.01" value={stForm.step} required onChange={e => setStForm(f => ({ ...f, step: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="1" />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Suffix <span className="font-normal text-gray-400">— shown after value</span></label>
                  <input type="text" value={stForm.suffix} onChange={e => setStForm(f => ({ ...f, suffix: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. % or pts" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Direction</label>
                  <select value={stForm.higher_is_better ? 'true' : 'false'} onChange={e => setStForm(f => ({ ...f, higher_is_better: e.target.value === 'true' }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                    <option value="true">Higher is better</option>
                    <option value="false">Lower is better</option>
                  </select>
                </div>
              </div>
              <div className="w-32">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Display Order</label>
                <input type="number" min="1" value={stForm.display_order} onChange={e => setStForm(f => ({ ...f, display_order: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="auto" />
              </div>
              {stError && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {stError}</p>}
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={stSaving} className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors">
                  {stSaving ? 'Saving…' : stModal.mode === 'create' ? 'Create' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setStModal(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Attribute Modal ────────────────────────────────────────────────── */}
      {attrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <h2 className="text-lg font-bold text-gray-800">{attrModal.mode === 'create' ? 'Add Attribute' : 'Edit Attribute'}</h2>
              <button onClick={() => setAttrModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveAttr} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Name *</label>
                <input type="text" value={attrForm.name} onChange={e => setAttrForm(f => ({ ...f, name: e.target.value }))} required autoFocus className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="e.g. Quality" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Display Order</label>
                <input type="number" min="1" value={attrForm.display_order} onChange={e => setAttrForm(f => ({ ...f, display_order: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent" placeholder="auto" />
              </div>
              {attrError && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {attrError}</p>}
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" disabled={attrSaving} className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg text-sm transition-colors">
                  {attrSaving ? 'Saving…' : attrModal.mode === 'create' ? 'Create Attribute' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setAttrModal(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
