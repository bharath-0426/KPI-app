import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { getEmployees, getRoles, updateEmployee } from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import { Search, X, Pencil, ZoomIn, ZoomOut, Network, ChevronRight } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const CARD_W   = 200;
const CARD_H   = 62;
const HALF_H   = 31;
const STEM_W   = 24;   // width of connector between columns
const ROW_GAP  = 10;   // gap between sibling rows (tree view)
const COL_PAD  = 12;   // column internal padding (top/bottom/left/right)
const CARD_GAP = 8;    // vertical gap between cards in a column

const ROLE_COLORS = {
  'Director of Operations': { avatar: '#111827', border: '#374151', badge: 'bg-gray-100 text-gray-700' },
  'Group Head':             { avatar: '#374151', border: '#6b7280', badge: 'bg-gray-100 text-gray-700' },
  'Project Manager':        { avatar: '#4b5563', border: '#9ca3af', badge: 'bg-gray-100 text-gray-700' },
  'Engineering Manager':    { avatar: '#374151', border: '#9ca3af', badge: 'bg-gray-100 text-gray-700' },
  'Project Lead':           { avatar: '#6b7280', border: '#d1d5db', badge: 'bg-gray-100 text-gray-600' },
  'Team Member':            { avatar: '#6b7280', border: '#d1d5db', badge: 'bg-gray-100 text-gray-600' },
};
const DEFAULT_COLOR = { avatar: '#6b7280', border: '#d1d5db', badge: 'bg-gray-100 text-gray-600' };

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

// ── Column Card — used in focused Miller-column view ──────────────────────────
function ColumnCard({ node, isSelected, onSelect, editMode, draggedId, dropId, onDragStart, onDragEnd, onDragOver, onConfirmDrop }) {
  const hasChildren = node.children?.length > 0;
  const isDragOver  = dropId === node.id;
  const c           = ROLE_COLORS[node.role_name] ?? DEFAULT_COLOR;

  const borderColor = isDragOver ? '#f59e0b' : isSelected ? c.border : '#e5e7eb';
  const bgColor     = isDragOver ? '#fffbeb' : isSelected ? '#f8faff' : '#ffffff';
  const borderWidth = (isSelected || isDragOver) ? 2 : 1;

  return (
    <div
      onClick={() => onSelect(node.id)}
      draggable={editMode || undefined}
      onDragStart={editMode ? (e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(node.id); } : undefined}
      onDragEnd={editMode   ? onDragEnd   : undefined}
      onDragOver={editMode  ? (e) => { e.preventDefault(); if (draggedId && draggedId !== node.id) onDragOver(node.id); } : undefined}
      onDrop={editMode      ? (e) => { e.preventDefault(); onConfirmDrop(node.id); } : undefined}
      style={{ borderColor, background: bgColor, height: CARD_H, borderWidth, width: CARD_W }}
      className={[
        'border rounded-xl flex items-center gap-2.5 px-3 select-none transition-all duration-150 shrink-0',
        isSelected  ? 'shadow-md'                                              : '',
        !isSelected ? 'cursor-pointer hover:shadow hover:border-gray-300'     : '',
        isDragOver  ? 'scale-105'                                              : '',
        editMode && !isSelected ? 'cursor-grab active:cursor-grabbing'        : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        style={{ width: 34, height: 34, background: c.avatar, flexShrink: 0 }}
        className="rounded-full flex items-center justify-center text-white font-bold text-xs"
      >
        {initials(node.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-gray-900 truncate text-xs leading-tight">{node.name}</div>
        <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${c.badge}`}>
          {node.role_name || '—'}
        </span>
      </div>
      {hasChildren && (
        <ChevronRight
          size={14}
          strokeWidth={2.5}
          className={isSelected ? 'text-gray-900 shrink-0' : 'text-gray-300 shrink-0'}
        />
      )}
    </div>
  );
}

// ── Tree Node — used in full chart view ───────────────────────────────────────
function TreeNode({ node, selectedId, ancestorIds, onSelect, editMode, draggedId, dropId, onDragStart, onDragEnd, onDragOver, onConfirmDrop }) {
  const hasChildren = node.children?.length > 0;
  const isSelected  = node.id === selectedId;
  const isAncestor  = ancestorIds.has(node.id);
  const isDragOver  = dropId === node.id;
  const c           = ROLE_COLORS[node.role_name] ?? DEFAULT_COLOR;

  // In full view every node is expanded
  const showChildren = hasChildren;

  const borderColor = isDragOver ? '#f59e0b' : isSelected ? c.border : isAncestor ? '#cbd5e1' : '#e5e7eb';
  const bgColor     = isDragOver ? '#fffbeb' : isSelected ? '#f8faff' : '#ffffff';
  const borderWidth = (isSelected || isDragOver) ? 2 : 1;

  return (
    <div className="flex items-start">
      <div className="shrink-0 relative" style={{ width: CARD_W }}>
        <div
          onClick={() => onSelect(node.id)}
          draggable={editMode || undefined}
          onDragStart={editMode ? (e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(node.id); } : undefined}
          onDragEnd={editMode   ? onDragEnd   : undefined}
          onDragOver={editMode  ? (e) => { e.preventDefault(); if (draggedId && draggedId !== node.id) onDragOver(node.id); } : undefined}
          onDrop={editMode      ? (e) => { e.preventDefault(); onConfirmDrop(node.id); } : undefined}
          style={{ borderColor, background: bgColor, height: CARD_H, borderWidth }}
          className={[
            'border rounded-xl flex items-center gap-2.5 px-3 select-none transition-all duration-150',
            isSelected  ? 'shadow-md cursor-default'                          : '',
            !isSelected ? 'cursor-pointer hover:shadow hover:border-gray-300' : '',
            isDragOver  ? 'scale-105'                                         : '',
            editMode && !isSelected ? 'cursor-grab active:cursor-grabbing'    : '',
          ].filter(Boolean).join(' ')}
        >
          <div style={{ width: 34, height: 34, background: c.avatar, flexShrink: 0 }} className="rounded-full flex items-center justify-center text-white font-bold text-xs">
            {initials(node.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900 truncate text-xs leading-tight">{node.name}</div>
            <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${c.badge}`}>
              {node.role_name || '—'}
            </span>
          </div>
        </div>
      </div>

      {showChildren && (
        <>
          <div className="shrink-0 bg-gray-200" style={{ width: STEM_W, height: 1, marginTop: HALF_H - 0.5 }} />
          <div className="flex flex-col shrink-0">
            {node.children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast  = idx === node.children.length - 1;
              const only    = isFirst && isLast;
              return (
                <div key={child.id} className="relative" style={{ paddingLeft: STEM_W, paddingBottom: isLast ? 0 : ROW_GAP }}>
                  {!only && (
                    <div className="absolute bg-gray-200" style={{ left: 0, width: 1, top: isFirst ? HALF_H : 0, bottom: isLast ? `calc(100% - ${HALF_H}px)` : 0 }} />
                  )}
                  <div className="absolute bg-gray-200" style={{ left: 0, top: HALF_H, width: STEM_W, height: 1 }} />
                  <TreeNode
                    node={child}
                    selectedId={selectedId}
                    ancestorIds={ancestorIds}
                    onSelect={onSelect}
                    editMode={editMode}
                    draggedId={draggedId}
                    dropId={dropId}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    onDragOver={onDragOver}
                    onConfirmDrop={onConfirmDrop}
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

// ── Main component ────────────────────────────────────────────────────────────
export default function OrgChart() {
  const { addToast } = useToast();
  const [employees,  setEmployees]  = useState([]);
  const [roles,      setRoles]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editMode,   setEditMode]   = useState(false);
  const [search,     setSearch]     = useState('');
  const [draggedId,  setDraggedId]  = useState(null);
  const [dropId,     setDropId]     = useState(null);
  const [pending,    setPending]    = useState(null);
  const [zoom,        setZoom]       = useState(1);
  const [showFull,    setShowFull]   = useState(false);
  const [chartHeight, setChartHeight] = useState(600);
  const initialized = useRef(false);
  const chartRef    = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const [data, roleData] = await Promise.all([getEmployees(), getRoles()]);
      setEmployees(data.filter(e => e.is_active));
      setRoles(roleData);
    } catch {
      setError('Failed to load employees.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Measure chart container height for independent column scrolling ────────
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setChartHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Infer reports_to from role hierarchy ──────────────────────────────────
  const treeEmployees = useMemo(() => {
    if (!employees.length || !roles.length) return employees;
    return employees.reduce((acc, emp) => {
      if (emp.reports_to) { acc.push(emp); return acc; }
      const role = roles.find(r => r.id === emp.role_id);
      if (!role || !role.parent_role_id) { acc.push(emp); return acc; }
      const candidates = employees.filter(e =>
        e.role_id === role.parent_role_id && e.department_id === emp.department_id
      );
      if (candidates.length === 1) acc.push({ ...emp, reports_to: candidates[0].id });
      return acc;
    }, []);
  }, [employees, roles]);

  // ── Nested tree ───────────────────────────────────────────────────────────
  const tree = useMemo(() => {
    function buildNode(emp) {
      return {
        ...emp,
        children: treeEmployees
          .filter(e => e.reports_to === emp.id)
          .sort((a, b) => (a.hierarchy_level ?? 99) - (b.hierarchy_level ?? 99) || a.name.localeCompare(b.name))
          .map(buildNode),
      };
    }
    return treeEmployees
      .filter(e => !e.reports_to)
      .sort((a, b) => (a.hierarchy_level ?? 99) - (b.hierarchy_level ?? 99))
      .map(buildNode);
  }, [treeEmployees]);

  // ── Node lookup map ───────────────────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const map = new Map();
    function traverse(node) { map.set(node.id, node); node.children.forEach(traverse); }
    tree.forEach(traverse);
    return map;
  }, [tree]);

  // ── Default selection: top person ─────────────────────────────────────────
  useEffect(() => {
    if (!initialized.current && tree.length > 0) {
      setSelectedId(tree[0].id);
      initialized.current = true;
    }
  }, [tree]);

  // ── Active path: array of IDs from root → selectedId ─────────────────────
  const pathIds = useMemo(() => {
    if (!selectedId) return [];
    const ids = [];
    let curId = selectedId;
    while (curId) {
      ids.unshift(curId);
      const cur = treeEmployees.find(e => e.id === curId);
      curId = cur?.reports_to ?? null;
    }
    return ids;
  }, [selectedId, treeEmployees]);

  // ── Miller columns ────────────────────────────────────────────────────────
  // Each column carries a paddingTop so that the first child card aligns
  // vertically with the selected parent card in the previous column.
  // paddingTop accumulates: each column's top offset = the Y centre of the
  // selected card in the previous column, minus HALF_H (so the card starts
  // at that Y, not its centre).
  const columns = useMemo(() => {
    const cols = [];
    let nextPaddingTop = COL_PAD; // column 0 starts flush at the top

    // Column 0: all top-level roots
    cols.push({ items: tree, selectedId: pathIds[0] ?? null, paddingTop: COL_PAD });

    // Advance paddingTop to align the next column with the selected root card
    if (pathIds[0] != null) {
      const idx = tree.findIndex(n => n.id === pathIds[0]);
      if (idx >= 0) nextPaddingTop = COL_PAD + idx * (CARD_H + CARD_GAP);
    }

    // One column per node in the active path
    for (let i = 0; i < pathIds.length; i++) {
      const node = nodeMap.get(pathIds[i]);
      if (!node || !node.children.length) break;
      const nextSelectedId = pathIds[i + 1] ?? null;

      cols.push({ items: node.children, selectedId: nextSelectedId, paddingTop: nextPaddingTop });

      // Advance paddingTop to align the column after this one
      if (nextSelectedId != null) {
        const idx = node.children.findIndex(c => c.id === nextSelectedId);
        if (idx >= 0) nextPaddingTop = nextPaddingTop + idx * (CARD_H + CARD_GAP);
      }
    }

    return cols;
  }, [pathIds, tree, nodeMap]);

  // ── Ancestor IDs (for full chart view highlighting) ───────────────────────
  const ancestorIds = useMemo(() => {
    const ids = new Set(pathIds.slice(0, -1)); // everything except selectedId itself
    return ids;
  }, [pathIds]);

  // ── Connector Y: centre of the selected card within this column ──────────
  function connectorY(col) {
    const idx = col.items.findIndex(item => item.id === col.selectedId);
    const pt  = col.paddingTop ?? COL_PAD;
    if (idx < 0) return pt + HALF_H;
    return pt + idx * (CARD_H + CARD_GAP) + HALF_H;
  }

  // ── Floating employees (no tree slot) ─────────────────────────────────────
  const floatingEmployees = useMemo(() => {
    const treeIds = new Set(treeEmployees.map(e => e.id));
    return employees.filter(e => !treeIds.has(e.id));
  }, [employees, treeEmployees]);

  // ── Search ────────────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return employees
      .filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.role_name?.toLowerCase().includes(q) ||
        e.department_name?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [search, employees]);

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const zoomIn  = () => setZoom(z => Math.min(1.5, parseFloat((z + 0.1).toFixed(1))));
  const zoomOut = () => setZoom(z => Math.max(0.4, parseFloat((z - 0.1).toFixed(1))));

  // ── Select handler (exits full view, sets selected) ───────────────────────
  function handleSelect(id) {
    setShowFull(false);
    setSelectedId(id);
  }

  // ── Drag-to-reparent ──────────────────────────────────────────────────────
  function isDescendant(empId, ancestorId) {
    let cur = treeEmployees.find(e => e.id === empId);
    while (cur) {
      if (cur.reports_to === ancestorId) return true;
      cur = treeEmployees.find(e => e.id === cur.reports_to);
    }
    return false;
  }

  function handleDrop(targetId) {
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDropId(null); return; }
    const dragged = treeEmployees.find(x => x.id === draggedId);
    if (!dragged) { setDraggedId(null); setDropId(null); return; }
    if (isDescendant(targetId, draggedId)) {
      addToast('Cannot move a person under their own report.', 'error');
      setDraggedId(null); setDropId(null); return;
    }
    const target = employees.find(e => e.id === targetId);
    setPending({ employee: dragged, newManager: target });
    setDraggedId(null); setDropId(null);
  }

  async function handleReparent() {
    if (!pending) return;
    try {
      await updateEmployee(pending.employee.id, { reports_to: pending.newManager.id });
      addToast('Reporting line updated.');
      setPending(null);
      await load();
    } catch (err) {
      addToast(err?.response?.data?.error || 'Failed to update.', 'error');
      setPending(null);
    }
  }

  // ── Shared drag props ─────────────────────────────────────────────────────
  const dragProps = {
    editMode,
    draggedId,
    dropId,
    onDragStart:   (id) => setDraggedId(id),
    onDragEnd:     ()   => { setDraggedId(null); setDropId(null); },
    onDragOver:    (id) => setDropId(id),
    onConfirmDrop: handleDrop,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className="h-full flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  if (error)   return <div className="h-full flex items-center justify-center text-red-500 text-sm">{error}</div>;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <ConfirmModal
        open={!!pending}
        title={`Move ${pending?.employee?.name}?`}
        message={`Set reporting manager to ${pending?.newManager?.name} (${pending?.newManager?.role_name})?`}
        confirmLabel="Move"
        onConfirm={handleReparent}
        onCancel={() => setPending(null)}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-4 shrink-0">
        {/* Search */}
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, role, or department…"
            className="w-full pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-gray-50"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-30 overflow-hidden">
              {searchResults.map(emp => {
                const c = ROLE_COLORS[emp.role_name] ?? DEFAULT_COLOR;
                return (
                  <button
                    key={emp.id}
                    onClick={() => { handleSelect(emp.id); setSearch(''); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div style={{ background: c.avatar }} className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {initials(emp.name)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{emp.name}</div>
                      <div className="text-xs text-gray-400">{emp.role_name} · {emp.department_name}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Show Full Org Chart toggle */}
        <button
          onClick={() => setShowFull(f => !f)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            showFull
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Network size={13} />
          {showFull ? 'Collapse' : 'Show Full Org Chart'}
        </button>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-1">
          <button onClick={zoomOut} disabled={zoom <= 0.4} className="p-1.5 rounded text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-30 transition-colors" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-medium text-gray-500 w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={zoomIn} disabled={zoom >= 1.5} className="p-1.5 rounded text-gray-500 hover:bg-white hover:text-gray-800 disabled:opacity-30 transition-colors" title="Zoom in">
            <ZoomIn size={14} />
          </button>
        </div>

        <span className="text-xs text-gray-400">{employees.length} employees</span>

        <button
          onClick={() => setEditMode(m => !m)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            editMode
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          <Pencil size={13} />
          {editMode ? 'Done' : 'Edit Reporting Lines'}
        </button>
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-x-auto" ref={chartRef}>

        {showFull ? (
          /* ── Full tree view (siblings may shift — expected in full view) ── */
          <div className="overflow-auto" style={{ height: chartHeight }}>
          <div style={{ zoom }} className="inline-flex flex-col gap-12 p-10 min-w-max origin-top-left">
            {tree.map(root => (
              <TreeNode
                key={root.id}
                node={root}
                selectedId={selectedId}
                ancestorIds={ancestorIds}
                onSelect={handleSelect}
                {...dragProps}
              />
            ))}
            {floatingEmployees.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 font-medium mb-3 uppercase tracking-wide">
                  Unassigned ({floatingEmployees.length})
                </p>
                <div className="flex flex-wrap gap-3">
                  {floatingEmployees.map(emp => {
                    const c   = ROLE_COLORS[emp.role_name] ?? DEFAULT_COLOR;
                    const sel = emp.id === selectedId;
                    const dov = dropId === emp.id;
                    return (
                      <div
                        key={emp.id}
                        onClick={() => handleSelect(emp.id)}
                        draggable={editMode || undefined}
                        onDragStart={editMode ? (e) => { e.dataTransfer.effectAllowed = 'move'; setDraggedId(emp.id); } : undefined}
                        onDragEnd={editMode   ? () => { setDraggedId(null); setDropId(null); } : undefined}
                        onDragOver={editMode  ? (e) => { e.preventDefault(); if (draggedId && draggedId !== emp.id) setDropId(emp.id); } : undefined}
                        onDrop={editMode      ? (e) => { e.preventDefault(); handleDrop(emp.id); } : undefined}
                        style={{ width: CARD_W, height: CARD_H, borderColor: dov ? '#f59e0b' : sel ? c.border : '#e5e7eb', background: dov ? '#fffbeb' : sel ? '#f8faff' : '#fff', borderWidth: sel || dov ? 2 : 1, borderStyle: 'dashed' }}
                        className="border rounded-xl flex items-center gap-2.5 px-3 cursor-pointer select-none hover:shadow transition-all"
                      >
                        <div style={{ width: 34, height: 34, background: c.avatar, flexShrink: 0 }} className="rounded-full flex items-center justify-center text-white font-bold text-xs">{initials(emp.name)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 truncate text-xs leading-tight">{emp.name}</div>
                          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${c.badge}`}>{emp.role_name || '—'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          </div>
        ) : (
          /* ── Focused Miller-column view ── */
          /* Each column scrolls independently; siblings never shift position */
          <div style={{ zoom }} className="inline-flex origin-top-left">
            {columns.map((col, colIdx) => (
              <Fragment key={colIdx}>
                {/* Column: fixed height, independent vertical scroll */}
                {/* paddingTop offsets so the first child aligns with the selected parent */}
                <div
                  className="flex flex-col shrink-0 overflow-y-auto"
                  style={{
                    width:         CARD_W + COL_PAD * 2,
                    height:        chartHeight / zoom,
                    paddingTop:    col.paddingTop,
                    paddingBottom: COL_PAD,
                    paddingLeft:   COL_PAD,
                    paddingRight:  COL_PAD,
                    gap:           CARD_GAP,
                  }}
                >
                  {col.items.map(item => (
                    <ColumnCard
                      key={item.id}
                      node={item}
                      isSelected={item.id === col.selectedId}
                      onSelect={handleSelect}
                      {...dragProps}
                    />
                  ))}
                </div>

                {/* Connector line between this column and the next */}
                {colIdx < columns.length - 1 && (
                  <div className="relative shrink-0" style={{ width: STEM_W, height: chartHeight / zoom }}>
                    {col.selectedId && (
                      <div
                        className="absolute bg-gray-300"
                        style={{ left: 0, right: 0, height: 1, top: connectorY(col) }}
                      />
                    )}
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Edit mode hint */}
      {editMode && (
        <div className="shrink-0 py-2 px-6 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 text-center">
          Drag a person's card onto their new manager to reassign their reporting line
        </div>
      )}
    </div>
  );
}
