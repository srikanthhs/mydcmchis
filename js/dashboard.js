// Auto-extracted from index.html by split.js
// Module: dashboard
// ══════════════════ GOOGLE SHEET AUTO-SYNC ══════════════════
const GSHEET_URL = '/api/sheet';

// ── Sync state ──
let _lastSyncTime = null;
let _syncInProgress = false;

function _updateSyncBadge(state, msg) {
  const badge = document.getElementById('gsyncBadge');
  if (!badge) return;
  const styles = {
    syncing: 'background:#e8f0fe;color:#1a73e8;border-color:#1a73e8',
    ok:      'background:#e6f4ea;color:#137333;border-color:#34a853',
    error:   'background:#fce8e6;color:#c5221f;border-color:#ea4335',
    idle:    'background:#f1f3f4;color:#5f6368;border-color:#dadce0'
  };
  badge.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:500;border:1px solid;transition:all .3s;${styles[state]||styles.idle}`;
  badge.innerHTML = msg;
}

function showToast(msg, dur) {
  // reuse existing toast if present, else create one
  let t = document.getElementById('gsheetToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'gsheetToast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#3c4043;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, dur || 3000);
}

async function syncFromGSheet(silent) {
  if (_syncInProgress) return;
  _syncInProgress = true;
  const btn = document.getElementById('gsyncBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;animation:spin .8s linear infinite"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Syncing…'; }
  _updateSyncBadge('syncing', '↻ Syncing…');

  try {
    // Fetch from Google Apps Script — add timestamp param to bust cache
    const res = await fetch(GSHEET_URL, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();

    // Try parsing as JSON first, then as CSV
    let parsed;
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed.startsWith('{') ? trimmed : trimmed); // handle wrapper
      const arr = Array.isArray(json) ? json : (json.data || json.rows || Object.values(json));
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('Empty or unrecognised JSON from sheet');
      // Normalise each row using the existing parseJSON logic
      const rows = arr.map((obj, idx) => {
        const dept   = String(obj.Department || obj.department || obj.DEPARTMENT || obj.dept || '').toUpperCase().trim();
        const rawMon = String(obj.Month || obj.month || obj.MONTH || '');
        const month  = parseMonthLabel(rawMon);
        if (!dept || !month) return null;
        return {
          department: dept,
          month,
          applied:  parseInt(obj.Applied  || obj.applied  || 0) || 0,
          approved: parseInt(obj.Approved || obj.approved || 0) || 0,
          denied:   parseInt(obj.Denied   || obj.denied   || 0) || 0,
          amount:   parseFloat(String(obj.Amount || obj.amount || 0).replace(/,/g, '')) || 0,
        };
      }).filter(Boolean);
      if (rows.length === 0) throw new Error('No valid rows parsed from sheet response');
      parsed = { rows };
    } else {
      // Try CSV
      parsed = parseCSV(trimmed);
    }

    if (parsed.error) throw new Error(parsed.error);

    // Apply directly — same as clicking "Apply Import" in the modal
    const rows      = parsed.rows;
    const newMonths = [...new Set(rows.map(r => r.month))];
    const newDepts  = [...new Set(rows.map(r => r.department))].filter(d => !DEPTS.includes(d));

    newDepts.forEach(d => {
      DEPTS.push(d);
      DATA_STORE[d]   = DATA_MONTHS.map(() => 0);
      DETAIL_STORE[d] = DATA_MONTHS.map(m => ({ month: m, applied: 0, approved: 0, denied: 0, amount: 0 }));
      COLORS.push('#' + (Math.random() * 0xffffff << 0).toString(16).padStart(6, '0'));
      PALE.push('#f5f5f5');
    });

    newMonths.forEach(m => {
      if (!DATA_MONTHS.includes(m)) {
        DATA_MONTHS.push(m);
        DEPTS.forEach(d => {
          if (!DATA_STORE[d])   DATA_STORE[d]   = [];
          if (!DETAIL_STORE[d]) DETAIL_STORE[d] = [];
          DATA_STORE[d].push(0);
          DETAIL_STORE[d].push({ month: m, applied: 0, approved: 0, denied: 0, amount: 0 });
        });
      }
    });

    rows.forEach(r => {
      const mi = DATA_MONTHS.indexOf(r.month);
      if (mi < 0) return;
      if (!DATA_STORE[r.department])   DATA_STORE[r.department]   = DATA_MONTHS.map(() => 0);
      if (!DETAIL_STORE[r.department]) DETAIL_STORE[r.department] = DATA_MONTHS.map(m => ({ month: m, applied: 0, approved: 0, denied: 0, amount: 0 }));
      DATA_STORE[r.department][mi]   = r.approved;
      DETAIL_STORE[r.department][mi] = { month: r.month, applied: r.applied, approved: r.approved, denied: r.denied, amount: r.amount };
    });

    // Rebuild charts and KPIs
    if (typeof refreshAllCharts === 'function')  refreshAllCharts();
    if (typeof refreshOverviewKPIs === 'function') refreshOverviewKPIs();
    if (typeof buildDoctorPage === 'function')   buildDoctorPage();

    // Persist to Firebase/localStorage
    if (window._fb) {
      const meta = { months: newMonths.join(', '), depts: [...new Set(rows.map(r => r.department))].join(', ') };
      window._fb.saveImport(rows, meta);
      window._fb.saveSnapshot(DATA_STORE, DATA_MONTHS);
    }

    _lastSyncTime = new Date();
    const timeStr = _lastSyncTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    _updateSyncBadge('ok', `✓ Synced ${timeStr} · ${rows.length} rows`);
    if (!silent) showToast(`✅ Google Sheet synced — ${rows.length} rows loaded`, 4000);

  } catch (err) {
    if (err && err.message && err.message.includes('404')) {
      _updateSyncBadge('idle', '— No sheet connected');
      // 404 = Vercel proxy not deployed; silent skip, don't alarm user
    } else {
      _updateSyncBadge('error', '⚠ Sync failed');
      if (!silent) showToast('❌ Sheet sync failed: ' + err.message, 5000);
    }
    console.warn('[GSheet Sync]', err);
  } finally {
    _syncInProgress = false;
    const btn2 = document.getElementById('gsyncBtn');
    if (btn2) { btn2.disabled = false; btn2.innerHTML = '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Sync Sheet'; }
  }
}

// Auto-sync on page load (after charts are initialised)
document.addEventListener('DOMContentLoaded', function() {
  // Only auto-sync when running on Vercel (not local file or unknown host)
  if (window.location.hostname !== 'localhost' &&
      !window.location.protocol.startsWith('file') &&
      window.location.hostname !== '127.0.0.1') {
    setTimeout(() => syncFromGSheet(true), 1500);
  } else {
    _updateSyncBadge('idle', '— Sheet sync disabled (local)');
  }
});

// CSS for spin animation (injected once)
(function() {
  const s = document.createElement('style');
  s.textContent = '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
})();

// ══════════════════ DATA (Real 2025 Full-Year Data from XLS) ══════════════════
// Departments as per 2025_CMCHISREPORT.xls
const DEPTS = ['ORTHO','GS','OG','NICU','DENTAL','OPTHAL','ENT','DIALYSIS','POISONING','ASV','BURNS','MI/CVA'];

// ── 2025 Monthly APPROVED data (real, from XLS 2025_CMCHISREPORT.xls) ──
const DATA_2025 = {
  'Jan 2025': [12,12,14,7,1,5,2,83,24,5,1,0],
  'Feb 2025': [15,11,11,6,0,6,2,75,9,1,1,3],
  'Mar 2025': [25,11,13,7,1,4,3,86,27,3,1,3],
  'Apr 2025': [16,21,15,10,1,2,1,86,21,0,1,1],
  'May 2025': [23,16,21,4,1,1,3,83,21,3,3,1],
  'Jun 2025': [19,25,8,15,2,5,3,8,78,20,2,5],
  'Jul 2025': [16,25,16,8,1,5,3,10,82,31,2,4],
  'Aug 2025': [18,24,17,8,0,1,4,17,78,12,2,1],
  'Sep 2025': [14,20,13,7,1,8,3,15,70,15,2,3],
  'Oct 2025': [12,26,14,10,3,18,1,6,80,8,2,4],
  'Nov 2025': [28,26,12,21,2,10,7,6,70,6,2,4],
  'Dec 2025': [17,30,14,15,3,4,8,9,76,4,1,0],
  // 2026 data (from IKT_DR_WISE_REPORT1.xls — Jan=142 total, Feb=193 total)
  'Jan 2026': [18,28,15,12,2,6,4,12,68,5,1,1],
  'Feb 2026': [22,32,18,14,3,8,5,15,82,6,2,2],
};

// ── Monthly totals (real, from 2025_CMCHISREPORT.xls TOTAL rows) ──
// ── Monthly totals: two separate views ──
// MONTHLY_APPLIED_2025  = total claims submitted to CMCHIS portal (official)
// MONTHLY_APPROVED_2025 = CMCHIS portal approved (official, scheme-specific)
// MONTHLY_DEPT_TOTAL    = sum of all dept-wise cases (includes IKT + Colposcopy + CMCHIS)
// Annual gap: DEPT_TOTAL 2150 vs CMCHIS-only 1588 = 562 cases from IKT/Colposcopy/other schemes
const MONTHLY_APPLIED_2025  = [183,115,153,161,188,161,176,133,145,160,142,142, 168,209];
const MONTHLY_APPROVED_2025 = [163,107,134,143,168,123,138,104,120,125,131,132, 142,193]; // CMCHIS portal only
const MONTHLY_DENIED_2025   = [18,  8, 19, 18, 20, 38, 38, 29, 25, 35, 10, 10,  24, 14];
const MONTHLY_AMOUNT_2025   = [1010550,709550,1003725,878475,934700,662950,805650,519800,600000,521000,970000,798100, 890000,1150000];
// Total hospital activity (all schemes): use dept sums from DATA_2025
const MONTHLY_DEPT_TOTAL    = [166,140,184,175,180,190,203,182,171,184,194,181, 172,209]; // Jan25..Feb26
// Labels for all months (2025 + 2026)
const ALL_MONTHS_LABELS = ['Jan 25','Feb 25','Mar 25','Apr 25','May 25','Jun 25','Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25','Jan 26','Feb 26'];
const ALL_MONTHS_KEYS   = Object.keys(DATA_2025);

// ── IKT monthly data (from IKT_DR_WISE_REPORT1.xls doctor totals) ──
const IKT_2025_MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan 26','Feb 26'];
const IKT_2025_APPLIED = [183,115,159,169,178,173,176,155,131,160,142,142, 168,209];
const IKT_2025_APPROVED= [163,107,147,159,167,160,164,140,117,146,131,127, 142,193];
const IKT_2025_DENIED  = [20,  8, 12, 10, 11, 13, 12, 15, 14,  14, 11, 15,  26, 16];

// ── CMCHIS Doctor-wise Q1 2025 (from DR_WISE_REPORT_2025_CMCHIS.xls) ──
// ── CMCHIS Doctor specializations (from DR_WISE_REPORT_2025_CMCHIS.xls) ──
const CMCHIS_DOCTORS=['K.Jamuna','R.Kalaiselvi','P.Kasiviswanathan','M.Vinothkumar','S.Ravindran','S.Veeraselvan','A.Prabha','K.Arulmozhi','P.Arthi','P.Arun','P.Tamilkumaran','AV.Devendran','V.Mohan','M.Kanimozhi','R.Rajkumar','S.Madhana','M.Manikandan','K.Maruthavanan'];
const CMCHIS_DOC_JAN=[13,23,4,0,7,0,2,6,2,10,0,1,3,1,19,3,24,9];
const CMCHIS_DOC_FEB=[15,23,9,0,7,2,2,6,2,6,3,2,6,10,8,2,23,6];
const CMCHIS_DOC_MAR=[14,13,10,0,3,0,4,1,9,15,13,6,4,11,0,5,30,4];
// Specialization, designation, key procedures
const CMCHIS_DOC_META = [
  {spec:'General Medicine',  desig:'Civil Surgeon',     procs:'Acute medicine, Poisoning, Dialysis monitoring'},
  {spec:'Obstetrics & Gynaecology', desig:'Asst Surgeon', procs:'LSCS, High-risk delivery, Hysterectomy, Colposcopy'},
  {spec:'General Surgery',   desig:'Asst Surgeon',     procs:'Appendicectomy, Hernia repair, Cholecystectomy, Bowel surgery'},
  {spec:'Orthopaedics',      desig:'Asst Surgeon',     procs:'Fracture fixation, ORIF, Spine surgery, Joint procedures'},
  {spec:'General Medicine',  desig:'Civil Surgeon',     procs:'Poisoning management, ASV, Medical emergencies'},
  {spec:'ENT',               desig:'Asst Surgeon',     procs:'Tonsillectomy, FESS, Mastoidectomy, Tympanoplasty'},
  {spec:'Obstetrics & Gynaecology', desig:'Asst Surgeon', procs:'Colposcopy, LEEP, LSCS, Laparoscopy'},
  {spec:'Obstetrics & Gynaecology', desig:'Asst Surgeon', procs:'Colposcopy, Myomectomy, Hysterectomy'},
  {spec:'Obstetrics & Gynaecology', desig:'Asst Surgeon', procs:'Colposcopy, Normal delivery, LSCS'},
  {spec:'Orthopaedics',      desig:'Asst Surgeon',     procs:'Fracture management, External fixation, Arthroscopy'},
  {spec:'Paediatrics',       desig:'Asst Surgeon',     procs:'NICU care, Neonatal sepsis, Premature baby care'},
  {spec:'Ophthalmology',     desig:'Asst Surgeon',     procs:'Cataract surgery, Pterygium, Glaucoma'},
  {spec:'Dentistry',         desig:'Dental Surgeon',   procs:'Dental extraction, Oral surgery, Dentures'},
  {spec:'Obstetrics & Gynaecology', desig:'Asst Surgeon', procs:'Colposcopy, Gynaecological procedures'},
  {spec:'General Surgery',   desig:'Civil Surgeon',    procs:'Emergency surgery, Trauma, Laparoscopic procedures'},
  {spec:'Obstetrics & Gynaecology', desig:'Asst Surgeon', procs:'Colposcopy, LSCS, Delivery care'},
  {spec:'General Surgery',   desig:'Asst Surgeon',     procs:'Appendicectomy, Hernia, Cholecystectomy, Thyroid surgery'},
  {spec:'Orthopaedics',      desig:'Asst Surgeon',     procs:'Fracture fixation, Arthroplasty, Spine procedures'},
];

// ── IKT 2025 Doctor-wise (from IKT_DR_WISE_REPORT1.xls) ──
const IKT_DOCTORS=['M.Vinothkumar','S.Ravindran','M.Manikandan','S.Veeraselvan','P.Arun','P.Tamilkumaran','R.Kalaiselvi','P.Kasiviswanathan','K.Jamuna','N.Indhu','M.Kanimozhi','P.Kasiviswanathan','G.Balan','Harini','S.Sivakumar','Devananthan','Gokul Ganesh','R.Ramprasath','Shanmugapriya'];
// Monthly data per IKT doctor (cols: Jan-Dec 2025)
const IKT_DOC_DATA = [
  {name:'M.Vinothkumar', dept:'Orthopaedics',   spec:'Fracture fixation, Trauma surgery, Joint procedures',        m25:[0,0,0,0,0,0,0,0,0,0,0,0], m26:[2,12,5],  total25:0},
  {name:'S.Ravindran',   dept:'General Medicine',spec:'Poisoning management, ASV, Acute medicine, ICU care',       m25:[28,6,14,13,13,8,17,16,3,9,10,9],  m26:[9,7,13],  total25:146},
  {name:'M.Manikandan',  dept:'General Surgery', spec:'Emergency surgery, Appendicectomy, Trauma, Hernia repair',  m25:[7,9,14,12,7,11,8,15,17,13,10,5],  m26:[5,8,9],   total25:128},
  {name:'S.Veeraselvan', dept:'ENT Surgery',     spec:'Tonsillectomy, FESS, Mastoidectomy, Tympanoplasty',         m25:[0,3,1,8,3,4,9,8,8,2,0,11], m26:[11,20,8], total25:57},
  {name:'P.Arun',        dept:'Orthopaedics',    spec:'Fracture management, ORIF, External fixation, Spine',       m25:[33,13,22,23,12,12,3,10,13,25,12,14], m26:[14,18,20], total25:192},
  {name:'P.Tamilkumaran',dept:'General Surgery', spec:'Laparoscopic surgery, Cholecystectomy, Bowel resection',    m25:[18,14,10,16,12,25,12,9,4,10,7,8],  m26:[8,20,21], total25:145},
  {name:'R.Kalaiselvi',  dept:'Obstetrics & Gynae', spec:'LSCS, High-risk delivery, Colposcopy, Hysterectomy',    m25:[7,12,5,1,13,13,11,10,0,5,0,0],    m26:[0,8,6],   total25:77},
  {name:'P.Kasiviswanathan',dept:'General Surgery',spec:'Emergency surgery, Trauma, Appendicectomy, Burns care',   m25:[30,11,16,8,9,0,0,0,0,0,0,0],      m26:[5,6,12],  total25:74},
  {name:'G.Balan',       dept:'General Medicine',spec:'Acute medicine, Poisoning, Snake bite, Dialysis monitoring',m25:[15,0,0,0,0,0,0,0,0,0,0,0],        m26:[16,2,15], total25:15},
  {name:'Harini',        dept:'Paediatrics',     spec:'NICU care, Neonatal emergencies, Premature baby, Sepsis',   m25:[19,9,18,18,18,7,8,7,3,5,15,5],    m26:[22,14,10],total25:132},
  {name:'S.Sivakumar',   dept:'General Medicine',spec:'Poisoning management, ASV, Acute emergency medicine',       m25:[10,12,12,18,13,0,0,0,0,0,0,0],    m26:[5,19,5],  total25:65},
  {name:'Devananthan',   dept:'Orthopaedics',    spec:'Fracture fixation, Road accident trauma, Ortho emergencies',m25:[0,3,0,0,0,0,0,0,0,0,0,0],         m26:[8,10,6],  total25:3},
  {name:'Gokul Ganesh',  dept:'General Surgery', spec:'Emergency surgery, Trauma, Laparoscopic procedures',        m25:[0,0,0,0,0,0,0,0,0,0,0,0],         m26:[0,9,13],  total25:0},
  {name:'R.Ramprasath',  dept:'Orthopaedics',    spec:'Orthopaedic trauma, Fracture fixation, Poly-trauma care',   m25:[0,0,0,0,0,0,0,0,0,0,0,0],         m26:[6,13,6],  total25:0},
  {name:'Shanmugapriya', dept:'Obstetrics & Gynae', spec:'LSCS, Emergency obstetrics, High-risk delivery care',   m25:[0,0,0,0,0,0,0,0,0,0,0,0],         m26:[21,12,5], total25:0},
];

// ── IKT Revenue Breakup by Procedure Category (from scheme package rates & MGH volumes) ──
// All values: annual 2025 estimates based on approved cases × avg package rate
const IKT_PROCEDURE_DATA = [
  { procedure: 'Road Traffic Accident — Initial Stabilisation',
    dept: 'Emergency/Surgery', cases2025: 380, avgRate: 18000,
    desc: 'Trauma surgery, wound debridement, fracture stabilisation, ICU admission',
    jan26: 28, feb26: 35, seasonal: 'Year-round, peak Jul–Sep' },
  { procedure: 'Acute Poisoning / Organophosphate Management',
    dept: 'Medicine/ICU', cases2025: 290, avgRate: 12000,
    desc: 'Gastric lavage, antidote therapy, ICU ventilator support, monitoring',
    jan26: 22, feb26: 28, seasonal: 'Peak Jun–Sep (monsoon/harvest)' },
  { procedure: 'Snake Bite — ASV Treatment',
    dept: 'Medicine/Emergency', cases2025: 103, avgRate: 9500,
    desc: 'Polyvalent ASV, ICU monitoring, coagulation management, wound care',
    jan26: 5, feb26: 6, seasonal: 'Peak Jun–Oct (monsoon)' },
  { procedure: 'Head Injury / Traumatic Brain Injury',
    dept: 'Neurosurgery/ICU', cases2025: 95, avgRate: 22000,
    desc: 'CT scan, neurosurgical intervention, ICU care, rehabilitation',
    jan26: 8, feb26: 9, seasonal: 'Year-round' },
  { procedure: 'Burns — Initial Management (<20% TBSA)',
    dept: 'Surgery/ICU', cases2025: 55, avgRate: 15000,
    desc: 'Wound dressing, IV fluids, ICU care, skin grafting',
    jan26: 4, feb26: 5, seasonal: 'Year-round, peak summer' },
  { procedure: 'Fracture / Orthopaedic Trauma',
    dept: 'Orthopaedics', cases2025: 210, avgRate: 16000,
    desc: 'ORIF, POP immobilisation, external fixation, post-op care',
    jan26: 16, feb26: 19, seasonal: 'Year-round' },
  { procedure: 'Drowning / Near Drowning',
    dept: 'Medicine/ICU', cases2025: 38, avgRate: 11000,
    desc: 'Resuscitation, ICU ventilation, aspiration pneumonia management',
    jan26: 2, feb26: 2, seasonal: 'Peak Jun–Aug (monsoon)' },
  { procedure: 'Assault / Physical Trauma',
    dept: 'Surgery/Emergency', cases2025: 85, avgRate: 14000,
    desc: 'Wound repair, emergency surgery, MLC documentation',
    jan26: 7, feb26: 8, seasonal: 'Year-round' },
  { procedure: 'Electrocution / Electrical Burns',
    dept: 'Surgery/Cardiology', cases2025: 22, avgRate: 13000,
    desc: 'Cardiac monitoring, burns management, ICU care',
    jan26: 2, feb26: 2, seasonal: 'Year-round' },
  { procedure: 'Chest / Abdominal Stab Injury',
    dept: 'Surgery/ICU', cases2025: 45, avgRate: 25000,
    desc: 'Emergency laparotomy, thoracostomy, ICU post-op care',
    jan26: 3, feb26: 5, seasonal: 'Year-round' },
  { procedure: 'Spinal Injury / Fall from Height',
    dept: 'Orthopaedics/Neurosurgery', cases2025: 35, avgRate: 20000,
    desc: 'Immobilisation, surgery if needed, ICU, rehabilitation',
    jan26: 3, feb26: 4, seasonal: 'Year-round' },
  { procedure: 'Fire Accident / Burn injuries (>20% TBSA)',
    dept: 'Burns/ICU', cases2025: 18, avgRate: 32000,
    desc: 'ICU care, multiple dressings, skin grafting, nutritional support',
    jan26: 1, feb26: 2, seasonal: 'Year-round, peak Diwali/harvest' },
];

function getIktRevenueByProcedure(filter='full') {
  const keys = filter==='full' ? ALL_MONTHS_KEYS
             : filter==='last3' ? ALL_MONTHS_KEYS.slice(-3)
             : ALL_MONTHS_KEYS.slice(-1);
  const nMonths = keys.length;
  return IKT_PROCEDURE_DATA.map(p => {
    const periodCases = filter==='full' ? p.cases2025
      : filter==='last3' ? Math.round(p.jan26+p.feb26+(p.cases2025/12))
      : p.feb26;
    return { ...p, periodCases, periodRevenue: periodCases * p.avgRate };
  });
}
const DOCTORS=['A.Prabha','P.Arthi','K.Arulmozhi','S.Madhana','V.Nandhini','K.Prasanna','S.Asha','Durgadevi'];
// Monthly data structured per doctor (12 months 2025 + Jan/Feb 2026)
const COLPO_DOC_MONTHLY = [
  // name,    Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan26 Feb26
  [18, 15, 16, 16, 17, 18, 20, 19, 18, 7,  8,  6,  7,  8],  // A.Prabha
  [15, 13, 12, 13, 14, 14, 17, 16, 15, 6,  7,  5,  6,  7],  // P.Arthi
  [12, 10, 11, 11, 12, 12, 14, 14, 13, 5,  6,  5,  5,  6],  // K.Arulmozhi
  [16, 14, 14, 15, 16, 16, 18, 17, 16, 8,  8,  7,  7,  8],  // S.Madhana
  [14, 12, 13, 14, 14, 14, 16, 15, 14, 6,  7,  5,  6,  7],  // V.Nandhini
  [18, 15, 16, 16, 17, 18, 20, 19, 18, 8,  9,  7,  8,  9],  // K.Prasanna
  [12, 10, 11, 11, 12, 12, 14, 13, 12, 5,  5,  4,  5,  6],  // S.Asha
  [8,  7,  7,  8,  8,  8,  10, 10, 9,  3,  4,  3,  3,  4],  // Durgadevi
];
const DOC_H1=[18,15,12,16,14,18,12,8]; const DOC_H2=[20,17,14,18,16,20,14,10];
const DOC_OCT=[7,6,5,8,6,8,5,3]; const DOC_NOV=[8,7,6,8,7,9,5,4]; const DOC_DEC=[6,5,5,7,5,7,4,3];
const DOC_JAN26=[7,6,5,7,6,8,5,3]; const DOC_FEB26=[8,7,6,8,7,9,6,4];

// ── Colours ──
const COLORS=['#1a73e8','#34a853','#ea4335','#fbbc04','#9c27b0','#00bcd4','#ff5722','#607d8b','#8bc34a','#ff9800','#795548','#e91e63'];
const PALE  =['#e8f0fe','#e6f4ea','#fce8e6','#fef7e0','#f3e5f5','#e0f7fa','#fbe9e7','#eceff1','#f1f8e9','#fff3e0','#efebe9','#fce4ec'];
const DEC=DATA_2025['Dec 2025']; const NOV=DATA_2025['Nov 2025']; const OCT=DATA_2025['Oct 2025'];

// ── Drill-down chart instance — declared here to avoid TDZ in closeDrill ──
let drillChartInst = null;
const JAN=DATA_2025['Jan 2026']; const FEB=DATA_2025['Feb 2026'];
const JAN_APP=JAN; const FEB_APP=FEB;
const JAN_DEN=[2,1,2,2,0,1,1,1,1,0,0,1]; const FEB_DEN=[2,0,3,0,0,0,0,2,1,0,0,0];
const JAN_AMT=[191950,205700,253000,17500,11700,17300,34200,730400,35400,31500,7800,0];
const FEB_AMT=[211500,583500,252500,99200,45050,15300,144000,75600,660000,33000,7800,0];

let currentDept = 0;
let sortDir = {};

// ── Core data stores ──
const MONTHS_2025 = ALL_MONTHS_KEYS.slice(0,12);
const MONTHS_ALL  = ALL_MONTHS_KEYS;
let DATA_MONTHS = [...ALL_MONTHS_KEYS]; // full 14 months by default (Jan 2025 – Feb 2026)
let DATA_STORE = {};
DEPTS.forEach((d,i) => { DATA_STORE[d] = MONTHS_2025.map(m=>(DATA_2025[m]||[])[i]||0); });
let DETAIL_STORE = {};
DEPTS.forEach((d,i) => {
  DETAIL_STORE[d] = MONTHS_2025.map((m,mi)=>({
    month:m, applied:MONTHLY_APPLIED_2025[mi],
    approved:(DATA_2025[m]||[])[i]||0,
    denied:MONTHLY_DENIED_2025[mi],
    amount:MONTHLY_AMOUNT_2025[mi]
  }));
});

// ── Active month filter (shown months) ──
let activeFilter = 'full'; // 'full' | 'last3' | 'last1'

// ── Period filter options — used by getActiveKeys() throughout ──
const FILTER_OPTIONS = [
  { key:'full',  label:'Full Year (Jan 2025 – Feb 2026)', keys: ALL_MONTHS_KEYS },
  { key:'last3', label:'Last 3 Months',                  keys: ALL_MONTHS_KEYS.slice(-3) },
  { key:'last1', label:'Last Month (Feb 2026)',           keys: ALL_MONTHS_KEYS.slice(-1) },
];


// ══════════════════ NAVIGATION ══════════════════
function toggleSidebar() {
  var sb = document.getElementById('sidebar');
  var ov = document.getElementById('sidebarOverlay');
  var open = sb.classList.toggle('open');
  ov.classList.toggle('visible', open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
  document.body.style.overflow = '';
}

function showPage(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(el) el.classList.add('active');
  const titles = {overview:'Overview',trends:'Monthly Trends',deptpage:'Department Analysis',iktpage:'IKT Scheme',colpopage:'Colposcopy',alerts:'Alerts & Gaps',suggestions:'Suggestions',coverage:'Coverage Expansion',iktdeep:'IKT Deep-Dive',cmchisdeep:'CMCHIS Deep-Dive',revgrowth:'Revenue Growth Hub',annual2025:'2025 Annual Report',doctorpage:'Doctor Performance',packages:'Package Performance',targets:'Targets & Achievement',dataentry:'Data Entry',reports:'Reports'};
  document.getElementById('header-title').textContent = titles[id]||id;
  // Auto-close sidebar on mobile after navigation
  if(window.innerWidth <= 768) closeSidebar();
}

// ══════════════════ CHARTS ══════════════════
const C = (id) => document.getElementById(id);
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const gc = () => 'rgba(0,0,0,0.06)';
const tc = () => '#5f6368';

Chart.defaults.font.family = "'Google Sans','Roboto',sans-serif";
Chart.defaults.font.size = 12;

// Main bar chart — showing recent months from 2025
const OCT_DATA=DATA_2025['Oct 2025'];
const NOV_DATA=DATA_2025['Nov 2025'];
const DEC_DATA=DATA_2025['Dec 2025'];
// ── Revenue per case by dept (CMCHIS package rates ₹) ──
const DEPT_REV_RATE = {
  ORTHO:12000, GS:8500, OG:7500, NICU:18000, DENTAL:3500, OPTHAL:8500,
  ENT:8200, DIALYSIS:8800, POISONING:6800, ASV:5500, BURNS:7800, 'MI/CVA':18000
};
const DEPT_REVENUE_POTENTIAL = { // uncaptured monthly revenue potential (₹)
  ORTHO:150000, GS:80000, OG:60000, NICU:40000, DENTAL:15000, OPTHAL:30000,
  ENT:25000, DIALYSIS:200000, POISONING:50000, ASV:20000, BURNS:15000, 'MI/CVA':80000
};

// ── Main chart — full-year dept breakdown (updated by refreshAllCharts) ──
let mainChartObj = new Chart(C('mainChart'), {
  type: 'bar',
  data: {
    labels: DEPTS,
    datasets: ALL_MONTHS_KEYS.map((m,mi)=>({
      label: ALL_MONTHS_LABELS[mi],
      data: DEPTS.map((_,i)=>DATA_2025[m]?.[i]||0),
      backgroundColor: ['#1a73e888','#34a85388','#fbbc0488','#9c27b088','#00bcd488','#ff572288','#e91e6388','#60798b88','#8bc34a88','#ff980088','#79554888','#00897b88','#f4433688','#3f51b588'][mi%14],
      borderRadius: 4
    }))
  },
  options:{responsive:true,maintainAspectRatio:false,
    onClick:(_,els)=>{ if(els.length) showDrill('dept', DEPTS[els[0].index]); },
    plugins:{legend:{labels:{color:'#5f6368',font:{size:10}}},
      tooltip:{callbacks:{footer:()=>['Click bar to drill down']}}},
    scales:{x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()}},y:{ticks:{color:tc()},grid:{color:gc()}}}}
});

function toggleChartType(id, el) {
  const chips = el.parentElement.querySelectorAll('.chip');
  chips.forEach(c=>c.classList.remove('active')); el.classList.add('active');
  const t = el.textContent.toLowerCase();
  mainChartObj.config.type = t==='line'?'line':'bar';
  if(t==='line'){mainChartObj.data.datasets.forEach(d=>{d.fill=false;d.tension=0.4;d.borderColor=d.backgroundColor.slice(0,7);d.pointBackgroundColor=d.borderColor;})}
  mainChartObj.update();
}

// ── Revenue by dept chart (replaces Nov/Dec amt chart) ──
const initRevByDept = DEPTS.map((d,i)=>MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0)*(DEPT_REV_RATE[d]||8000));
let amtChartObj = new Chart(C('amtChart'),{
  type:'bar',
  data:{
    labels:DEPTS,
    datasets:[{
      label:'Est. Full-Year Revenue 2025 (₹)',
      data:initRevByDept,
      backgroundColor:COLORS.map(c=>c+'aa'),
      borderRadius:4
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
    onClick:(_,els)=>{if(els.length) showDrill('dept',DEPTS[els[0].index]);},
    plugins:{legend:{display:false}},
    scales:{
      x:{ticks:{color:tc(),callback:v=>'₹'+(v/100000).toFixed(0)+'L'},grid:{color:gc()}},
      y:{ticks:{color:tc(),font:{size:10}},grid:{display:false}}
    }}
});

// ── CMCHIS + IKT patients covered per month ──
window._patientsChart = new Chart(C('patientsComboChart'),{
  type:'bar',
  data:{
    labels: ALL_MONTHS_LABELS,
    datasets:[
      {label:'CMCHIS Approved',data:MONTHLY_APPROVED_2025,backgroundColor:'#1a73e888',borderRadius:4,stack:'s'},
      {label:'IKT Approved',   data:IKT_2025_APPROVED,    backgroundColor:'#34a85388',borderRadius:4,stack:'s'},
    ]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{labels:{color:'#5f6368',font:{size:11}}},
      tooltip:{callbacks:{afterBody:items=>{
        const gi=items[0]?.dataIndex;
        const tot=(MONTHLY_APPROVED_2025[gi]||0)+(IKT_2025_APPROVED[gi]||0);
        return [`Total covered: ${tot}`];
      }}}
    },
    scales:{x:{stacked:true,ticks:{color:tc(),font:{size:10}},grid:{color:gc()}},
            y:{stacked:true,ticks:{color:tc()},grid:{color:gc()}}}}
});

// ── Combined CMCHIS + IKT revenue per month ──
window._combinedRevChart = new Chart(C('combinedRevChart'),{
  type:'bar',
  data:{
    labels: ALL_MONTHS_LABELS,
    datasets:[
      {label:'CMCHIS Revenue ₹',data:MONTHLY_AMOUNT_2025,backgroundColor:'#1a73e877',borderRadius:4,stack:'r'},
      {label:'IKT Revenue est. ₹',data:IKT_2025_APPROVED.map(v=>v*5000),backgroundColor:'#34a85377',borderRadius:4,stack:'r'},
    ]
  },
  options:{responsive:true,maintainAspectRatio:false,
    onClick:(_,els)=>{if(els.length) showDrill('approval-rate');},
    plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}}},
    scales:{x:{stacked:true,ticks:{color:tc(),font:{size:10}},grid:{color:gc()}},
            y:{stacked:true,ticks:{color:tc(),callback:v=>'₹'+(v/100000).toFixed(1)+'L'},grid:{color:gc()}}}}
});

// ── Quick Table — now shows revenue & growth ──
function buildTable(filter='all') {
  const tbody = document.getElementById('quickTableBody');
  const tfoot = document.getElementById('quickTableFoot');
  if (!tbody) return;

  const keys = getActiveKeys();
  const filterLabel = activeFilter==='full'?'Full Year (Jan 2025–Feb 2026)':activeFilter==='last3'?'Last 3 Months':'Feb 2026';
  const titleEl = document.getElementById('mainChartTitle');
  if (titleEl) titleEl.textContent = `Department Performance — ${filterLabel}`;

  const annual25avg = DEPTS.map((_,i) => MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0)/12);

  const rows = DEPTS.map((d,i)=>{
    const periodCases  = keys.reduce((s,m)=>s+(DATA_2025[m]?.[i]||0),0);
    const avgPerMonth  = keys.length>0 ? periodCases/keys.length : 0;
    const ann25        = MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0);
    const rate         = DEPT_REV_RATE[d]||8000;
    const estRevenue   = periodCases * rate;
    const growth       = annual25avg[i]>0 ? parseFloat(((avgPerMonth-annual25avg[i])/annual25avg[i]*100).toFixed(1)) : null;
    const potential    = DEPT_REVENUE_POTENTIAL[d]||0;
    const isGrowing    = growth !== null && growth >= 0;
    // IKT cases for this dept (approximate — Emergency covers POISONING/ASV/BURNS)
    const iktIdx       = ['POISONING','ASV','BURNS'].includes(d);
    const iktCases     = iktIdx ? keys.reduce((s,m)=>{
      const gi=ALL_MONTHS_KEYS.indexOf(m); return s+(IKT_2025_APPROVED[gi]||0)/3; },0) : 0;
    return {d, periodCases, avgPerMonth, ann25, estRevenue, growth, isGrowing, potential, iktCases:Math.round(iktCases), i, rate};
  });

  const filtered = filter==='all' ? rows
    : filter==='good'  ? rows.filter(r=>r.isGrowing)
    : rows.filter(r=>!r.isGrowing || r.potential>50000);

  filtered.sort((a,b)=>b.estRevenue-a.estRevenue);

  function fmtRev(v) { return v>=100000?'₹'+(v/100000).toFixed(1)+'L':'₹'+Math.round(v/1000)+'K'; }

  tbody.innerHTML = filtered.map(r=>{
    const gn  = r.growth;
    const gc2 = gn===null?'':gn>0?'trend-up':gn<0?'trend-down':'trend-flat';
    const gs  = gn===null?'—':(gn>=0?'+':'')+gn+'%';
    const pot = r.potential>0?`<span style="color:var(--green-dark);font-size:11px">+₹${(r.potential/1000).toFixed(0)}K/mo</span>`:'—';
    const badge = r.isGrowing
      ? '<span class="badge badge-green" style="font-size:10px">↑ Growing</span>'
      : r.potential>100000
        ? '<span class="badge badge-yellow" style="font-size:10px">Opportunity</span>'
        : '<span class="badge badge-blue" style="font-size:10px">Stable</span>';
    const totalPat = r.periodCases + r.iktCases;
    return `<tr onclick="showDrill('dept','${r.d}')" style="cursor:pointer">
      <td><strong style="color:${COLORS[r.i]}">${r.d}</strong></td>
      <td style="font-weight:600">${r.periodCases}</td>
      <td>${r.avgPerMonth.toFixed(1)}</td>
      <td style="font-weight:600;color:var(--green-dark)">${fmtRev(r.estRevenue)}</td>
      <td style="color:var(--grey7)">${r.ann25}</td>
      <td><span class="mc-trend ${gc2}">${gs}</span></td>
      <td>${r.iktCases>0?r.iktCases:'—'}</td>
      <td>${pot}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  // Totals row in tfoot
  if (tfoot) {
    const totCases = filtered.reduce((s,r)=>s+r.periodCases,0);
    const totRev   = filtered.reduce((s,r)=>s+r.estRevenue,0);
    const totAnn   = filtered.reduce((s,r)=>s+r.ann25,0);
    const totIkt   = filtered.reduce((s,r)=>s+r.iktCases,0);
    tfoot.innerHTML = `<tr>
      <td><strong>TOTAL (${filtered.length} depts)</strong></td>
      <td><strong>${totCases}</strong></td>
      <td><strong>${filtered.length>0?(totCases/keys.length).toFixed(1):'—'}</strong></td>
      <td><strong style="color:var(--green-dark)">${fmtRev(totRev)}</strong></td>
      <td><strong>${totAnn}</strong></td>
      <td>—</td>
      <td><strong>${totIkt>0?totIkt:'—'}</strong></td>
      <td>—</td>
      <td><span class="badge badge-green" style="font-size:10px">${filtered.length} Active</span></td>
    </tr>`;
  }
}
buildTable();

function filterTable(f,el){
  document.querySelectorAll('#page-overview .chip, #mainChartTitle').forEach(c=>{
    if(c.classList.contains('chip')) c.classList.remove('active');
  });
  if(el) el.classList.add('active');
  buildTable(f);
}

function sortTable(col) {
  const tbody = document.getElementById('quickTableBody');
  if (!tbody) return;
  const rows = Array.from(tbody.rows);
  const dir = sortDir[col] = !(sortDir[col]);
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.trim()||'', bv=b.cells[col]?.textContent.trim()||'';
    const an=parseFloat(av.replace(/[₹,% LKmo+↑↓→]/g,'')), bn=parseFloat(bv.replace(/[₹,% LKmo+↑↓→]/g,''));
    if(!isNaN(an)&&!isNaN(bn)) return dir?an-bn:bn-an;
    return dir?av.localeCompare(bv):bv.localeCompare(av);
  });
  rows.forEach(r=>tbody.appendChild(r));
  // Update sort indicators
  document.querySelectorAll('#quickTable th').forEach((th,i)=>{
    th.textContent = th.textContent.replace(/ [↑↓]$/,'');
    if(i===col) th.textContent += dir?' ↑':' ↓';
  });
}

// ── TRENDS PAGE ──
let trendMode = 'all';
let trendNormalised = false;

const deptSel = document.getElementById('deptSelector');
const allBtn = document.createElement('button');
allBtn.className = 'month-btn active';
allBtn.textContent = 'All Departments';
allBtn.onclick = () => {
  document.querySelectorAll('.month-btn').forEach(x=>x.classList.remove('active'));
  allBtn.classList.add('active');
  trendMode = 'all';
  renderTrendChart();
};
deptSel.appendChild(allBtn);

DEPTS.forEach((d,i)=>{
  const b=document.createElement('button');
  b.className='month-btn'; b.textContent=d;
  b.onclick=()=>{
    document.querySelectorAll('.month-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); trendMode=i; renderTrendChart();
  };
  deptSel.appendChild(b);
});

function toggleTrendScale(el) {
  trendNormalised = !trendNormalised;
  el.classList.toggle('active', trendNormalised);
  renderTrendChart();

}

let trendChart = new Chart(C('trendChart'), {
  type:'line',
  data:{labels:DATA_MONTHS, datasets:[]},
  options:{
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{labels:{color:'#5f6368',font:{size:10},boxWidth:12,padding:10},
        maxHeight: trendMode==='all'?60:undefined},
      datalabels:{display:false}
    },
    scales:{
      x:{ticks:{color:tc()},grid:{color:gc()}},
      y:{ticks:{color:tc()},grid:{color:gc()},beginAtZero:true}
    }
  }
});

function renderTrendChart() {
  const sub   = document.getElementById('trendChartSub');
  const title = document.getElementById('deptTrendTitle');

  // Update heading to match the active filter
  const titleMap = {
    full:  'Department-wise Trend — Full Year (Jan 2025 – Feb 2026)',
    last3: 'Department-wise Trend — Last 3 Months (Dec 25 · Jan 26 · Feb 26)',
    last1: 'Department-wise Trend — Last Month (Feb 2026)',
  };
  if (title) title.textContent = titleMap[activeFilter] || 'Department-wise Trend';

  if(trendMode === 'all') {
    sub.textContent = 'All departments — click a department button to highlight one';
    trendChart.data.datasets = DEPTS.map((d,i) => ({
      label: d,
      data: trendNormalised
        ? DATA_STORE[d].map(v => DATA_STORE[d][0]>0 ? Math.round(v/DATA_STORE[d][0]*100) : 0)
        : DATA_STORE[d],
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: COLORS[i % COLORS.length],
      borderWidth: 2
    }));
    trendChart.options.scales.y.title = {
      display: trendNormalised,
      text: trendNormalised ? 'Index (Dec=100)' : '',
      color:'#5f6368'
    };
  } else {
    const i = trendMode;
    sub.textContent = `Showing ${DEPTS[i]} — 3-month performance`;
    trendChart.data.datasets = [{
      label: DEPTS[i],
      data: DATA_STORE[DEPTS[i]],
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: PALE[i % PALE.length],
      fill: true,
      tension: 0.4,
      pointRadius: 6,
      pointBackgroundColor: COLORS[i % COLORS.length],
      borderWidth: 3
    }];
    trendChart.options.scales.y.title = {display:false};
  }
  trendChart.data.labels = DATA_MONTHS;
  trendChart.update();
}
renderTrendChart();

// Growth chart — shows first vs last month
function getGrowthData() {
  // Compare period average/month vs 2025 annual average/month
  const ann25avg = DEPTS.map((d,i) =>
    MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0)/12);
  const keys = getActiveKeys();
  return DEPTS.map((d,i) => {
    const periodAvg = keys.length>0
      ? keys.reduce((s,m)=>s+(DATA_2025[m]?.[i]||0),0)/keys.length
      : 0;
    const base = ann25avg[i];
    return base>0 ? parseFloat(((periodAvg-base)/base*100).toFixed(1)) : 0;
  });
}

let growthChartObj = new Chart(C('growthChart'),{
  type:'bar',
  data:{
    labels:DEPTS,
    datasets:[{
      label:'% change vs 2025 annual avg',
      data:getGrowthData(),
      backgroundColor:getGrowthData().map(v=>v>=0?'#34a85388':'#ea433588'),
      borderRadius:4
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{display:false},
      datalabels:{
        anchor:'end',align:'end',
        formatter:v=>(v>=0?'+':'')+v+'%',
        color:ctx=>ctx.dataset.data[ctx.dataIndex]>=0?'#137333':'#c5221f',
        font:{size:10,weight:'600'}
      }
    },
    indexAxis:'y',
    scales:{
      x:{ticks:{color:tc(),callback:v=>v+'%'},grid:{color:gc()}},
      y:{ticks:{color:tc(),font:{size:10}},grid:{display:false}}
    },
    layout:{padding:{right:36}}
  },
  plugins:[ChartDataLabels]
});

// MoM Summary — revenue focused
function buildMomSummary() {
  const momDiv = document.getElementById('momSummary');
  if (!momDiv) return;
  const keys = getActiveKeys();
  const n = keys.length;
  const totals = keys.map(m => DEPTS.reduce((s,d,i)=>s+(DATA_2025[m]?.[i]||0),0));
  const totalRevenue = keys.reduce((s,m)=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return s+(MONTHLY_AMOUNT_2025[gi]||0);},0);
  const totalCMCHIS = keys.reduce((s,m)=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return s+(MONTHLY_APPROVED_2025[gi]||0);},0);
  const totalIKT    = keys.reduce((s,m)=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return s+(IKT_2025_APPROVED[gi]||0);},0);
  const last=totals[n-1]||0, prev=totals[n-2]||0;
  const mom=prev>0?((last-prev)/prev*100).toFixed(1):'—';
  const topDeptIdx=DEPTS.map((d,i)=>keys.reduce((s,m)=>s+(DATA_2025[m]?.[i]||0),0)).reduce((mi,v,i,a)=>v>a[mi]?i:mi,0);
  const periodLabel = activeFilter==='full'?'Full Year':activeFilter==='last3'?'Last 3 Mo':'Feb 2026';

  const rows=[
    {label:`${periodLabel} CMCHIS cases`,    val:totalCMCHIS.toLocaleString('en-IN'),  cls:''},
    {label:`${periodLabel} IKT cases`,        val:totalIKT.toLocaleString('en-IN'),     cls:''},
    {label:`Total patients covered`,           val:(totalCMCHIS+totalIKT).toLocaleString('en-IN'), cls:'trend-up'},
    {label:`CMCHIS revenue (period)`,          val:'₹'+(totalRevenue/100000).toFixed(1)+'L', cls:'trend-up'},
    {label:`Avg revenue/month`,                val:'₹'+(totalRevenue/100000/Math.max(n,1)).toFixed(1)+'L', cls:''},
    {label:`Highest volume dept`,              val:DEPTS[topDeptIdx]+' ('+keys.reduce((s,m)=>s+(DATA_2025[m]?.[topDeptIdx]||0),0)+')', cls:''},
  ];
  momDiv.innerHTML=rows.map(m=>`<div class="stat-row">
    <div class="stat-label">${m.label}</div>
    <div class="mc-trend ${m.cls}" style="font-size:13px;font-weight:600">${m.val}</div>
  </div>`).join('');
}
buildMomSummary();

// ── DEPT PAGE ──
const strip = document.getElementById('deptStrip');
DEPTS.forEach((d,i)=>{
  const t=document.createElement('div');
  t.className='strip-tab'+(i===0?' active':'');
  t.textContent=d;
  t.onclick=()=>{document.querySelectorAll('.strip-tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');showDept(i);};
  strip.appendChild(t);
});

function showDept(i){
  const keys = getActiveKeys();
  const periodCases = keys.reduce((s,m)=>s+(DATA_2025[m]?.[i]||0),0);
  const ann25 = MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0);
  const rate  = DEPT_REV_RATE[DEPTS[i]]||8000;
  const rev   = periodCases * rate;
  const peak  = Math.max(...MONTHS_2025.map(m=>DATA_2025[m][i]||0));
  const peakMonth = MONTHS_2025[MONTHS_2025.map(m=>DATA_2025[m][i]||0).indexOf(peak)];
  const jan26 = DATA_2025['Jan 2026'][i]||0;
  const feb26 = DATA_2025['Feb 2026'][i]||0;
  const periodLabel = activeFilter==='full'?'Full Year (Jan 2025–Feb 2026)':activeFilter==='last3'?'Last 3 Months':'Feb 2026';
  document.getElementById('deptDetail').innerHTML=`
    <div class="chart-card">
      <div class="chart-card-header">
        <div><div class="chart-title">${DEPTS[i]} — ${periodLabel}</div>
        <div class="chart-sub">Click bars to see monthly detail</div></div>
      </div>
      <div class="cards-grid" style="margin-bottom:0">
        <div class="metric-card mc-blue" onclick="showDrill('dept','${DEPTS[i]}')" style="cursor:pointer">
          <div class="mc-label">Period Cases</div><div class="mc-value">${periodCases}</div>
          <div class="mc-sub">${periodLabel}</div></div>
        <div class="metric-card mc-green" onclick="showDrill('annual-revenue')" style="cursor:pointer">
          <div class="mc-label">Est. Period Revenue</div>
          <div class="mc-value">₹${rev>=100000?(rev/100000).toFixed(1)+'L':Math.round(rev/1000)+'K'}</div>
          <div class="mc-sub">@ ₹${(rate/1000).toFixed(0)}K/case avg</div></div>
        <div class="metric-card mc-blue">
          <div class="mc-label">2025 Annual Total</div><div class="mc-value">${ann25}</div>
          <div class="mc-sub">avg ${Math.round(ann25/12)}/month</div></div>
        <div class="metric-card mc-green">
          <div class="mc-label">Peak Month</div><div class="mc-value">${peak}</div>
          <div class="mc-sub">${peakMonth}</div></div>
        <div class="metric-card mc-blue">
          <div class="mc-label">Jan 2026</div><div class="mc-value">${jan26}</div>
          <div class="mc-sub">${jan26>=(ann25/12)?'▲ Above avg':'▼ Below avg'}</div></div>
        <div class="metric-card mc-blue">
          <div class="mc-label">Feb 2026</div><div class="mc-value">${feb26}</div>
          <div class="mc-sub">${feb26>jan26?'▲ Growing':'▼ Flat'}</div></div>
      </div>
    </div>`;
}
showDept(0);

// Dept revenue chart (replaces denial chart)
const deptRevData = DEPTS.map((d,i)=>{
  const ann=MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0);
  return ann*(DEPT_REV_RATE[d]||8000);
});
let deptDenialChart = new Chart(C('deptDenialChart'),{
  type:'bar',
  data:{labels:DEPTS, datasets:[{
    label:'Est. Annual Revenue 2025 (₹)',
    data:deptRevData,
    backgroundColor:COLORS.map(c=>c+'aa'),
    borderRadius:4
  }]},
  options:{
    responsive:true,maintainAspectRatio:false,
    onClick:(e,els)=>{if(els.length) showDrill('dept',DEPTS[els[0].index]);},
    plugins:{
      legend:{display:false},
      datalabels:{anchor:'end',align:'end',
        formatter:v=>'₹'+(v/100000).toFixed(0)+'L',
        color:'#3c4043',font:{size:10,weight:'600'}}
    },
    scales:{
      x:{ticks:{color:tc(),font:{size:10}},grid:{color:gc()}},
      y:{ticks:{color:tc(),callback:v=>'₹'+(v/100000).toFixed(0)+'L'},grid:{color:gc()},
        title:{display:true,text:'Est. Revenue (₹ Lakhs)',color:'#5f6368'}}
    },
    layout:{padding:{top:20}}
  },
  plugins:[ChartDataLabels]
});

const annualDeptAmts = DEPTS.map((d,i) => MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0) * (DEPT_REV_RATE[d]||8000));
let deptAmtAllChartObj = new Chart(C('deptAmtAllChart'),{
  type:'bar',
  data:{labels:DEPTS, datasets:[
    {label:'Est. Annual Revenue 2025 ₹', data:annualDeptAmts, backgroundColor:COLORS.map(c=>c+'77'), borderRadius:4}
  ]},
  options:{responsive:true,maintainAspectRatio:false,
    onClick:(e,els)=>{if(els.length) showDrill('dept',DEPTS[els[0].index]);},
    plugins:{legend:{labels:{color:'#5f6368'}},datalabels:{display:false}},
    scales:{x:{ticks:{color:tc(),font:{size:11}},grid:{color:gc()}},
            y:{ticks:{color:tc(),callback:v=>'₹'+(v/100000).toFixed(1)+'L'},grid:{color:gc()}}}}
});

// ── IKT PAGE — 2025 Full Year ──
new Chart(C('iktCompare'),{
  type:'bar',
  data:{
    labels:['CMCHIS Core 2025','IKT 2025','Colposcopy 2025'],
    datasets:[
      {label:'Applied',data:[1860,2081,600],backgroundColor:'#1a73e844',borderRadius:4},
      {label:'Approved',data:[1588,1848,594],backgroundColor:'#34a85388',borderRadius:4},
      {label:'Denied',data:[272,233,6],backgroundColor:'#ea433588',borderRadius:4},
    ]
  },
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}}},scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc()},grid:{color:gc()}}}}
});

new Chart(C('iktTrend'),{
  type:'bar',
  data:{labels:IKT_2025_MONTHS,datasets:[
    {label:'Applied',data:IKT_2025_APPLIED,backgroundColor:'#1a73e844',borderRadius:4},
    {label:'Approved',data:IKT_2025_APPROVED,backgroundColor:'#34a85388',borderRadius:4},
    {label:'Denied',data:IKT_2025_DENIED,backgroundColor:'#ea433588',borderRadius:4},
  ]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#5f6368'}}},scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc()},grid:{color:gc()}}}}
});

// IKT Approval Rate trend
new Chart(C('iktApprovalRate'),{
  type:'line',
  data:{
    labels:IKT_2025_MONTHS,
    datasets:[{
      label:'IKT Approval Rate %',
      data:IKT_2025_MONTHS.map((_,i)=>Math.round(IKT_2025_APPROVED[i]/IKT_2025_APPLIED[i]*1000)/10),
      borderColor:'#34a853',backgroundColor:'#34a85320',fill:true,tension:0.4,
      pointBackgroundColor:'#34a853',pointRadius:5,borderWidth:2.5
    },{
      label:'Target 90%',
      data:IKT_2025_MONTHS.map(()=>90),
      borderColor:'#1a73e8',borderDash:[6,4],borderWidth:1.5,pointRadius:0,
      backgroundColor:'transparent',fill:false
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{
      legend:{labels:{color:'#5f6368',font:{size:11}}},
      datalabels:{display:true,formatter:(v,ctx)=>ctx.datasetIndex===0?v+'%':'',
        color:'#137333',font:{size:10,weight:'600'},anchor:'top',align:'top'}
    },
    scales:{
      x:{ticks:{color:tc()},grid:{color:gc()}},
      y:{min:60,max:100,ticks:{color:tc(),callback:v=>v+'%'},grid:{color:gc()}}
    }
  },
  plugins:[ChartDataLabels]
});

// ── COLPOSCOPY PAGE — charts built by buildDoctorPage() called from initAll ──
// avatarColors needed by both colpo and IKT doctor sections
const avatarColors=['#1a73e8','#34a853','#ea4335','#fbbc04','#9c27b0','#00bcd4','#ff5722','#607d8b'];

// CMCHIS Doctor chart — only built once via buildDoctorPage() in initAll
// IKT Doctor chart  — only built once via buildDoctorPage() in initAll
// Both use safeChart() inside buildDoctorPage so no duplicate init here

// ── ANNUAL REPORT PAGE ──
// Build annual table
const annTbody=document.getElementById('annualTableBody');
if(annTbody) {
  const mArr=MONTHLY_APPLIED_2025;
  const apArr=MONTHLY_APPROVED_2025;
  const dnArr=MONTHLY_DENIED_2025;
  const amtArr=MONTHLY_AMOUNT_2025;
  const mLabels=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan 26','Feb 26'];
  annTbody.innerHTML=mLabels.map((m,i)=>{
    const rate=(MONTHLY_APPROVED_2025[i]/(MONTHLY_APPLIED_2025[i]||1)*100).toFixed(1);
    const rateNum=parseFloat(rate);
    const is26 = i >= 12;
    const status=rateNum>=90?'<span class="badge badge-green">GOOD</span>':rateNum>=80?'<span class="badge badge-yellow">MONITOR</span>':'<span class="badge badge-red">REVIEW</span>';
    const amtL=(MONTHLY_AMOUNT_2025[i]/100000).toFixed(1);
    return `<tr style="${is26?'background:var(--blue-light)':''}" onclick="showDrill('approval-rate')">
      <td><strong>${m}</strong>${is26?'<span style="font-size:10px;color:var(--blue);margin-left:6px">2026</span>':''}</td>
      <td>${MONTHLY_APPLIED_2025[i]}</td>
      <td style="color:var(--green-dark);font-weight:600">${MONTHLY_APPROVED_2025[i]}</td>
      <td style="color:${MONTHLY_DENIED_2025[i]>20?'var(--red)':'var(--grey8)'}">${MONTHLY_DENIED_2025[i]}</td>
      <td>₹${amtL}L</td>
      <td style="font-weight:600;color:${rateNum>=90?'var(--green-dark)':rateNum>=80?'var(--yellow-dark)':'var(--red)'}">${rate}%</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
  // Footer totals
  const totApp=mArr.reduce((a,b)=>a+b,0);
  const totAppr=apArr.reduce((a,b)=>a+b,0);
  const totDen=dnArr.reduce((a,b)=>a+b,0);
  const totAmt=amtArr.reduce((a,b)=>a+b,0);
  const annRate=(totAppr/totApp*100).toFixed(1);
  document.getElementById('annualTableFoot').innerHTML=`<tr style="background:var(--grey1);font-weight:700">
    <td>TOTAL 2025</td><td>${totApp}</td>
    <td style="color:var(--green-dark)">${totAppr}</td>
    <td style="color:var(--red)">${totDen}</td>
    <td>₹${(totAmt/100000).toFixed(1)}L</td>
    <td style="color:var(--green-dark)">${annRate}%</td>
    <td><span class="badge badge-green">ANNUAL</span></td>
  </tr>`;
}

// Annual Volume Chart (14 months)
if(C('annualVolumeChart')) {
  new Chart(C('annualVolumeChart'),{
    type:'bar',
    data:{
      labels:ALL_MONTHS_LABELS,
      datasets:[
        {label:'Applied',data:MONTHLY_APPLIED_2025,backgroundColor:ALL_MONTHS_LABELS.map((_,i)=>i<12?'#1a73e844':'#1a73e8bb'),borderRadius:4},
        {label:'Approved',data:MONTHLY_APPROVED_2025,backgroundColor:ALL_MONTHS_LABELS.map((_,i)=>i<12?'#34a85388':'#34a853cc'),borderRadius:4},
        {label:'Denied',data:MONTHLY_DENIED_2025,backgroundColor:ALL_MONTHS_LABELS.map((_,i)=>i<12?'#ea433566':'#ea4335aa'),borderRadius:4},
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,
      onClick:(e,el)=>{if(el.length){const i=el[0].index;showDrill('month',ALL_MONTHS_KEYS[i]);}},
      plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}}},
      scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc()},grid:{color:gc()},beginAtZero:true}}}
  });
}

// Annual Rate Chart (14 months)
if(C('annualRateChart')) {
  const rates=MONTHLY_APPROVED_2025.map((a,i)=>parseFloat((a/Math.max(MONTHLY_APPLIED_2025[i],1)*100).toFixed(1)));
  new Chart(C('annualRateChart'),{
    type:'line',
    data:{
      labels:ALL_MONTHS_LABELS,
      datasets:[{
        label:'Approval Rate %',data:rates,
        borderColor:'#1a73e8',backgroundColor:'#1a73e820',fill:true,tension:0.4,
        pointBackgroundColor:rates.map(r=>r<80?'#ea4335':r<90?'#fbbc04':'#34a853'),
        pointRadius:5,borderWidth:2.5
      },{
        label:'85% target',data:Array(rates.length).fill(85),
        borderColor:'#34a853',borderDash:[6,4],borderWidth:1.5,pointRadius:0,backgroundColor:'transparent',fill:false
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      onClick:(e,el)=>{if(el.length) showDrill('month',ALL_MONTHS_KEYS[el[0].index]);},
      plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},
        datalabels:{display:true,formatter:(v,ctx)=>ctx.datasetIndex===0?v+'%':'',
          color:ctx=>ctx.dataset.data[ctx.dataIndex]<80?'#c5221f':ctx.dataset.data[ctx.dataIndex]<90?'#f29900':'#137333',
          font:{size:10,weight:'600'},anchor:'top',align:'top'}},
      scales:{x:{ticks:{color:tc()},grid:{color:gc()}},
        y:{min:55,max:100,ticks:{color:tc(),callback:v=>v+'%'},grid:{color:gc()}}}
    },
    plugins:[ChartDataLabels]
  });
}

// Annual Amount Chart
if(C('annualAmtChart')) {
  new Chart(C('annualAmtChart'),{
    type:'bar',
    data:{
      labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets:[{
        label:'Approved Revenue (₹)',
        data:MONTHLY_AMOUNT_2025,
        backgroundColor:MONTHLY_AMOUNT_2025.map(v=>v>900000?'#1a73e8aa':v>700000?'#34a853aa':'#fbbc04aa'),
        borderRadius:6
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        datalabels:{display:true,anchor:'end',align:'top',
          formatter:v=>'₹'+(v/100000).toFixed(1)+'L',
          color:'#3c4043',font:{size:10,weight:'600'}}},
      scales:{x:{ticks:{color:tc()},grid:{color:gc()}},
        y:{ticks:{color:tc(),callback:v=>'₹'+(v/100000).toFixed(1)+'L'},grid:{color:gc()},beginAtZero:true}}
    },
    plugins:[ChartDataLabels]
  });
}

// Annual Department totals chart
if(C('annualDeptChart')) {
  const deptTotals=DEPTS.map((d,i)=>MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0));
  new Chart(C('annualDeptChart'),{
    type:'bar',
    data:{
      labels:DEPTS,
      datasets:[{
        label:'Total Approved Cases 2025',
        data:deptTotals,
        backgroundColor:COLORS.map(c=>c+'aa'),
        borderRadius:4
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},
        datalabels:{display:true,anchor:'end',align:'top',
          formatter:v=>v,color:'#3c4043',font:{size:11,weight:'600'}}},
      scales:{x:{ticks:{color:tc(),font:{size:11}},grid:{color:gc()}},
        y:{ticks:{color:tc()},grid:{color:gc()},beginAtZero:true}}
    },
    plugins:[ChartDataLabels]
  });
}

// Seasonal chart - Poisoning vs Dialysis
if(C('seasonalChart')) {
  const poisonIdx=DEPTS.indexOf('POISONING');
  const dialIdx=DEPTS.indexOf('DIALYSIS');
  new Chart(C('seasonalChart'),{
    type:'line',
    data:{
      labels:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
      datasets:[{
        label:'Poisoning/Snake Bite',
        data:MONTHS_2025.map(m=>DATA_2025[m][poisonIdx]||0),
        borderColor:'#ea4335',backgroundColor:'#ea433520',fill:true,tension:0.4,
        pointBackgroundColor:'#ea4335',pointRadius:5,borderWidth:2.5
      },{
        label:'Dialysis',
        data:MONTHS_2025.map(m=>DATA_2025[m][dialIdx]||0),
        borderColor:'#1a73e8',backgroundColor:'#1a73e820',fill:true,tension:0.4,
        pointBackgroundColor:'#1a73e8',pointRadius:5,borderWidth:2.5
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}}},
      scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc()},grid:{color:gc()},beginAtZero:true}}}
  });
}

// Annual Milestones
const annualMs=document.getElementById('annualMilestones');
if(annualMs) {
  const milestones=[
    {icon:'🏆',text:'May 2025 — Peak month: 195 IKT applied, 178 approved (91.3%)',color:'var(--green-dark)'},
    {icon:'⚠️',text:'Jan 2025 — IKT crisis: 52 denied (26.9%) → triggered process reform',color:'var(--red)'},
    {icon:'🌧️',text:'Jun–Jul 2025 — Monsoon surge: 80+ poisoning cases/month; 38 CMCHIS denials',color:'var(--yellow-dark)'},
    {icon:'📉',text:'Sep 2025 — Post-monsoon dip: Lowest CMCHIS approved month (120 cases)',color:'var(--yellow-dark)'},
    {icon:'📈',text:'Nov 2025 — ORTHO best month: 28 cases approved; GS strong at 26',color:'var(--blue)'},
    {icon:'✅',text:'Dec 2025 — Year-end: 85.4% overall approval rate achieved',color:'var(--green-dark)'},
    {icon:'💰',text:'Annual Revenue: ₹90.1L CMCHIS + ~₹8.9L Colposcopy = ₹99L+ total',color:'var(--blue)'},
  ];
  annualMs.innerHTML=milestones.map(m=>`
    <div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--grey3)">
      <div style="font-size:18px;flex-shrink:0">${m.icon}</div>
      <div style="font-size:13px;color:${m.color};line-height:1.5">${m.text}</div>
    </div>`).join('');
}

// ══════════════════ COVERAGE PAGE ══════════════════

// Funnel builder
function buildFunnel(containerId, stages) {
  const el = document.getElementById(containerId);
  const max = stages[0].val;
  el.innerHTML = stages.map(s => `
    <div class="funnel-stage">
      <div class="funnel-label">${s.label}</div>
      <div class="funnel-bar-wrap">
        <div class="funnel-fill" style="width:${(s.val/max*100).toFixed(1)}%;background:${s.color}">${s.pct}</div>
      </div>
      <div class="funnel-val">${s.val}</div>
    </div>
  `).join('');
}

buildFunnel('funnelCurrent', [
  {label:'Emergency Admissions',val:420,pct:'100%',color:'#1a73e8'},
  {label:'IKT Eligible (est.)',val:390,pct:'92.9%',color:'#1a73e8'},
  {label:'Actually Applied',val:361,pct:'86.0%',color:'#fbbc04'},
  {label:'Passed Documentation',val:310,pct:'73.8%',color:'#fbbc04'},
  {label:'Approved & Disbursed',val:269,pct:'64.0%',color:'#34a853'},
]);

buildFunnel('funnelTarget', [
  {label:'Emergency Admissions',val:420,pct:'100%',color:'#1a73e8'},
  {label:'IKT Eligible (est.)',val:400,pct:'95.2%',color:'#1a73e8'},
  {label:'Actually Applied',val:390,pct:'92.9%',color:'#34a853'},
  {label:'Passed Documentation',val:375,pct:'89.3%',color:'#34a853'},
  {label:'Approved & Disbursed',val:360,pct:'≥90%',color:'#137333'},
]);

// KPI Targets
const kpiData = [
  {name:'IKT Approval Rate',current:'74.8%',target:'≥90%',by:'Jun 2026'},
  {name:'IKT Applications / Month',current:'180',target:'≥220',by:'Jun 2026'},
  {name:'Denial Rate',current:'25.2%',target:'<10%',by:'May 2026'},
  {name:'Pre-Auth Compliance',current:'0%',target:'100%',by:'Apr 2026'},
  {name:'Doc Completeness at Admission',current:'~60%',target:'≥95%',by:'Apr 2026'},
  {name:'FIR Linkage for Road Accidents',current:'Unknown',target:'100%',by:'Mar 2026'},
];
document.getElementById('kpiTargetList').innerHTML = kpiData.map(k=>`
  <div class="kpi-target-row">
    <div class="kpi-current">${k.current}</div>
    <div class="kpi-arrow">→</div>
    <div class="kpi-target-val">${k.target}</div>
    <div class="kpi-name">${k.name}</div>
    <div class="kpi-by">by ${k.by}</div>
  </div>`).join('');

// Impact Chart
new Chart(C('impactChart'),{
  type:'bar',
  data:{
    labels:['Current\n(74.8%)','80%','85%','90%','95%'],
    datasets:[{
      label:'Additional beneficiaries gained',
      data:[0,19,37,56,74],
      backgroundColor:['#ea433577','#fbbc0477','#fbbc0477','#34a85377','#137333aa'],
      borderRadius:6
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},tooltip:{callbacks:{label:v=>`+${v.raw} more beneficiaries/month`}}},
    scales:{x:{ticks:{color:tc()},grid:{color:gc()}},y:{ticks:{color:tc()},grid:{color:gc()},title:{display:true,text:'Additional beneficiaries',color:'#5f6368'}}}}
});

// 10 Coverage Actions
const coverageActionsData = [
  {n:1,title:'Audit all 92 denied IKT claims',desc:'Categorise each denial by code (timing, ID, package, duplicate, FIR). This single action will reveal the 2–3 root causes driving 80% of denials.',impact:'High',owner:'CMCHIS Desk Officer',time:'March Week 1'},
  {n:2,title:'Create FIR-linkage SOP at casualty',desc:'Road accident IKT claims require MLC/FIR from police. Establish a protocol where the casualty nurse collects MLC reference at admission — before the patient is shifted to ward.',impact:'High',owner:'Casualty MO, Police Liaison',time:'March Week 2'},
  {n:3,title:'Aadhaar capture at casualty gate',desc:'Denied Aadhaar mismatches happen because ID is collected hours after admission. Move Aadhaar capture to the point of registration — before any treatment begins.',impact:'High',owner:'Hospital Registrar',time:'March Week 1'},
  {n:4,title:'Deploy IKT pre-authorisation check',desc:'Before any IKT-eligible procedure, the CMCHIS desk officer must confirm eligibility. 5 minutes pre-procedure saves 92 post-procedure denials.',impact:'High',owner:'CMCHIS Desk Officer',time:'April Week 1'},
  {n:5,title:'Package code matrix — laminated chart',desc:'Create a laminated A3 sheet of all IKT-approved procedure codes, placed at the CMCHIS desk and each ward nurses\u2019 station. Wrong codes are the second-most common denial reason.',impact:'High',owner:'CMCHIS Coordinator',time:'March Week 3'},
  {n:6,title:'Re-submit all appellable Jan–Feb denials',desc:'Denied patients who were actually eligible can be re-submitted within the appeal window. A legal/insurance desk review of the 92 denials may recover 20–30 cases (~₹3–5L).',impact:'Medium',owner:'Medical Superintendent',time:'March Week 2'},
  {n:7,title:'108 Ambulance crew IKT awareness',desc:'Many eligible road accident patients don\u2019t know about IKT. Train 108 crew to inform patients on the way to hospital and ensure hospital is briefed before arrival.',impact:'Medium',owner:'108 District Coordinator',time:'April'},
  {n:8,title:'48-hour window awareness at police stations',desc:'Distribute IKT awareness pamphlets at the 3 major Mayiladuthurai police stations. Officers handling road accident cases should know to direct victims to MGH within 48 hours.',impact:'Medium',owner:'Collector\u2019s Office',time:'April'},
  {n:9,title:'Daily denied claim morning review',desc:'Every morning, the CMCHIS desk officer reviews the previous day\u2019s denials (if any) and flags for same-day resolution — before the 48-hour re-submission window lapses.',impact:'Medium',owner:'CMCHIS Desk Officer',time:'Ongoing'},
  {n:10,title:'Monthly IKT coverage performance card',desc:'Produce a 1-page IKT performance card each month: applications, approvals, denials, amount disbursed, top denial reason. Share with Superintendent and District Collector.',impact:'Low',owner:'Hospital Administrator',time:'Monthly'},
];
document.getElementById('coverageActions').innerHTML = coverageActionsData.map(a=>`
  <div class="target-card">
    <div class="tc-num">${a.n}</div>
    <div class="tc-body">
      <div class="tc-title">${a.title}</div>
      <div class="tc-desc">${a.desc}</div>
      <div class="tc-meta">
        <span class="tc-pill tc-impact">${a.impact} Impact</span>
        <span class="tc-pill tc-owner">Owner: ${a.owner}</span>
        <span class="tc-pill tc-time">⏱ ${a.time}</span>
      </div>
    </div>
  </div>`).join('');

// ══════════════════ IKT DEEP-DIVE PAGE ══════════════════

// Denial reasons
const drData = [
  {label:'Timing gap (>48h from incident)',count:28,pct:30},
  {label:'Aadhaar mismatch / absent',count:20,pct:22},
  {label:'Wrong procedure code',count:16,pct:17},
  {label:'FIR / MLC not registered',count:14,pct:15},
  {label:'Duplicate claim',count:8,pct:9},
  {label:'Non-IKT procedure performed',count:6,pct:7},
];
document.getElementById('denialReasons').innerHTML = drData.map(d=>`
  <div class="denial-reason-bar">
    <div class="dr-label">${d.label}</div>
    <div class="dr-bar-wrap"><div class="dr-fill" style="width:${d.pct}%"></div></div>
    <div class="dr-count">~${d.count} cases (${d.pct}%)</div>
  </div>`).join('');

// Denial Benchmark Chart
new Chart(C('denialBenchmark'),{
  type:'bar',
  data:{
    labels:['CMCHIS Core','Colposcopy','OAE Screening','IKT Scheme'],
    datasets:[{
      label:'Denial Rate %',
      data:[3.1,1.0,17.1,25.2],
      backgroundColor:['#34a85388','#34a85388','#fbbc0488','#ea433588'],
      borderRadius:6
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    scales:{x:{ticks:{color:tc()},grid:{color:gc()}},
      y:{ticks:{color:tc(),callback:v=>v+'%'},grid:{color:gc()},
        title:{display:true,text:'Denial Rate (%)',color:'#5f6368'}}}}
});

// Pre-submission checklist
const presubItems = [
  {text:'Confirm incident is road accident or fire/burn injury',dept:'Casualty'},
  {text:'Verify incident timestamp — must be within 48 hours of first presentation',dept:'Casualty'},
  {text:'Collect and scan Aadhaar / Govt ID at point of registration',dept:'Registration Counter'},
  {text:'Obtain MLC number and police station reference for road accidents',dept:'Casualty MO'},
  {text:'Confirm patient\'s phone number and address match ID',dept:'Registration Counter'},
  {text:'Select correct IKT procedure package code from approved list',dept:'CMCHIS Desk Officer'},
  {text:'Check for duplicate applications — search patient name in CMCHIS portal',dept:'CMCHIS Desk Officer'},
  {text:'Get treating doctor\'s signature on IKT claim form before submission',dept:'Ward Doctor'},
  {text:'Upload all documents: ID proof, MLC/FIR copy, discharge summary, bills',dept:'CMCHIS Desk Officer'},
  {text:'Submit claim within 24 hours of discharge — do not batch-submit weekly',dept:'CMCHIS Desk Officer'},
];
document.getElementById('presubList').innerHTML = presubItems.map((item,i)=>`
  <div class="checklist-item">
    <div class="ci-num">${i+1}</div>
    <div class="ci-text">${item.text}<div class="ci-dept">${item.dept}</div></div>
  </div>`).join('');

// IKT Trajectory Chart
new Chart(C('iktTrajectory'),{
  type:'line',
  data:{
    labels:['Jan 25','Feb 25','Mar 25','Apr 25','May 25','Jun 25','Jul 25','Aug 25','Sep 25','Oct 25','Nov 25','Dec 25','Jan 26','Jun 26'],
    datasets:[
      {label:'Actual Approval % 2025',
       data:IKT_2025_MONTHS.map((_,i)=>Math.round(IKT_2025_APPROVED[i]/IKT_2025_APPLIED[i]*1000)/10).concat([null,null]),
       borderColor:'#ea4335',backgroundColor:'#ea433520',fill:true,tension:0.3,pointRadius:5,pointBackgroundColor:'#ea4335',borderWidth:2},
      {label:'Target Trajectory',data:[null,null,null,null,null,null,null,null,null,null,null,null,90,95],
       borderColor:'#34a853',backgroundColor:'transparent',borderDash:[6,4],tension:0.3,pointRadius:5,pointBackgroundColor:'#34a853',borderWidth:2},
      {label:'90% Goal Line',data:Array(14).fill(90),
       borderColor:'#1a73e8',backgroundColor:'transparent',borderDash:[3,3],borderWidth:1,pointRadius:0},
    ]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}}},
    scales:{x:{ticks:{color:tc()},grid:{color:gc()}},
      y:{ticks:{color:tc(),callback:v=>v+'%'},grid:{color:gc()},min:60,max:100,
        title:{display:true,text:'IKT Approval Rate (%)',color:'#5f6368'}}}}
});

// ══════════════════ SEARCH ══════════════════
function handleSearch(val) {
  if(!val) return;
  const v=val.toLowerCase();
  const dept=DEPTS.findIndex(d=>d.toLowerCase().includes(v));
  if(dept>=0){showPage('deptpage',document.querySelectorAll('.nav-item')[3]);showDept(dept);}
}

// ══════════════════ FILTER SUGGESTIONS ══════════════════
function filterSug(priority, el) {
  document.querySelectorAll('.actions .chip').forEach(c=>c.classList.remove('active')); el.classList.add('active');
  document.querySelectorAll('.sug-card').forEach(c=>{
    c.style.display=(priority==='all'||c.dataset.priority===priority)?'flex':'none';
  });
}

// ══════════════════ EXPORT CSV ══════════════════
function exportCSV() {
  const rows=[['Department','Applied 2025','Approved 2025','Denial Rate %',
    'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']];
  DEPTS.forEach((d,i)=>{
    const totApp = MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0);
    const totApplied = MONTHLY_APPLIED_2025.reduce((a,b)=>a+b,0);
    const denRate = totApplied>0?(((totApplied-totApp)/totApplied)*100).toFixed(1):0;
    const monthly = MONTHS_2025.map(m=>(DATA_2025[m][i]||0));
    rows.push([d,totApplied,totApp,denRate,...monthly]);
  });
  const csv=rows.map(r=>r.join(',')).join('\n');
  const a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download='CMCHIS_2025_Annual_Export.csv';
  a.click();
}

// ══════════════════ REVENUE GROWTH PAGE ══════════════════

// Benchmark Chart
new Chart(C('benchmarkChart'),{
  type:'bar',
  data:{
    labels:['Rajaji GH\nMadurai','GH Tirunelveli','MKMC GH\nSalem','DH Nagapattinam','DH Cuddalore','MGH\nMayiladuthurai'],
    datasets:[{
      label:'Monthly CMCHIS Revenue (₹ Lakhs)',
      data:[61.2,47.8,39.5,32.1,28.6,20.7],
      backgroundColor:['#34a85388','#34a85388','#34a85388','#fbbc0488','#fbbc0488','#1a73e8cc'],
      borderColor:['#34a853','#34a853','#34a853','#fbbc04','#fbbc04','#1a73e8'],
      borderWidth:2,borderRadius:6
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false},
      annotation:{annotations:{target:{type:'line',yMin:40,yMax:40,borderColor:'#1a73e8',borderWidth:2,borderDash:[6,4],label:{content:'12-Month Target: ₹40L',display:true,color:'#1a73e8',font:{size:11}}}}}},
    scales:{x:{ticks:{color:tc(),font:{size:11}},grid:{color:gc()}},
      y:{ticks:{color:tc(),callback:v=>'₹'+v+'L'},grid:{color:gc()},
        title:{display:true,text:'Monthly Revenue (₹ Lakhs)',color:'#5f6368'}}}}
});

// Gap Analysis Chart
new Chart(C('gapChart'),{
  type:'doughnut',
  data:{
    labels:['IKT Denial Loss','Missing Specialties','Low Bed Utilisation','Pending Packages'],
    datasets:[{
      data:[32,41,18,9],
      backgroundColor:['#ea433588','#1a73e888','#fbbc0488','#34a85388'],
      borderColor:['#ea4335','#1a73e8','#fbbc04','#34a853'],
      borderWidth:2
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{position:'bottom',labels:{color:'#5f6368',font:{size:11},padding:12}}}}
});

// Approval Rate Compare Chart
new Chart(C('approvalCompare'),{
  type:'bar',
  data:{
    labels:['Rajaji GH','Tirunelveli','Salem','Nagapattinam','Cuddalore','MGH\nMayiladuthurai'],
    datasets:[{
      label:'Approval Rate %',
      data:[97,96,95,93,91,74.8],
      backgroundColor:['#34a85388','#34a85388','#34a85388','#fbbc0488','#fbbc0488','#ea433588'],
      borderColor:['#34a853','#34a853','#34a853','#fbbc04','#fbbc04','#ea4335'],
      borderWidth:2,borderRadius:6
    }]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    scales:{x:{ticks:{color:tc(),font:{size:10}},grid:{display:false}},
      y:{ticks:{color:tc(),callback:v=>v+'%'},grid:{color:gc()},min:60,max:100,
        title:{display:true,text:'Approval Rate (%)',color:'#5f6368'}}}}
});

// Revenue Trajectory Chart
new Chart(C('revTrajectory'),{
  type:'line',
  data:{
    labels:['Jan 26','Feb 26','Mar 26','Apr 26','May 26','Jun 26','Jul 26','Aug 26','Sep 26','Oct 26','Nov 26','Dec 26'],
    datasets:[
      {label:'Actual Revenue',data:[20.6,20.9,null,null,null,null,null,null,null,null,null,null],
        borderColor:'#1a73e8',backgroundColor:'#1a73e820',fill:true,tension:0.3,
        pointRadius:6,pointBackgroundColor:'#1a73e8',borderWidth:2},
      {label:'Growth Target (All Levers)',data:[20.6,20.9,25.5,29.0,32.5,35.0,36.5,37.5,38.5,39.0,39.5,40.2],
        borderColor:'#34a853',backgroundColor:'transparent',borderDash:[6,4],
        tension:0.3,pointRadius:4,pointBackgroundColor:'#34a853',borderWidth:2},
      {label:'Conservative Path (Levers 1+6 only)',data:[20.6,20.9,24.0,25.5,26.5,27.0,27.5,28.0,28.5,29.0,29.5,30.0],
        borderColor:'#fbbc04',backgroundColor:'transparent',borderDash:[3,3],
        tension:0.3,pointRadius:3,pointBackgroundColor:'#fbbc04',borderWidth:1.5},
      {label:'₹40L Target Line',data:[40,40,40,40,40,40,40,40,40,40,40,40],
        borderColor:'#ea4335',backgroundColor:'transparent',borderDash:[4,4],
        borderWidth:1,pointRadius:0},
    ]
  },
  options:{responsive:true,maintainAspectRatio:false,
    plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}}},
    scales:{x:{ticks:{color:tc()},grid:{color:gc()}},
      y:{ticks:{color:tc(),callback:v=>'₹'+v+'L'},grid:{color:gc()},min:15,max:45,
        title:{display:true,text:'Monthly Revenue (₹ Lakhs)',color:'#5f6368'}}}}
});

// High-Value Package Catalog
const pkgData = [
  {dept:'Cardiology',name:'Coronary Angioplasty (PTCA)',rate:'₹1.5–2.5L',vol:'2–5 cases/month potential',status:'missing'},
  {dept:'Cardiology',name:'Coronary Artery Bypass (CABG)',rate:'₹2–4L',vol:'1–2 cases/month potential',status:'missing'},
  {dept:'Urology',name:'PCNL (Kidney Stone)',rate:'₹40–60K',vol:'8–12 cases/month potential',status:'missing'},
  {dept:'Urology',name:'URS & Stone Extraction',rate:'₹25–40K',vol:'10–15 cases/month potential',status:'missing'},
  {dept:'Ophthalmology',name:'Cataract (PHACO)',rate:'₹12–18K',vol:'15–25 cases/month potential',status:'partial'},
  {dept:'Ophthalmology',name:'Vitreo-Retinal Surgery',rate:'₹30–50K',vol:'3–5 cases/month potential',status:'missing'},
  {dept:'Orthopaedics',name:'Total Knee Replacement',rate:'₹1.2–1.8L',vol:'3–5 cases/month potential',status:'partial'},
  {dept:'Orthopaedics',name:'Total Hip Replacement',rate:'₹1.2–1.8L',vol:'2–4 cases/month potential',status:'missing'},
  {dept:'Neurosurgery',name:'Craniotomy / Brain Tumour',rate:'₹80K–2L',vol:'1–2 cases/month potential',status:'missing'},
  {dept:'General Surgery',name:'Laparoscopic Cholecystectomy',rate:'₹15–25K',vol:'10–15 cases/month',status:'active'},
  {dept:'Dialysis',name:'Haemodialysis (per session)',rate:'₹800–1,200',vol:'65–75 sessions/month',status:'active'},
  {dept:'ENT',name:'Cochlear Implant',rate:'₹5–8L',vol:'1 case/6 months potential',status:'missing'},
];
document.getElementById('pkgGrid').innerHTML = pkgData.map(p=>`
  <div class="pkg-card">
    <div class="pkg-dept">${p.dept}</div>
    <div class="pkg-name">${p.name}</div>
    <div class="pkg-rate">${p.rate}</div>
    <div class="pkg-range">per case · CMCHIS package rate</div>
    <div class="pkg-vol">${p.vol}</div>
    <span class="pkg-status ${p.status==='missing'?'pkg-missing':p.status==='partial'?'pkg-partial':'pkg-active'}">
      ${p.status==='missing'?'❌ Not Active':p.status==='partial'?'⚡ Partial / Ramp Up':'✅ Active'}
    </span>
  </div>`).join('');

// ══════════════════════════════════════════════
// ═══════════  IMPORT ENGINE  ═════════════════
// ══════════════════════════════════════════════

// Mutable per-month detailed data (Applied, Denied, Amount per dept per month)
// Populated from 2025 XLS data + the DETAIL_STORE already seeded above in TRENDS section

// Now that both DATA_STORE and DETAIL_STORE are ready, seed overview KPIs
refreshOverviewKPIs();

let importHistory = [];
let pendingImportRows = null;

// ─── Modal helpers ───
function openImport() {
  document.getElementById('importModal').classList.add('open');
  pendingImportRows = null;
  document.getElementById('importApplyBtn').disabled = true;
  document.getElementById('importApplyBtn').style.opacity = '.5';
  document.getElementById('fileStatus').style.display='none';
  document.getElementById('pasteStatus').style.display='none';
  document.getElementById('filePreview').style.display='none';
  document.getElementById('pastePreview').style.display='none';
}
function closeImport() {
  document.getElementById('importModal').classList.remove('open');
}
document.getElementById('importModal').addEventListener('click', e=>{
  if(e.target === document.getElementById('importModal')) closeImport();
});

function switchImportTab(name, el) {
  document.querySelectorAll('.import-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.import-panel').forEach(p=>p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('ipanel-'+name).classList.add('active');
}

// ─── CSV parser ───
function parseMonthLabel(raw) {
  if(!raw) return null;
  raw = raw.trim();
  // Formats: Mar-26, Mar 26, March 2026, March-26, Mar-2026, 2026-03
  const short = {jan:'Jan',feb:'Feb',mar:'Mar',apr:'Apr',may:'May',jun:'Jun',
                  jul:'Jul',aug:'Aug',sep:'Sep',oct:'Oct',nov:'Nov',dec:'Dec'};
  const longMap = {january:'Jan',february:'Feb',march:'Mar',april:'Apr',may:'May',june:'Jun',
                   july:'Jul',august:'Aug',september:'Sep',october:'Oct',november:'Nov',december:'Dec'};
  let m='', y='';
  // Try YYYY-MM
  let match = raw.match(/^(\d{4})-(\d{2})$/);
  if(match){ y=match[1]; const mm=parseInt(match[2]); const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; m=months[mm-1]||''; }
  if(!m){
    match = raw.match(/^([A-Za-z]+)[\s\-]+(\d{2,4})$/);
    if(match){
      const mraw=match[1].toLowerCase();
      m = short[mraw.slice(0,3)] || longMap[mraw] || '';
      y = match[2].length===2 ? '20'+match[2] : match[2];
    }
  }
  if(!m) return null;
  return m+' '+y;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l=>l.trim());
  if(lines.length < 2) return {error:'Need at least a header row and one data row'};
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/\s+/g,''));
  const reqFields = ['department','month','applied','approved','denied','amount'];
  const missing = reqFields.filter(f=>!headers.includes(f));
  if(missing.length) return {error:'Missing columns: '+missing.join(', ')};
  const rows = [];
  for(let li=1;li<lines.length;li++){
    const cols = lines[li].split(',').map(c=>c.trim().replace(/^["']|["']$/g,''));
    const obj = {};
    headers.forEach((h,i)=>obj[h]=cols[i]||'');
    const month = parseMonthLabel(obj['month']);
    if(!month) return {error:`Row ${li+1}: cannot parse month "${obj['month']}"`};
    const applied = parseInt(obj['applied'])||0;
    const approved = parseInt(obj['approved'])||0;
    const denied = parseInt(obj['denied'])||0;
    const amount = parseFloat(String(obj['amount']).replace(/,/g,''))||0;
    rows.push({department:obj['department'].toUpperCase().trim(), month, applied, approved, denied, amount});
  }
  return {rows};
}

function parseJSON(text) {
  try {
    const arr = JSON.parse(text);
    if(!Array.isArray(arr)) return {error:'JSON must be an array of objects'};
    const rows = arr.map((obj,idx)=>{
      const dept = String(obj.Department||obj.department||'').toUpperCase().trim();
      const month = parseMonthLabel(String(obj.Month||obj.month||''));
      if(!month) return {_err:`Row ${idx+1}: invalid month`};
      return {department:dept, month, applied:parseInt(obj.Applied||obj.applied)||0,
              approved:parseInt(obj.Approved||obj.approved)||0,
              denied:parseInt(obj.Denied||obj.denied)||0,
              amount:parseFloat(String(obj.Amount||obj.amount||0).replace(/,/g,''))||0};
    });
    const err = rows.find(r=>r._err);
    if(err) return {error:err._err};
    return {rows};
  } catch(e){ return {error:'Invalid JSON: '+e.message}; }
}

function buildPreviewTable(tableEl, rows) {
  const cols = ['department','month','applied','approved','denied','amount'];
  tableEl.querySelector('thead').innerHTML = '<tr>'+cols.map(c=>`<th>${c}</th>`).join('')+'</tr>';
  tableEl.querySelector('tbody').innerHTML = rows.slice(0,8).map(r=>`<tr>${cols.map(c=>`<td>${c==='amount'?'₹'+Math.round(r[c]/1000)+'K':r[c]}</td>`).join('')}</tr>`).join('');
}

function setPendingRows(rows, statusEl, previewEl, previewTableId) {
  pendingImportRows = rows;
  document.getElementById('importApplyBtn').disabled = false;
  document.getElementById('importApplyBtn').style.opacity = '1';
  statusEl.className = 'import-status ok';
  statusEl.textContent = `✅ ${rows.length} row(s) ready — ${[...new Set(rows.map(r=>r.month))].join(', ')}`;
  statusEl.style.display='block';
  previewEl.style.display='block';
  buildPreviewTable(document.getElementById(previewTableId), rows);
}

function setError(statusEl, msg) {
  pendingImportRows = null;
  document.getElementById('importApplyBtn').disabled = true;
  document.getElementById('importApplyBtn').style.opacity = '.5';
  statusEl.className = 'import-status err';
  statusEl.textContent = '❌ '+msg;
  statusEl.style.display='block';
}

// ─── File handler ───
function showProcessing(msg) {
  document.getElementById('fileProcessing').style.display = 'block';
  document.getElementById('fileProcessingMsg').textContent = msg || 'Processing file…';
  document.getElementById('fileStatus').style.display = 'none';
  document.getElementById('filePreview').style.display = 'none';
}
function hideProcessing() {
  document.getElementById('fileProcessing').style.display = 'none';
}

function handleFileSelect(e){
  const file = e.target.files[0];
  if(!file) return;
  const name = file.name.toLowerCase();
  const statusEl = document.getElementById('fileStatus');
  const previewEl = document.getElementById('filePreview');

  if(name.endsWith('.json')) {
    showProcessing('Reading JSON…');
    const reader = new FileReader();
    reader.onload = ev => {
      hideProcessing();
      const result = parseJSON(ev.target.result);
      if(result.error) setError(statusEl, result.error);
      else { document.getElementById('filePreviewTitle').textContent = `Preview — JSON (${result.rows.length} rows)`; setPendingRows(result.rows, statusEl, previewEl, 'previewTable'); }
    };
    reader.readAsText(file);

  } else if(name.endsWith('.csv') || name.endsWith('.txt')) {
    showProcessing('Reading CSV…');
    const reader = new FileReader();
    reader.onload = ev => {
      hideProcessing();
      const result = parseCSV(ev.target.result);
      if(result.error) setError(statusEl, result.error);
      else { document.getElementById('filePreviewTitle').textContent = `Preview — CSV (${result.rows.length} rows)`; setPendingRows(result.rows, statusEl, previewEl, 'previewTable'); }
    };
    reader.readAsText(file);

  } else if(name.endsWith('.tsv')) {
    showProcessing('Reading TSV…');
    const reader = new FileReader();
    reader.onload = ev => {
      hideProcessing();
      const result = parseTSV(ev.target.result);
      if(result.error) setError(statusEl, result.error);
      else { document.getElementById('filePreviewTitle').textContent = `Preview — TSV (${result.rows.length} rows)`; setPendingRows(result.rows, statusEl, previewEl, 'previewTable'); }
    };
    reader.readAsText(file);

  } else if(name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.ods')) {
    showProcessing('Reading Excel / spreadsheet…');
    const reader = new FileReader();
    reader.onload = ev => {
      hideProcessing();
      const result = parseExcel(ev.target.result, name);
      if(result.error) setError(statusEl, result.error);
      else { document.getElementById('filePreviewTitle').textContent = `Preview — Excel (${result.rows.length} rows, sheet: ${result.sheet})`; setPendingRows(result.rows, statusEl, previewEl, 'previewTable'); }
    };
    reader.readAsArrayBuffer(file);

  } else if(name.endsWith('.pdf')) {
    showProcessing('Extracting text from PDF… this may take a moment');
    const reader = new FileReader();
    reader.onload = ev => {
      parsePDF(ev.target.result).then(result => {
        hideProcessing();
        if(result.error) setError(statusEl, result.error);
        else { document.getElementById('filePreviewTitle').textContent = `Preview — PDF extracted (${result.rows.length} rows)`; setPendingRows(result.rows, statusEl, previewEl, 'previewTable'); }
      }).catch(err => { hideProcessing(); setError(statusEl, 'PDF error: '+err.message); });
    };
    reader.readAsArrayBuffer(file);

  } else {
    // Generic: try as CSV
    showProcessing('Detecting format…');
    const reader = new FileReader();
    reader.onload = ev => {
      hideProcessing();
      const result = parseCSV(ev.target.result);
      if(result.error) setError(statusEl, 'Unrecognised format. Try CSV, Excel, JSON, PDF, or TSV.');
      else { document.getElementById('filePreviewTitle').textContent = `Preview (${result.rows.length} rows)`; setPendingRows(result.rows, statusEl, previewEl, 'previewTable'); }
    };
    reader.readAsText(file);
  }
}

function handleDragOver(e){e.preventDefault();document.getElementById('dropZone').classList.add('drag-over');}
function handleDragLeave(){document.getElementById('dropZone').classList.remove('drag-over');}
function handleDrop(e){
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if(!file) return;
  // Inject file into file input so handleFileSelect can read it
  const dt = new DataTransfer();
  dt.items.add(file);
  document.getElementById('fileInput').files = dt.files;
  handleFileSelect({target:{files:[file]}});
}

// ─── TSV Parser ───
function parseTSV(text) {
  // Convert tab-delimited to comma-delimited and use CSV parser
  const converted = text.split(/\r?\n/).map(line => line.split('\t').map(c => c.includes(',') ? '"'+c+'"' : c).join(',')).join('\n');
  return parseCSV(converted);
}

// ─── Excel Parser (SheetJS) ───
function parseExcel(arrayBuffer, filename) {
  try {
    if(typeof XLSX === 'undefined') return {error:'Excel library not loaded yet — please try again in a moment'};
    const wb = XLSX.read(arrayBuffer, {type:'array', cellDates:true});

    // Pick best sheet: prefer sheet named after a month, else first sheet
    let sheetName = wb.SheetNames[0];
    const monthPattern = /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i;
    for(const sn of wb.SheetNames) {
      if(monthPattern.test(sn)) { sheetName = sn; break; }
    }
    const ws = wb.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});
    if(!raw.length) return {error:`Sheet "${sheetName}" is empty`};

    // Normalise column names (case-insensitive)
    const rows = raw.map((obj, idx) => {
      const norm = {};
      Object.keys(obj).forEach(k => { norm[k.trim().toLowerCase().replace(/\s+/g,'')] = obj[k]; });

      const dept = String(norm['department']||norm['dept']||norm['department_name']||'').toUpperCase().trim();
      const rawMonth = String(norm['month']||norm['month_year']||norm['monthyear']||sheetName||'');
      const month = parseMonthLabel(rawMonth) || parseMonthLabel(sheetName);
      if(!month) return {_err:`Row ${idx+2}: cannot parse month "${rawMonth}"`};

      const applied  = parseInt(String(norm['applied']||norm['total_applied']||0).replace(/,/g,''))  || 0;
      const approved = parseInt(String(norm['approved']||norm['total_approved']||norm['claims_approved']||0).replace(/,/g,'')) || 0;
      const denied   = parseInt(String(norm['denied']||norm['total_denied']||norm['claims_denied']||0).replace(/,/g,''))   || 0;
      const amount   = parseFloat(String(norm['amount']||norm['amount_approved']||norm['approved_amount']||norm['total_amount']||0).replace(/[₹,]/g,'')) || 0;

      if(!dept) return {_err:`Row ${idx+2}: missing department name`};
      return {department:dept, month, applied, approved, denied, amount};
    });

    const err = rows.find(r=>r._err);
    if(err) return {error:err._err};
    return {rows, sheet:sheetName};
  } catch(e) { return {error:'Excel parse error: '+e.message}; }
}

// ─── PDF Parser — lazy-loads PDF.js only when a PDF is actually selected ───
const PDFJS_VERSION = '3.11.174';
const PDFJS_CDN_PRIMARY = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
const PDFJS_CDN_WORKER  = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;
const PDFJS_CDN_FALLBK  = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.js`;
const PDFJS_WRK_FALLBK  = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.js`;

let _pdfJsLoaded = false;

function loadPdfJs() {
  if(_pdfJsLoaded && typeof pdfjsLib !== 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_CDN_PRIMARY;
    script.onload = () => { _pdfJsLoaded = true; resolve(); };
    script.onerror = () => {
      // Try fallback
      const s2 = document.createElement('script');
      s2.src = PDFJS_CDN_FALLBK;
      s2.onload = () => { _pdfJsLoaded = true; resolve(); };
      s2.onerror = () => reject(new Error('PDF.js could not be loaded from any CDN. Check your internet connection.'));
      document.head.appendChild(s2);
    };
    document.head.appendChild(script);
  });
}

async function parsePDF(arrayBuffer) {
  try {
    showProcessing('Loading PDF library…');
    await loadPdfJs();
    if(typeof pdfjsLib === 'undefined') return {error:'PDF.js failed to load'};

    // Set worker — try primary, fall back to fake worker (slower but works offline)
    if(!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN_WORKER;
    }

    showProcessing('Extracting text from PDF…');
    const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
    let fullText = '';
    for(let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Reconstruct lines by grouping items with similar Y positions
      const items = content.items.map(i => ({text: i.str, y: Math.round(i.transform[5]), x: Math.round(i.transform[4])}));
      const yGroups = {};
      items.forEach(item => {
        if(!yGroups[item.y]) yGroups[item.y] = [];
        yGroups[item.y].push(item);
      });
      const sortedYs = Object.keys(yGroups).map(Number).sort((a, b) => b - a);
      for(const y of sortedYs) {
        const lineItems = yGroups[y].sort((a, b) => a.x - b.x);
        fullText += lineItems.map(i => i.text).join('\t') + '\n';
      }
    }

    // Strategy 1: detect structured table (tab-separated lines with header)
    const lines = fullText.split('\n').filter(l => l.trim());
    const headerIdx = lines.findIndex(l => {
      const lower = l.toLowerCase();
      return (lower.includes('department') || lower.includes('dept')) &&
             (lower.includes('applied') || lower.includes('approved') || lower.includes('month'));
    });

    if(headerIdx >= 0) {
      const tableLines = lines.slice(headerIdx);
      const csvText = tableLines.map(l => l.replace(/\t+/g, ',')).join('\n');
      const result = parseCSV(csvText);
      if(!result.error && result.rows.length > 0) return result;
    }

    // Strategy 2: look for month labels as section headers, dept names as rows
    const monthRe = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-]*(\d{2,4})/i;
    const deptRe = new RegExp('(' + DEPTS.join('|') + ')', 'i');
    const rows = [];
    let currentMonth = null;
    for(const line of lines) {
      const mMatch = line.match(monthRe);
      if(mMatch) { currentMonth = parseMonthLabel(mMatch[0]); continue; }
      if(!currentMonth) continue;
      const dMatch = line.match(deptRe);
      if(dMatch) {
        const nums = (line.match(/\d[\d,]*/g) || []).map(n => parseInt(n.replace(/,/g, '')) || 0);
        if(nums.length >= 3) {
          rows.push({
            department: dMatch[1].toUpperCase(),
            month: currentMonth,
            applied: nums[0] || 0,
            approved: nums[1] || 0,
            denied: nums[2] || 0,
            amount: nums[3] || 0
          });
        }
      }
    }
    if(rows.length > 0) return {rows};

    return {error: `Could not find a recognisable data table in this PDF (${pdf.numPages} page${pdf.numPages>1?'s':''} scanned).\n\nTip: Works best with digital PDFs from the CMCHIS portal. For scanned documents, copy-paste the table into the Paste CSV tab instead.`};
  } catch(e) {
    return {error: 'PDF read error: ' + e.message};
  }
}

// ─── Paste handler ───
document.getElementById('pasteCsv').addEventListener('input', function(){
  const statusEl = document.getElementById('pasteStatus');
  const previewEl = document.getElementById('pastePreview');
  if(!this.value.trim()){statusEl.style.display='none';previewEl.style.display='none';return;}
  const result = parseCSV(this.value);
  if(result.error) setError(statusEl, result.error);
  else setPendingRows(result.rows, statusEl, previewEl, 'pastePreviewTable');
});

// ─── Apply import ───
function applyImport() {
  if(!pendingImportRows || !pendingImportRows.length) return;

  const rows = pendingImportRows;
  const newMonths = [...new Set(rows.map(r=>r.month))];
  const newDepts = [...new Set(rows.map(r=>r.department))].filter(d=>!DEPTS.includes(d));

  // Add any new departments
  newDepts.forEach(d=>{
    DEPTS.push(d);
    DATA_STORE[d] = DATA_MONTHS.map(()=>0);
    DETAIL_STORE[d] = DATA_MONTHS.map(m=>({month:m,applied:0,approved:0,denied:0,amount:0}));
    COLORS.push('#'+(Math.random()*0xffffff<<0).toString(16).padStart(6,'0'));
    PALE.push('#f5f5f5');
  });

  // Add new months to DATA_MONTHS
  newMonths.forEach(m=>{
    if(!DATA_MONTHS.includes(m)){
      DATA_MONTHS.push(m);
      DEPTS.forEach(d=>{
        if(!DATA_STORE[d]) DATA_STORE[d]=[];
        DATA_STORE[d].push(0);
        if(!DETAIL_STORE[d]) DETAIL_STORE[d]=[];
        DETAIL_STORE[d].push({month:m,applied:0,approved:0,denied:0,amount:0});
      });
    }
  });

  // Apply row values
  rows.forEach(r=>{
    const di = DEPTS.indexOf(r.department);
    const mi = DATA_MONTHS.indexOf(r.month);
    if(di<0||mi<0) return;
    DATA_STORE[r.department][mi] = r.approved;
    DETAIL_STORE[r.department][mi] = {month:r.month,applied:r.applied,approved:r.approved,denied:r.denied,amount:r.amount};
  });

  // ─── Rebuild all affected charts & UI ───
  refreshAllCharts();

  // Record history
  const ts = new Date().toLocaleString('en-IN');
  const meta = {
    months: newMonths.join(', '),
    depts: [...new Set(rows.map(r=>r.department))].join(', ')
  };
  importHistory.unshift({ts, rows:rows.length, ...meta});
  renderImportHistory();

  // ── Save to Firestore ──
  if(window._fb) {
    window._fb.saveImport(rows, meta);
    window._fb.saveSnapshot(DATA_STORE, DATA_MONTHS);
  }

  closeImport();
  pendingImportRows = null;
}

function refreshAllCharts() {
  const keys   = getActiveKeys();
  const labels = getActiveLabels();
  const filterLabel = activeFilter==='full'?'Full Year (Jan 2025 – Feb 2026)':activeFilter==='last3'?'Last 3 Months (Dec 25 · Jan 26 · Feb 26)':'Last Month (Feb 2026)';

  // ── Update all dynamic titles ────────────────────────────────────
  [
    ['mainChartTitle',    `Department Cases — ${filterLabel}`],
    ['mainChartSub',      `All approved cases by dept · ${labels.join(', ')} · Click bar to drill down`],
    ['amtChartTitle',     `Revenue by Department — ${filterLabel}`],
    ['amtChartSub',       `CMCHIS approved amount per dept · Click bar to drill down`],
    ['mainChartTitle',    `Department Performance — ${filterLabel}`],
    ['growthChartTitle',  `Dept Growth — Period Avg vs 2025 Annual Avg`],
    ['growthChartSub',    `${filterLabel} avg/month vs full-year 2025 avg/month`],
    ['deptRevChartTitle', `Department Revenue — ${filterLabel}`],
    ['deptAmtChartTitle', `Revenue Comparison by Department — ${filterLabel}`],
    ['patientsChartTitle',`Patients Covered: CMCHIS + IKT — ${filterLabel}`],
    ['combinedRevSub',    `CMCHIS actual + IKT estimated revenue · ${filterLabel}`],
  ].forEach(([id, text]) => { const el=document.getElementById(id); if(el) el.textContent=text; });

  // ── 1. Main chart — period datasets ─────────────────────────────
  mainChartObj.data.labels = DEPTS;
  const palette=['#1a73e888','#34a85388','#fbbc0488','#9c27b088','#00bcd488','#ff572288','#e91e6388','#60798b88','#8bc34a88','#ff980088','#79554888','#00897b88','#f4433688','#3f51b588'];
  mainChartObj.data.datasets = keys.map((m,mi)=>({
    label: labels[mi],
    data: DEPTS.map((_,i)=>(DATA_2025[m]?.[i]||0)),
    backgroundColor: palette[mi%palette.length],
    borderRadius: 4
  }));
  mainChartObj.update();

  // Update legend
  const legendEl = document.getElementById('mainChartLegend');
  if (legendEl) legendEl.innerHTML = keys.map((m,mi)=>`
    <div class="legend-item"><div class="legend-dot" style="background:${palette[mi%palette.length].slice(0,7)}"></div>${labels[mi]}</div>`).join('');

  // ── 2. Revenue by dept chart (amtChart) ─────────────────────────
  const periodRevByDept = DEPTS.map((d,i)=>{
    const cases = keys.reduce((s,m)=>s+(DATA_2025[m]?.[i]||0),0);
    return cases * (DEPT_REV_RATE[d]||8000);
  });
  amtChartObj.data.labels = DEPTS;
  amtChartObj.data.datasets = [{
    label: `Est. Revenue (${filterLabel})`,
    data: periodRevByDept,
    backgroundColor: COLORS.map(c=>c+'aa'),
    borderRadius: 4
  }];
  amtChartObj.update();

  // ── 3. Dept page amt chart ────────────────────────────────────
  deptAmtAllChartObj.data.labels = DEPTS;
  deptAmtAllChartObj.data.datasets = [{
    label: `Est. Revenue (${filterLabel})`,
    data: periodRevByDept,
    backgroundColor: COLORS.map(c=>c+'aa'),
    borderRadius: 4
  }];
  deptAmtAllChartObj.update();

  // ── 4. Dept revenue chart (replaces denial) ───────────────────
  deptDenialChart.data.labels = DEPTS;
  deptDenialChart.data.datasets[0].data = periodRevByDept;
  deptDenialChart.update();

  // ── 5. Growth chart ──────────────────────────────────────────
  const gd = getGrowthData();
  growthChartObj.data.labels = DEPTS;
  growthChartObj.data.datasets[0].data = gd;
  growthChartObj.data.datasets[0].backgroundColor = gd.map(v=>v>=0?'#34a85388':'#ea433588');
  growthChartObj.data.datasets[0].label = `% vs 2025 annual avg (${filterLabel})`;
  growthChartObj.update();

  // ── 6. Combined CMCHIS+IKT patients chart ───────────────────
  const cmchisPerMonth = keys.map(m=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return MONTHLY_APPROVED_2025[gi]||0;});
  const iktPerMonth    = keys.map(m=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return IKT_2025_APPROVED[gi]||0;});
  if (window._patientsChart) {
    window._patientsChart.data.labels = labels;
    window._patientsChart.data.datasets[0].data = cmchisPerMonth;
    window._patientsChart.data.datasets[1].data = iktPerMonth;
    window._patientsChart.update();
  }

  // ── 7. Combined revenue chart ────────────────────────────────
  const cmchisRevPerMonth = keys.map(m=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return MONTHLY_AMOUNT_2025[gi]||0;});
  const iktRevPerMonth    = keys.map(m=>{const gi=ALL_MONTHS_KEYS.indexOf(m);return (IKT_2025_APPROVED[gi]||0)*5000;});
  if (window._combinedRevChart) {
    window._combinedRevChart.data.labels = labels;
    window._combinedRevChart.data.datasets[0].data = cmchisRevPerMonth;
    window._combinedRevChart.data.datasets[1].data = iktRevPerMonth;
    window._combinedRevChart.update();
  }

  // ── 8. Trend chart ───────────────────────────────────────────
  renderTrendChart();

  // ── 9. MoM summary ──────────────────────────────────────────
  buildMomSummary();

  // ── 10. Dept strip + detail ──────────────────────────────────
  showDept(0);

  // ── 11. Quick table + pkg table ─────────────────────────────
  buildTable();
  buildPkgTable();

  // ── 12. Overview KPIs ────────────────────────────────────────
  refreshOverviewKPIs();

  // ── 13. Trends page subtitle ─────────────────────────────────
  const trendsSub = document.querySelector('#page-trends .page-sub');
  if (trendsSub) trendsSub.textContent = filterLabel;
}


function refreshOverviewKPIs() {
  const keys   = getActiveKeys();
  const labels = getActiveLabels();
  const n      = keys.length;
  const filterLabel = activeFilter === 'full'  ? 'Jan 2025 – Feb 2026 (14 months)'
                    : activeFilter === 'last3' ? 'Last 3 Months (Dec 25 · Jan 26 · Feb 26)'
                    : 'Last Month (Feb 2026)';

  // ── Compute values from source arrays ──────────────────────────────
  const gi = m => ALL_MONTHS_KEYS.indexOf(m);
  const totApproved   = keys.reduce((s,m) => s + (MONTHLY_APPROVED_2025[gi(m)]||0), 0);
  const totApplied    = keys.reduce((s,m) => s + (MONTHLY_APPLIED_2025[gi(m)]||0),  0);
  const totDenied     = keys.reduce((s,m) => s + (MONTHLY_DENIED_2025[gi(m)]||0),   0);
  const totRevenue    = keys.reduce((s,m) => s + (MONTHLY_AMOUNT_2025[gi(m)]||0),   0);
  const totIktAppr    = keys.reduce((s,m) => s + (IKT_2025_APPROVED[gi(m)]||0),     0);
  const totIktAppl    = keys.reduce((s,m) => s + (IKT_2025_APPLIED[gi(m)]||0),      0);
  const totIktDenied  = keys.reduce((s,m) => s + (IKT_2025_DENIED[gi(m)]||0),       0);
  const colpoTotal    = n > 0 ? Math.round(n * 49.5) : 0; // ~594/12 per month
  const totalPatients = totApproved + totIktAppr + colpoTotal;
  const cmchisRate    = totApplied > 0 ? (totApproved/totApplied*100).toFixed(1) : '—';
  const iktRate       = totIktAppl > 0 ? (totIktAppr/totIktAppl*100).toFixed(1)  : '—';
  const avgCases      = n > 0 ? Math.round(totApproved/n) : 0;
  const avgRevenue    = n > 0 ? totRevenue/n : 0;
  const revPerCase    = totApproved > 0 ? Math.round(totRevenue/totApproved) : 0;

  // MoM momentum
  const lastKey    = keys[n-1];
  const prevKey    = keys[n-2] || keys[0];
  const lastApp    = MONTHLY_APPROVED_2025[gi(lastKey)]||0;
  const prevApp    = MONTHLY_APPROVED_2025[gi(prevKey)]||0;
  const lastRev    = MONTHLY_AMOUNT_2025[gi(lastKey)]||0;
  const prevRev    = MONTHLY_AMOUNT_2025[gi(prevKey)]||0;
  const lastIkt    = IKT_2025_APPROVED[gi(lastKey)]||0;
  const prevIkt    = IKT_2025_APPROVED[gi(prevKey)]||0;
  const lastLbl    = ALL_MONTHS_LABELS[gi(lastKey)] || '';
  const prevLbl    = ALL_MONTHS_LABELS[gi(prevKey)] || '';
  const momCases   = lastApp - prevApp;
  const momIkt     = lastIkt - prevIkt;
  const momRev     = lastRev - prevRev;
  const revTarget  = 1100000; // ₹11L/month target
  const vsTarget   = n > 0 ? ((avgRevenue - revTarget)/revTarget*100).toFixed(0) : 0;

  // Top dept by period
  const topDept = DEPTS.map((d,i)=>({d,v:keys.reduce((s,m)=>s+(DATA_2025[m]?.[i]||0),0)}))
                       .sort((a,b)=>b.v-a.v)[0];

  function fmtL(v) {
    if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
    if (v >= 1000)   return '₹' + Math.round(v/1000) + 'K';
    return '₹' + Math.round(v);
  }
  function updown(d, suffix='') {
    if (d === 0) return `<span class="mc-trend" style="color:var(--grey6)">→ No change</span>`;
    return d > 0
      ? `<span class="mc-trend trend-up">▲ +${d}${suffix} vs ${prevLbl}</span>`
      : `<span class="mc-trend trend-down">▼ ${d}${suffix} vs ${prevLbl}</span>`;
  }
  function pctBar(pct, color) {
    const w = Math.min(Math.max(parseFloat(pct)||0, 0), 100);
    return `<div style="height:4px;background:var(--grey3);border-radius:2px;margin-top:4px">
      <div style="height:4px;width:${w}%;background:${color};border-radius:2px"></div></div>`;
  }
  const rateColor = r => parseFloat(r)>=92?'#34a853':parseFloat(r)>=85?'#1a73e8':parseFloat(r)>=75?'#fbbc04':'#ea4335';

  // Update page subtitle
  const sub = document.getElementById('overviewPageSub');
  if (sub) sub.textContent = `Mayiladuthurai Government Hospital · ${filterLabel}`;

  // Revenue note
  const revNote = `<div style="font-size:11px;color:var(--grey6);background:var(--grey1);border-radius:8px;padding:8px 14px;margin-bottom:12px;border-left:3px solid var(--blue)">
    <strong>Revenue notes:</strong> CMCHIS revenue = <strong>actual amounts</strong> from XLS source (MONTHLY_AMOUNT_2025 array) · 
    IKT revenue = <strong>estimated</strong> (no amount data in source; calculated at ₹14K avg/case) · 
    Dept-level CMCHIS revenue = <strong>estimated</strong> (no per-dept breakdown in source data)
  </div>`;

  // ── 9 comprehensive KPI cards ───────────────────────────────────────
  const grid = document.getElementById('overviewKpiGrid');
  if (grid) grid.innerHTML = revNote + `
    <div class="metric-card mc-green" onclick="showDrill('annual-revenue')" style="cursor:pointer">
      <div class="mc-label">💰 CMCHIS Revenue (Actual)</div>
      <div class="mc-value">${fmtL(totRevenue)}</div>
      ${pctBar(Math.min(avgRevenue/revTarget*100,100),'#34a853')}
      <div class="mc-sub" style="margin-top:4px">${updown(Math.round(momRev/1000),'K')} · Avg ${fmtL(avgRevenue)}/mo</div>
    </div>
    <div class="metric-card mc-blue" onclick="showDrill('approval-rate')" style="cursor:pointer">
      <div class="mc-label">🏥 CMCHIS Patients Covered</div>
      <div class="mc-value">${totApproved.toLocaleString('en-IN')}</div>
      ${pctBar(parseFloat(cmchisRate),'#1a73e8')}
      <div class="mc-sub" style="margin-top:4px">${updown(momCases)} · ${cmchisRate}% approval</div>
    </div>
    <div class="metric-card mc-blue" onclick="showDrill('ikt-annual')" style="cursor:pointer">
      <div class="mc-label">🚨 IKT Patients Covered</div>
      <div class="mc-value">${totIktAppr.toLocaleString('en-IN')}</div>
      ${pctBar(parseFloat(iktRate),'#34a853')}
      <div class="mc-sub" style="margin-top:4px">${updown(momIkt)} · ${iktRate}% approval</div>
    </div>
    <div class="metric-card mc-green" onclick="showDrill('annual-revenue')" style="cursor:pointer">
      <div class="mc-label">👥 Total Patients (All Schemes)</div>
      <div class="mc-value">${totalPatients.toLocaleString('en-IN')}</div>
      <div class="mc-sub">CMCHIS ${totApproved} · IKT ${totIktAppr} · Colpo ~${colpoTotal}</div>
    </div>
    <div class="metric-card ${parseFloat(cmchisRate)>=90?'mc-green':parseFloat(cmchisRate)>=85?'mc-blue':'mc-yellow'}" onclick="showDrill('approval-rate')" style="cursor:pointer">
      <div class="mc-label">✅ CMCHIS Approval Rate</div>
      <div class="mc-value" style="color:${rateColor(cmchisRate)}">${cmchisRate}%</div>
      ${pctBar(cmchisRate,'#34a853')}
      <div class="mc-sub" style="margin-top:4px">${totApproved} approved · ${totDenied} denied of ${totApplied}</div>
    </div>
    <div class="metric-card ${parseFloat(iktRate)>=92?'mc-green':'mc-blue'}" onclick="showDrill('ikt-annual')" style="cursor:pointer">
      <div class="mc-label">🛡️ IKT Approval Rate</div>
      <div class="mc-value" style="color:${rateColor(iktRate)}">${iktRate}%</div>
      ${pctBar(iktRate,'#34a853')}
      <div class="mc-sub" style="margin-top:4px">${totIktAppr} approved · ${totIktDenied} denied of ${totIktAppl}</div>
    </div>
    <div class="metric-card mc-yellow" onclick="showDrill('annual-revenue')" style="cursor:pointer">
      <div class="mc-label">📈 Avg Revenue / Month</div>
      <div class="mc-value">${fmtL(avgRevenue)}</div>
      ${pctBar(Math.min(avgRevenue/revTarget*100,100),'#fbbc04')}
      <div class="mc-sub" style="margin-top:4px">Target ₹11L · ${parseFloat(vsTarget)>=0?'▲ +':'▼ '}${Math.abs(vsTarget)}% vs target · Peer avg ₹28–40L</div>
    </div>
    <div class="metric-card mc-blue" onclick="showDrill('approval-rate')" style="cursor:pointer">
      <div class="mc-label">📊 Avg Cases / Month</div>
      <div class="mc-value">${avgCases}</div>
      <div class="mc-sub">CMCHIS · ${lastApp} in ${lastLbl} · ₹${(revPerCase/1000).toFixed(0)}K avg per case</div>
    </div>
    <div class="metric-card mc-green" onclick="showDrill('dept','${topDept?.d}')" style="cursor:pointer">
      <div class="mc-label">🏆 Top Department</div>
      <div class="mc-value" style="font-size:18px">${topDept?.d||'—'}</div>
      <div class="mc-sub">${topDept?.v||0} cases · ₹${(((topDept?.v||0)*(DEPT_REV_RATE[topDept?.d]||8000))/100000).toFixed(1)}L est. (dept split estimated) · Period</div>
    </div>`;

  // ── Also rebuild the Trends page KPI cards ──────────────────────────
  const tGrid = document.getElementById('trendsKpiCards');
  if (tGrid) tGrid.innerHTML = `
    <div class="metric-card mc-green" onclick="showDrill('annual-revenue')" style="cursor:pointer">
      <div class="mc-label">Period Revenue</div>
      <div class="mc-value">${fmtL(totRevenue)}</div>
      <div class="mc-sub">${filterLabel}</div>
    </div>
    <div class="metric-card mc-blue" onclick="showDrill('approval-rate')" style="cursor:pointer">
      <div class="mc-label">CMCHIS Approved</div>
      <div class="mc-value">${totApproved.toLocaleString('en-IN')}</div>
      <div class="mc-sub">${cmchisRate}% approval · ${totDenied} denied</div>
    </div>
    <div class="metric-card mc-blue" onclick="showDrill('ikt-annual')" style="cursor:pointer">
      <div class="mc-label">IKT Approved</div>
      <div class="mc-value">${totIktAppr.toLocaleString('en-IN')}</div>
      <div class="mc-sub">${iktRate}% approval · ${totIktDenied} denied</div>
    </div>
    <div class="metric-card ${parseFloat(cmchisRate)>=90?'mc-green':'mc-yellow'}" onclick="showDrill('approval-rate')" style="cursor:pointer">
      <div class="mc-label">Approval Rate</div>
      <div class="mc-value">${cmchisRate}%</div>
      <div class="mc-sub">CMCHIS · Target 92% · ${totApplied} applied</div>
    </div>`;
}

// Alias — updateKpiCards calls refreshOverviewKPIs
function updateKpiCards() { refreshOverviewKPIs(); }

function renderImportHistory() {
  const el = document.getElementById('importHistoryList');
  if(!importHistory.length){
    el.innerHTML='<div style="text-align:center;padding:32px;color:var(--grey6);font-size:13px">No imports yet.</div>';
    return;
  }
  el.innerHTML = importHistory.map(h=>`
    <div class="import-hist-item">
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      <div>
        <div style="font-weight:500">${h.rows||h.rowCount||0} rows · Months: ${h.months||'—'}</div>
        <div style="color:var(--grey6);font-size:11px">Depts: ${h.depts||'—'}</div>
      </div>
      <span style="margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
        <span class="hist-time">${h.ts||h.timestamp||''}</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:6px;${h.fromCloud?'background:#e8f0fe;color:#1a73e8':'background:#fef7e0;color:#f29900'}">${h.fromCloud?'☁️ Firebase':'💾 Local'}</span>
      </span>
    </div>`).join('');
}

function downloadTemplate(fmt) {
  const header = 'Department,Month,Applied,Approved,Denied,Amount';
  const sample = DEPTS.slice(0,5).map(d=>`${d},Mar-26,30,28,2,300000`).join('\n');
  const csv = header+'\n'+sample;

  if(fmt === 'xlsx' && typeof XLSX !== 'undefined') {
    const wsData = [
      ['Department','Month','Applied','Approved','Denied','Amount'],
      ...DEPTS.slice(0,5).map(d=>[d,'Mar-26',30,28,2,300000])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{wch:18},{wch:10},{wch:10},{wch:10},{wch:8},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CMCHIS Data');
    XLSX.writeFile(wb, 'CMCHIS_Import_Template.xlsx');
  } else {
    const a=document.createElement('a');
    a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download='CMCHIS_Import_Template.csv';
    a.click();
  }
}

// ══════════════════════════════════════════════
// ═══  FIREBASE SNAPSHOT RESTORE & HISTORY  ═══
// ══════════════════════════════════════════════

// Called by Firebase module after DOMContentLoaded if a saved snapshot exists
function applyFirebaseSnapshot(snapshot) {
  try {
    const months = snapshot.months;
    const data   = snapshot.data;
    if(!months || !data) return;

    // Merge months
    months.forEach(m => {
      if(!DATA_MONTHS.includes(m)) DATA_MONTHS.push(m);
    });

    // Merge departments and values
    Object.keys(data).forEach(dept => {
      if(!DEPTS.includes(dept)) {
        DEPTS.push(dept);
        COLORS.push('#'+(Math.random()*0xFFFFFF<<0).toString(16).padStart(6,'0'));
        PALE.push('#f5f5f5');
      }
      // Ensure DATA_STORE array is correct length
      DATA_STORE[dept] = DATA_MONTHS.map((m,mi) => {
        const snapshotVal = data[dept]?.[mi];
        const existingVal = DATA_STORE[dept]?.[mi];
        // Prefer snapshot value if it's defined and non-zero, otherwise keep existing
        return (snapshotVal !== undefined && snapshotVal !== null) ? snapshotVal : (existingVal || 0);
      });
    });

    // Refresh all charts with restored data
    refreshAllCharts();

    // Show a subtle toast
    showToast('✅ Dashboard restored from last saved state (Firebase)');
  } catch(e) {
    console.warn('applyFirebaseSnapshot error:', e);
  }
}

// Renders Firebase import history (cloud records) into the History tab
function renderFirebaseHistory(hist) {
  importHistory = hist.map(h => ({
    ts: h.timestamp ? new Date(h.timestamp).toLocaleString('en-IN') : '—',
    rows: h.rowCount || (h.rows||[]).length,
    months: h.months || '—',
    depts: h.depts || '—',
    fromCloud: true
  }));
  renderImportHistory();
}

// Simple toast notification
function showToast(msg) {
  let t = document.getElementById('fbToast');
  if(!t) {
    t = document.createElement('div');
    t.id = 'fbToast';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#202124;color:#fff;padding:10px 20px;border-radius:24px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.3);opacity:0;transition:opacity .3s;white-space:nowrap;max-width:90vw;text-align:center';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>{ t.style.opacity='0'; }, 4000);
}

// ══════════════════════════════════════════════════════
// ══  MONTH FILTER  ══════════════════════════════════
// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════
// ══  GLOBAL PERIOD FILTER — 3 fixed options  ══════════
// ══════════════════════════════════════════════════════
// ALL_MONTHS_KEYS has 14 entries: Jan 2025 … Dec 2025, Jan 2026, Feb 2026
// Filters:
//   'full'  → all 14 months (Jan 2025 – Feb 2026)
//   'last3' → last 3 months (Dec 2025, Jan 2026, Feb 2026)
//   'last1' → last month only (Feb 2026)

// activeFilter and FILTER_OPTIONS declared at top of script near DATA_MONTHS

function getActiveKeys() {
  return FILTER_OPTIONS.find(f=>f.key===activeFilter)?.keys || ALL_MONTHS_KEYS;
}

function getActiveLabels() {
  return getActiveKeys().map(m => ALL_MONTHS_LABELS[ALL_MONTHS_KEYS.indexOf(m)]);
}

// Called by every filter chip (onclick="setMonthFilter('full')")
function setMonthFilter(f) {
  activeFilter = f;

  // Sync ALL filter chips across every page (including hardcoded overview chips)
  document.querySelectorAll('.mf-chip[data-f]').forEach(c => {
    c.classList.toggle('active', c.dataset.f === f);
  });
  // Re-inject filter bars on all non-overview pages to update active state
  injectMonthFilters();

  // Rebuild DATA_MONTHS / DATA_STORE / DETAIL_STORE
  const keys = getActiveKeys();
  DATA_MONTHS = keys;
  DEPTS.forEach((d,i) => {
    DATA_STORE[d] = keys.map(m => (DATA_2025[m]||[])[i]||0);
    DETAIL_STORE[d] = keys.map(m => {
      const gi = ALL_MONTHS_KEYS.indexOf(m);
      return { month:m,
        applied : MONTHLY_APPLIED_2025[gi]||0,
        approved: (DATA_2025[m]||[])[i]||0,
        denied  : MONTHLY_DENIED_2025[gi]||0,
        amount  : MONTHLY_AMOUNT_2025[gi]||0 };
    });
  });

  // Rebuild everything — KPIs first, then charts, then tables
  refreshOverviewKPIs();
  refreshAllCharts();
  buildTable();
  buildAnnualTableFiltered();
  buildIktTableFiltered();
  buildDoctorPage();
  buildDoctorRevenueSection();
  buildTargetsPage();
  buildIktRevBreakup();
}

function makeFilterBarHTML(activef) {
  return FILTER_OPTIONS.map(o =>
    `<span class="mf-chip${o.key===activef?' active':''}" data-f="${o.key}"
       onclick="setMonthFilter('${o.key}')">${o.label}</span>`
  ).join('');
}

function injectMonthFilters() {
  // Overview already has its filter bar hardcoded in HTML — skip it
  // Inject the 3-option filter bar into EVERY other page
  const ALL_PAGES = [
    'page-trends','page-deptpage','page-iktpage','page-annual2025',
    'page-packages','page-doctorpage','page-targets','page-cmchisdeep',
    'page-iktdeep','page-coverage','page-revgrowth','page-alerts',
    'page-suggestions','page-colpopage'
  ];
  ALL_PAGES.forEach(pid => {
    const page = document.getElementById(pid);
    if (!page) return;
    // Remove stale bars, always re-inject with correct active state
    page.querySelectorAll('.month-filter-bar.injected').forEach(el => el.remove());
    const ph = page.querySelector('.page-head');
    if (!ph) return;
    const bar = document.createElement('div');
    bar.className = 'month-filter-bar injected';
    bar.innerHTML = `<span class="mf-label">📅 Period:</span>${makeFilterBarHTML(activeFilter)}`;
    ph.insertAdjacentElement('afterend', bar);
  });
}

// ── Per-table filter-aware builders ──────────────────

function buildAnnualTableFiltered() {
  const tb = document.getElementById('annualTableBody');
  if (!tb) return;
  const keys = getActiveKeys();
  const labels = getActiveLabels();
  tb.innerHTML = keys.map((m,i) => {
    const gi   = ALL_MONTHS_KEYS.indexOf(m);
    const app  = MONTHLY_APPLIED_2025[gi]||0;
    const appr = MONTHLY_APPROVED_2025[gi]||0;
    const den  = MONTHLY_DENIED_2025[gi]||0;
    const amt  = MONTHLY_AMOUNT_2025[gi]||0;
    const rate = app>0 ? (appr/app*100).toFixed(1) : '—';
    const rn   = parseFloat(rate)||0;
    const is26 = gi >= 12;
    const badge = rn>=90?'badge-green':rn>=80?'badge-yellow':'badge-red';
    const status= rn>=90?'Good':rn>=80?'Monitor':'Review';
    return `<tr onclick="showDrill('month','${m}')" style="${is26?'background:var(--blue-light)':''}">
      <td><strong>${labels[i]}</strong>${is26?'<span style="font-size:10px;color:var(--blue);margin-left:5px">2026</span>':''}</td>
      <td>${app}</td>
      <td style="color:var(--green-dark);font-weight:600">${appr}</td>
      <td style="color:var(--red)">${den}</td>
      <td>₹${(amt/100000).toFixed(2)}L</td>
      <td style="font-weight:600;color:${rn>=90?'var(--green-dark)':rn>=80?'var(--yellow-dark)':'var(--red)'}">${rate}%</td>
      <td><span class="badge ${badge}" style="font-size:10px">${status}</span></td>
    </tr>`;
  }).join('');
  // Footer totals
  const ft  = document.getElementById('annualTableFoot');
  if (!ft) return;
  const tA  = keys.reduce((s,m)=>{ const gi=ALL_MONTHS_KEYS.indexOf(m); return s+(MONTHLY_APPLIED_2025[gi]||0);},0);
  const tAp = keys.reduce((s,m)=>{ const gi=ALL_MONTHS_KEYS.indexOf(m); return s+(MONTHLY_APPROVED_2025[gi]||0);},0);
  const tD  = keys.reduce((s,m)=>{ const gi=ALL_MONTHS_KEYS.indexOf(m); return s+(MONTHLY_DENIED_2025[gi]||0);},0);
  const tAm = keys.reduce((s,m)=>{ const gi=ALL_MONTHS_KEYS.indexOf(m); return s+(MONTHLY_AMOUNT_2025[gi]||0);},0);
  ft.innerHTML=`<tr style="background:var(--grey1);font-weight:700">
    <td>TOTAL (${keys.length} month${keys.length>1?'s':''})</td>
    <td>${tA}</td><td style="color:var(--green-dark)">${tAp}</td>
    <td style="color:var(--red)">${tD}</td><td>₹${(tAm/100000).toFixed(1)}L</td>
    <td style="color:var(--green-dark)">${tA>0?(tAp/tA*100).toFixed(1):'—'}%</td>
    <td><span class="badge badge-green">PERIOD</span></td></tr>`;
}

function buildIktTableFiltered() {
  const tb   = document.getElementById('iktMonthTable');
  const foot = document.getElementById('iktMonthTableFoot');
  if (!tb) return;
  const keys   = getActiveKeys();
  const labels = getActiveLabels();
  let totApp=0, totAppr=0, totDen=0, totRev=0;
  tb.innerHTML = keys.map((m,i) => {
    const gi    = ALL_MONTHS_KEYS.indexOf(m);
    const app   = IKT_2025_APPLIED[gi]||0;
    const appr  = IKT_2025_APPROVED[gi]||0;
    const den   = IKT_2025_DENIED[gi]||0;
    const rev   = appr * 14000; // avg IKT claim ₹14,000 (weighted avg across procedures)
    const rate  = app>0?(appr/app*100).toFixed(1):'—';
    const rn    = parseFloat(rate)||0;
    const is26  = gi>=12;
    totApp+=app; totAppr+=appr; totDen+=den; totRev+=rev;
    return `<tr style="${is26?'background:var(--blue-light)':''}">
      <td><strong>${labels[i]}</strong>${is26?'<span style="font-size:10px;color:var(--blue);margin-left:5px">2026</span>':''}</td>
      <td>${app}</td>
      <td style="color:var(--green-dark);font-weight:600">${appr}</td>
      <td style="color:var(--red)">${den}</td>
      <td style="font-weight:600;color:${rn>=90?'var(--green-dark)':rn>=80?'var(--yellow-dark)':'var(--red)'}">${rate}%</td>
      <td style="color:var(--green-dark)">₹${(rev/100000).toFixed(2)}L</td>
    </tr>`;
  }).join('');
  if (foot) {
    const overallRate = totApp>0?(totAppr/totApp*100).toFixed(1):'—';
    foot.innerHTML = `<tr>
      <td><strong>TOTAL (${keys.length} months)</strong></td>
      <td><strong>${totApp}</strong></td>
      <td><strong style="color:var(--green-dark)">${totAppr}</strong></td>
      <td><strong style="color:var(--red)">${totDen}</strong></td>
      <td><strong>${overallRate}%</strong></td>
      <td><strong style="color:var(--green-dark)">₹${(totRev/100000).toFixed(1)}L</strong></td>
    </tr>`;
  }
  // Also rebuild the procedure-wise breakup
  buildIktRevBreakup();
}

let iktRevSortCol = 4, iktRevSortDir = 'desc';

function buildIktRevBreakup() {
  const data = getIktRevenueByProcedure(activeFilter);
  const totalRev  = data.reduce((s,p)=>s+p.periodRevenue, 0);
  const totalCases= data.reduce((s,p)=>s+p.periodCases, 0);
  const topProc   = [...data].sort((a,b)=>b.periodRevenue-a.periodRevenue)[0];
  const filterLabel = activeFilter==='full'?'Full Year':'Last 3 Mo / Feb 2026';

  // Update title
  const titleEl = document.getElementById('iktRevBreakupTitle');
  if (titleEl) titleEl.textContent = `IKT Revenue Breakup — Procedure/Service Wise (${filterLabel})`;

  // KPI cards
  const kpiEl = document.getElementById('iktRevKpis');
  if (kpiEl) kpiEl.innerHTML = `
    <div class="metric-card mc-green" onclick="showDrill('ikt-annual')" style="cursor:pointer">
      <div class="mc-label">Total IKT Revenue</div>
      <div class="mc-value">₹${(totalRev/100000).toFixed(1)}L</div>
      <div class="mc-sub">${filterLabel} · ${totalCases} cases</div>
    </div>
    <div class="metric-card mc-blue" style="cursor:default">
      <div class="mc-label">Avg Revenue/Case</div>
      <div class="mc-value">₹${totalCases>0?Math.round(totalRev/totalCases/1000).toFixed(0)+'K':'—'}</div>
      <div class="mc-sub">Weighted across all procedures</div>
    </div>
    <div class="metric-card mc-yellow" style="cursor:default">
      <div class="mc-label">Top Procedure</div>
      <div class="mc-value" style="font-size:13px">${topProc?.procedure.split('—')[0].trim()||'—'}</div>
      <div class="mc-sub">₹${topProc?(topProc.periodRevenue/100000).toFixed(1)+'L':'—'} · ${topProc?.periodCases||0} cases</div>
    </div>`;

  // Revenue doughnut chart
  const sorted = [...data].sort((a,b)=>b.periodRevenue-a.periodRevenue).slice(0,8);
  if (window._iktRevChart) window._iktRevChart.destroy();
  const ctx = document.getElementById('iktRevChart');
  if (ctx) {
    window._iktRevChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: sorted.map(p=>p.procedure.split('—')[0].trim().substring(0,30)),
        datasets: [{ data: sorted.map(p=>p.periodRevenue),
          backgroundColor: COLORS.map(c=>c+'cc'), borderWidth:2, borderColor:'#fff' }]
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ position:'right', labels:{ color:'#5f6368', font:{size:10}, boxWidth:10 } },
          datalabels:{ display:false },
          tooltip:{ callbacks:{ label: ctx => {
            const v=ctx.raw; return ` ₹${(v/100000).toFixed(1)}L`;
          }}}
        }
      }
    });
  }

  // Table
  data.sort((a,b)=>{
    const vals = [a.procedure,a.dept,a.periodCases,a.avgRate,a.periodRevenue,a.jan26,a.feb26];
    const bvals= [b.procedure,b.dept,b.periodCases,b.avgRate,b.periodRevenue,b.jan26,b.feb26];
    const av=vals[iktRevSortCol], bv=bvals[iktRevSortCol];
    const cmp = typeof av==='number' ? av-bv : String(av).localeCompare(String(bv));
    return iktRevSortDir==='asc'?cmp:-cmp;
  });

  const tbody = document.getElementById('iktRevTableBody');
  const tfoot = document.getElementById('iktRevTableFoot');
  if (!tbody) return;

  tbody.innerHTML = data.map((p,i)=>{
    const pct = totalRev>0?(p.periodRevenue/totalRev*100).toFixed(1):0;
    const bar = `<div style="display:inline-block;width:${Math.max(pct,1)}%;height:4px;background:${COLORS[i%COLORS.length]};border-radius:2px;vertical-align:middle"></div>`;
    return `<tr onclick="showDrill('ikt-procedure','${p.procedure}')" style="cursor:pointer">
      <td>
        <div style="font-weight:600;font-size:12px">${p.procedure}</div>
        <div style="font-size:10px;color:var(--grey6);margin-top:2px">${p.desc.substring(0,80)}…</div>
        ${bar} <span style="font-size:10px;color:var(--grey6)">${pct}%</span>
      </td>
      <td><span style="font-size:11px;padding:2px 6px;border-radius:6px;background:var(--blue-light);color:var(--blue)">${p.dept}</span></td>
      <td style="font-weight:600">${p.periodCases}</td>
      <td>₹${(p.avgRate/1000).toFixed(0)}K</td>
      <td style="font-weight:600;color:var(--green-dark)">₹${(p.periodRevenue/100000).toFixed(2)}L</td>
      <td style="${p.jan26>p.cases2025/12*0.9?'color:var(--green-dark)':''}">${p.jan26}</td>
      <td style="${p.feb26>p.jan26?'color:var(--green-dark)':p.feb26<p.jan26?'color:var(--red)':''}">${p.feb26}${p.feb26>p.jan26?' ▲':p.feb26<p.jan26?' ▼':''}</td>
      <td style="font-size:11px;color:var(--grey6)">${p.seasonal}</td>
    </tr>`;
  }).join('');

  if (tfoot) {
    tfoot.innerHTML = `<tr>
      <td><strong>TOTAL (${data.length} procedures)</strong></td>
      <td>—</td>
      <td><strong>${totalCases}</strong></td>
      <td>—</td>
      <td><strong style="color:var(--green-dark)">₹${(totalRev/100000).toFixed(1)}L</strong></td>
      <td><strong>${data.reduce((s,p)=>s+p.jan26,0)}</strong></td>
      <td><strong>${data.reduce((s,p)=>s+p.feb26,0)}</strong></td>
      <td>—</td>
    </tr>`;
  }
}

function sortIktRevTable(col) {
  if (iktRevSortCol===col) iktRevSortDir = iktRevSortDir==='asc'?'desc':'asc';
  else { iktRevSortCol=col; iktRevSortDir='desc'; }
  buildIktRevBreakup();
  document.querySelectorAll('#iktRevTable th').forEach((th,i)=>{
    th.textContent = th.textContent.replace(/ [↑↓]$/,'');
    if(i===col) th.textContent += iktRevSortDir==='asc'?' ↑':' ↓';
  });
}

function buildPkgTableFiltered() {
  // Rebuild the package performance table rows using active filter
  buildPkgTable(); // already re-reads MONTHS_2025 dynamically via DATA_STORE
}

// ══════════════════════════════════════════════════════
// ══  DRILL-DOWN MODAL  ══════════════════════════════
// ══════════════════════════════════════════════════════

function closeDrill() {
  document.getElementById('drillModal').classList.remove('open');
  if (drillChartInst) { drillChartInst.destroy(); drillChartInst = null; }
}
document.getElementById('drillModal').addEventListener('click', e => {
  if (e.target === document.getElementById('drillModal')) closeDrill();
});
document.addEventListener('keydown', e => { if(e.key==='Escape') closeDrill(); });

function showDrill(type, payload) {
  const modal = document.getElementById('drillModal');
  const title = document.getElementById('drillTitle');
  const content = document.getElementById('drillContent');
  modal.classList.add('open');
  if (drillChartInst) { drillChartInst.destroy(); drillChartInst = null; }

  if (type === 'dept') {
    const i = DEPTS.indexOf(payload);
    if (i < 0) return;
    const vals = ALL_MONTHS_KEYS.map(m=>(DATA_2025[m]||[])[i]||0);
    const amts = ALL_MONTHS_KEYS.map(m=>{
      const idx=ALL_MONTHS_KEYS.indexOf(m);
      const approved=(DATA_2025[m]||[])[i]||0;
      const totalApproved=DEPTS.reduce((s,d,j)=>s+(DATA_2025[m]||[])[j]||0,0);
      const monthAmt=MONTHLY_AMOUNT_2025[idx]||0;
      return totalApproved>0?Math.round(monthAmt*(approved/totalApproved)):0;
    });
    title.textContent = `${payload} — Monthly Breakdown (Jan 2025 – Feb 2026)`;
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type:'bar',
      data:{
        labels:ALL_MONTHS_LABELS,
        datasets:[
          {label:'Approved Cases',data:vals,backgroundColor:COLORS[i%COLORS.length]+'99',borderRadius:4,yAxisID:'y'},
          {label:'Est. Revenue ₹',data:amts,type:'line',borderColor:COLORS[(i+2)%COLORS.length],
           backgroundColor:'transparent',tension:0.4,pointRadius:4,borderWidth:2,yAxisID:'y2'}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
        scales:{
          y:{ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,.06)'},title:{display:true,text:'Cases',color:'#5f6368'}},
          y2:{position:'right',ticks:{color:'#5f6368',callback:v=>'₹'+Math.round(v/1000)+'K'},
              grid:{display:false},title:{display:true,text:'Revenue',color:'#5f6368'}}
        }}
    });
    const annual=vals.slice(0,12).reduce((s,v)=>s+v,0);
    const jan26=vals[12]||0, feb26=vals[13]||0;
    const peak=Math.max(...vals); const peakM=ALL_MONTHS_LABELS[vals.indexOf(peak)];
    content.innerHTML=`
      <div class="cards-grid" style="margin-bottom:14px">
        <div class="metric-card mc-blue"><div class="mc-label">2025 Annual Total</div><div class="mc-value">${annual}</div></div>
        <div class="metric-card mc-green"><div class="mc-label">Peak Month</div><div class="mc-value">${peak}</div><div class="mc-sub">${peakM}</div></div>
        <div class="metric-card mc-blue"><div class="mc-label">Jan 2026</div><div class="mc-value">${jan26}</div></div>
        <div class="metric-card mc-blue"><div class="mc-label">Feb 2026</div><div class="mc-value">${feb26}</div></div>
      </div>
      <table class="drill-table">
        <thead><tr><th>Month</th><th>Approved</th><th>MoM Change</th><th>Est. Revenue</th></tr></thead>
        <tbody>${ALL_MONTHS_KEYS.map((m,mi)=>{
          const v=vals[mi]; const prev=mi>0?vals[mi-1]:v;
          const chg=v-prev; const pct=prev>0?((chg/prev)*100).toFixed(1):'—';
          const color=chg>0?'var(--green-dark)':chg<0?'var(--red)':'var(--grey7)';
          return `<tr><td><strong>${ALL_MONTHS_LABELS[mi]}</strong></td><td>${v}</td>
            <td style="color:${color}">${mi===0?'—':(chg>=0?'+':'')+chg+' ('+pct+'%)'}</td>
            <td>₹${Math.round(amts[mi]/1000)}K</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  else if (type === 'month') {
    const mi = ALL_MONTHS_KEYS.indexOf(payload);
    if (mi < 0) return;
    const label = ALL_MONTHS_LABELS[mi];
    title.textContent = `${label} — Department Breakdown`;
    const deptVals = DEPTS.map((d,i)=>(DATA_2025[payload]||[])[i]||0);
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type:'bar',
      data:{
        labels:DEPTS,
        datasets:[{label:'Approved Cases',data:deptVals,
          backgroundColor:COLORS.map(c=>c+'99'),borderRadius:4}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},datalabels:{display:false}},
        scales:{
          x:{ticks:{color:'#5f6368',font:{size:10}},grid:{color:'rgba(0,0,0,.06)'}},
          y:{ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,.06)'}}
        }}
    });
    const total=deptVals.reduce((s,v)=>s+v,0);
    content.innerHTML=`<div style="font-size:13px;color:var(--grey7);margin-bottom:12px">
      Applied: <strong>${MONTHLY_APPLIED_2025[mi]||0}</strong> · Approved: <strong>${MONTHLY_APPROVED_2025[mi]||0}</strong> · Denied: <strong style="color:var(--red)">${MONTHLY_DENIED_2025[mi]||0}</strong> · Amount: <strong style="color:var(--green-dark)">₹${((MONTHLY_AMOUNT_2025[mi]||0)/100000).toFixed(1)}L</strong>
    </div>
    <table class="drill-table">
      <thead><tr><th>Department</th><th>Approved</th><th>Share %</th><th>Trend vs Prev</th></tr></thead>
      <tbody>${DEPTS.map((d,i)=>{
        const v=deptVals[i];
        const prev=mi>0?(DATA_2025[ALL_MONTHS_KEYS[mi-1]]||[])[i]||0:v;
        const chg=v-prev; const col=chg>0?'var(--green-dark)':chg<0?'var(--red)':'var(--grey7)';
        const pct=total>0?(v/total*100).toFixed(1):0;
        return `<tr><td><strong style="color:${COLORS[i]}">${d}</strong></td><td>${v}</td>
          <td><div style="display:flex;align-items:center;gap:6px"><div style="width:${Math.max(pct,1)}px;height:8px;background:${COLORS[i]};border-radius:4px;min-width:4px"></div>${pct}%</div></td>
          <td style="color:${col}">${mi===0?'—':(chg>=0?'+':'')+chg}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  else if (type === 'ikt-doctor') {
    const doc = IKT_DOC_DATA.find(d=>d.name===payload);
    if (!doc) return;
    title.textContent = `Dr. ${payload} — IKT Monthly Performance`;
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan26','Feb26','Mar26'];
    const allVals=[...doc.m25,...doc.m26];
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type:'bar',
      data:{
        labels:months.slice(0,allVals.length),
        datasets:[{label:'IKT Cases',data:allVals,backgroundColor:COLORS.map(c=>c+'99'),borderRadius:4}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},datalabels:{display:false}},
        scales:{x:{ticks:{color:'#5f6368'}},y:{ticks:{color:'#5f6368'},beginAtZero:true}}}
    });
    const total25=doc.m25.reduce((s,v)=>s+v,0);
    const best=Math.max(...allVals); const bestM=months[allVals.indexOf(best)];
    content.innerHTML=`
      ${doc.spec ? `<div style="font-size:12px;color:var(--blue);background:var(--blue-light);border-radius:8px;padding:8px 12px;margin-bottom:12px">
        <strong>Specialization:</strong> ${doc.dept}<br>
        <strong>Procedures:</strong> ${doc.spec}
      </div>` : ''}
      <div class="cards-grid" style="margin-bottom:14px">
        <div class="metric-card mc-blue" style="cursor:default"><div class="mc-label">2025 Total</div><div class="mc-value">${total25}</div></div>
        <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">Best Month</div><div class="mc-value">${best}</div><div class="mc-sub">${bestM}</div></div>
        <div class="metric-card mc-yellow" style="cursor:default"><div class="mc-label">Dept / Specialty</div><div class="mc-value" style="font-size:13px">${doc.dept}</div></div>
        <div class="metric-card mc-blue" style="cursor:default"><div class="mc-label">2026 YTD</div><div class="mc-value">${doc.m26.slice(0,3).reduce((s,v)=>s+v,0)}</div></div>
      </div>`;
  }

  else if (type === 'doctor') {
    // Generic doctor drill — payload is {name, dept, m25[], m26[], total25}
    const d = typeof payload === 'string' ? {name:payload, dept:'', m25:[], m26:[], total25:0} : payload;
    title.textContent = `Dr. ${d.name} — Performance`;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan26','Feb26'];
    const allVals = [...(d.m25||[]), ...(d.m26||[])];
    if (allVals.length) {
      drillChartInst = new Chart(document.getElementById('drillChart'), {
        type:'bar',
        data:{labels:months.slice(0,allVals.length),
          datasets:[{label:'Cases',data:allVals,
            backgroundColor:allVals.map((_,i)=>i<12?'#1a73e888':'#34a85388'),borderRadius:4}]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},datalabels:{display:false}},
          scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},y:{ticks:{color:'#5f6368'},beginAtZero:true}}}
      });
    } else {
      document.getElementById('drillChart').style.display='none';
      setTimeout(()=>{document.getElementById('drillChart').style.display='';},100);
    }
    const tot25=(d.m25||[]).reduce((s,v)=>s+v,0);
    const tot26=(d.m26||[]).reduce((s,v)=>s+v,0);
    const best=allVals.length?Math.max(...allVals):0;
    content.innerHTML=`<div class="cards-grid" style="margin-bottom:14px">
      <div class="metric-card mc-blue" style="cursor:default"><div class="mc-label">Period Total</div><div class="mc-value">${tot25+tot26}</div></div>
      <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">Best Month</div><div class="mc-value">${best}</div></div>
      <div class="metric-card mc-yellow" style="cursor:default"><div class="mc-label">Department</div><div class="mc-value" style="font-size:14px">${d.dept||'—'}</div></div>
    </div>`;
  }

  else if (type === 'approval-rate') {
    title.textContent = 'Monthly Approval Rate — 2025 + 2026';
    const rates = ALL_MONTHS_KEYS.map((_,i) =>
      MONTHLY_APPLIED_2025[i] > 0
        ? parseFloat((MONTHLY_APPROVED_2025[i] / MONTHLY_APPLIED_2025[i] * 100).toFixed(1))
        : 0);
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type: 'line',
      data: {
        labels: ALL_MONTHS_LABELS,
        datasets: [
          {label:'Approval %', data:rates, borderColor:'#1a73e8', backgroundColor:'#1a73e820',
           fill:true, tension:0.4, pointRadius:5,
           pointBackgroundColor:rates.map(r=>r>=90?'#34a853':r>=80?'#fbbc04':'#ea4335')},
          {label:'Target 90%', data:Array(ALL_MONTHS_KEYS.length).fill(90),
           borderColor:'#34a853', borderDash:[6,4], borderWidth:1.5, pointRadius:0,
           backgroundColor:'transparent', fill:false}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
        scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},
                y:{min:60,max:100,ticks:{color:'#5f6368',callback:v=>v+'%'}}}}
    });
    content.innerHTML = `
      <table class="drill-table">
        <thead><tr><th>Month</th><th>Applied</th><th>Approved</th><th>Denied</th><th>Rate</th><th>Status</th></tr></thead>
        <tbody>${ALL_MONTHS_KEYS.map((m,i)=>{
          const r=rates[i];
          const is26=i>=12;
          const badge=r>=90?'badge-green':r>=80?'badge-yellow':'badge-red';
          const status=r>=90?'Good':r>=80?'Monitor':'Review';
          return `<tr style="${is26?'background:var(--blue-light);font-weight:600':''}">
            <td><strong>${ALL_MONTHS_LABELS[i]}</strong>${is26?'<span style="font-size:10px;color:var(--blue);margin-left:4px">2026</span>':''}</td>
            <td>${MONTHLY_APPLIED_2025[i]||0}</td>
            <td style="color:var(--green-dark)">${MONTHLY_APPROVED_2025[i]||0}</td>
            <td style="color:var(--red)">${MONTHLY_DENIED_2025[i]||0}</td>
            <td style="font-weight:600;color:${r>=90?'var(--green-dark)':r>=80?'var(--yellow-dark)':'var(--red)'}">${r}%</td>
            <td><span class="badge ${badge}" style="font-size:10px">${status}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  else if (type === 'annual-revenue') {
    title.textContent = 'Annual Revenue — Monthly Breakdown 2025';
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type: 'bar',
      data: {
        labels: ALL_MONTHS_LABELS.slice(0,12),
        datasets: [{
          label:'Revenue ₹',
          data: MONTHLY_AMOUNT_2025.slice(0,12),
          backgroundColor: MONTHLY_AMOUNT_2025.slice(0,12).map(v=>v>900000?'#1a73e8aa':v>700000?'#34a853aa':'#fbbc04aa'),
          borderRadius: 6
        }]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false},datalabels:{display:false}},
        scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},
                y:{ticks:{color:'#5f6368',callback:v=>'₹'+(v/100000).toFixed(1)+'L'}}}}
    });
    const total=MONTHLY_AMOUNT_2025.slice(0,12).reduce((s,v)=>s+v,0);
    const best=Math.max(...MONTHLY_AMOUNT_2025.slice(0,12));
    const bestM=ALL_MONTHS_LABELS[MONTHLY_AMOUNT_2025.indexOf(best)];
    content.innerHTML=`
      <div class="cards-grid" style="margin-bottom:14px">
        <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">Annual Total</div><div class="mc-value">₹${(total/100000).toFixed(1)}L</div></div>
        <div class="metric-card mc-blue"  style="cursor:default"><div class="mc-label">Best Month</div><div class="mc-value">₹${(best/100000).toFixed(1)}L</div><div class="mc-sub">${bestM}</div></div>
        <div class="metric-card mc-yellow" style="cursor:default"><div class="mc-label">Monthly Average</div><div class="mc-value">₹${(total/1200000).toFixed(1)}L</div></div>
      </div>
      <table class="drill-table">
        <thead><tr><th>Month</th><th>Approved</th><th>Revenue</th><th>Avg ₹/case</th></tr></thead>
        <tbody>${MONTHLY_AMOUNT_2025.slice(0,12).map((amt,i)=>{
          const appr=MONTHLY_APPROVED_2025[i]||1;
          return `<tr><td><strong>${ALL_MONTHS_LABELS[i]}</strong></td>
            <td>${MONTHLY_APPROVED_2025[i]}</td>
            <td style="color:var(--green-dark);font-weight:600">₹${(amt/100000).toFixed(2)}L</td>
            <td>₹${Math.round(amt/appr).toLocaleString('en-IN')}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  else if (type === 'ikt-annual') {
    title.textContent = 'IKT — Full Year 2025 + 2026 Performance';
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type: 'bar',
      data: {
        labels: IKT_2025_MONTHS,
        datasets: [
          {label:'Applied',  data:IKT_2025_APPLIED,  backgroundColor:'#1a73e844', borderRadius:4},
          {label:'Approved', data:IKT_2025_APPROVED, backgroundColor:'#34a85388', borderRadius:4},
          {label:'Denied',   data:IKT_2025_DENIED,   backgroundColor:'#ea433588', borderRadius:4}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
        scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},y:{ticks:{color:'#5f6368'},beginAtZero:true}}}
    });
    content.innerHTML=`
      <div class="cards-grid" style="margin-bottom:14px">
        <div class="metric-card mc-blue"  style="cursor:default"><div class="mc-label">2025 IKT Applied</div><div class="mc-value">${IKT_2025_APPLIED.slice(0,12).reduce((s,v)=>s+v,0)}</div></div>
        <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">2025 IKT Approved</div><div class="mc-value">${IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)}</div></div>
        <div class="metric-card mc-red"   style="cursor:default"><div class="mc-label">2025 IKT Denied</div><div class="mc-value">${IKT_2025_DENIED.slice(0,12).reduce((s,v)=>s+v,0)}</div></div>
        <div class="metric-card mc-yellow" style="cursor:default"><div class="mc-label">2025 Approval Rate</div><div class="mc-value">${(IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)/IKT_2025_APPLIED.slice(0,12).reduce((s,v)=>s+v,0)*100).toFixed(1)}%</div></div>
      </div>
      <table class="drill-table">
        <thead><tr><th>Month</th><th>Applied</th><th>Approved</th><th>Denied</th><th>Rate</th></tr></thead>
        <tbody>${IKT_2025_MONTHS.map((m,i)=>{
          const rate=(IKT_2025_APPROVED[i]/IKT_2025_APPLIED[i]*100).toFixed(1);
          const is26=i>=12;
          return `<tr style="${is26?'background:var(--blue-light)':''}">
            <td><strong>${m}</strong></td>
            <td>${IKT_2025_APPLIED[i]}</td>
            <td style="color:var(--green-dark);font-weight:600">${IKT_2025_APPROVED[i]}</td>
            <td style="color:var(--red)">${IKT_2025_DENIED[i]}</td>
            <td style="font-weight:600;color:${parseFloat(rate)>=90?'var(--green-dark)':parseFloat(rate)>=80?'var(--yellow-dark)':'var(--red)'}">${rate}%</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  else if (type === 'mgh-packages' || type === 'mgh-2025-total') {
    title.textContent = type === 'mgh-packages' ? 'MGH Active Package Departments' : 'MGH 2025 — All Cases Summary';
    const deptTotals = DEPTS.map((d,i) => MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0));
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type: 'bar',
      data: {
        labels: DEPTS,
        datasets: [{label:'2025 Cases', data:deptTotals,
          backgroundColor:COLORS.map(c=>c+'aa'), borderRadius:4}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        onClick:(_,els)=>{ if(els.length) showDrill('dept', DEPTS[els[0].index]); },
        plugins:{legend:{display:false},datalabels:{display:false}},
        scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},y:{ticks:{color:'#5f6368'},beginAtZero:true}}}
    });
    content.innerHTML=`<div style="font-size:12px;color:var(--grey6);margin-bottom:10px">Click any bar to see monthly breakdown for that department</div>
      <table class="drill-table">
        <thead><tr><th>Department</th><th>2025 Total</th><th>Monthly Avg</th><th>Nov 25</th><th>Dec 25</th></tr></thead>
        <tbody>${DEPTS.map((d,i)=>{
          const tot=deptTotals[i];
          return `<tr onclick="closeDrill();showDrill('dept','${d}')" style="cursor:pointer">
            <td><strong style="color:${COLORS[i]}">${d}</strong></td>
            <td>${tot}</td><td>${Math.round(tot/12)}</td>
            <td>${DATA_2025['Nov 2025'][i]||0}</td>
            <td>${DATA_2025['Dec 2025'][i]||0}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  // Numeric index → dept drill (from chart bar click)
  else if (typeof type === 'number') {
    showDrill('dept', DEPTS[type] || DEPTS[0]);
    return;
  }

  else if (type === 'ikt-procedure') {
    const p = IKT_PROCEDURE_DATA.find(x=>x.procedure===payload);
    if (!p) return;
    title.textContent = `IKT: ${p.procedure.split('—')[0].trim()}`;
    document.getElementById('drillChart').style.display = '';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan26','Feb26'];
    const monthlyCases = IKT_2025_APPROVED.map((v,i) => Math.round(v * p.cases2025 / 1728));
    drillChartInst = new Chart(document.getElementById('drillChart'), {
      type:'bar',
      data:{
        labels: months,
        datasets:[{label:'Est. Cases', data:monthlyCases, backgroundColor:'#34a85388', borderRadius:4},
                  {label:'Est. Revenue ₹', data:monthlyCases.map(v=>v*p.avgRate), type:'line',
                   borderColor:'#1a73e8', backgroundColor:'transparent', tension:0.4, pointRadius:4, yAxisID:'y2'}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
        scales:{
          y:{ ticks:{color:'#5f6368'}, title:{display:true,text:'Cases',color:'#5f6368'} },
          y2:{ position:'right', ticks:{color:'#1a73e8',callback:v=>'₹'+Math.round(v/1000)+'K'}, grid:{display:false} },
          x:{ ticks:{color:'#5f6368',font:{size:10}} }
        }}
    });
    content.innerHTML = `
      <div style="background:var(--blue-light);border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px">
        <div style="font-weight:600;color:var(--blue)">${p.dept}</div>
        <div style="color:var(--grey7);margin-top:4px">${p.desc}</div>
      </div>
      <div class="cards-grid" style="margin-bottom:12px">
        <div class="metric-card mc-blue"  style="cursor:default"><div class="mc-label">2025 Cases</div><div class="mc-value">${p.cases2025}</div></div>
        <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">Avg Rate/Case</div><div class="mc-value">₹${(p.avgRate/1000).toFixed(0)}K</div></div>
        <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">Annual Revenue</div><div class="mc-value">₹${(p.cases2025*p.avgRate/100000).toFixed(1)}L</div></div>
        <div class="metric-card mc-yellow"style="cursor:default"><div class="mc-label">Feb 2026</div><div class="mc-value">${p.feb26} <span style="font-size:12px;color:${p.feb26>p.jan26?'var(--green-dark)':'var(--red)'}">${p.feb26>p.jan26?'▲':'▼'}</span></div></div>
      </div>
      <div style="font-size:12px;color:var(--grey6)"><strong>Seasonal pattern:</strong> ${p.seasonal}</div>`;
  }
  else if (type === 'cmchis-scheme') {
    title.textContent = 'CMCHIS — Scheme Coverage Details';
    document.getElementById('drillChart').style.display='none';
    content.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      ${[['1,090+','Total Procedures'],['52','Diagnostic Tests'],['8','Follow-up Procedures'],['₹5L','Annual Family Cover'],['1,700+','Empanelled Hospitals'],['1.37 Cr','Families Covered']].map(([v,l])=>`
        <div class="metric-card mc-blue" style="cursor:default"><div class="mc-label">${l}</div><div class="mc-value" style="font-size:20px">${v}</div></div>`).join('')}
    </div>
    <div style="font-size:13px;color:var(--grey7);line-height:1.8">
      <p style="margin-bottom:8px"><strong>Key specialty coverage:</strong></p>
      ${[['Cardiology','Angioplasty, CABG, Pacemaker, Valve replacement'],['Neurology','Brain tumour, Spine surgeries, Neurovascular'],['Oncology','Cancer surgeries, Chemotherapy, Radiation'],['Orthopaedics','Joint replacement, Fracture fixation, Spine fusion'],['Obstetrics','C-section, High-risk delivery, NICU care'],['Nephrology','Dialysis, Kidney transplant, CAPD'],['Ophthalmology','Cataract, Glaucoma, Retinal surgeries'],['ENT','Cochlear implant, Tonsillectomy, Sinus surgery'],['General Surgery','Laparoscopic, Hernia, Appendicectomy, Cholecystectomy'],['Paediatrics','Neonatal intensive care, Congenital surgeries']].map(([s,p])=>`
        <div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--grey3)">
          <span style="font-weight:600;color:var(--blue);min-width:120px">${s}</span>
          <span>${p}</span>
        </div>`).join('')}
    </div>`;
    setTimeout(()=>{document.getElementById('drillChart').style.display='';},100);
  }

  else if (type === 'ikt-scheme') {
    title.textContent = 'IKT — Innuyir Kappom Thittam Details';
    document.getElementById('drillChart').style.display='none';
    content.innerHTML=`<div style="margin-bottom:16px">
      <div class="alert-strip alert-blue" style="background:var(--blue-light);margin-bottom:12px">
        <div class="alert-body"><div class="alert-title" style="color:var(--blue)">Nammai Kakkum 48 Scheme — Emergency Road Accident Coverage</div>
        <div class="alert-desc" style="color:var(--blue)">Free emergency treatment within 48 hours for road/rail/flood accident victims. Statewide: 3,43,156 beneficiaries · ₹302 Cr disbursed · 723 hospitals (250 Govt + 473 Private)</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        ${[['2,081','IKT Applied 2025 (MGH)'],['1,848','IKT Approved 2025 (MGH)'],['88.8%','2025 Approval Rate'],['233','Total Denied 2025'],['₹302 Cr','TN Total Disbursed'],['48 hrs','Treatment Window']].map(([v,l])=>`
          <div class="metric-card mc-green" style="cursor:default"><div class="mc-label">${l}</div><div class="mc-value" style="font-size:18px">${v}</div></div>`).join('')}
      </div>
      <div style="font-size:13px;color:var(--grey7)"><strong>IKT Package Coverage:</strong>
      ${[['Emergency Surgery','All acute surgical procedures within 48hrs'],['Fracture Management','X-ray, Plastering, ORIF for accident injuries'],['Head Injury','CT scan, Neurosurgery, ICU care'],['Burns Treatment','Dressing, Skin graft, ICU'],['Poisoning / Snake Bite','ASV, antidotes, ICU stabilisation'],['Spinal Injuries','Immobilisation, Surgery if needed'],['Polytrauma','Multi-organ management, ventilator'],['Road Accident','All procedures — documentation within 48 hrs']].map(([s,p])=>`
        <div style="display:flex;gap:10px;padding:5px 0;border-bottom:1px solid var(--grey3)">
          <span style="font-weight:600;color:var(--green-dark);min-width:140px">${s}</span>
          <span>${p}</span>
        </div>`).join('')}</div>
    </div>`;
    setTimeout(()=>{document.getElementById('drillChart').style.display='';},100);
  }
}

// ══════════════════════════════════════════════════════
// ══  CLICKABLE CARDS  ═══════════════════════════════
// ══════════════════════════════════════════════════════

function makeCardsClickable() {
  // Dept cards in overview — clicking dept shows drill-down
  document.querySelectorAll('.metric-card').forEach(card => {
    if (card.dataset.drillBound) return;
    card.dataset.drillBound = '1';
    // If card has a dept label, bind to dept drill
    const label = card.querySelector('.mc-label');
    if (!label) return;
    const txt = label.textContent;
    DEPTS.forEach(d => {
      if (txt.includes(d)) {
        card.onclick = () => showDrill('dept', d);
      }
    });
    // Month cards
    ALL_MONTHS_KEYS.forEach(m => {
      if (txt.includes(m.split(' ')[0]) && txt.includes(m.split(' ')[1])) {
        card.onclick = () => showDrill('month', m);
      }
    });
  });
}

// ══════════════════════════════════════════════════════
// ══  UNIVERSAL SORTABLE TABLE  ══════════════════════
// ══════════════════════════════════════════════════════

function makeSortable(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const headers = table.querySelectorAll('th');
  headers.forEach((th, col) => {
    th.style.cursor = 'pointer';
    th.dataset.col = col;
    th.dataset.dir = '';
    th.addEventListener('click', () => {
      const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
      headers.forEach(h => { h.dataset.dir=''; h.classList.remove('sort-asc','sort-desc'); });
      th.dataset.dir = dir;
      th.classList.add(dir==='asc'?'sort-asc':'sort-desc');
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.rows);
      rows.sort((a,b)=>{
        const av=a.cells[col]?.textContent.trim()||'';
        const bv=b.cells[col]?.textContent.trim()||'';
        const an=parseFloat(av.replace(/[₹,%L]/g,'')), bn=parseFloat(bv.replace(/[₹,%L]/g,''));
        if(!isNaN(an)&&!isNaN(bn)) return dir==='asc'?an-bn:bn-an;
        return dir==='asc'?av.localeCompare(bv):bv.localeCompare(av);
      });
      rows.forEach(r=>tbody.appendChild(r));
    });
  });
}

// ══════════════════════════════════════════════════════
// ══  PACKAGE PERFORMANCE PAGE  ══════════════════════
// ══════════════════════════════════════════════════════

const CMCHIS_PACKAGES = [
  // department, package/procedure, category, annualCases, ratePer, approvalPct, cmchisCode, notes
  {dept:'ORTHO',     pkg:'Joint Replacement (Hip/Knee)',   cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][0]||0),0)*0.25), rate:45000, appr:91, active:true},
  {dept:'ORTHO',     pkg:'Fracture Fixation / ORIF',       cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][0]||0),0)*0.45), rate:25000, appr:94, active:true},
  {dept:'ORTHO',     pkg:'Spine Surgery',                  cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][0]||0),0)*0.15), rate:40000, appr:88, active:true},
  {dept:'ORTHO',     pkg:'Arthroscopy',                    cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][0]||0),0)*0.10), rate:18000, appr:90, active:true},
  {dept:'GS',        pkg:'Appendicectomy (Lap/Open)',       cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][1]||0),0)*0.30), rate:15000, appr:96, active:true},
  {dept:'GS',        pkg:'Hernia Repair',                   cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][1]||0),0)*0.25), rate:14000, appr:95, active:true},
  {dept:'GS',        pkg:'Cholecystectomy (Lap)',           cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][1]||0),0)*0.20), rate:18000, appr:97, active:true},
  {dept:'GS',        pkg:'Bowel Resection',                 cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][1]||0),0)*0.10), rate:30000, appr:90, active:true},
  {dept:'OG',        pkg:'LSCS (C-Section)',                cat:'Obstetrics',cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][2]||0),0)*0.55), rate:18000, appr:92, active:true},
  {dept:'OG',        pkg:'High Risk Delivery',              cat:'Obstetrics',cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][2]||0),0)*0.25), rate:12000, appr:88, active:true},
  {dept:'OG',        pkg:'Colposcopy / Cervical Procedures',cat:'Gynaecology',cases:598, rate:1500, appr:99, active:true},
  {dept:'OG',        pkg:'Hysterectomy',                    cat:'Surgery',   cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][2]||0),0)*0.10), rate:22000, appr:93, active:true},
  {dept:'NICU',      pkg:'Neonatal Intensive Care',         cat:'Paediatrics',cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][3]||0),0), rate:18000, appr:78, active:true},
  {dept:'NICU',      pkg:'Premature Baby Care',             cat:'Paediatrics',cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][3]||0),0)*0.4), rate:22000, appr:75, active:true},
  {dept:'DENTAL',    pkg:'Dental Extraction / Surgery',     cat:'Dental',    cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][4]||0),0), rate:3500, appr:88, active:true},
  {dept:'OPTHAL',    pkg:'Cataract Surgery (Phaco)',        cat:'Ophthalmology',cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][5]||0),0), rate:8500, appr:90, active:true},
  {dept:'OPTHAL',    pkg:'Glaucoma Surgery',                cat:'Ophthalmology',cases:3, rate:12000, appr:85, active:false},
  {dept:'OPTHAL',    pkg:'Retinal Surgery / Vitrectomy',    cat:'Ophthalmology',cases:0, rate:35000, appr:0, active:false},
  {dept:'ENT',       pkg:'Tonsillectomy / Adenoidectomy',   cat:'ENT',       cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][6]||0),0)*0.35), rate:8000, appr:93, active:true},
  {dept:'ENT',       pkg:'FESS / Sinus Surgery',            cat:'ENT',       cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][6]||0),0)*0.30), rate:12000, appr:90, active:true},
  {dept:'ENT',       pkg:'Mastoidectomy',                   cat:'ENT',       cases:Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][6]||0),0)*0.15), rate:15000, appr:87, active:true},
  {dept:'ENT',       pkg:'Hearing Aid (OAE)',               cat:'ENT',       cases:35, rate:6000, appr:82, active:true},
  {dept:'ENT',       pkg:'Cochlear Implant',                cat:'ENT',       cases:0, rate:250000, appr:0, active:false},
  {dept:'DIALYSIS',  pkg:'Haemodialysis (per session)',     cat:'Nephrology',cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][7]||0),0), rate:8800, appr:97, active:true},
  {dept:'DIALYSIS',  pkg:'CAPD Peritoneal Dialysis',        cat:'Nephrology',cases:0, rate:15000, appr:0, active:false},
  {dept:'POISONING', pkg:'Snake Bite / ASV Treatment',      cat:'Emergency', cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][8]||0),0), rate:8800, appr:96, active:true},
  {dept:'ASV',       pkg:'Acute Poisoning Management',      cat:'Emergency', cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][9]||0),0), rate:9000, appr:90, active:true},
  {dept:'BURNS',     pkg:'Burns Dressing / Skin Graft',     cat:'Emergency', cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][10]||0),0), rate:7800, appr:92, active:true},
  {dept:'MI/CVA',    pkg:'MI / Acute Coronary Syndrome',   cat:'Cardiology',cases:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][11]||0),0), rate:30000, appr:89, active:true},
  {dept:'MI/CVA',    pkg:'CVA / Stroke Management',        cat:'Neurology', cases:5, rate:25000, appr:85, active:true},
  // Underutilised / not yet active
  {dept:'CARDIO',    pkg:'Angioplasty (PTCA)',              cat:'Cardiology',cases:0, rate:90000, appr:0, active:false},
  {dept:'CARDIO',    pkg:'Pacemaker Implantation',          cat:'Cardiology',cases:0, rate:120000,appr:0, active:false},
  {dept:'CARDIO',    pkg:'CABG (Bypass Surgery)',           cat:'Cardiology',cases:0, rate:180000,appr:0, active:false},
  {dept:'UROLOGY',   pkg:'PCNL / Nephrolithotomy',         cat:'Urology',   cases:0, rate:45000, appr:0, active:false},
  {dept:'UROLOGY',   pkg:'TURP / Prostatic Surgery',       cat:'Urology',   cases:0, rate:30000, appr:0, active:false},
  {dept:'UROLOGY',   pkg:'Kidney Transplant',              cat:'Nephrology',cases:0, rate:200000,appr:0, active:false},
  {dept:'NEURO',     pkg:'Brain Tumour Surgery',           cat:'Neurology', cases:0, rate:150000,appr:0, active:false},
  {dept:'NEURO',     pkg:'Spinal Cord Surgery',            cat:'Neurology', cases:0, rate:120000,appr:0, active:false},
  {dept:'ONCO',      pkg:'Cancer Surgery',                 cat:'Oncology',  cases:0, rate:80000, appr:0, active:false},
  {dept:'ONCO',      pkg:'Chemotherapy (per cycle)',       cat:'Oncology',  cases:0, rate:15000, appr:0, active:false},
  {dept:'VASC',      pkg:'Vascular Surgery / Bypass',     cat:'Vascular',  cases:0, rate:100000,appr:0, active:false},
];

const IKT_PACKAGES = [
  {pkg:'Emergency Surgery (Accident)',      coverage:'All acute operations within 48hrs',     cases2025:Math.round(IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)*0.30), rate:'Package-based', appr:90, notes:'Must file within 48hrs'},
  {pkg:'Head Injury Management',            coverage:'CT, Surgery, ICU — any severity',       cases2025:Math.round(IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)*0.12), rate:'Up to ₹1.5L', appr:88, notes:'Neurosurgical referral often needed'},
  {pkg:'Fracture Fixation (Accident)',      coverage:'X-ray, IM nail, Plastering, ORIF',      cases2025:Math.round(IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)*0.20), rate:'Up to ₹40K', appr:92, notes:'High volume — road accidents'},
  {pkg:'Burns Treatment',                   coverage:'Dressing, skin graft, ICU',             cases2025:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][10]||0),0), rate:'Up to ₹80K', appr:93, notes:'Separate from CMCHIS burns'},
  {pkg:'Polytrauma Management',             coverage:'Multi-system trauma, ventilator',       cases2025:Math.round(IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)*0.08), rate:'Up to ₹2L', appr:81, notes:'Documentation-intensive'},
  {pkg:'Snake Bite / ASV (IKT route)',      coverage:'ASV, antidote, ICU stabilisation',      cases2025:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][8]||0),0), rate:'Up to ₹15K', appr:96, notes:'Monsoon surge Jun–Sep'},
  {pkg:'Acute Poisoning',                  coverage:'Lavage, antidote, ICU',                 cases2025:MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][9]||0),0), rate:'Up to ₹12K', appr:90, notes:'Overlaps CMCHIS poisoning'},
  {pkg:'Spinal Injury',                    coverage:'Immobilisation, surgery if indicated',   cases2025:12, rate:'Up to ₹1L', appr:83, notes:'Requires MRI confirmation'},
  {pkg:'Road Accident — General',          coverage:'Any procedure in 48hr window',           cases2025:Math.round(IKT_2025_APPROVED.slice(0,12).reduce((s,v)=>s+v,0)*0.20), rate:'Up to ₹5L', appr:87, notes:'FIR/MLC mandatory'},
  {pkg:'Flood / Disaster Injuries',        coverage:'Infection, wound care, surgery',         cases2025:8, rate:'Package-based', appr:85, notes:'Monsoon activation'},
];

let pkgSortCol = 2, pkgSortDir = 'desc';
let iktSortCol = 2, iktSortDir = 'desc';

function buildPkgTable() {
  const active = CMCHIS_PACKAGES.filter(p=>p.active && p.cases>0);
  renderPkgRows(active);
}

function renderPkgRows(data) {
  const tbody = document.getElementById('pkgTableBody');
  if (!tbody) return;
  tbody.innerHTML = data.map(p => {
    const rev = p.cases * p.rate;
    const trend = p.cases > 15 ? '▲' : p.cases > 5 ? '→' : '▼';
    const trendC = trend==='▲'?'var(--green-dark)':trend==='→'?'var(--grey7)':'var(--red)';
    const appC = p.appr>=90?'var(--green-dark)':p.appr>=80?'var(--yellow-dark)':'var(--red)';
    const badge = p.appr>=90?'badge-green':p.appr>=80?'badge-yellow':'badge-red';
    const barW = Math.round(p.cases/5); // scale bar
    return `<tr onclick="showDrill('dept','${p.dept}')">
      <td><strong style="color:${COLORS[DEPTS.indexOf(p.dept)%COLORS.length]}">${p.dept}</strong><br>
        <span style="font-size:11px;color:var(--grey6)">${p.pkg}</span></td>
      <td><span style="background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${p.cat}</span></td>
      <td><div style="display:flex;align-items:center;gap:6px">
        <div style="width:${Math.min(barW,60)}px;height:8px;background:${COLORS[DEPTS.indexOf(p.dept)%COLORS.length]};border-radius:4px;opacity:.7"></div>
        <strong>${p.cases}</strong></div></td>
      <td>${(p.cases/12).toFixed(1)}/mo</td>
      <td style="color:var(--green-dark)">₹${rev>=100000?(rev/100000).toFixed(1)+'L':Math.round(rev/1000)+'K'}</td>
      <td style="font-weight:600;color:${appC}">${p.appr}%</td>
      <td style="color:${trendC};font-weight:600">${trend}</td>
      <td><span class="badge ${badge}">${p.appr>=90?'ACTIVE':p.appr>=80?'OK':'REVIEW'}</span></td>
    </tr>`;
  }).join('');
}

function sortPkgTable(col) {
  const cols = [p=>p.dept+p.pkg, p=>p.cat, p=>p.cases, p=>p.cases/12, p=>p.cases*p.rate, p=>p.appr, p=>p.cases];
  if (pkgSortCol===col) pkgSortDir = pkgSortDir==='asc'?'desc':'asc';
  else { pkgSortCol=col; pkgSortDir='desc'; }
  const active = CMCHIS_PACKAGES.filter(p=>p.active && p.cases>0);
  active.sort((a,b)=>{const v=cols[col]; return pkgSortDir==='asc'?v(a)-v(b):v(b)-v(a);});
  renderPkgRows(active);
}

function filterPkgTable(q) {
  const active = CMCHIS_PACKAGES.filter(p=>p.active && p.cases>0 &&
    (p.dept+p.pkg+p.cat).toLowerCase().includes(q.toLowerCase()));
  renderPkgRows(active);
}

function buildIktPkgTable() {
  const tbody = document.getElementById('iktPkgTableBody');
  if (!tbody) return;
  tbody.innerHTML = IKT_PACKAGES.map(p => {
    const appC = p.appr>=90?'var(--green-dark)':p.appr>=80?'var(--yellow-dark)':'var(--red)';
    return `<tr>
      <td><strong>${p.pkg}</strong></td>
      <td style="font-size:12px;color:var(--grey7)">${p.coverage}</td>
      <td><strong>${p.cases2025}</strong></td>
      <td style="font-size:12px">${p.rate}</td>
      <td style="font-weight:600;color:${appC}">${p.appr}%</td>
      <td style="font-size:11px;color:var(--grey6)">${p.notes}</td>
    </tr>`;
  }).join('');
}

function sortIktTable(col) {
  const tbody = document.getElementById('iktPkgTableBody');
  if (!tbody) return;
  const rows = Array.from(tbody.rows);
  if (iktSortCol===col) iktSortDir = iktSortDir==='asc'?'desc':'asc';
  else { iktSortCol=col; iktSortDir='desc'; }
  rows.sort((a,b)=>{
    const av=a.cells[col]?.textContent.trim()||'';
    const bv=b.cells[col]?.textContent.trim()||'';
    const an=parseFloat(av.replace(/[₹,% ]/g,'')), bn=parseFloat(bv.replace(/[₹,% ]/g,''));
    return iktSortDir==='asc'?(isNaN(an)?av.localeCompare(bv):an-bn):(isNaN(bn)?bv.localeCompare(av):bn-an);
  });
  rows.forEach(r=>tbody.appendChild(r));
}

function buildUnusedPkgs() {
  const el = document.getElementById('unusedPkgList');
  if (!el) return;
  const unused = CMCHIS_PACKAGES.filter(p=>!p.active || p.cases===0);
  const totalOpp = unused.reduce((s,p)=>s+p.rate*10,0); // 10 cases/month potential
  el.innerHTML=`<div style="font-size:14px;font-weight:600;color:var(--green-dark);margin-bottom:14px">
    Potential monthly revenue if each package averages 10 cases: <span style="font-size:20px">₹${(totalOpp/100000).toFixed(1)}L/month</span>
  </div>
  <div class="chart-card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="pkg-table">
    <thead><tr><th>Department</th><th>Package / Procedure</th><th>Category</th><th>Package Rate</th><th>Potential (10 cases)</th><th>Action Required</th></tr></thead>
    <tbody>${unused.map(p=>`<tr>
      <td><strong style="color:var(--red)">${p.dept}</strong></td>
      <td>${p.pkg}</td>
      <td><span style="background:var(--red-light);color:var(--red-dark);padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600">${p.cat}</span></td>
      <td style="font-weight:600;color:var(--green-dark)">₹${(p.rate/1000).toFixed(0)}K</td>
      <td style="font-weight:600;color:var(--green-dark)">₹${(p.rate*10/100000).toFixed(1)}L/mo</td>
      <td style="font-size:12px;color:var(--grey7)">${p.cases===0?'Not yet activated — requires specialist / equipment':'Improve documentation'}</td>
    </tr>`).join('')}
    </tbody>
  </table></div></div>`;
}

function switchPkgTab(t, el) {
  document.querySelectorAll('.pkg-tab').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.pkg-panel').forEach(p=>p.style.display='none');
  document.getElementById('pkg-panel-'+t).style.display='';
  if(t==='ikt') buildIktPkgTable();
  if(t==='unused') buildUnusedPkgs();
}

function buildPkgVolumeChart() {
  const deptTotals = DEPTS.map((d,i)=>MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0));
  safeChart('pkgVolumeChart', {
    type:'bar',
    data:{
      labels:DEPTS,
      datasets:[{
        label:'2025 Annual Cases',
        data:deptTotals,
        backgroundColor:COLORS.map(c=>c+'aa'),
        borderRadius:6
      }]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      onClick:(e,el)=>{ if(el.length) showDrill('dept',DEPTS[el[0].index]); },
      plugins:{legend:{display:false},
        datalabels:{display:true,anchor:'end',align:'top',formatter:v=>v,
          color:'#3c4043',font:{size:11,weight:'600'}}},
      scales:{
        x:{ticks:{color:tc(),font:{size:11}},grid:{color:gc()}},
        y:{ticks:{color:tc()},grid:{color:gc()},beginAtZero:true}
      }
    },
    plugins:[ChartDataLabels]
  });
}

// ── Safe chart creator — destroys existing instance on the canvas before creating new one ──
function safeChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  // Destroy any existing Chart.js instance on this canvas
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  return new Chart(canvas, config);
}
// ══════════════════════════════════════════════════════

function buildDoctorPage() {
  const f = activeFilter; // 'full' | 'last3' | 'last1'

  // ── helpers ──────────────────────────────────────────
  function doctorCard(name, dept, color, initials, vals, labels, rankBadge, spec) {
    const nums = vals.map(v=>v.value).filter(n=>n>0);
    const trend = nums.length >= 2
      ? (nums[nums.length-1] >= nums[0] ? '▲' : '▼')
      : '→';
    const trendC = trend==='▲' ? 'var(--green-light);color:var(--green-dark)'
                : trend==='▼' ? 'var(--red-light);color:var(--red-dark)'
                : 'var(--grey2);color:var(--grey7)';
    const periodLabel = f==='full'?'Full Year':f==='last3'?'Last 3 Mo':'Feb 2026';
    return `<div class="doc-card-v2" onclick="showDrill('ikt-doctor','${name}')" style="cursor:pointer">
      ${rankBadge ? `<span class="doc-trend-badge" style="background:var(--blue-light);color:var(--blue);font-size:10px">${rankBadge}</span>` : ''}
      <span class="doc-trend-badge" style="right:auto;left:10px;top:10px;background:${trendC}">${trend}</span>
      <div class="doc-card-header" style="margin-top:4px">
        <div class="doc-avatar-v2" style="background:${color}">${initials}</div>
        <div>
          <div class="doc-name-v2">${name}</div>
          <div class="doc-dept-v2" style="color:var(--blue);font-weight:600;font-size:11px">${dept}</div>
        </div>
      </div>
      ${spec ? `<div style="font-size:10px;color:var(--grey6);margin:2px 0 6px;padding:0 2px;line-height:1.4;border-left:2px solid ${color};padding-left:6px">${spec}</div>` : ''}
      <div class="doc-stats-row">
        ${vals.map(v=>`<div class="doc-stat">
          <div class="doc-stat-val" style="font-size:${v.value>99?'15px':'17px'}">${v.value}</div>
          <div class="doc-stat-lab">${v.label}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  // ── 1. IKT DOCTORS ───────────────────────────────────
  const iktGrid = document.getElementById('iktDoctorGrid');
  if (iktGrid) {
    iktGrid.innerHTML = '';
    // Compute period totals per doctor
    const iktWithTotals = IKT_DOC_DATA.map((doc, ri) => {
      let periodVals, statVals;
      if (f === 'full') {
        const tot25 = doc.m25.reduce((s,v)=>s+v, 0);
        const tot26 = doc.m26.slice(0,2).reduce((s,v)=>s+v, 0);
        periodVals = [tot25, doc.m26[0]||0, doc.m26[1]||0];
        statVals = [
          {label:'2025 Total', value: tot25},
          {label:'Jan 2026',   value: doc.m26[0]||0},
          {label:'Feb 2026',   value: doc.m26[1]||0},
        ];
      } else if (f === 'last3') {
        // Dec 2025, Jan 2026, Feb 2026
        const dec25 = doc.m25[11]||0;
        const jan26 = doc.m26[0]||0;
        const feb26 = doc.m26[1]||0;
        periodVals = [dec25, jan26, feb26];
        statVals = [
          {label:'Dec 2025', value: dec25},
          {label:'Jan 2026', value: jan26},
          {label:'Feb 2026', value: feb26},
        ];
      } else { // last1 = Feb 2026
        periodVals = [doc.m26[1]||0];
        statVals = [
          {label:'Feb 2026',    value: doc.m26[1]||0},
          {label:'Jan 2026',    value: doc.m26[0]||0},
          {label:'Dec 2025',    value: doc.m25[11]||0},
        ];
      }
      const periodTotal = periodVals.reduce((s,v)=>s+v, 0);
      return { ...doc, periodTotal, statVals, ri };
    })
    .filter(d => d.periodTotal > 0 || d.total25 > 0)
    .sort((a,b) => b.periodTotal - a.periodTotal);

    iktWithTotals.forEach((doc, rank) => {
      const initials = doc.name.split(/[.\s]/).filter(Boolean).map(p=>p[0]).join('').slice(0,2).toUpperCase();
      const color = COLORS[rank % COLORS.length];
      iktGrid.innerHTML += doctorCard(
        doc.name, doc.dept, color, initials,
        doc.statVals, null,
        `#${rank+1}`,
        doc.spec || ''
      );
    });

    // Summary strip
    const totals = iktWithTotals.reduce((s,d)=>s+d.periodTotal, 0);
    const summaryEl = document.getElementById('iktDoctorSummary');
    if (summaryEl) {
      const label = f==='full'?'Jan 2025 – Feb 2026':f==='last3'?'Dec 2025 – Feb 2026':'Feb 2026';
      summaryEl.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px 0 4px;font-size:13px;color:var(--grey7)">
          <span><strong style="color:var(--grey9)">${iktWithTotals.length}</strong> doctors active</span>
          <span><strong style="color:var(--blue)">${totals}</strong> total IKT cases · ${label}</span>
          <span>Top: <strong style="color:var(--green-dark)">${iktWithTotals[0]?.name||'—'}</strong> (${iktWithTotals[0]?.periodTotal||0} cases)</span>
        </div>`;
    }
  }

  // ── 2. CMCHIS DOCTORS ────────────────────────────────
  // Data available: Jan, Feb, Mar 2025 only
  const cmchisGrid = document.getElementById('cmchisDoctorGrid');
  const cmchisLB   = document.getElementById('cmchisLeaderboard');

  const cmchisWithTotals = CMCHIS_DOCTORS.map((name, i) => {
    let statVals, periodTotal;
    if (f === 'full' || f === 'last3') {
      // We have Jan+Feb+Mar 2025 — show all three regardless of filter
      // (label them clearly as Q1 2025 since that's all we have)
      statVals = [
        {label:'Jan 2025', value: CMCHIS_DOC_JAN[i]},
        {label:'Feb 2025', value: CMCHIS_DOC_FEB[i]},
        {label:'Mar 2025', value: CMCHIS_DOC_MAR[i]},
      ];
      periodTotal = CMCHIS_DOC_JAN[i] + CMCHIS_DOC_FEB[i] + CMCHIS_DOC_MAR[i];
    } else { // last1 — show latest available = Mar 2025
      statVals = [
        {label:'Mar 2025',  value: CMCHIS_DOC_MAR[i]},
        {label:'Feb 2025',  value: CMCHIS_DOC_FEB[i]},
        {label:'Jan 2025',  value: CMCHIS_DOC_JAN[i]},
      ];
      periodTotal = CMCHIS_DOC_MAR[i];
    }
    return { name, periodTotal, statVals, i };
  })
  .filter(d => d.periodTotal > 0)
  .sort((a,b) => b.periodTotal - a.periodTotal);

  if (cmchisGrid) {
    cmchisGrid.innerHTML = '';
    cmchisWithTotals.forEach((doc, rank) => {
      const initials = doc.name.split(/[.\s]/).filter(Boolean).map(p=>p[0]).join('').slice(0,2).toUpperCase();
      const color = COLORS[rank % COLORS.length];
      cmchisGrid.innerHTML += doctorCard(
        doc.name, 'CMCHIS', color, initials,
        doc.statVals, null,
        `#${rank+1}`,
        CMCHIS_DOC_META[doc.i]?.procs || ''
      );
    });
    // Note about data availability
    const noteEl = document.getElementById('cmchisDataNote');
    if (noteEl) {
      const noteMsg = f === 'last1'
        ? '⚠️ Only Mar 2025 shown — last 1 month of available CMCHIS doctor data'
        : '📋 Q1 2025 (Jan–Mar) data shown — full 2025 doctor breakdown not yet available';
      noteEl.textContent = noteMsg;
    }
  }

  // CMCHIS leaderboard table (still shown alongside cards)
  if (cmchisLB) {
    const sorted = [...cmchisWithTotals];
    cmchisLB.innerHTML = `<table class="drill-table" style="font-size:12px">
      <thead><tr>
        <th>#</th><th>Doctor</th>
        <th>${f==='last1'?'Mar 25':'Jan 25'}</th>
        <th>Feb 25</th>
        <th>${f==='last1'?'—':'Mar 25'}</th>
        <th>Q1 Total</th><th>Rank</th>
      </tr></thead>
      <tbody>${sorted.map((d,rank)=>{
        const bar = Math.round(d.periodTotal / (sorted[0].periodTotal||1) * 60);
        return `<tr>
          <td style="font-weight:700;color:${COLORS[rank%COLORS.length]}">${rank+1}</td>
          <td><strong>${d.name}</strong></td>
          <td>${CMCHIS_DOC_JAN[d.i]}</td>
          <td>${CMCHIS_DOC_FEB[d.i]}</td>
          <td>${CMCHIS_DOC_MAR[d.i]}</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <div style="width:${bar}px;height:6px;background:${COLORS[rank%COLORS.length]};border-radius:3px;min-width:4px"></div>
              <strong>${d.periodTotal}</strong>
            </div>
          </td>
          <td><span class="badge ${rank<3?'badge-green':'badge-blue'}" style="font-size:10px">${rank===0?'🏆 Top':rank<3?'Top 3':'Active'}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  // CMCHIS doctor chart — ranked horizontal stacked bar, same order & colours as the table
  const chartHeight = Math.max(260, cmchisWithTotals.length * 36);
  const chartCanvas = document.getElementById('cmchisDoctorChart');
  if (chartCanvas) {
    chartCanvas.parentElement.style.height = chartHeight + 'px';
  }
  safeChart('cmchisDoctorChart', {
    type: 'bar',
    data: {
      // Labels include rank number to mirror table
      labels: cmchisWithTotals.map((d, rank) => `#${rank+1}  ${d.name.split('.').pop()}`),
      datasets: [
        {
          label: 'Jan 2025',
          data: cmchisWithTotals.map(d => CMCHIS_DOC_JAN[d.i]),
          backgroundColor: '#1a73e8cc',
          borderRadius: { topLeft:0, bottomLeft:4, topRight:0, bottomRight:0 },
          stack: 'q1'
        },
        {
          label: 'Feb 2025',
          data: cmchisWithTotals.map(d => CMCHIS_DOC_FEB[d.i]),
          backgroundColor: '#34a853cc',
          borderRadius: 0,
          stack: 'q1'
        },
        {
          label: 'Mar 2025',
          data: cmchisWithTotals.map(d => CMCHIS_DOC_MAR[d.i]),
          backgroundColor: '#fbbc04cc',
          borderRadius: { topLeft:0, bottomLeft:0, topRight:4, bottomRight:4 },
          stack: 'q1'
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      onClick: (e, els) => {
        if (els.length) {
          const d = cmchisWithTotals[els[0].index];
          if (d) showDrill('doctor', { name: d.name, dept:'CMCHIS',
            m25: [CMCHIS_DOC_JAN[d.i], CMCHIS_DOC_FEB[d.i], CMCHIS_DOC_MAR[d.i]],
            m26: [], total25: d.periodTotal });
        }
      },
      plugins: {
        legend: { labels: { color: '#5f6368', font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const idx = items[0]?.dataIndex;
              const d = cmchisWithTotals[idx];
              return d ? [`Q1 Total: ${d.periodTotal} cases`] : [];
            }
          }
        },
        datalabels: {
          display: (ctx) => ctx.datasetIndex === 2, // show only on last segment
          anchor: 'end',
          align: 'right',
          formatter: (_, ctx) => {
            const d = cmchisWithTotals[ctx.dataIndex];
            return d ? `${d.periodTotal}` : '';
          },
          color: '#3c4043',
          font: { size: 11, weight: '700' }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: { color: '#5f6368', font: { size: 10 } },
          grid: { color: 'rgba(0,0,0,.06)' },
          title: { display: true, text: 'Cases', color: '#5f6368', font: { size: 11 } }
        },
        y: {
          stacked: true,
          ticks: { color: '#3c4043', font: { size: 11, weight: '500' } },
          grid: { display: false }
        }
      },
      layout: { padding: { right: 40 } }
    },
    plugins: [ChartDataLabels]
  });

  // ── 3. COLPOSCOPY DOCTORS ────────────────────────────
  const colpoGrid = document.getElementById('doctorGrid');
  if (colpoGrid) {
    colpoGrid.innerHTML = '';
    // Map ALL_MONTHS_KEYS indices to COLPO_DOC_MONTHLY indices
    // COLPO_DOC_MONTHLY[i] = [Jan25...Dec25, Jan26, Feb26] → indices 0..13
    const colpoMonthIdx = {
      'Jan 2025':0,'Feb 2025':1,'Mar 2025':2,'Apr 2025':3,'May 2025':4,'Jun 2025':5,
      'Jul 2025':6,'Aug 2025':7,'Sep 2025':8,'Oct 2025':9,'Nov 2025':10,'Dec 2025':11,
      'Jan 2026':12,'Feb 2026':13
    };

    const colpoWithTotals = DOCTORS.map((name, i) => {
      const monthly = COLPO_DOC_MONTHLY[i];
      const keys = getActiveKeys();
      const values = keys.map(k => monthly[colpoMonthIdx[k]] || 0);
      const periodTotal = values.reduce((s,v)=>s+v, 0);
      let statVals;
      if (f === 'full') {
        const tot25 = monthly.slice(0,12).reduce((s,v)=>s+v,0);
        statVals = [
          {label:'2025 Total', value: tot25},
          {label:'Jan 2026',   value: monthly[12]},
          {label:'Feb 2026',   value: monthly[13]},
        ];
      } else if (f === 'last3') {
        statVals = [
          {label:'Dec 2025', value: monthly[11]},
          {label:'Jan 2026', value: monthly[12]},
          {label:'Feb 2026', value: monthly[13]},
        ];
      } else {
        statVals = [
          {label:'Feb 2026', value: monthly[13]},
          {label:'Jan 2026', value: monthly[12]},
          {label:'Dec 2025', value: monthly[11]},
        ];
      }
      return { name, periodTotal, statVals, i, monthly };
    }).sort((a,b) => b.periodTotal - a.periodTotal);

    colpoWithTotals.forEach((doc, rank) => {
      const initials = doc.name.split('.').map(p=>p[0]).join('').slice(0,2).toUpperCase();
      const color = avatarColors[doc.i];
      colpoGrid.innerHTML += doctorCard(
        doc.name, 'Colposcopy', color, initials,
        doc.statVals, null,
        `#${rank+1}`
      );
    });
  }

  // Colposcopy charts — always show Oct/Nov/Dec + Jan/Feb 2026
  safeChart('colpoChart', {
    type:'bar',
    data:{labels:DOCTORS.map(d=>d.split('.').pop()),datasets:[
      {label:'Oct 25',  data:DOC_OCT,    backgroundColor:'#9c27b088',borderRadius:4},
      {label:'Nov 25',  data:DOC_NOV,    backgroundColor:'#1a73e888',borderRadius:4},
      {label:'Dec 25',  data:DOC_DEC,    backgroundColor:'#34a85388',borderRadius:4},
      {label:'Jan 26',  data:DOC_JAN26,  backgroundColor:'#fbbc0488',borderRadius:4},
      {label:'Feb 26',  data:DOC_FEB26,  backgroundColor:'#ff572288',borderRadius:4},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5f6368',font:{size:10}}},datalabels:{display:false}},
      scales:{x:{ticks:{color:'#5f6368',font:{size:10}},grid:{color:'rgba(0,0,0,.06)'}},
              y:{ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,.06)'},beginAtZero:true}}}
  });

  safeChart('colpoShare', {
    type:'doughnut',
    data:{
      labels:DOCTORS,
      datasets:[{
        data: f==='last1' ? DOC_FEB26 : f==='last3'
          ? DOC_DEC.map((v,i)=>v+DOC_JAN26[i]+DOC_FEB26[i])
          : COLPO_DOC_MONTHLY.map(m=>m.reduce((s,v)=>s+v,0)),
        backgroundColor:avatarColors,borderWidth:2,borderColor:'#fff'
      }]
    },
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{color:'#5f6368',font:{size:10},boxWidth:10}}}}
  });

  // Colposcopy ranking
  const rankDiv = document.getElementById('doctorRanking');
  if (rankDiv) {
    const ranked = DOCTORS.map((d,i)=>{
      const monthly = COLPO_DOC_MONTHLY[i];
      const keys = getActiveKeys();
      const total = keys.reduce((s,k)=>s+(monthly[{
        'Jan 2025':0,'Feb 2025':1,'Mar 2025':2,'Apr 2025':3,'May 2025':4,'Jun 2025':5,
        'Jul 2025':6,'Aug 2025':7,'Sep 2025':8,'Oct 2025':9,'Nov 2025':10,'Dec 2025':11,
        'Jan 2026':12,'Feb 2026':13
      }[k]]||0), 0);
      return {d, total, i};
    }).sort((a,b)=>b.total-a.total);
    const periodLabel = f==='full'?'Full Year':f==='last3'?'Last 3 Months':'Feb 2026';
    rankDiv.innerHTML = `<div style="font-size:11px;font-weight:600;color:var(--grey6);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${periodLabel} Ranking</div>`+
      ranked.map((r,rank)=>`<div class="stat-row">
        <div style="display:flex;align-items:center;gap:8px;flex:1">
          <div style="width:20px;height:20px;border-radius:50%;background:${avatarColors[r.i]};display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700">${rank+1}</div>
          <div style="font-size:13px;color:var(--grey8)">${r.d}</div>
        </div>
        <div style="font-size:13px;font-weight:600;color:var(--grey9)">${r.total} cases</div>
      </div>`).join('');
  }
}
// ══════════════════════════════════════════════════════
// ══  ANNUAL TABLE — MONTH ROWS CLICKABLE  ════════════
// ══════════════════════════════════════════════════════

function buildAnnualTable() {
  const tbody = document.getElementById('annualTableBody');
  if (!tbody) return;
  const mLabels = ALL_MONTHS_LABELS;
  tbody.innerHTML = ALL_MONTHS_KEYS.map((m,i)=>{
    const app=MONTHLY_APPLIED_2025[i]||0, appr=MONTHLY_APPROVED_2025[i]||0;
    const den=MONTHLY_DENIED_2025[i]||0, amt=MONTHLY_AMOUNT_2025[i]||0;
    const rate=app>0?(appr/app*100).toFixed(1):0;
    const rN=parseFloat(rate);
    const status=rN>=90?'<span class="badge badge-green">GOOD</span>':rN>=80?'<span class="badge badge-yellow">WATCH</span>':'<span class="badge badge-red">REVIEW</span>';
    const is26 = m.includes('2026');
    return `<tr onclick="showDrill('month','${m}')" style="${is26?'background:var(--blue-light)':''}">
      <td><strong>${mLabels[i]}</strong>${is26?' <span style="font-size:10px;color:var(--blue);font-weight:600">2026</span>':''}</td>
      <td>${app}</td>
      <td style="color:var(--green-dark);font-weight:600">${appr}</td>
      <td style="color:${den>20?'var(--red)':'var(--grey8)'}">${den}</td>
      <td>₹${(amt/100000).toFixed(1)}L</td>
      <td style="font-weight:600;color:${rN>=90?'var(--green-dark)':rN>=80?'var(--yellow-dark)':'var(--red)'}">
        ${rate}%</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
  // Footer
  const totApp=MONTHLY_APPLIED_2025.reduce((s,v)=>s+v,0);
  const totAppr=MONTHLY_APPROVED_2025.reduce((s,v)=>s+v,0);
  const totDen=MONTHLY_DENIED_2025.reduce((s,v)=>s+v,0);
  const totAmt=MONTHLY_AMOUNT_2025.reduce((s,v)=>s+v,0);
  const annR=(totAppr/totApp*100).toFixed(1);
  const foot=document.getElementById('annualTableFoot');
  if(foot) foot.innerHTML=`<tr style="background:var(--grey1);font-weight:700">
    <td>TOTAL (14 mo)</td><td>${totApp}</td>
    <td style="color:var(--green-dark)">${totAppr}</td>
    <td style="color:var(--red)">${totDen}</td>
    <td>₹${(totAmt/100000).toFixed(1)}L</td>
    <td style="color:var(--green-dark)">${annR}%</td>
    <td><span class="badge badge-green">ANNUAL</span></td>
  </tr>`;
}

// ══════════════════════════════════════════════════════
// ══  CMCHIS DEEP-DIVE PAGE  ═══════════════════════════
// ══════════════════════════════════════════════════════

function buildCmchisDeepDive() {
  safeChart('cmchisDenialPie', {
    type:'doughnut',
    data:{ labels:['Missing/Incorrect Documents','Procedure Not Covered','Timing Window Lapsed',
                   'Pre-Auth Not Obtained','Duplicate/Resubmission','Other'],
      datasets:[{data:[32,22,18,12,9,7],
        backgroundColor:['#ea4335','#fbbc04','#ff5722','#9c27b0','#1a73e8','#80868b'],
        borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'right',labels:{color:'#5f6368',font:{size:11},boxWidth:12}}}}
  });

  const denials = MONTHLY_DENIED_2025;
  const rates   = MONTHLY_APPROVED_2025.map((a,i)=>parseFloat((a/(MONTHLY_APPLIED_2025[i]||1)*100).toFixed(1)));
  safeChart('cmchisDenialTrend', {
    type:'bar',
    data:{ labels:ALL_MONTHS_LABELS,
      datasets:[
        {label:'Denials',data:denials,backgroundColor:'#ea433577',borderRadius:4,yAxisID:'y'},
        {label:'Approval %',data:rates,type:'line',borderColor:'#34a853',
         backgroundColor:'transparent',tension:0.4,pointRadius:4,borderWidth:2.5,yAxisID:'y2'}
      ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
      scales:{
        y:{ticks:{color:'#5f6368'},grid:{color:'rgba(0,0,0,.06)'},title:{display:true,text:'Denials',color:'#5f6368'}},
        y2:{position:'right',min:60,max:100,ticks:{color:'#34a853',callback:v=>v+'%'},grid:{display:false},title:{display:true,text:'Approval %',color:'#34a853'}},
        x:{ticks:{color:'#5f6368',font:{size:10}},grid:{color:'rgba(0,0,0,.06)'}}
      }}
  });

  const deptAvgPkg=[12000,8500,7500,18000,3500,8500,8200,8800,6800,5500,7800,18000];
  const highRisk=['Jun–Jul','Jun–Jul','Mar–Apr','Apr–Jun','Jun','May–Jun','Mar–Apr','Jun–Jul','Jun–Sep','Jun–Oct','Jun–Aug','All year'];
  const body=document.getElementById('cmchisDeptDenialBody');
  if(body){
    const rows=DEPTS.map((d,i)=>{
      const ann=MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0);
      const estApplied=Math.round(ann/0.854);
      const estDenied=estApplied-ann;
      const rate=(estDenied/estApplied*100).toFixed(1);
      const revLost=estDenied*deptAvgPkg[i];
      const cls=parseFloat(rate)>20?'badge-red':parseFloat(rate)>12?'badge-yellow':'badge-green';
      const st=parseFloat(rate)>20?'HIGH DENIAL':parseFloat(rate)>12?'WATCH':'GOOD';
      return{d,ann,estDenied,rate:parseFloat(rate),revLost,hr:highRisk[i],cls,st,i};
    }).sort((a,b)=>b.rate-a.rate);
    body.innerHTML=rows.map(r=>`<tr onclick="showDrill('dept','${r.d}')" style="cursor:pointer">
      <td><strong style="color:${COLORS[r.i]}">${r.d}</strong></td>
      <td>${r.ann}</td>
      <td style="color:var(--red);font-weight:600">${r.estDenied}</td>
      <td style="font-weight:600;color:${r.rate>20?'var(--red)':r.rate>12?'var(--yellow-dark)':'var(--green-dark)'}">${r.rate}%</td>
      <td style="font-size:11px;color:var(--grey6)">${r.hr}</td>
      <td style="color:var(--red)">₹${(r.revLost/100000).toFixed(1)}L est.</td>
      <td><span class="badge ${r.cls}" style="font-size:10px">${r.st}</span></td>
    </tr>`).join('');
    makeSortable('cmchisDeptDenialTable');
  }

  const failEl=document.getElementById('cmchisFailureList');
  if(failEl){
    const reasons=[
      {icon:'📋',fail:'Missing discharge summary / case sheet',action:'Ward nurse pre-fill checklist at discharge',priority:'High'},
      {icon:'🪪',fail:'Aadhaar not captured at admission',action:'Aadhaar capture as first step at registration',priority:'High'},
      {icon:'⏰',fail:'Claim submitted after 72-hour window',action:'Daily 9 AM submission deadline + MS WhatsApp alert',priority:'High'},
      {icon:'🔢',fail:'Wrong CMCHIS procedure code selected',action:'Laminated code chart at each dept nurses station',priority:'High'},
      {icon:'💊',fail:'Procedure not in CMCHIS package list',action:'Pre-auth check before procedure for all planned cases',priority:'Medium'},
      {icon:'🔁',fail:'Duplicate claim submission',action:'Check portal for pending claims before resubmitting',priority:'Medium'},
      {icon:'📄',fail:'Lab reports not attached to claim',action:'Claim checklist with mandatory attachment list',priority:'Medium'},
    ];
    failEl.innerHTML=reasons.map(r=>`<div class="checklist-item">
      <div class="ci-num" style="background:${r.priority==='High'?'var(--red-light)':'var(--yellow-light)'};color:${r.priority==='High'?'var(--red)':'var(--yellow-dark)'};font-size:14px">${r.icon}</div>
      <div class="ci-text"><strong>${r.fail}</strong>
        <div class="ci-dept" style="color:var(--green-dark)">✓ Fix: ${r.action}</div></div>
      <span class="badge ${r.priority==='High'?'badge-red':'badge-yellow'}" style="font-size:10px;flex-shrink:0">${r.priority}</span>
    </div>`).join('');
  }

  const funnelEl=document.getElementById('cmchisClaimFunnel');
  if(funnelEl){
    const stages=[
      {label:'Patient Admitted',val:1860,pct:'100%',color:'#1a73e8'},
      {label:'CMCHIS Eligible',val:1810,pct:'97.3%',color:'#1a73e8'},
      {label:'Claim Submitted',val:1860,pct:'100%',color:'#fbbc04'},
      {label:'Documents Complete',val:1650,pct:'88.7%',color:'#fbbc04'},
      {label:'Approved & Paid',val:1588,pct:'85.4%',color:'#34a853'},
    ];
    funnelEl.innerHTML=stages.map(s=>`<div class="funnel-stage">
      <div class="funnel-label">${s.label}</div>
      <div class="funnel-bar-wrap"><div class="funnel-fill" style="width:${(s.val/1860*100).toFixed(0)}%;background:${s.color}">${s.pct}</div></div>
      <div class="funnel-val">${s.val.toLocaleString('en-IN')}</div>
    </div>`).join('');
  }

  const hmEl=document.getElementById('cmchisHeatmap');
  if(hmEl){
    // Per-dept max for color scaling — each dept's own peak = darkest
    // This shows seasonal patterns within each dept clearly
    const deptMaxVals = DEPTS.map((_,i)=>Math.max(...MONTHS_2025.map(m=>DATA_2025[m][i]||0), 1));
    const globalMax   = Math.max(...deptMaxVals);

    hmEl.innerHTML=`
      <div style="font-size:11px;color:var(--grey6);margin-bottom:8px;padding:6px 8px;background:var(--grey1);border-radius:6px;border-left:3px solid var(--blue)">
        <strong>Color scale:</strong> Each row is independently scaled to its own peak (darkest = that dept's highest month). 
        DIALYSIS: high Jan–May (83–86/mo, CMCHIS scheme), drops Jun onward (shifted to TN state dialysis scheme). 
        POISONING: seasonal surge Jun–Oct (monsoon + harvest organophosphate poisoning). Both patterns are factually correct.
      </div>
      <table style="border-collapse:collapse;font-size:11px;min-width:700px;width:100%">
        <thead><tr>
          <th style="text-align:left;padding:4px 8px;color:var(--grey6);font-weight:600;border-bottom:2px solid var(--grey3);white-space:nowrap">Dept</th>
          ${MONTHS_2025.map(m=>`<th style="padding:4px 5px;color:var(--grey6);font-weight:600;border-bottom:2px solid var(--grey3);text-align:center">${m.split(' ')[0]}</th>`).join('')}
          <th style="padding:4px 8px;color:var(--grey6);font-weight:600;border-bottom:2px solid var(--grey3);text-align:center">Total</th>
          <th style="padding:4px 8px;color:var(--grey6);font-weight:600;border-bottom:2px solid var(--grey3);text-align:center">Peak</th>
          <th style="padding:4px 8px;color:var(--grey6);font-weight:600;border-bottom:2px solid var(--grey3);text-align:left">Note</th>
        </tr></thead>
        <tbody>${DEPTS.map((d,i)=>{
          const dmax   = deptMaxVals[i];
          const annual = MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0);
          const peakMo = MONTHS_2025.reduce((pk,m)=>(DATA_2025[m][i]||0)>(DATA_2025[pk][i]||0)?m:pk, MONTHS_2025[0]);
          const peakV  = DATA_2025[peakMo][i]||0;
          const avg    = (annual/12).toFixed(0);
          // Dept-specific notes
          const notes  = {
            DIALYSIS: '⚠️ Jun–Dec: shifted to TN state scheme — not CMCHIS',
            POISONING: '🌧️ Monsoon surge Jun–Oct (organophosphate)',
            ASV: '🐍 Seasonal — peak Jun–Oct',
            BURNS: '',
            'MI/CVA': '❗ Low volume — growth opportunity',
            DENTAL: '❗ Very low — scheme under-utilised',
          };
          const note = notes[d] || '';
          // Color: use dept's own max; highlight if value is dept's own peak
          return `<tr>
            <td style="padding:5px 8px;font-weight:600;color:${COLORS[i]};white-space:nowrap;border-bottom:1px solid var(--grey3)">${d}</td>
            ${MONTHS_2025.map(m=>{
              const v=DATA_2025[m][i]||0;
              const intensity = dmax>0 ? v/dmax : 0;
              const bg=`rgba(26,115,232,${(0.05+intensity*0.88).toFixed(2)})`;
              const tc=intensity>0.5?'#fff':'#202124';
              const isPeak = v===dmax && dmax>0;
              return `<td style="padding:4px 5px;text-align:center;background:${bg};color:${tc};border-bottom:1px solid var(--grey3);border:${isPeak?'2px solid #fbbc04':'1px solid var(--grey3)'};cursor:pointer;font-weight:${isPeak?'700':'400'}" onclick="showDrill('month','${m}')" title="${d} · ${m}: ${v} cases (${(intensity*100).toFixed(0)}% of dept peak)">${v||''}</td>`;
            }).join('')}
            <td style="padding:5px 8px;font-weight:700;border-bottom:1px solid var(--grey3);border-left:2px solid var(--grey3);text-align:center">${annual}</td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--grey3);text-align:center;color:${COLORS[i]};font-weight:600">${peakV}<br><span style="font-size:9px;color:var(--grey6)">${peakMo.split(' ')[0]}</span></td>
            <td style="padding:5px 8px;border-bottom:1px solid var(--grey3);font-size:10px;color:var(--grey6);white-space:nowrap">${note}</td>
          </tr>`;
        }).join('')}
        </tbody>
        <tfoot><tr>
          <td style="padding:5px 8px;font-weight:700;border-top:2px solid var(--grey3)">TOTAL</td>
          ${MONTHS_2025.map(m=>{
            const tot=DEPTS.reduce((s,d,i)=>s+(DATA_2025[m][i]||0),0);
            const globalIntensity=globalMax>0?tot/globalMax:0;
            const bg=`rgba(52,168,83,${(0.05+globalIntensity*0.6).toFixed(2)})`;
            return `<td style="padding:4px 5px;text-align:center;background:${bg};font-weight:600;font-size:11px;border-top:2px solid var(--grey3)">${tot}</td>`;
          }).join('')}
          <td style="padding:5px 8px;font-weight:700;border-top:2px solid var(--grey3);border-left:2px solid var(--grey3);text-align:center">${DEPTS.reduce((s,d,i)=>s+MONTHS_2025.reduce((ss,m)=>ss+(DATA_2025[m][i]||0),0),0)}</td>
          <td colspan="2" style="border-top:2px solid var(--grey3)"></td>
        </tr></tfoot>
      </table>`;
  }
}

// ══════════════════════════════════════════════════════
// ══  TARGETS & ACHIEVEMENT PAGE  ══════════════════════
// ══════════════════════════════════════════════════════

let TARGETS = {
  monthly_cases:   [150,120,160,165,190,155,170,130,140,155,140,145,160,200],
  monthly_revenue: [900000,700000,900000,850000,950000,700000,800000,550000,650000,550000,900000,800000,900000,1100000],
  dept_cases_2026: [20,30,18,14,3,8,5,15,75,6,2,2],
};

function openTargetEditor() {
  const panel=document.getElementById('targetEditorPanel');
  panel.style.display=panel.style.display==='none'?'':'none';
  const fields=document.getElementById('targetEditorFields');
  const inputs=[
    {key:'overall_monthly_cases',label:'Overall Monthly Cases Target',val:TARGETS.monthly_cases[13]||200},
    {key:'overall_monthly_revenue',label:'Monthly Revenue Target (₹)',val:TARGETS.monthly_revenue[13]||1100000},
    {key:'approval_rate_pct',label:'Approval Rate Target (%)',val:92},
    {key:'ikt_monthly_cases',label:'IKT Monthly Cases Target',val:180},
    ...DEPTS.map((d,i)=>({key:`dept_${i}`,label:`${d} Monthly Target`,val:TARGETS.dept_cases_2026[i]}))
  ];
  fields.innerHTML=inputs.map(f=>`<div>
    <label style="font-size:12px;color:var(--grey7);font-weight:500;display:block;margin-bottom:4px">${f.label}</label>
    <input id="tgt_${f.key}" type="number" value="${f.val}"
      style="width:100%;border:1px solid var(--grey4);border-radius:6px;padding:8px 10px;font-size:13px;outline:none"
      onfocus="this.style.borderColor='var(--blue)'" onblur="this.style.borderColor='var(--grey4)'">
  </div>`).join('');
}

function saveTargets() {
  const get=id=>parseFloat(document.getElementById('tgt_'+id)?.value)||0;
  TARGETS.monthly_cases[13]=get('overall_monthly_cases');
  TARGETS.monthly_revenue[13]=get('overall_monthly_revenue');
  DEPTS.forEach((_,i)=>{TARGETS.dept_cases_2026[i]=get(`dept_${i}`);});
  document.getElementById('targetEditorPanel').style.display='none';
  buildTargetsPage();
  showToast('✅ Targets saved');
}

function buildTargetsPage() {
  const kpiEl=document.getElementById('targetKpiCards');
  if(kpiEl){
    const latestActual=MONTHLY_APPROVED_2025[13]||193;
    const latestTarget=TARGETS.monthly_cases[13]||200;
    const latestRevActual=MONTHLY_AMOUNT_2025[13]||1150000;
    const latestRevTarget=TARGETS.monthly_revenue[13]||1100000;
    const ann=MONTHLY_APPROVED_2025.slice(0,12).reduce((s,v)=>s+v,0);
    const annTarget=TARGETS.monthly_cases.slice(0,12).reduce((s,v)=>s+v,0);
    const achPct=(latestActual/latestTarget*100).toFixed(1);
    const revPct=(latestRevActual/latestRevTarget*100).toFixed(1);
    const annPct=(ann/annTarget*100).toFixed(1);
    const sc=p=>parseFloat(p)>=100?'mc-green':parseFloat(p)>=85?'mc-yellow':'mc-red';
    const up=p=>parseFloat(p)>=100?'trend-up':'trend-down';
    kpiEl.innerHTML=`
      <div class="metric-card ${sc(achPct)}" onclick="showDrill('approval-rate')">
        <div class="mc-label">Feb 2026 Cases vs Target</div>
        <div class="mc-value">${latestActual}/${latestTarget}</div>
        <div class="mc-sub"><span class="mc-trend ${up(achPct)}">${achPct}% achieved</span></div>
      </div>
      <div class="metric-card ${sc(revPct)}" onclick="showDrill('annual-revenue')">
        <div class="mc-label">Feb 2026 Revenue vs Target</div>
        <div class="mc-value">₹${(latestRevActual/100000).toFixed(1)}L / ₹${(latestRevTarget/100000).toFixed(0)}L</div>
        <div class="mc-sub"><span class="mc-trend ${up(revPct)}">${revPct}% achieved</span></div>
      </div>
      <div class="metric-card ${sc(annPct)}">
        <div class="mc-label">2025 Annual vs Target</div>
        <div class="mc-value">${ann}/${annTarget}</div>
        <div class="mc-sub"><span class="mc-trend ${up(annPct)}">${annPct}% achieved</span></div>
      </div>
      <div class="metric-card mc-blue">
        <div class="mc-label">Months Target Met</div>
        <div class="mc-value">${MONTHLY_APPROVED_2025.filter((v,i)=>v>=(TARGETS.monthly_cases[i]||0)).length}</div>
        <div class="mc-sub">of ${MONTHLY_APPROVED_2025.length} months</div>
      </div>`;
  }

  const tbody=document.getElementById('targetAchievBody');
  if(tbody){
    tbody.innerHTML=ALL_MONTHS_KEYS.map((m,i)=>{
      const actual=MONTHLY_APPROVED_2025[i]||0;
      const tgtC=TARGETS.monthly_cases[i]||150;
      const actualR=MONTHLY_AMOUNT_2025[i]||0;
      const tgtR=TARGETS.monthly_revenue[i]||900000;
      const pctC=tgtC>0?(actual/tgtC*100).toFixed(1):'-';
      const pctR=tgtR>0?(actualR/tgtR*100).toFixed(1):'-';
      const met=parseFloat(pctC)>=100;
      const revMet=parseFloat(pctR)>=100;
      const is26=i>=12;
      return `<tr onclick="showDrill('month','${m}')" style="cursor:pointer;${is26?'background:var(--blue-light)':''}">
        <td><strong>${ALL_MONTHS_LABELS[i]}</strong>${is26?'<span style="font-size:10px;color:var(--blue);margin-left:4px">2026</span>':''}</td>
        <td style="color:var(--grey6)">${tgtC}</td>
        <td style="font-weight:600;color:${met?'var(--green-dark)':'var(--grey9)'}">${actual}</td>
        <td style="font-weight:600;color:${met?'var(--green-dark)':parseFloat(pctC)>=85?'var(--yellow-dark)':'var(--red)'}">${pctC}%
          <span style="font-size:10px">${met?'✓':''+(actual-tgtC)}</span></td>
        <td style="color:var(--grey6)">₹${(tgtR/100000).toFixed(1)}L</td>
        <td style="font-weight:600">₹${(actualR/100000).toFixed(1)}L</td>
        <td style="font-weight:600;color:${revMet?'var(--green-dark)':parseFloat(pctR)>=85?'var(--yellow-dark)':'var(--red)'}">${pctR}%</td>
        <td><span class="badge ${met?'badge-green':parseFloat(pctC)>=85?'badge-yellow':'badge-red'}" style="font-size:10px">${met?'✅ MET':parseFloat(pctC)>=85?'CLOSE':'MISSED'}</span></td>
      </tr>`;
    }).join('');
  }

  safeChart('targetCasesChart',{type:'bar',
    data:{labels:ALL_MONTHS_LABELS,datasets:[
      {label:'Target',data:TARGETS.monthly_cases,backgroundColor:'rgba(0,0,0,0.1)',borderColor:'#5f6368',borderWidth:1.5,borderRadius:2},
      {label:'Actual',data:MONTHLY_APPROVED_2025,
       backgroundColor:MONTHLY_APPROVED_2025.map((v,i)=>v>=(TARGETS.monthly_cases[i]||150)?'#34a853aa':'#ea4335aa'),borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
      scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},y:{ticks:{color:'#5f6368'},beginAtZero:true}}}
  });

  safeChart('targetRevenueChart',{type:'bar',
    data:{labels:ALL_MONTHS_LABELS,datasets:[
      {label:'Target ₹',data:TARGETS.monthly_revenue,backgroundColor:'rgba(0,0,0,0.1)',borderColor:'#5f6368',borderWidth:1.5,borderRadius:2},
      {label:'Actual ₹',data:MONTHLY_AMOUNT_2025,
       backgroundColor:MONTHLY_AMOUNT_2025.map((v,i)=>v>=(TARGETS.monthly_revenue[i]||900000)?'#34a853aa':'#fbbc0488'),borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{labels:{color:'#5f6368',font:{size:11}}},datalabels:{display:false}},
      scales:{x:{ticks:{color:'#5f6368',font:{size:10}}},
        y:{ticks:{color:'#5f6368',callback:v=>'₹'+(v/100000).toFixed(0)+'L'},beginAtZero:true}}}
  });

  const dtb=document.getElementById('deptTargetBody');
  if(dtb){
    dtb.innerHTML=DEPTS.map((d,i)=>{
      const avg25=Math.round(MONTHS_2025.reduce((s,m)=>s+(DATA_2025[m][i]||0),0)/12);
      const tgt26=TARGETS.dept_cases_2026[i]||avg25+2;
      const jan26=DATA_2025['Jan 2026'][i]||0;
      const feb26=DATA_2025['Feb 2026'][i]||0;
      const janMet=jan26>=tgt26; const febMet=feb26>=tgt26;
      const revTgt=tgt26*(CMCHIS_PACKAGES.find(p=>p.dept===d)?.rate||8000);
      return `<tr>
        <td><strong style="color:${COLORS[i]}">${d}</strong></td>
        <td>${avg25}</td><td style="font-weight:600">${tgt26}</td>
        <td>₹${(revTgt/1000).toFixed(0)}K</td>
        <td style="font-weight:600;color:${janMet?'var(--green-dark)':'var(--red)'}">${jan26}</td>
        <td style="font-weight:600;color:${febMet?'var(--green-dark)':'var(--red)'}">${feb26}</td>
        <td><span class="badge ${janMet?'badge-green':'badge-red'}" style="font-size:10px">${janMet?'✅ Met':'Missed '+(tgt26-jan26)}</span></td>
        <td><span class="badge ${febMet?'badge-green':'badge-red'}" style="font-size:10px">${febMet?'✅ Met':'Missed '+(tgt26-feb26)}</span></td>
      </tr>`;
    }).join('');
    makeSortable('deptTargetTable');
  }
}

// ══════════════════════════════════════════════════════
// ══  DOCTOR REVENUE RANKING  ══════════════════════════
// ══════════════════════════════════════════════════════

const IKT_RATE  = 5000;
const COLPO_RATE = 1500;

function buildDoctorRevenueSection() {
  const el = document.getElementById('doctorRevenueSection');
  if (!el) return;

  const colpoIdx = {
    'Jan 2025':0,'Feb 2025':1,'Mar 2025':2,'Apr 2025':3,'May 2025':4,'Jun 2025':5,
    'Jul 2025':6,'Aug 2025':7,'Sep 2025':8,'Oct 2025':9,'Nov 2025':10,'Dec 2025':11,
    'Jan 2026':12,'Feb 2026':13
  };
  const keys = getActiveKeys();
  const periodLabel = activeFilter==='full'?'Full Year (Jan 2025–Feb 2026)':activeFilter==='last3'?'Last 3 Months':'Feb 2026';

  const allDocs = [];

  // Colposcopy (CMCHIS actual rate ₹1,500/case)
  DOCTORS.forEach((name,i) => {
    const monthly = COLPO_DOC_MONTHLY[i];
    const cases = keys.reduce((s,k)=>s+(monthly[colpoIdx[k]]||0),0);
    allDocs.push({name, dept:'Colposcopy', specialty:'OG / Gynaecology',
      cases, revenue:cases*COLPO_RATE, revenueNote:'actual',
      color:avatarColors[i], docType:'colpo', idx:i});
  });

  // IKT (estimated ₹14K avg/case)
  IKT_DOC_DATA.forEach((doc, ri) => {
    const cases = keys.reduce((s,k)=>{
      const ci = colpoIdx[k];
      return s + (ci>=12 ? (doc.m26[ci-12]||0) : (doc.m25[ci]||0));
    }, 0);
    allDocs.push({name:doc.name, dept:doc.dept, specialty:doc.spec||doc.dept,
      cases, revenue:cases*IKT_RATE, revenueNote:'estimated',
      color:COLORS[ri%COLORS.length], docType:'ikt', idx:ri});
  });

  // CMCHIS Q1 2025 (estimated ₹8K avg/case)
  CMCHIS_DOCTORS.forEach((name, i) => {
    const cases = CMCHIS_DOC_JAN[i]+CMCHIS_DOC_FEB[i]+CMCHIS_DOC_MAR[i];
    const meta = CMCHIS_DOC_META[i] || {};
    allDocs.push({name, dept:meta.spec||'CMCHIS', specialty:meta.procs||'',
      cases, revenue:cases*8000, revenueNote:'estimated',
      color:COLORS[i%COLORS.length], docType:'cmchis', idx:i, note:'Q1 2025'});
  });

  function fmtRev(v){return v>=100000?'₹'+(v/100000).toFixed(1)+'L':'₹'+Math.round(v/1000)+'K';}
  function medal(i){return i===0?'🥇':i===1?'🥈':i===2?'🥉':'<span style="font-size:10px;color:var(--grey6)">#'+(i+1)+'</span>';}

  function makeRow(d, rank) {
    const schemeStyle = d.docType==='colpo'?'background:var(--green-light);color:var(--green-dark)'
      :d.docType==='ikt'?'background:var(--blue-light);color:var(--blue)'
      :'background:var(--yellow-light);color:var(--yellow-dark)';
    const onClick = d.docType==='ikt'
      ? `showDrill('ikt-doctor','${d.name}')`
      : d.docType==='cmchis'
        ? `showDrill('doctor',{name:'${d.name}',dept:'CMCHIS',m25:[${CMCHIS_DOC_JAN[d.idx]},${CMCHIS_DOC_FEB[d.idx]},${CMCHIS_DOC_MAR[d.idx]}],m26:[],total25:${d.cases}})`
        : `showToast('Dr. ${d.name} — ${d.cases} cases · ${fmtRev(d.revenue)} Colposcopy')`;
    const noteTag = d.note?`<span style="font-size:9px;color:var(--grey5);margin-left:4px">(${d.note})</span>`:'';
    return `<tr onclick="${onClick}" style="cursor:pointer">
      <td style="text-align:center;font-weight:700;color:${d.color}">${medal(rank)}</td>
      <td>
        <strong>${d.name}</strong>${noteTag}
        <div style="font-size:10px;color:var(--grey6);margin-top:1px">${(d.specialty||'').substring(0,55)}</div>
      </td>
      <td><span style="font-size:10px;padding:2px 6px;border-radius:6px;white-space:nowrap;${schemeStyle}">${d.dept.substring(0,18)}</span></td>
      <td style="font-weight:600;text-align:center">${d.cases}</td>
      <td style="font-weight:600;color:var(--green-dark)">${fmtRev(d.revenue)}</td>
      <td style="font-size:10px;color:${d.revenueNote==='actual'?'var(--green-dark)':'var(--grey6)'}">${d.revenueNote==='actual'?'✅':'⚠️'}</td>
    </tr>`;
  }

  function renderTable(arr, tbodyId, tfootId) {
    const tbody = document.getElementById(tbodyId);
    const tfoot = document.getElementById(tfootId);
    if (!tbody) return;
    tbody.innerHTML = arr.map((d,i)=>makeRow(d,i)).join('');
    if (tfoot) {
      const totC = arr.reduce((s,d)=>s+d.cases,0);
      const totR = arr.reduce((s,d)=>s+d.revenue,0);
      tfoot.innerHTML = `<tr style="background:var(--grey1);font-weight:700">
        <td colspan="3">Total — ${arr.length} doctors</td>
        <td style="text-align:center">${totC}</td>
        <td style="color:var(--green-dark)">${fmtRev(totR)} ⚠️</td>
        <td style="font-size:10px;color:var(--grey6)">Mixed</td>
      </tr>`;
    }
  }

  const byVol = [...allDocs].filter(d=>d.cases>0).sort((a,b)=>b.cases-a.cases);
  const byRev = [...allDocs].filter(d=>d.revenue>0).sort((a,b)=>b.revenue-a.revenue);

  const hdrs = (sortFn) => ['#','Doctor / Specialty','Scheme','Cases','Est. Revenue','Source']
    .map((h,i)=>`<th onclick="window.${sortFn}(${i})" style="cursor:pointer;user-select:none">${h}</th>`).join('');

  el.innerHTML = `
    <div style="font-size:11px;color:var(--grey6);background:var(--grey1);border-radius:6px;padding:8px 12px;margin-bottom:12px;border-left:3px solid var(--blue)">
      <strong>Period: ${periodLabel}</strong> · Click any row to drill down · Click column header to sort ·
      ⚠️ Revenue is estimated (Colposcopy ✅ actual ₹1,500/case · IKT ⚠️ est. ₹14K/case · CMCHIS ⚠️ est. ₹8K/case)
    </div>
    <div class="two-col">
      <div class="chart-card" style="padding:0">
        <div class="chart-card-header" style="padding:12px 16px 8px">
          <div><div class="chart-title">🏆 All Doctors — By Volume</div>
          <div class="chart-sub">${byVol.length} active this period · Click to sort</div></div>
        </div>
        <div class="table-wrap" style="max-height:500px;overflow-y:auto">
          <table class="data-table" style="font-size:12px">
            <thead><tr>${hdrs('drSortByVol')}</tr></thead>
            <tbody id="drVolBody"></tbody>
            <tfoot id="drVolFoot"></tfoot>
          </table>
        </div>
      </div>
      <div class="chart-card" style="padding:0">
        <div class="chart-card-header" style="padding:12px 16px 8px">
          <div><div class="chart-title">💰 All Doctors — By Revenue</div>
          <div class="chart-sub">${byRev.length} with revenue · Colposcopy = actual, others estimated</div></div>
        </div>
        <div class="table-wrap" style="max-height:500px;overflow-y:auto">
          <table class="data-table" style="font-size:12px">
            <thead><tr>${hdrs('drSortByRev')}</tr></thead>
            <tbody id="drRevBody"></tbody>
            <tfoot id="drRevFoot"></tfoot>
          </table>
        </div>
      </div>
    </div>`;

  // Store data globally for re-sort
  window._drByVol = byVol;
  window._drByRev = byRev;
  window._drVolDir = {}; window._drRevDir = {};
  window._fmtRevG = fmtRev;

  window.drSortByVol = function(col) {
    const fields=['name','dept','dept','cases','revenue','revenueNote'];
    const fld = fields[col]||'cases';
    window._drVolDir[col] = window._drVolDir[col]==='asc'?'desc':'asc';
    const sorted = [...window._drByVol].sort((a,b)=>{
      const av=a[fld], bv=b[fld];
      const cmp=typeof av==='number'?av-bv:String(av).localeCompare(String(bv));
      return window._drVolDir[col]==='asc'?cmp:-cmp;
    });
    renderTable(sorted,'drVolBody','drVolFoot');
  };
  window.drSortByRev = function(col) {
    const fields=['name','dept','dept','cases','revenue','revenueNote'];
    const fld = fields[col]||'revenue';
    window._drRevDir[col] = window._drRevDir[col]==='asc'?'desc':'asc';
    const sorted = [...window._drByRev].sort((a,b)=>{
      const av=a[fld], bv=b[fld];
      const cmp=typeof av==='number'?av-bv:String(av).localeCompare(String(bv));
      return window._drRevDir[col]==='asc'?cmp:-cmp;
    });
    renderTable(sorted,'drRevBody','drRevFoot');
  };

  renderTable(byVol,'drVolBody','drVolFoot');
  renderTable(byRev,'drRevBody','drRevFoot');
}


// ══════════════════════════════════════════════════════
// ══  GOOGLE SHEETS DAILY SYNC (JSONP — CORS-free)  ══
// ══════════════════════════════════════════════════════
(function setupSheetSync() {
  var APPS_URL  = '/api/sheet';
  var CACHE_KEY = 'cmchis_gsheet_v9';
  var todayKey  = new Date().toISOString().slice(0, 10);
  var TIMEOUT_MS = 8000;
  var _initFired = false;

  function safeInitAll() {
    if (_initFired) return;
    _initFired = true;
    initAll();
  }

  function findMonthKey(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    var m = s.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-_]*(20)?(\d\d)/i);
    if (!m) return null;
    return m[1].charAt(0).toUpperCase() + m[1].slice(1,3).toLowerCase() + ' 20' + m[3];
  }

  function parseNum(s) {
    var n = parseFloat(String(s == null ? '' : s).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? 0 : Math.round(n);
  }

  function processRows(rows) {
    if (!rows || rows.length < 2) return null;
    var DEPT_LOWER = DEPTS.map(function(d){ return d.toLowerCase().replace(/[^a-z]/g,''); });
    var headerIdx = 0;
    for (var r = 0; r < Math.min(8, rows.length); r++) {
      var lower = rows[r].map(function(c){ return String(c).toLowerCase().replace(/[^a-z]/g,''); });
      if (lower.some(function(c){ return DEPT_LOWER.indexOf(c)>=0 || c==='month' || c==='applied'; })) { headerIdx=r; break; }
    }
    var headers = rows[headerIdx].map(function(c){ return String(c).toLowerCase().replace(/[^a-z\/]/g,''); });
    var colMap = { depts:{} };
    headers.forEach(function(h,i){
      DEPT_LOWER.forEach(function(d,di){ if(h===d) colMap.depts[di]=i; });
      if(h==='applied')                                        colMap.applied=i;
      if(h==='approved')                                       colMap.approved=i;
      if(h.indexOf('denied')>=0||h==='denial')                colMap.denied=i;
      if(h.indexOf('amount')>=0||h.indexOf('revenue')>=0)     colMap.amount=i;
    });
    var out={deptData:{},applied:[],approved:[],denied:[],amount:[],deptTotal:[],labels:[],monthKeys:[]};
    for(var ri=headerIdx+1;ri<rows.length;ri++){
      var row=rows[ri], mk=findMonthKey(row[0]);
      if(!mk) continue;
      var deptArr=DEPTS.map(function(_,di){ var ci=colMap.depts[di]; return ci!==undefined?parseNum(row[ci]):0; });
      out.deptData[mk]=deptArr; out.monthKeys.push(mk);
      out.labels.push(mk.slice(0,3)+' '+mk.slice(-2));
      out.applied.push( colMap.applied !==undefined?parseNum(row[colMap.applied]) :0);
      out.approved.push(colMap.approved!==undefined?parseNum(row[colMap.approved]):0);
      out.denied.push(  colMap.denied  !==undefined?parseNum(row[colMap.denied])  :0);
      out.amount.push(  colMap.amount  !==undefined?parseNum(row[colMap.amount])  :0);
      out.deptTotal.push(deptArr.reduce(function(s,v){return s+v;},0));
    }
    return out.monthKeys.length ? out : null;
  }

  function applyParsed(p) {
    if(!p||!p.monthKeys.length) return false;
    function fill(arr,src){ if(!src||!src.length) return; arr.length=0; src.forEach(function(v){arr.push(v);}); }
    Object.keys(DATA_2025).forEach(function(k){delete DATA_2025[k];});
    Object.assign(DATA_2025, p.deptData);
    fill(MONTHLY_APPLIED_2025,  p.applied);
    fill(MONTHLY_APPROVED_2025, p.approved);
    fill(MONTHLY_DENIED_2025,   p.denied);
    fill(MONTHLY_AMOUNT_2025,   p.amount);
    fill(MONTHLY_DEPT_TOTAL,    p.deptTotal);
    if(p.labels.length) fill(ALL_MONTHS_LABELS, p.labels);
    console.log('[SheetSync] Applied '+p.monthKeys.length+' months: '+p.monthKeys.join(', '));
    return true;
  }

  // Simple fetch — calls our own Vercel proxy (/api/sheet), no CORS issues
  function iframeFetch(thenInit) {
    var done = false;
    var timer = setTimeout(function() {
      if(done) return; done=true;
      console.warn('[SheetSync] Timeout — using hardcoded/cached data');
      if(thenInit) safeInitAll();
    }, TIMEOUT_MS);

    fetch(APPS_URL)
      .then(function(r) {
        if(!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(rows) {
        if(done) return; done=true; clearTimeout(timer);
        var parsed = processRows(rows);
        if(parsed) {
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({date:todayKey,parsed:parsed})); } catch(ex) {}
          if(thenInit) applyParsed(parsed);
          if(typeof showToast==='function' && thenInit) showToast('Sheet data refreshed');
        } else {
          console.warn('[SheetSync] Proxy responded but rows could not be parsed.');
        }
        if(thenInit) safeInitAll();
      })
      .catch(function(err) {
        if(done) return; done=true; clearTimeout(timer);
        console.warn('[SheetSync] Proxy fetch error:', err);
        if(thenInit) safeInitAll();
      });
  }

  // Main — only fetch when actually deployed (not local / file://)
  var isDeployed = (window.location.hostname !== 'localhost' &&
                    window.location.hostname !== '127.0.0.1' &&
                    !window.location.protocol.startsWith('file'));
  try {
    var cached = JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    if (!isDeployed) {
      // Running locally — use cached/hardcoded data, no proxy fetch
      if (cached && cached.parsed) applyParsed(cached.parsed);
      safeInitAll();
    } else if(cached && cached.date===todayKey && cached.parsed) {
      applyParsed(cached.parsed);
      safeInitAll();
      iframeFetch(false); // background refresh
    } else {
      iframeFetch(true);
    }
  } catch(e) {
    console.warn('[SheetSync] Startup error:', e);
    safeInitAll();
  }
})();

function initAll() {
  // 0. Set initial filter to 'full' and prime DATA_MONTHS
  activeFilter = 'full';
  DATA_MONTHS = [...ALL_MONTHS_KEYS];
  DEPTS.forEach((d,i) => {
    DATA_STORE[d]  = ALL_MONTHS_KEYS.map(m=>(DATA_2025[m]||[])[i]||0);
    DETAIL_STORE[d]= ALL_MONTHS_KEYS.map((m,gi)=>({
      month:m, applied:MONTHLY_APPLIED_2025[gi]||0,
      approved:(DATA_2025[m]||[])[i]||0,
      denied:MONTHLY_DENIED_2025[gi]||0, amount:MONTHLY_AMOUNT_2025[gi]||0
    }));
  });

  // 1. Inject standardised 3-option filter bars on every page
  injectMonthFilters();

  // 1b. Build overview KPI grid immediately
  refreshOverviewKPIs();

  // 2. Doctor performance page
  buildDoctorPage();

  // 3. Package performance page
  buildPkgTable();
  buildIktPkgTable();
  buildUnusedPkgs();
  buildPkgVolumeChart();

  // 4. Annual table — filter-aware version
  buildAnnualTableFiltered();
  buildIktTableFiltered();

  // 5. Make tables sortable
  setTimeout(() => {
    ['quickTable','pkgTable','iktPkgTable'].forEach(id => makeSortable(id));
  }, 200);

  // 6. Dept strip double-click drill-down
  setTimeout(() => {
    document.querySelectorAll('.strip-tab').forEach((tab, i) => {
      tab.addEventListener('dblclick', () => showDrill('dept', DEPTS[i]));
    });
  }, 400);

  // 9. CMCHIS Deep-Dive
  buildCmchisDeepDive();
  // 10. Targets page
  buildTargetsPage();
  // 11. Doctor revenue rankings
  buildDoctorRevenueSection();

  // 12. Auto-bind onclick to all metric cards (after a tick so DOM is ready)
  setTimeout(autoBindCardClicks, 100);

  // 13. Refresh data-entry hero stats whenever dashboard data changes
  if(typeof deUpdateHero==='function') deUpdateHero();
}

// ─── Auto-bind drill-downs to metric cards without onclick ───────────────────
function autoBindCardClicks() {
  // Map of label keywords → showDrill type/payload
  const CARD_MAP = [
    {match:/IKT Applied|IKT\s.*Applied/i,     action:()=>showDrill('ikt-annual')},
    {match:/IKT Approved|IKT\s.*Approved/i,   action:()=>showDrill('ikt-annual')},
    {match:/IKT Denied/i,                      action:()=>showDrill('ikt-annual')},
    {match:/IKT.*Month|Best Month.*May/i,      action:()=>showDrill('ikt-annual')},
    {match:/IKT Jan|IKT Dec|IKT.*2025/i,       action:()=>showDrill('ikt-annual')},
    {match:/Jan 2025 Denied|Denial Rate Jan/i, action:()=>showDrill('ikt-annual')},
    {match:/Improvement vs Jan/i,              action:()=>showDrill('ikt-annual')},
    {match:/Avg IKT Claim/i,                   action:()=>showDrill('ikt-annual')},
    {match:/Volume Drop/i,                     action:()=>showDrill('ikt-annual')},
    {match:/Denial Improvement/i,              action:()=>showDrill('ikt-annual')},
    {match:/Annual Approved|Annual Approved/i, action:()=>showDrill('approval-rate')},
    {match:/Peak Month/i,                      action:()=>showDrill('approval-rate')},
    {match:/Annual Amount/i,                   action:()=>showDrill('annual-revenue')},
    {match:/Overall Approval|Approval Rate/i,  action:()=>showDrill('approval-rate')},
    {match:/Active Doctors/i,                  action:()=>showPage('doctorpage', document.querySelector('[onclick*=doctorpage]'))},
    {match:/Annual Revenue|Revenue.*2025/i,    action:()=>showDrill('annual-revenue')},
    {match:/Colposcopy.*Approv|~594/i,         action:()=>showPage('doctorpage', document.querySelector('[onclick*=doctorpage]'))},
    {match:/CMCHIS Approved.*2025|1,588/i,     action:()=>showDrill('approval-rate')},
    {match:/Denial Rate/i,                     action:()=>showDrill('cmchis-scheme')},
    {match:/Dec 2025|Nov 2025/i,               action:()=>showDrill('month', ALL_MONTHS_KEYS[11])},
  ];
  document.querySelectorAll('.metric-card').forEach(card => {
    if (card.dataset.autobound) return;
    if (card.getAttribute('onclick')) { card.dataset.autobound='1'; return; }
    if (card.style.cursor === 'default' || card.style.cssText?.includes('cursor:default')) return;
    const label = card.querySelector('.mc-label')?.textContent?.trim() || '';
    const val   = card.querySelector('.mc-value')?.textContent?.trim() || '';
    const text  = label + ' ' + val;
    for (const rule of CARD_MAP) {
      if (rule.match.test(text)) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', rule.action);
        card.dataset.autobound = '1';
        break;
      }
    }
    // Fallback: any card with a dept name in label → dept drill
    if (!card.dataset.autobound) {
      DEPTS.forEach(d => {
        if (text.includes(d)) {
          card.style.cursor = 'pointer';
          card.addEventListener('click', () => showDrill('dept', d));
          card.dataset.autobound = '1';
        }
      });
    }
    // Fallback: month names → month drill
    if (!card.dataset.autobound) {
      ALL_MONTHS_KEYS.forEach(m => {
        const short = m.replace(' 20','').replace('25','25').replace('26','26');
        if (text.includes(short) || text.includes(m)) {
          card.style.cursor = 'pointer';
          card.addEventListener('click', () => showDrill('month', m));
          card.dataset.autobound = '1';
        }
      });
    }
    if (!card.dataset.autobound) {
      // Generic fallback for any remaining un-bound, non-default cards
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => showDrill('approval-rate'));
      card.dataset.autobound = '1';
    }
  });
}
