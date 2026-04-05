const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./schema');

function seed() {
  console.log('Initializing schema...');
  initSchema();

  // Use a transaction for atomicity
  const run = db.transaction(() => {

    // ── 1. KPI Attributes ────────────────────────────────────────────────────
    const attrs = [
      { name: 'Effectiveness', display_order: 1 },
      { name: 'Effort',        display_order: 2 },
      { name: 'Efficiency',    display_order: 3 },
      { name: 'Execution',     display_order: 4 },
      { name: 'Brand Development', display_order: 5 },
    ];

    const insertAttr = db.prepare(`
      INSERT OR IGNORE INTO kpi_attributes (name, display_order) VALUES (?, ?)
    `);
    for (const a of attrs) insertAttr.run(a.name, a.display_order);

    const attrMap = {};
    db.prepare('SELECT id, name FROM kpi_attributes').all()
      .forEach(r => { attrMap[r.name] = r.id; });

    console.log('KPI attributes seeded:', Object.keys(attrMap));

    // ── 2. Department ─────────────────────────────────────────────────────────
    db.prepare(`INSERT OR IGNORE INTO departments (name) VALUES (?)`).run('Engineering');
    const dept = db.prepare(`SELECT id FROM departments WHERE name = ?`).get('Engineering');
    const deptId = dept.id;

    // ── 3. Roles ──────────────────────────────────────────────────────────────
    const roles = [
      { name: 'Group Head',          hierarchy_level: 1 },
      { name: 'Project Manager',     hierarchy_level: 2 },
      { name: 'Engineering Manager', hierarchy_level: 2 },
      { name: 'Project Lead',        hierarchy_level: 3 },
      { name: 'Team Member',         hierarchy_level: 4 },
    ];
    const insertRole = db.prepare(`
      INSERT OR IGNORE INTO roles (name, department_id, hierarchy_level) VALUES (?, ?, ?)
    `);
    for (const r of roles) insertRole.run(r.name, deptId, r.hierarchy_level);

    const roleMap = {};
    db.prepare('SELECT id, name FROM roles').all()
      .forEach(r => { roleMap[r.name] = r.id; });

    console.log('Roles seeded:', Object.keys(roleMap));

    // ── 4. KPI Templates ──────────────────────────────────────────────────────
    const insertTemplate = db.prepare(`
      INSERT OR IGNORE INTO kpi_templates
        (role_id, attribute_id, sub_metric_name, measurement_description,
         scoring_guide, frequency, formula, calculation_guide,
         weight_percentage, score_type, display_order)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // ── PROJECT MANAGER ──────────────────────────────────────────────────────
    const pmTemplates = [
      {
        attribute: 'Effectiveness',
        sub_metric_name: 'Customer Retention',
        measurement_description: '% Customer retained/year',
        scoring_guide: '5 pts: ≥95%\n4 pts: 90–94%\n3 pts: 80–89%\n2 pts: <80%',
        frequency: 'monthly',
        formula: '((Start of quarter customers - new customers in the quarter) ÷ End of quarter customers) x 100',
        calculation_guide: 'Only the active customers should be entered in total for customers at start and end of quarter.\nTotal number of new customers should be input in that quarter irrespective of project type or duration.',
        weight_percentage: 15,
        score_type: 'scale_2_5',
        display_order: 1,
      },
      {
        attribute: 'Effectiveness',
        sub_metric_name: 'Percentage of A and B+ Players Hired',
        measurement_description: '% of team members rated as A & B+ performers by management',
        scoring_guide: '5 pts: >70%\n4 pts: 61–70%\n3 pts: 50–60%\n2 pts: <50%',
        frequency: 'monthly',
        formula: '-',
        calculation_guide: 'Will be rated by the management.',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 2,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'Total Hours Billed per Quarter',
        measurement_description: 'Total relative billed hours in the period (scored as % of top performer)',
        scoring_guide: '5 pts: ≥9.0\n4 pts: 8.0–8.9\n3 pts: 7.0–7.9\n2 pts: <7.0',
        frequency: 'monthly',
        formula: '(Your Billed hrs per quarter / Top Billed hrs in the dept) × 10, rounded',
        calculation_guide: 'Add up all billable hours for the quarter.\nIdentify the highest billed hours among comparable PMs in the same department.\nDivide your billed hours by that number.',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 3,
      },
      {
        attribute: 'Effort',
        sub_metric_name: '% Additional Hours Billed from Existing Clients per Quarter',
        measurement_description: '((Current quarter billing - Previous quarter billing) ÷ Current quarter billing) × 100',
        scoring_guide: '5 pts: >120%\n4 pts: 110–120%\n3 pts: 101–109%\n2 pts: ≤100%\n(Anything less than 100% will get 2 points)',
        frequency: 'monthly',
        formula: '((Current quarter billing - Previous quarter billing) ÷ Current quarter billing) × 100',
        calculation_guide: '',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 4,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'Adherence to Documentation/Filing (Audit Rating)',
        measurement_description: 'Audit rating score (1–10)',
        scoring_guide: '5 pts: ≥9.0\n4 pts: 8.0–8.9\n3 pts: 7.0–7.9\n2 pts: <7.0',
        frequency: 'monthly',
        formula: '-',
        calculation_guide: 'Rating will be given by the audit team.',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 5,
      },
      {
        attribute: 'Efficiency',
        sub_metric_name: '% Early or Delay vs. Scheduled Delivery',
        measurement_description: '((Planned – Actual) ÷ Planned) × 100',
        scoring_guide: '5 pts: +6% to +20% (early)\n4 pts: 0% to +6% (early)\n3 pts: -1% to -10% (delay)\n2 pts: >-10% (delay)',
        frequency: 'weekly',
        formula: '((Planned – Actual) ÷ Planned) × 100',
        calculation_guide: 'Planned = hours committed to the customer at project approval.\nActual = hours actually spent to complete the work.\nCompare planned vs actual to determine early or delayed delivery.',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 6,
      },
      {
        attribute: 'Efficiency',
        sub_metric_name: 'Resource Utilisation',
        measurement_description: '(Hours billed ÷ Available hours) × 100',
        scoring_guide: '5 pts: 91–100%\n4 pts: 86–90%\n3 pts: 80–85%\n2 pts: <80%',
        frequency: 'weekly',
        formula: '(Hours billed ÷ Available hours) × 100',
        calculation_guide: 'Calculate total billable hours in the period.\nCalculate available hours after excluding holidays, leave, LOP.\nWork-from-home hours are included.\nIf utilisation exceeds 100%, treat it as over-utilisation (2 points).',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 7,
      },
      {
        attribute: 'Execution',
        sub_metric_name: '% Training Modules Completed for Team',
        measurement_description: '(Completed ÷ Assigned) × 100',
        scoring_guide: '5 pts: ≥90%\n4 pts: 70–89%\n3 pts: 50–69%\n2 pts: <50%',
        frequency: 'quarterly',
        formula: '(Completed ÷ Assigned) × 100',
        calculation_guide: '',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 8,
      },
      {
        attribute: 'Execution',
        sub_metric_name: 'GH ₹100 Distribution',
        measurement_description: 'Actual score (1–100 scale) — distributed by GH',
        scoring_guide: 'Score between 1–100 as distributed by the Group Head.',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'Score is set directly by the GH through the ₹100 distribution. No self-assessment required.',
        weight_percentage: 10,
        score_type: 'raw_100',
        display_order: 9,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Team Rating',
        measurement_description: 'Actual score (1–5 scale)',
        scoring_guide: '5 pts: 5 (Role Model)\n4 pts: 4 (Above Expectation)\n3 pts: 3 (Meets Expectation)\n2 pts: 0–2 (Below Expectation)',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '5 = Role Model\n4 = Above Expectation\n3 = Meets Expectation\n2 = Below Expectation\n1 = Unacceptable',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 10,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Exit Employee Rating',
        measurement_description: 'Avg. exit interview score (1–10)',
        scoring_guide: '5 pts: ≥9.0\n4 pts: 8.0–8.9\n3 pts: 7.0–7.9\n2 pts: <7.0',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 11,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Employee Retention',
        measurement_description: '% employees retained/year',
        scoring_guide: '5 pts: ≥95%\n4 pts: 90–94%\n3 pts: 80–89%\n2 pts: <80%',
        frequency: 'quarterly',
        formula: '((Count at start of quarter - Exited count during that quarter) ÷ Count at start of quarter) × 100',
        calculation_guide: '',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 12,
      },
    ];

    for (const t of pmTemplates) {
      insertTemplate.run(
        roleMap['Project Manager'], attrMap[t.attribute], t.sub_metric_name,
        t.measurement_description, t.scoring_guide, t.frequency,
        t.formula, t.calculation_guide, t.weight_percentage, t.score_type, t.display_order
      );
    }

    // ── ENGINEERING MANAGER ───────────────────────────────────────────────────
    const emTemplates = [
      {
        attribute: 'Effectiveness',
        sub_metric_name: 'No. of Errors in Projects/Week',
        measurement_description: 'Errors identified through customer feedback or complaint logs (with severity: Low/Med/High)',
        scoring_guide: 'WEEKLY\n5 pts: 0–1 errors/week or (0H, 0M, 1L)\n4 pts: 2–3 errors/week or (0H, 0M, 2–3L)\n3 pts: 4–5 errors/week or (0H, 1–2M, <5L)\n2 pts: 5+ errors/week or (>1H, >2M, >5L)',
        frequency: 'weekly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 25,
        score_type: 'scale_2_5',
        display_order: 1,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'No. of Prospects Generated per Quarter',
        measurement_description: 'Qualified prospects identified and passed to sales',
        scoring_guide: '5 pts: ≥5 prospects\n4 pts: 3–4 prospects\n3 pts: 1–2 prospects\n2 pts: 0 prospects',
        frequency: 'monthly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 15,
        score_type: 'scale_2_5',
        display_order: 2,
      },
      {
        attribute: 'Efficiency',
        sub_metric_name: 'Hours Saved via Automation',
        measurement_description: '% reduction in hours for repeated tasks',
        scoring_guide: '5 pts: ≥20% saved\n4 pts: 10–19%\n3 pts: 5–9%\n2 pts: <5%',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'For example, if a work which took 10 hrs has been automated and now it takes only 9 hrs, you\'ve saved 10% of time which will get you 4 points.',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 3,
      },
      {
        attribute: 'Efficiency',
        sub_metric_name: '% Early or Delay vs. Scheduled Delivery',
        measurement_description: '((Planned – Actual) ÷ Planned) × 100',
        scoring_guide: '5 pts: +6% to +20% (early)\n4 pts: 0% to +6% (early)\n3 pts: -1% to -10% (delay)\n2 pts: >-10% (delay)',
        frequency: 'weekly',
        formula: '((Planned – Actual) ÷ Planned) × 100',
        calculation_guide: '',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 4,
      },
      {
        attribute: 'Execution',
        sub_metric_name: 'R&D, Innovation, and Standard Upgradation',
        measurement_description: '% of planned R&D initiatives and standard updates completed in the period',
        scoring_guide: '5 pts: ≥100% completed\n4 pts: 90–100%\n3 pts: 80–89%\n2 pts: <80%',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 15,
        score_type: 'scale_2_5',
        display_order: 5,
      },
      {
        attribute: 'Execution',
        sub_metric_name: '% Training Modules Created and Completed by Team',
        measurement_description: '(Modules Completed ÷ Assigned) × 100 — includes KT/KSS trainings',
        scoring_guide: '5 pts: ≥90%\n4 pts: 70–89%\n3 pts: 50–69%\n2 pts: <50%',
        frequency: 'quarterly',
        formula: '(Modules Completed ÷ Assigned) × 100',
        calculation_guide: '',
        weight_percentage: 15,
        score_type: 'scale_2_5',
        display_order: 6,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Team Rating',
        measurement_description: 'Actual score (1–5 scale)',
        scoring_guide: '5 pts: 5 (Role Model)\n4 pts: 4 (Above Expectation)\n3 pts: 3 (Meets Expectation)\n2 pts: 0–2 (Below Expectation)',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '5 = Role Model\n4 = Above Expectation\n3 = Meets Expectation\n2 = Below Expectation\n1 = Unacceptable',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 7,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'GH ₹100 Distribution',
        measurement_description: 'Actual score (1–100 scale) — distributed by GH',
        scoring_guide: 'Score between 1–100 as distributed by the Group Head.',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'Score is set directly by the GH through the ₹100 distribution. No self-assessment required.',
        weight_percentage: 10,
        score_type: 'raw_100',
        display_order: 8,
      },
    ];

    for (const t of emTemplates) {
      insertTemplate.run(
        roleMap['Engineering Manager'], attrMap[t.attribute], t.sub_metric_name,
        t.measurement_description, t.scoring_guide, t.frequency,
        t.formula, t.calculation_guide, t.weight_percentage, t.score_type, t.display_order
      );
    }

    // ── PROJECT LEAD ──────────────────────────────────────────────────────────
    const plTemplates = [
      {
        attribute: 'Effectiveness',
        sub_metric_name: 'No. of Errors in Deliverables',
        measurement_description: 'Errors identified during QA review or client feedback (with severity: Low/Med/High)',
        scoring_guide: '5 pts: 0–1 errors/week or (0H, 0M, 1L)\n4 pts: 2–3 errors/week or (0H, 0M, 2–3L)\n3 pts: 4–5 errors/week or (0H, 1–2M, <5L)\n2 pts: 5+ errors/week or (>1H, >2M, >5L)',
        frequency: 'weekly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 25,
        score_type: 'scale_2_5',
        display_order: 1,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'Total Hours Billed per Quarter',
        measurement_description: 'Total relative billed hours in the period (scored as % of top performer)',
        scoring_guide: '5 pts: ≥9.0\n4 pts: 8.0–8.9\n3 pts: 7.0–7.9\n2 pts: <7.0\n\nCalculated as: (Your Billed hrs / Max Billed hrs) × 10, rounded',
        frequency: 'monthly',
        formula: '(Your Billed hrs per quarter / Top Billed hrs in the dept) × 10, rounded',
        calculation_guide: 'Add up all billable hours for the quarter.\nIdentify the highest billed hours among comparable PLs in the same department.\nDivide your billed hours by that number.',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 2,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'Customer Rating',
        measurement_description: 'Actual score from surveys (1–5 scale)',
        scoring_guide: '5 pts: 5\n4 pts: 4\n3 pts: 3\n2 pts: 0–2',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 10,
        score_type: 'scale_1_5',
        display_order: 3,
      },
      {
        attribute: 'Efficiency',
        sub_metric_name: '% Early or Delay vs. Scheduled Delivery',
        measurement_description: '((Planned Time – Actual Time) / Planned Time) × 100',
        scoring_guide: '5 pts: +6% to +20% (early)\n4 pts: 0% to +6% (early)\n3 pts: -1% to -10% (delay)\n2 pts: >-10% (delay)',
        frequency: 'weekly',
        formula: '((Planned Time – Actual Time) / Planned Time) × 100',
        calculation_guide: '',
        weight_percentage: 20,
        score_type: 'scale_2_5',
        display_order: 4,
      },
      {
        attribute: 'Execution',
        sub_metric_name: 'Process Improvement / Hours Saved via Automation',
        measurement_description: '% reduction in hours for a task or Degree of Innovation',
        scoring_guide: '5 pts: ≥20% hours saved / Commercialised Innovation\n4 pts: 10–19% / Patented Innovation\n3 pts: 5–9% / Moderate Innovation\n2 pts: <5% / No Innovation',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'For example, if a work which took 10 hrs has been automated and now it takes only 9 hrs, you\'ve saved 10% of time which will get you 4 points.',
        weight_percentage: 7.5,
        score_type: 'scale_2_5',
        display_order: 5,
      },
      {
        attribute: 'Execution',
        sub_metric_name: '% Training Modules Completed',
        measurement_description: '(Modules Completed / Assigned Modules) × 100',
        scoring_guide: '5 pts: ≥90%\n4 pts: 70–89%\n3 pts: 50–69%\n2 pts: <50%',
        frequency: 'quarterly',
        formula: '(Modules Completed / Assigned Modules) × 100',
        calculation_guide: '',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 6,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Brand Development',
        measurement_description: 'Evaluation done by management',
        scoring_guide: '5 pts: Spreads positivity and takes initiative\n4 pts: Spreads positivity (Word of mouth, Social Media)\n3 pts: Neutral\n2 pts: Spreads Negativity',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 5,
        score_type: 'scale_2_5',
        display_order: 7,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Team Rating',
        measurement_description: 'Average score from team rating / exit employee feedback surveys (1–5 scale)',
        scoring_guide: '5 pts: 5 (Role Model)\n4 pts: 4 (Above Expectation)\n3 pts: 3 (Meets Expectation)\n2 pts: 0–2 (Below Expectation)',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '5 = Role Model\n4 = Above Expectation\n3 = Meets Expectation\n2 = Below Expectation\n1 = Unacceptable',
        weight_percentage: 7.5,
        score_type: 'scale_2_5',
        display_order: 8,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'PM ₹100 Distribution',
        measurement_description: 'Actual score (1–100 scale) — distributed by PM',
        scoring_guide: 'Score between 1–100 as distributed by the Project Manager.',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'Score is set directly by the PM through the ₹100 distribution. No self-assessment required.',
        weight_percentage: 5,
        score_type: 'raw_100',
        display_order: 9,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'GH ₹100 Distribution',
        measurement_description: 'Actual score (1–100 scale) — distributed by GH',
        scoring_guide: 'Score between 1–100 as distributed by the Group Head.',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'Score is set directly by the GH through the ₹100 distribution. No self-assessment required.',
        weight_percentage: 5,
        score_type: 'raw_100',
        display_order: 10,
      },
    ];

    for (const t of plTemplates) {
      insertTemplate.run(
        roleMap['Project Lead'], attrMap[t.attribute], t.sub_metric_name,
        t.measurement_description, t.scoring_guide, t.frequency,
        t.formula, t.calculation_guide, t.weight_percentage, t.score_type, t.display_order
      );
    }

    // ── TEAM MEMBER ───────────────────────────────────────────────────────────
    const tmTemplates = [
      {
        attribute: 'Effectiveness',
        sub_metric_name: 'No. of Errors in Deliverables',
        measurement_description: 'Errors identified during review (with severity: Low/Med/High)',
        scoring_guide: '5 pts: 0–1 errors/week or (0H, 0M, 1L)\n4 pts: 2–3 errors/week or (0H, 0M, 2–3L)\n3 pts: 4–5 errors/week or (0H, 1–2M, <5L)\n2 pts: 5+ errors/week or (>1H, >2M, >5L)',
        frequency: 'weekly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 30,
        score_type: 'scale_2_5',
        display_order: 1,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'Billable Hours as per Timesheet',
        measurement_description: '% of billed hours out of allocated hours (160 hours) per month',
        scoring_guide: '5 pts: ≥95% of allocated hours\n4 pts: 90–94%\n3 pts: 80–89%\n2 pts: <80%',
        frequency: 'monthly',
        formula: '(Total billed ÷ Total available hrs) × 100',
        calculation_guide: 'Total billed hrs divided by available hrs.\nCalculate available hours after excluding holidays, leave, LOP.\nWork-from-home hours are included.',
        weight_percentage: 10,
        score_type: 'scale_2_5',
        display_order: 2,
      },
      {
        attribute: 'Effort',
        sub_metric_name: 'PL Rating: Collaboration and Challenges',
        measurement_description: 'Initiative in taking challenges and collaboration',
        scoring_guide: '5 pts: Always volunteers & leads\n4 pts: Frequently volunteers\n3 pts: Sometimes volunteers\n2 pts: Rarely/never volunteers',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 7.5,
        score_type: 'scale_2_5',
        display_order: 3,
      },
      {
        attribute: 'Efficiency',
        sub_metric_name: '% Early or Delay vs. Scheduled Delivery',
        measurement_description: '((Planned Time – Actual Time) / Planned Time) × 100',
        scoring_guide: '5 pts: +6% to +20% (early)\n4 pts: 0% to +5% (early)\n3 pts: -1% to -10% (delay)\n2 pts: >-10% (delay)',
        frequency: 'weekly',
        formula: '((Planned Time – Actual Time) / Planned Time) × 100',
        calculation_guide: '',
        weight_percentage: 15,
        score_type: 'scale_2_5',
        display_order: 4,
      },
      {
        attribute: 'Execution',
        sub_metric_name: 'Process Improvement / Hours Saved via Automation',
        measurement_description: '% reduction in hours for a task or Degree of Innovation',
        scoring_guide: '5 pts: ≥20% hours saved / Patented and Commercialised Innovation\n4 pts: 10–19% / Patented Innovation\n3 pts: 5–9% / Moderate Innovation\n2 pts: <5% / No Innovation',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'For example, if a work which took 10 hrs has been automated and now it takes only 9 hrs, you\'ve saved 10% of time which will get you 4 points.',
        weight_percentage: 7.5,
        score_type: 'scale_2_5',
        display_order: 5,
      },
      {
        attribute: 'Execution',
        sub_metric_name: 'L&D Growth - % Training Modules Completed',
        measurement_description: '(Modules Completed / Assigned Modules) × 100',
        scoring_guide: '5 pts: ≥90%\n4 pts: 70–89%\n3 pts: 50–69%\n2 pts: <50%',
        frequency: 'quarterly',
        formula: '(Modules Completed / Assigned Modules) × 100',
        calculation_guide: '',
        weight_percentage: 7.5,
        score_type: 'scale_2_5',
        display_order: 6,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Customer Rating',
        measurement_description: 'Actual score from surveys (1–5 scale)',
        scoring_guide: '5 pts: 5\n4 pts: 4\n3 pts: 3\n2 pts: 0–2',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 7.5,
        score_type: 'scale_1_5',
        display_order: 7,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'PM ₹100 Distribution',
        measurement_description: 'Actual score (1–100 scale) — distributed by PM',
        scoring_guide: 'Score between 1–100 as distributed by the Project Manager.',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: 'Score is set directly by the PM through the ₹100 distribution. No self-assessment required.',
        weight_percentage: 7.5,
        score_type: 'raw_100',
        display_order: 8,
      },
      {
        attribute: 'Brand Development',
        sub_metric_name: 'Brand Development',
        measurement_description: 'Evaluation done by GH/Management',
        scoring_guide: '5 pts: Spreads positivity and takes initiative\n4 pts: Spreads positivity (Word of mouth, Social Media)\n3 pts: Neutral\n2 pts: Spreads Negativity',
        frequency: 'quarterly',
        formula: '',
        calculation_guide: '',
        weight_percentage: 7.5,
        score_type: 'scale_2_5',
        display_order: 9,
      },
    ];

    for (const t of tmTemplates) {
      insertTemplate.run(
        roleMap['Team Member'], attrMap[t.attribute], t.sub_metric_name,
        t.measurement_description, t.scoring_guide, t.frequency,
        t.formula, t.calculation_guide, t.weight_percentage, t.score_type, t.display_order
      );
    }

    // ── 5. Default Admin Account ──────────────────────────────────────────────
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT OR IGNORE INTO employees
        (name, email, password_hash, is_admin, is_active)
      VALUES (?, ?, ?, 1, 1)
    `).run('Admin', 'admin@company.com', passwordHash);

    // ── 6. App settings ────────────────────────────────────────────────────────
    db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`).run('reconciliation_threshold', '1');
    db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`).run('admin_password_changed', '0');

    // ── Summary ───────────────────────────────────────────────────────────────
    const templateCount = db.prepare('SELECT COUNT(*) as n FROM kpi_templates').get().n;
    const pmWeight = db.prepare(`
      SELECT SUM(weight_percentage) as total FROM kpi_templates WHERE role_id = ?
    `).get(roleMap['Project Manager']).total;
    const emWeight = db.prepare(`
      SELECT SUM(weight_percentage) as total FROM kpi_templates WHERE role_id = ?
    `).get(roleMap['Engineering Manager']).total;
    const plWeight = db.prepare(`
      SELECT SUM(weight_percentage) as total FROM kpi_templates WHERE role_id = ?
    `).get(roleMap['Project Lead']).total;
    const tmWeight = db.prepare(`
      SELECT SUM(weight_percentage) as total FROM kpi_templates WHERE role_id = ?
    `).get(roleMap['Team Member']).total;

    console.log(`\nKPI Templates seeded: ${templateCount}`);
    console.log(`Weight sums — PM: ${pmWeight}%, EM: ${emWeight}%, PL: ${plWeight}%, TM: ${tmWeight}%`);
    console.log(`Admin account: admin@company.com / admin123`);
    console.log('\nSeed complete!');
  });

  run();
}

seed();
