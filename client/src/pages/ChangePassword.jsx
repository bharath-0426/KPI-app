import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KeyRound } from 'lucide-react';

export default function ChangePassword() {
  const navigate = useNavigate();
  const { setNeedsPasswordChange } = useAuth();
  const [form, setForm] = useState({ current: '', newPw: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.newPw !== form.confirm) {
      setError('New passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await changePassword(form.current, form.newPw);
      setNeedsPasswordChange(false);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-6">
            <KeyRound size={20} className="text-gray-500" />
            <h1 className="text-base font-bold text-gray-900">Change Default Password</h1>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            You're using the default admin password. Please set a new one before continuing.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Current Password</label>
              <input
                type="password"
                value={form.current}
                onChange={e => setForm(f => ({ ...f, current: e.target.value }))}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">New Password</label>
              <input
                type="password"
                value={form.newPw}
                onChange={e => setForm(f => ({ ...f, newPw: e.target.value }))}
                required
                minLength={6}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
