# Claude Code Prompt: Company KPI Tracking Web Application

## Project Overview

Build a full-stack web application for tracking company-wide KPIs across roles and departments. The app replaces manual Excel-based KPI scoring with a structured system that supports KPI definitions, self-assessment, manager review, reconciliation workflows, and dashboard-style reporting — all governed by a strict organizational hierarchy.

**Target users:** ~200 employees across multiple roles and departments.
**Deployment:** Local (localhost).
**Database:** SQLite (simplest option for local deployment; use a single `.db` file).

---

## Tech Stack

Choose the simplest production-quality stack that fits these constraints:

- **Frontend:** React (with Vite), Tailwind CSS, Recharts or Chart.js for visualizations, Lucide icons
- **Backend:** Node.js with Express (or Fastify)
- **Database:** SQLite via `better-sqlite3` (synchronous, fast, zero-config)
- **Auth:** Session-based auth with bcrypt for password hashing (no OAuth complexity needed for local deployment)
- **Monorepo structure:** Single repo, `/client` and `/server` folders

---

## Organizational Hierarchy (Strict)

```
GH (Group Head)
├── PM (Project Manager)
│   ├── PL (Project Lead)
│   │   └── TM (Team Member)
├── EM (Engineering Manager)
```

- Every employee has exactly ONE `reports_to` manager.
- GH is the top of the chain. GH has no manager.
- PM and EM both report directly to GH.
- PL reports to PM.
- TM reports to PL.
- Data visibility is hierarchy-based: you can only see KPI data for yourself and everyone below you in the chain. GH sees everything. A PM sees their PLs and those PLs' TMs. A TM sees only themselves.

---

## User Roles & Permissions

| Role | Can Do |
|------|--------|
| **Admin** | Full system access. Manage employees, departments, KPI templates, roles, weights. Not necessarily in the org hierarchy (could be HR/IT). |
| **GH** | View all KPIs under their org. Score PM/EM reports. Distribute ₹100. Resolve reconciliation disputes. Final authority. |
| **PM** | View own KPIs + all PL/TM KPIs under them. Score PLs. Distribute ₹100 to PLs. Self-assess own KPIs. |
| **EM** | View own KPIs + team KPIs under them. Self-assess own KPIs. |
| **PL** | View own KPIs + TM KPIs under them. Score TMs. Distribute ₹100 to TMs (PM Rating). Self-assess own KPIs. |
| **TM** | View only own KPIs. Self-assess own KPIs. |

---

## Data Model

### Core Entities

**departments**
- `id`, `name`, `created_at`
- Seed with: "Engineering" (or "Projects"). Structure supports future HR, Sales, Admin, Finance departments.

**roles**
- `id`, `name`, `department_id`, `hierarchy_level` (1=GH, 2=PM/EM, 3=PL, 4=TM)
- Hierarchy level determines visibility and permissions.

**employees**
- `id`, `name`, `email`, `password_hash`, `role_id`, `department_id`, `reports_to` (employee_id, nullable for GH), `is_admin` (boolean), `is_active`, `joined_at`, `created_at`

**kpi_attributes**
- `id`, `name`, `order`
- The 5 fixed attributes: Effectiveness, Effort, Efficiency, Execution, Brand Development.
- Shared across all departments. Sub-metrics differ per role, but the 5 attribute categories are constant.

**kpi_templates**
- `id`, `role_id`, `attribute_id`, `sub_metric_name`, `measurement_description`, `scoring_guide` (text — the full 2-5 point rubric), `frequency` (enum: weekly/monthly/quarterly), `formula` (nullable text), `calculation_guide` (nullable text), `weight_percentage` (decimal — the weight for this sub-metric), `score_type` (enum: 'scale_2_5', 'raw_100', 'scale_1_5', 'scale_1_10', 'calculated')
- Weights for all templates within a role MUST sum to 100%.
- `score_type` distinguishes how the score is entered: most are 2-5 scale, ₹100 distributions are raw_100, etc.

**scoring_periods**
- `id`, `period_type` (enum: weekly/monthly/quarterly), `start_date`, `end_date`, `label` (e.g., "Q1 2026", "March 2026", "Week 12 2026"), `is_active`, `created_at`

**kpi_scores**
- `id`, `employee_id`, `kpi_template_id`, `scoring_period_id`, `self_score` (nullable), `manager_score` (nullable), `final_score` (nullable), `self_notes` (text), `manager_notes` (text), `status` (enum: 'pending', 'self_submitted', 'manager_submitted', 'both_submitted', 'disputed', 'reconciled'), `reconciled_by` (employee_id, nullable — the GH/higher authority who resolved), `reconciliation_notes` (text), `created_at`, `updated_at`

**rupee_distributions**
- `id`, `distributor_id` (employee_id — the person distributing), `scoring_period_id`, `kpi_template_id`, `created_at`

**rupee_distribution_items**
- `id`, `distribution_id`, `recipient_id` (employee_id), `amount` (integer, 0-100)
- Constraint: SUM of amounts for a given `distribution_id` must equal 100.

### Seed Data

On first run, seed the database with:
1. The 5 KPI attributes.
2. All 4 roles (PM, EM, PL, TM) under an "Engineering" department.
3. All KPI templates from the Excel file (detailed below).
4. A default admin account (email: admin@company.com, password: admin123 — prompt to change on first login).

---

## KPI Templates to Seed (from Excel)

### Project Manager (12 sub-metrics, weights sum to 100%)

| Attribute | Sub-Metric | Weight | Score Type | Frequency |
|-----------|-----------|--------|------------|-----------|
| Effectiveness | Customer Retention | 15% | scale_2_5 | Monthly/Quarterly |
| Effectiveness | % of A/B+ Players Hired | 10% | scale_2_5 | Monthly/Quarterly |
| Effort | Total Hours Billed per Quarter | 10% | scale_2_5 | Monthly/Quarterly |
| Effort | % Additional Hours Billed from Existing | 10% | scale_2_5 | Monthly/Quarterly |
| Effort | Adherence to Documentation/Filing (Audit Rating) | 5% | scale_2_5 | Monthly/Quarterly |
| Efficiency | % Early or Delay vs Scheduled Delivery | 10% | scale_2_5 | Weekly/Monthly/Quarterly |
| Efficiency | Resource Utilisation | 10% | scale_2_5 | Weekly/Monthly/Quarterly |
| Execution | % Training Modules Completed for Team | 5% | scale_2_5 | Quarterly |
| Execution | GH ₹100 Distribution | 10% | raw_100 | Quarterly |
| Brand Dev | Team Rating | 5% | scale_2_5 | Quarterly |
| Brand Dev | Exit Employee Rating | 5% | scale_2_5 | Quarterly |
| Brand Dev | Employee Retention | 5% | scale_2_5 | Quarterly |

Include the full scoring guide text, formula, and calculation guide from the Excel for each. Store them in `scoring_guide`, `formula`, and `calculation_guide` fields respectively.

### Engineering Manager (8 sub-metrics, weights sum to 100%)

| Attribute | Sub-Metric | Weight | Score Type | Frequency |
|-----------|-----------|--------|------------|-----------|
| Effectiveness | No. of Errors in Projects/Week | 25% | scale_2_5 | Weekly/Monthly/Quarterly |
| Effort | No. of Prospects Generated/Quarter | 15% | scale_2_5 | Monthly/Quarterly |
| Efficiency | Hours Saved via Automation | 10% | scale_2_5 | Quarterly |
| Efficiency | % Early or Delay vs Scheduled Delivery | 5% | scale_2_5 | Weekly/Monthly/Quarterly |
| Execution | R&D, Innovation, and Standard Upgradation | 15% | scale_2_5 | Quarterly |
| Execution | % Training Modules Created and Completed | 15% | scale_2_5 | Quarterly |
| Brand Dev | Team Rating | 5% | scale_2_5 | Quarterly |
| Brand Dev | GH ₹100 Distribution | 10% | raw_100 | Quarterly |

### Project Lead (10 sub-metrics, weights sum to 100%)

| Attribute | Sub-Metric | Weight | Score Type | Frequency |
|-----------|-----------|--------|------------|-----------|
| Effectiveness | No. of Errors in Deliverables | 25% | scale_2_5 | Weekly/Monthly/Quarterly |
| Effort | Total Hours Billed per Quarter | 10% | scale_2_5 | Monthly/Quarterly |
| Effort | Customer Rating | 10% | scale_1_5 | Quarterly |
| Efficiency | % Early or Delay vs Scheduled Delivery | 20% | scale_2_5 | Weekly/Monthly/Quarterly |
| Execution | Process Improvement / Hours Saved | 7.5% | scale_2_5 | Quarterly |
| Execution | % Training Modules Completed | 5% | scale_2_5 | Quarterly |
| Brand Dev | Brand Development | 5% | scale_2_5 | Quarterly |
| Brand Dev | Team Rating | 7.5% | scale_2_5 | Quarterly |
| Brand Dev | PM ₹100 Distribution | 5% | raw_100 | Quarterly |
| Brand Dev | GH ₹100 Distribution | 5% | raw_100 | Quarterly |

### Team Member (9 sub-metrics, weights sum to 100%)

| Attribute | Sub-Metric | Weight | Score Type | Frequency |
|-----------|-----------|--------|------------|-----------|
| Effectiveness | No. of Errors in Deliverables | 30% | scale_2_5 | Weekly/Monthly/Quarterly |
| Effort | Billable Hours as per Timesheet | 10% | scale_2_5 | Monthly/Quarterly |
| Effort | PL Rating (Collaboration, Challenges) | 7.5% | scale_2_5 | Quarterly |
| Efficiency | % Early or Delay vs Scheduled Delivery | 15% | scale_2_5 | Weekly/Monthly/Quarterly |
| Execution | Process Improvement / Hours Saved via Automation | 7.5% | scale_2_5 | Quarterly |
| Execution | L&D Growth - % Training Modules Completed | 7.5% | scale_2_5 | Quarterly |
| Brand Dev | Customer Rating | 7.5% | scale_1_5 | Quarterly |
| Brand Dev | PM ₹100 Distribution | 7.5% | raw_100 | Quarterly |
| Brand Dev | Brand Development | 7.5% | scale_2_5 | Quarterly |

---

## Scoring & Reconciliation Workflow

### Step 1: Self-Assessment
- Employee logs in, selects a scoring period, and enters their own scores for each KPI.
- For `scale_2_5` metrics: dropdown or radio with 2, 3, 4, 5.
- For `raw_100` metrics: read-only — score comes from the ₹100 distribution by the relevant authority.
- For `scale_1_5` / `scale_1_10`: appropriate input range.
- Employee can add notes/justification for each score.
- Status moves to `self_submitted`.

### Step 2: Manager Review
- Manager logs in, sees their direct reports' KPIs for the period.
- Manager enters their score independently for each KPI.
- Manager can add notes.
- Status moves to `manager_submitted` (or `both_submitted` if self-assessment already done).

### Step 3: Reconciliation
- When both scores exist and they differ beyond a threshold (e.g., ≥1 point difference on a 2-5 scale, or any difference — make this configurable):
  - Status moves to `disputed`.
  - The dispute is escalated to the next level up (GH for PM/EM disputes; PM for PL disputes where PM is the manager's manager).
  - The reconciler sees both scores + notes, and sets the `final_score`.
  - Status moves to `reconciled`.
- When both scores match (or are within threshold): `final_score` is auto-set to the manager's score. Status moves to `reconciled`.

### ₹100 Distribution Flow
- GH distributes ₹100 among their PMs (for "GH ₹100 Distribution" KPI on PM templates).
- GH distributes ₹100 among their EMs (for "GH ₹100 Distribution" KPI on EM templates).
- GH distributes ₹100 among PLs (for "GH ₹100 Distribution" KPI on PL templates).
- PM distributes ₹100 among their PLs (for "PM ₹100 Distribution" KPI on PL templates).
- PM distributes ₹100 among their TMs (for "PM ₹100 Distribution" KPI on TM templates).
- **UI:** A dedicated page showing the distributor's direct reports (filtered by which role-template this distribution applies to). Sliders or number inputs per person. Total must equal exactly 100. Save disabled until sum = 100.
- Once distributed, the amount flows directly as the `final_score` for that KPI for each recipient — no self-assessment or reconciliation needed for ₹100 metrics.

---

## Weighted Score Calculation

For each employee in a given period:

```
Weighted Score = Σ (final_score_for_metric × weight_percentage / max_possible_score_for_that_metric)
```

- For `scale_2_5` metrics: max = 5, so a score of 4 with weight 15% = (4/5) × 15 = 12.0
- For `raw_100` metrics: max = 100, so a score of 35 with weight 10% = (35/100) × 10 = 3.5
- For `scale_1_5` metrics: max = 5, so a score of 4 with weight 10% = (4/5) × 10 = 8.0
- Final weighted score is out of 100.

Also calculate per-attribute scores (sum of weighted scores for all sub-metrics under each attribute).

---

## Pages & UI

### 1. Login Page
- Email + password. Clean, minimal.

### 2. Dashboard (role-dependent home page)
- **GH view:** Company-wide summary. Average scores by department, by role. Top/bottom performers. Pending reconciliations count. Distribution of scores (histogram). Trend charts (quarterly over quarters).
- **PM/EM view:** Their team's summary. Individual scorecards for direct reports. Own score summary. Pending items (self-assessments due, reviews to complete, disputes to resolve).
- **PL view:** Their TMs' summary + own scores.
- **TM view:** Only own KPI scorecard with current status, historical trend.
- Use gauge charts for overall scores, bar charts for attribute breakdowns, line charts for trends over time, color-coded status indicators (green/yellow/red based on score thresholds).

### 3. KPI Scoring Page
- Select period → see all your KPIs for that period.
- Each KPI shows: sub-metric name, attribute, weight, scoring guide (expandable), formula/calculation guide (expandable).
- Input field appropriate to score type.
- Notes field per KPI.
- Submit button (submits all at once).
- Show status badges: pending, self-submitted, manager-submitted, disputed, reconciled.

### 4. Manager Review Page
- Select a direct report → see their self-assessment + enter manager scores side by side.
- Highlight differences.
- Bulk actions: approve all (accept self-scores as manager scores).

### 5. Reconciliation Page (GH / higher authority)
- List of disputed KPIs across the org.
- For each: show employee name, KPI, self-score, manager-score, both notes.
- Input for final score + reconciliation notes.

### 6. ₹100 Distribution Page
- Shows eligible recipients based on the distribution type.
- Slider or number input per person, must sum to 100.
- Visual indicator showing remaining balance.
- Lock/submit when total = 100.

### 7. Employee Management (Admin)
- CRUD employees: name, email, role, department, reports_to (dropdown filtered by hierarchy rules), active/inactive.
- Bulk import from CSV (future nice-to-have).
- View org tree visualization.

### 8. KPI Template Management (Admin)
- View/edit KPI templates per role.
- Add new sub-metrics, edit weights (with validation that weights sum to 100% per role).
- Edit scoring guides, formulas, calculation guides.
- This is how new departments/roles get their KPI structures.

### 9. Period Management (Admin)
- Create/close scoring periods (weekly, monthly, quarterly).
- View period status: how many employees have submitted, reviewed, reconciled.

### 10. Reports Page
- Downloadable reports (CSV/PDF) for:
  - Individual employee scorecard for a period.
  - Department summary for a period.
  - Trend report across periods.

---

## Design Direction

Dashboard-style UI. Dark sidebar navigation. Clean white/light-gray content area. Use a professional color palette:
- Primary: deep blue (#1E3A5F or similar)
- Success/high scores: green
- Warning/medium: amber
- Danger/low scores: red
- Neutral: slate grays

Gauge charts for overall scores. Progress bars for individual metrics. Color-coded score badges. Card-based layouts for employee scorecards. Responsive but desktop-first (this is an internal tool).

---

## Extensibility Requirements

The system MUST be designed so that:

1. **New departments** can be added via Admin UI — just create department + roles + KPI templates with weights.
2. **New roles** within a department can be added with their own KPI templates.
3. **GH KPIs** are not defined yet but the structure supports adding them later (GH is just another role with its own KPI templates — the reconciler for GH would need to be handled separately, perhaps self-reconciling or board-level review).
4. **Weight changes** can be made per role without code changes.
5. **New score types** can be added if needed (the `score_type` enum is extensible).

---

## Implementation Order

Build in this sequence:

1. **Database schema + seed data** — SQLite setup, all tables, seed KPI templates from Excel data with full scoring guides/formulas/calculation guides.
2. **Auth + employee management** — Login, session management, CRUD employees, role assignment, hierarchy.
3. **Period management** — Create/manage scoring periods.
4. **KPI scoring flow** — Self-assessment input, manager review input, status tracking.
5. **Reconciliation workflow** — Dispute detection, escalation, resolution.
6. **₹100 Distribution** — Distribution UI + auto-scoring integration.
7. **Dashboard + visualizations** — Role-based dashboards with charts/gauges.
8. **KPI template management** — Admin CRUD for templates/weights.
9. **Reports** — Export functionality.
10. **Polish** — Error handling, loading states, edge cases, responsive tweaks.

---

## Important Notes

- All scoring guides, formulas, and calculation guides from the Excel file must be stored verbatim in the database and displayed to users when they're scoring — this is the reference material they need.
- The ₹100 distribution is NOT a self-assessed metric. It bypasses the self/manager/reconciliation flow entirely. The distributor's allocation IS the final score.
- Hierarchy enforcement must be strict at the database query level, not just UI level. A PM should never be able to query a TM who isn't under their PL chain.
- When an employee is deactivated, their historical scores remain but they're excluded from future scoring periods and ₹100 distributions.
- The scoring guide text contains newlines and special characters — store and render them properly (use `<pre>` or whitespace-preserving formatting in the UI).
