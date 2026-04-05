import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

// Unwrap .data automatically + handle session expiry
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url ?? '';
      if (!url.includes('/auth/me') && !url.includes('/auth/login')) {
        window.dispatchEvent(new Event('session-expired'));
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (email, password) =>
  api.post('/auth/login', { email, password });

export const logout = () =>
  api.post('/auth/logout');

export const getMe = () =>
  api.get('/auth/me');

export const changePassword = (currentPassword, newPassword) =>
  api.post('/auth/change-password', { currentPassword, newPassword });

// Employees
export const getEmployees = () =>
  api.get('/employees');

export const getEmployee = (id) =>
  api.get(`/employees/${id}`);

export const createEmployee = (data) =>
  api.post('/employees', data);

export const updateEmployee = (id, data) =>
  api.put(`/employees/${id}`, data);

export const deactivateEmployee = (id) =>
  api.delete(`/employees/${id}`);

// Scoring
export const getMyScores = (periodId) =>
  api.get(`/scoring/${periodId}/my`);

export const submitSelfScores = (periodId, scores) =>
  api.post(`/scoring/${periodId}/my`, { scores });

export const getReportsSummary = (periodId) =>
  api.get(`/scoring/${periodId}/reports`);

export const getReportScores = (periodId, employeeId) =>
  api.get(`/scoring/${periodId}/reports/${employeeId}`);

export const submitManagerScores = (periodId, employeeId, scores) =>
  api.post(`/scoring/${periodId}/reports/${employeeId}`, { scores });

// Periods
export const getPeriods = () =>
  api.get('/periods');

export const getActivePeriods = () =>
  api.get('/periods/active');

export const getDistributorFrequencies = () =>
  api.get('/distribution/frequencies');

export const getPeriod = (id) =>
  api.get(`/periods/${id}`);

export const getAvailablePeriods = (type, year) =>
  api.get('/periods/available', { params: { type, year } });

export const getDefaultPeriods = () =>
  api.get('/periods/defaults');

export const updatePeriod = (id, data) =>
  api.put(`/periods/${id}`, data);

export const deletePeriod = (id) =>
  api.delete(`/periods/${id}`);

// Dashboard
export const getDashboard = () =>
  api.get('/dashboard');

// Reconciliation
export const getDisputes = () =>
  api.get('/reconcile');

export const getDisputeCount = () =>
  api.get('/reconcile/count');

export const resolveDispute = (scoreId, final_score, reconciliation_notes) =>
  api.post(`/reconcile/${scoreId}`, { final_score, reconciliation_notes });

// Distribution
export const getDistribution = (periodId) =>
  api.get(`/distribution/${periodId}`);

export const saveDistribution = (periodId, templateId, allocations) =>
  api.post(`/distribution/${periodId}/${templateId}`, { allocations });

// Reports
export const getReportPeriods = () =>
  api.get('/reports/periods');

export const getDrillDepartments = (periodId) =>
  api.get('/reports/drill/departments', { params: { period_id: periodId } });

export const getDrillDeptRoles = (deptId, periodId) =>
  api.get(`/reports/drill/departments/${deptId}/roles`, { params: { period_id: periodId } });

export const getDrillRoleKpis = (roleId, periodId) =>
  api.get(`/reports/drill/roles/${roleId}/kpis`, { params: { period_id: periodId } });

export const getDrillRoleEmployees = (roleId, periodId) =>
  api.get(`/reports/drill/roles/${roleId}/employees`, { params: { period_id: periodId } });

export const getDrillKpiEmployees = (templateId, periodId) =>
  api.get(`/reports/drill/kpis/${templateId}/employees`, { params: { period_id: periodId } });

export const getDrillEmployeeKpis = (empId, periodId) =>
  api.get(`/reports/drill/employees/${empId}/kpis`, { params: { period_id: periodId } });

export const getPeriodReport = (periodId) =>
  api.get(`/reports/period/${periodId}`);

export const getEmployeeHistory = (employeeId) =>
  api.get(`/reports/employee/${employeeId}/history`);

// Ratings for Team
export const getTeamRatings = (periodId) =>
  api.get('/ratings/team', { params: { periodId } });

export const submitTeamRatings = (periodId, ratings) =>
  api.post(`/ratings/team/${periodId}`, { ratings });

// KPI Templates
export const getKpiTemplates = () =>
  api.get('/kpi-templates');

export const createKpiTemplate = (data) =>
  api.post('/kpi-templates', data);

export const updateKpiTemplate = (id, data) =>
  api.put(`/kpi-templates/${id}`, data);

export const deleteKpiTemplate = (id) =>
  api.delete(`/kpi-templates/${id}`);

// Departments
export const getDepartments = () =>
  api.get('/departments');

export const createDepartment = (data) =>
  api.post('/departments', data);

export const updateDepartment = (id, data) =>
  api.put(`/departments/${id}`, data);

export const deleteDepartment = (id) =>
  api.delete(`/departments/${id}`);

// Roles CRUD
export const getRoles = () =>
  api.get('/roles');

export const createRole = (data) =>
  api.post('/roles', data);

export const updateRole = (id, data) =>
  api.put(`/roles/${id}`, data);

export const deleteRole = (id) =>
  api.delete(`/roles/${id}`);

// KPI Attributes
export const getKpiAttributes = () =>
  api.get('/kpi-attributes');

export const createKpiAttribute = (data) =>
  api.post('/kpi-attributes', data);

export const updateKpiAttribute = (id, data) =>
  api.put(`/kpi-attributes/${id}`, data);

export const deleteKpiAttribute = (id) =>
  api.delete(`/kpi-attributes/${id}`);

// Frequencies
export const getFrequencies = () =>
  api.get('/frequencies');

// Score Types
export const createScoreType = (data) =>
  api.post('/score-types', data);

export const updateScoreType = (id, data) =>
  api.put(`/score-types/${id}`, data);

export const deleteScoreType = (id) =>
  api.delete(`/score-types/${id}`);

// Frequencies CRUD
export const createFrequency = (data) =>
  api.post('/frequencies', data);

export const updateFrequency = (id, data) =>
  api.put(`/frequencies/${id}`, data);

export const deleteFrequency = (id) =>
  api.delete(`/frequencies/${id}`);

// Org tree
export const getOrgTree = () =>
  api.get('/org-tree');

// Settings
export const getScoringWindows = () =>
  api.get('/settings/scoring-windows');

export const saveScoringWindows = (data) =>
  api.put('/settings/scoring-windows', data);

export const getReconciliationThreshold = () =>
  api.get('/settings/reconciliation-threshold');

export const saveReconciliationThreshold = (threshold) =>
  api.put('/settings/reconciliation-threshold', { threshold });

// Notifications
export const getNotifications = () =>
  api.get('/notifications');

export const getUnreadCount = () =>
  api.get('/notifications/unread-count');

export const markNotificationRead = (id) =>
  api.patch(`/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  api.patch('/notifications/read-all');

// Score history
export const getScoreHistory = (scoreId) =>
  api.get(`/scoring/history/${scoreId}`);
