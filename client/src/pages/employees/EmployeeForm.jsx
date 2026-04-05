import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getEmployee, createEmployee, updateEmployee,
  getRoles, getDepartments, getEmployees,
} from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { ArrowLeft, Save, Eye, EyeOff } from 'lucide-react';

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [form, setForm] = useState({
    name: '', email: '', password: '', employee_code: '', role_id: '',
    department_id: '', reports_to: '', joined_at: '', is_active: true,
  });
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    Promise.all([getRoles(), getDepartments(), getEmployees()])
      .then(([r, d, e]) => {
        setRoles(r);
        setDepartments(d);
        setEmployees(e);
      });

    if (isEdit) {
      getEmployee(id).then(emp => {
        setForm({
          name: emp.name,
          email: emp.email,
          password: '',
          employee_code: emp.employee_code || '',
          role_id: emp.role_id || '',
          department_id: emp.department_id || '',
          reports_to: emp.reports_to || '',
          joined_at: emp.joined_at || '',
          is_active: Boolean(emp.is_active),
        });
      });
    }
  }, [id]);

  // Filter eligible managers: same department + direct parent role only
  const selectedRole = roles.find(r => r.id === Number(form.role_id));
  const eligibleManagers = employees.filter(e => {
    if (!e.is_active) return false;
    if (isEdit && e.id === Number(id)) return false; // can't report to self
    return true;
  });

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        role_id: Number(form.role_id) || null,
        department_id: Number(form.department_id) || null,
        reports_to: Number(form.reports_to) || null,
      };
      if (!payload.password) delete payload.password;

      if (isEdit) {
        await updateEmployee(id, payload);
        addToast('Employee updated.');
      } else {
        await createEmployee(payload);
        addToast('Employee created.');
      }
      navigate('/organization');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl overflow-y-auto flex-1">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/organization')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {isEdit ? 'Edit Employee' : 'Add Employee'}
        </h1>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="John Doe"
          />
        </div>

        {/* Employee Code */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Employee Code</label>
          <input
            value={form.employee_code}
            onChange={e => set('employee_code', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="e.g. EMP001"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
          <input
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            placeholder="john@company.com"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password {isEdit ? '(leave blank to keep current)' : '*'}
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              required={!isEdit}
              minLength={6}
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Department */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
          <select
            value={form.department_id}
            onChange={e => set('department_id', e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select department…</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
          <select
            value={form.role_id}
            onChange={e => { set('role_id', e.target.value); set('reports_to', ''); }}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">Select role…</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Reports To */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reports To</label>
          <select
            value={form.reports_to}
            onChange={e => set('reports_to', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">No manager</option>
            {eligibleManagers.map(e => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.role_name})
              </option>
            ))}
          </select>
        </div>

        {/* Joined At */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Joined Date</label>
          <input
            type="date"
            value={form.joined_at}
            onChange={e => set('joined_at', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>

        {/* Active status (edit only) */}
        {isEdit && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="w-4 h-4 text-gray-900 rounded"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Active (uncheck to deactivate)
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Save size={15} />
            {loading ? 'Saving…' : 'Save Employee'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/organization')}
            className="px-5 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
