// Auto-extracted from index.html by split.js
// Module: reports
// ════════════════════════════════════════════════════════
//  REPORTS — Data builder, renderers, export
// ════════════════════════════════════════════════════════

var RPT_ACTIVE_TAB = 'weekly';
var MONTH_NAMES_FULL = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
var MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                         'Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Tab switch ──
function rptShowTab(id, el) {
  document.querySelectorAll('.rpt-tab').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.rpt-panel').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active');
  document.getElementById('rptpanel-'+id).classList.add('active');
  RPT_ACTIVE_TAB = id;
  if (id === 'weekly')    rptBuildWeekly();
  if (id === 'monthly')   rptBuildMonthly();
  if (id === 'quarterly') rptBuildQuarterly();
  if (id === 'custom')    rptCrInit();
}

// ── Helpers ──
function rptMonthIdx(m) {
  return typeof ALL_MONTHS_KEYS !== 'undefined' ? ALL_MONTHS_KEYS.indexOf(m) : -1;
}
function rptRate(app, total) {
  return total > 0 ? (app / total * 100).toFixed(1) : '0.0';
}
function rptAmtL(v) { return (v / 100000).toFixed(2) + 'L'; }
function rptBadge(rate) {
  var r = parseFloat(rate);
  if (r >= 90) return '<span class="rpt-badge rpt-badge-green">GOOD</span>';
  if (r >= 80) return '<span class="rpt-badge rpt-badge-yellow">MONITOR</span>';
  return '<span class="rpt-badge rpt-badge-red">REVIEW</span>';
}
function rptNow() { return new Date().toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}); }
function rptDocFooter(period) {
  return '<div class="rpt-footer">' +
    '<div class="rpt-footer-note">Generated: ' + rptNow() + ' &nbsp;·&nbsp; MGH Mayiladuthurai CMCHIS Dashboard</div>' +
    '<div class="rpt-footer-sign">CMCHIS Desk Officer &nbsp; _______________________</div>' +
    '</div>';
}

// ── Populate month/week selectors on init ──
function rptInitSelectors() {
  var months = typeof ALL_MONTHS_KEYS !== 'undefined' ? ALL_MONTHS_KEYS : [];
  // Weekly month sel
  var wkMoSel = document.getElementById('rpt-wk-month');
  var moSel   = document.getElementById('rpt-mo-month');
  if (wkMoSel && months.length) {
    wkMoSel.innerHTML = months.map(function(m,i){
      return '<option value="'+m+'">'+m+'</option>';
    }).join('');
    wkMoSel.selectedIndex = months.length - 1;
    rptPopulateWeekSel(months[months.length-1]);
  }
  if (moSel && months.length) {
    moSel.innerHTML = months.map(function(m){
      return '<option value="'+m+'">'+m+'</option>';
    }).join('');
    moSel.selectedIndex = months.length - 1;
  }
  // Quarterly year sel
  var qrYr = document.getElementById('rpt-qr-year');
  if (qrYr) {
    var years = [];
    months.forEach(function(m){ var y=m.split(' ')[1]; if(years.indexOf(y)<0) years.push(y); });
    qrYr.innerHTML = years.map(function(y){ return '<option>'+y+'</option>'; }).join('');
    qrYr.selectedIndex = years.length - 1;
    // Pre-select current quarter
    var now = new Date();
    var qNow = Math.floor(now.getMonth()/3) + 1;
    var qSel = document.getElementById('rpt-qr-quarter');
    if (qSel) qSel.value = 'Q' + qNow;
  }
}

function rptPopulateWeekSel(m) {
  var wkSel = document.getElementById('rpt-wk-week');
  if (!wkSel || !m || typeof deGetWeeksInMonth !== 'function') return;
  var weeks = deGetWeeksInMonth(m);
  wkSel.innerHTML = weeks.map(function(wk, i){
    return '<option value="'+i+'">W'+(i+1)+' · '+wk.richLabel+'</option>';
  }).join('');
  // default to last saved week, or last week
  var store = typeof deLoadWeekly === 'function' ? deLoadWeekly() : {};
  var mData = store[m] || {};
  var lastSaved = -1;
  weeks.forEach(function(_, wi){ if(mData['w'+wi] && mData['w'+wi].savedAt) lastSaved = wi; });
  wkSel.selectedIndex = lastSaved >= 0 ? lastSaved : weeks.length - 1;
}

// ── Prev/Next week navigation ──
function rptWkPrev() {
  var wkSel = document.getElementById('rpt-wk-week');
  var moSel = document.getElementById('rpt-wk-month');
  if (!wkSel || !moSel) return;
  if (wkSel.selectedIndex > 0) {
    wkSel.selectedIndex--;
  } else if (moSel.selectedIndex > 0) {
    moSel.selectedIndex--;
    var m = moSel.value;
    rptPopulateWeekSel(m);
    var wks = deGetWeeksInMonth(m);
    wkSel.selectedIndex = wks.length - 1;
  }
  rptBuildWeekly();
}
function rptWkNext() {
  var wkSel = document.getElementById('rpt-wk-week');
  var moSel = document.getElementById('rpt-wk-month');
  if (!wkSel || !moSel) return;
  if (wkSel.selectedIndex < wkSel.options.length - 1) {
    wkSel.selectedIndex++;
  } else if (moSel.selectedIndex < moSel.options.length - 1) {
    moSel.selectedIndex++;
    var m = moSel.value;
    rptPopulateWeekSel(m);
    wkSel.selectedIndex = 0;
  }
  rptBuildWeekly();
}

// ════════════════════════
// WEEKLY REPORT BUILDER
// ════════════════════════
function rptBuildWeekly() {
  var moSel = document.getElementById('rpt-wk-month');
  var wkSel = document.getElementById('rpt-wk-week');
  var doc   = document.getElementById('rpt-weekly-doc');
  if (!moSel || !wkSel || !doc) return;

  var m  = moSel.value;
  if (!m) return;
  // Repopulate weeks if month changed
  if (wkSel.options.length === 0 || (wkSel.options[0] && !wkSel.options[0].value.match(/^\d+$/))) {
    rptPopulateWeekSel(m);
  }
  var wi = parseInt(wkSel.value) || 0;

  var weeks = typeof deGetWeeksInMonth === 'function' ? deGetWeeksInMonth(m) : [];
  var wk = weeks[wi] || {richLabel: m, pillLabel: m, startDay:'', endDay:'', numDays:7, isPartial:false};

  var store = typeof deLoadWeekly === 'function' ? deLoadWeekly() : {};
  var wd = (store[m] && store[m]['w'+wi]) ? store[m]['w'+wi] : {};

  var applied  = wd.applied  || 0;
  var approved = wd.approved || 0;
  var denied   = wd.denied   || (applied - approved);
  var amount   = wd.amount   || 0;
  var iktApp   = wd['ikt-applied']  || 0;
  var iktApv   = wd['ikt-approved'] || 0;
  var iktDen   = wd['ikt-denied']   || 0;
  var colpoTot = wd['colpo-total']  || 0;
  var colpoCmchis = wd['colpo-cmchis'] || 0;
  var pending  = wd.pending  || 0;
  var disbursed= wd.disbursed|| 0;
  var benefic  = wd.beneficiaries || 0;
  var rate     = rptRate(approved, applied);
  var iktRate  = rptRate(iktApv, iktApp);
  var notSaved = !wd.savedAt;

  // Dept breakdown
  var depts = typeof DEPTS !== 'undefined' ? DEPTS : [];
  var deptApv = wd.deptApproved || [];
  var deptApp = wd.deptApplied  || [];
  var deptAmt = wd.deptAmount   || [];

  // Denial reasons
  var denialReasons = typeof DE_DENIAL_REASONS !== 'undefined' ? DE_DENIAL_REASONS : [];

  doc.innerHTML =
    '<div class="rpt-doc-head">' +
      '<div class="rpt-doc-hosp">MGH Mayiladuthurai · CMCHIS Cell</div>' +
      '<div class="rpt-doc-title">Weekly Performance Report</div>' +
      '<div class="rpt-doc-period">Week ' + (wi+1) + ' — ' + wk.richLabel +
        (wk.isPartial ? ' <span style="opacity:.8;font-size:12px"> ⚠ Partial (' + wk.numDays + ' days)</span>' : '') +
      '</div>' +
      '<div class="rpt-doc-meta">' +
        '<div class="rpt-doc-meta-item">Month <span>' + m + '</span></div>' +
        '<div class="rpt-doc-meta-item">Week <span>' + (wi+1) + ' of ' + weeks.length + '</span></div>' +
        '<div class="rpt-doc-meta-item">Days <span>' + wk.numDays + (wk.isPartial?' (partial)':'') + '</span></div>' +
        '<div class="rpt-doc-meta-item">Status <span>' + (notSaved ? '⚠ Not yet saved' : '✓ Saved ' + (wd.savedAt||'')) + '</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="rpt-body">' +
    (notSaved ? '<div class="rpt-note">⚠ No data saved for this week yet. Enter figures in the Data Entry tab and save, then come back to generate the report.</div><br>' : '') +

    // KPIs
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">📊 CMCHIS Claims — Summary</div>' +
      '<div class="rpt-kpi-grid">' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Applied</div><div class="rpt-kpi-value">' + applied + '</div><div class="rpt-kpi-sub">Cases submitted</div></div>' +
        '<div class="rpt-kpi green"><div class="rpt-kpi-label">Approved</div><div class="rpt-kpi-value">' + approved + '</div><div class="rpt-kpi-sub">Cases approved</div></div>' +
        '<div class="rpt-kpi red"><div class="rpt-kpi-label">Denied</div><div class="rpt-kpi-value">' + denied + '</div><div class="rpt-kpi-sub">Cases rejected</div></div>' +
        '<div class="rpt-kpi yellow"><div class="rpt-kpi-label">Approval Rate</div><div class="rpt-kpi-value">' + rate + '%</div><div class="rpt-kpi-sub">' + rptBadge(rate) + '</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Amount Claimed</div><div class="rpt-kpi-value" style="font-size:16px">₹' + rptAmtL(amount) + '</div><div class="rpt-kpi-sub">This week</div></div>' +
        (pending ? '<div class="rpt-kpi"><div class="rpt-kpi-label">Pending</div><div class="rpt-kpi-value">' + pending + '</div><div class="rpt-kpi-sub">Under review</div></div>' : '') +
      '</div>' +
    '</div>' +

    // IKT
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">🔵 IKT Scheme — Weekly</div>' +
      '<div class="rpt-kpi-grid">' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">IKT Applied</div><div class="rpt-kpi-value">' + iktApp + '</div></div>' +
        '<div class="rpt-kpi green"><div class="rpt-kpi-label">IKT Approved</div><div class="rpt-kpi-value">' + iktApv + '</div></div>' +
        '<div class="rpt-kpi red"><div class="rpt-kpi-label">IKT Denied</div><div class="rpt-kpi-value">' + iktDen + '</div></div>' +
        '<div class="rpt-kpi yellow"><div class="rpt-kpi-label">IKT Approval Rate</div><div class="rpt-kpi-value">' + iktRate + '%</div><div class="rpt-kpi-sub">' + rptBadge(iktRate) + '</div></div>' +
      '</div>' +
    '</div>' +

    // Colposcopy
    (colpoTot > 0 ? '<div class="rpt-section">' +
      '<div class="rpt-section-title">🔬 Colposcopy — Weekly</div>' +
      '<div class="rpt-kpi-grid">' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Total Procedures</div><div class="rpt-kpi-value">' + colpoTot + '</div></div>' +
        '<div class="rpt-kpi green"><div class="rpt-kpi-label">CMCHIS Covered</div><div class="rpt-kpi-value">' + colpoCmchis + '</div></div>' +
      '</div>' +
    '</div>' : '') +

    // Dept breakdown (only if data available)
    (deptApv.some(function(v){return v>0;}) ?
      '<div class="rpt-section">' +
        '<div class="rpt-section-title">🏨 Department-wise Approved Cases</div>' +
        '<div class="table-wrap"><table class="rpt-table">' +
          '<thead><tr><th>Department</th><th>Applied</th><th>Approved</th><th>Denied</th><th>Amount (₹)</th><th>Rate %</th><th>Status</th></tr></thead>' +
          '<tbody>' +
          depts.map(function(dept, i) {
            var app2 = deptApp[i]||0, apv2 = deptApv[i]||0, den2 = app2>apv2?app2-apv2:0, amt2 = deptAmt[i]||0;
            if (apv2 === 0 && app2 === 0) return '';
            var r2 = rptRate(apv2, app2);
            return '<tr>' +
              '<td style="font-weight:600">' + dept + '</td>' +
              '<td>' + app2 + '</td>' +
              '<td style="color:var(--green-dark);font-weight:600">' + apv2 + '</td>' +
              '<td style="color:var(--red)">' + den2 + '</td>' +
              '<td>' + (amt2 ? '₹'+rptAmtL(amt2) : '—') + '</td>' +
              '<td style="font-weight:600">' + r2 + '%</td>' +
              '<td>' + rptBadge(r2) + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody>' +
          '<tfoot><tr>' +
            '<td>TOTAL</td>' +
            '<td>' + deptApp.reduce(function(s,v){return s+(v||0);},0) + '</td>' +
            '<td style="color:var(--green-dark)">' + deptApv.reduce(function(s,v){return s+(v||0);},0) + '</td>' +
            '<td style="color:var(--red)">' + depts.map(function(_,i){return Math.max(0,(deptApp[i]||0)-(deptApv[i]||0));}).reduce(function(s,v){return s+v;},0) + '</td>' +
            '<td>₹' + rptAmtL(deptAmt.reduce(function(s,v){return s+(v||0);},0)) + '</td>' +
            '<td>—</td><td>—</td>' +
          '</tr></tfoot>' +
        '</table></div>' +
      '</div>' : '') +

    // Denial reasons
    (wd.denialReasons && wd.denialReasons.some(function(v){return v>0;}) ?
      '<div class="rpt-section">' +
        '<div class="rpt-section-title">❌ Denial Reasons</div>' +
        '<table class="rpt-table">' +
          '<thead><tr><th>Reason</th><th>Count</th><th>% of Denials</th></tr></thead>' +
          '<tbody>' +
          denialReasons.map(function(r, i) {
            var v = (wd.denialReasons[i]||0);
            if (!v) return '';
            return '<tr><td>' + r + '</td><td>' + v + '</td><td>' + (denied>0?(v/denied*100).toFixed(1):'0') + '%</td></tr>';
          }).join('') +
          (wd.denialOther ? '<tr><td>Other / Unclassified</td><td>' + wd.denialOther + '</td><td>—</td></tr>' : '') +
          '</tbody>' +
        '</table>' +
      '</div>' : '') +

    '</div>' + // end rpt-body
    rptDocFooter('weekly');
}

// ═════════════════════════
// MONTHLY REPORT BUILDER
// ═════════════════════════
function rptBuildMonthly() {
  var moSel = document.getElementById('rpt-mo-month');
  var doc   = document.getElementById('rpt-monthly-doc');
  if (!moSel || !doc) return;

  var m = moSel.value;
  if (!m) return;
  var idx = rptMonthIdx(m);

  var applied  = (typeof MONTHLY_APPLIED_2025  !== 'undefined' && idx>=0) ? (MONTHLY_APPLIED_2025[idx]  || 0) : 0;
  var approved = (typeof MONTHLY_APPROVED_2025 !== 'undefined' && idx>=0) ? (MONTHLY_APPROVED_2025[idx] || 0) : 0;
  var denied   = (typeof MONTHLY_DENIED_2025   !== 'undefined' && idx>=0) ? (MONTHLY_DENIED_2025[idx]   || 0) : applied-approved;
  var amount   = (typeof MONTHLY_AMOUNT_2025   !== 'undefined' && idx>=0) ? (MONTHLY_AMOUNT_2025[idx]   || 0) : 0;
  var iktApp   = (typeof IKT_2025_APPLIED      !== 'undefined' && idx>=0) ? (IKT_2025_APPLIED[idx]      || 0) : 0;
  var iktApv   = (typeof IKT_2025_APPROVED     !== 'undefined' && idx>=0) ? (IKT_2025_APPROVED[idx]     || 0) : 0;

  var rate    = rptRate(approved, applied);
  var iktRate = rptRate(iktApv, iktApp);
  var depts   = typeof DEPTS !== 'undefined' ? DEPTS : [];
  var deptApv = (typeof DATA_2025 !== 'undefined' && DATA_2025[m]) ? DATA_2025[m] : [];

  // Weekly breakdown from store
  var store = typeof deLoadWeekly === 'function' ? deLoadWeekly() : {};
  var mData = store[m] || {};
  var weeks = typeof deGetWeeksInMonth === 'function' ? deGetWeeksInMonth(m) : [];
  var maxWkApv = Math.max(1, weeks.reduce(function(mx,_,wi){ return Math.max(mx,(mData['w'+wi]&&mData['w'+wi].approved)||0); }, 0));

  // Part of year label
  var mIdx = MONTH_NAMES_SHORT.indexOf(m.split(' ')[0]);
  var mFull = MONTH_NAMES_FULL[mIdx] || m;
  var yr = m.split(' ')[1];

  doc.innerHTML =
    '<div class="rpt-doc-head">' +
      '<div class="rpt-doc-hosp">MGH Mayiladuthurai · CMCHIS Cell</div>' +
      '<div class="rpt-doc-title">Monthly Performance Report</div>' +
      '<div class="rpt-doc-period">' + mFull + ' ' + yr + '</div>' +
      '<div class="rpt-doc-meta">' +
        '<div class="rpt-doc-meta-item">Month <span>' + m + '</span></div>' +
        '<div class="rpt-doc-meta-item">Weeks <span>' + weeks.length + '</span></div>' +
        '<div class="rpt-doc-meta-item">Generated <span>' + rptNow() + '</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="rpt-body">' +

    // Overall KPIs
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">📊 Overall CMCHIS Performance</div>' +
      '<div class="rpt-kpi-grid">' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Total Applied</div><div class="rpt-kpi-value">' + applied + '</div><div class="rpt-kpi-sub">Cases submitted</div></div>' +
        '<div class="rpt-kpi green"><div class="rpt-kpi-label">Total Approved</div><div class="rpt-kpi-value">' + approved + '</div><div class="rpt-kpi-sub">Cases cleared</div></div>' +
        '<div class="rpt-kpi red"><div class="rpt-kpi-label">Total Denied</div><div class="rpt-kpi-value">' + denied + '</div><div class="rpt-kpi-sub">Cases rejected</div></div>' +
        '<div class="rpt-kpi yellow"><div class="rpt-kpi-label">Approval Rate</div><div class="rpt-kpi-value">' + rate + '%</div><div class="rpt-kpi-sub">' + rptBadge(rate) + '</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Revenue</div><div class="rpt-kpi-value" style="font-size:16px">₹' + rptAmtL(amount) + '</div><div class="rpt-kpi-sub">Amount claimed</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">IKT Approved</div><div class="rpt-kpi-value">' + iktApv + '</div><div class="rpt-kpi-sub">Rate: ' + iktRate + '%</div></div>' +
      '</div>' +
    '</div>' +

    // Week-by-week breakdown
    (weeks.length > 0 ?
      '<div class="rpt-section">' +
        '<div class="rpt-section-title">📆 Week-by-Week Breakdown</div>' +
        '<div class="table-wrap"><table class="rpt-table">' +
          '<thead><tr><th>Week</th><th>Date Range</th><th>Days</th><th>Applied</th><th>Approved</th><th>Denied</th><th>Rate %</th><th>Amount (₹)</th><th>IKT Apv</th><th>Status</th></tr></thead>' +
          '<tbody>' +
          weeks.map(function(wk, wi) {
            var wd = mData['w'+wi] || {};
            var app = wd.applied||0, apv = wd.approved||0, den = wd.denied||(app-apv), amt = wd.amount||0;
            var ikt = wd['ikt-approved']||0;
            var r   = rptRate(apv, app);
            var saved = !!wd.savedAt;
            return '<tr>' +
              '<td style="font-weight:700">W'+(wi+1)+(wk.isPartial?'<span style="color:#e37400;font-size:10px"> ⚠</span>':'')+'</td>' +
              '<td style="font-size:11px">'+wk.pillLabel+'<br><span style="color:var(--grey6)">'+wk.startDay+' – '+wk.endDay+'</span></td>' +
              '<td style="color:var(--grey6)">'+wk.numDays+'</td>' +
              '<td>'+(saved?app:'—')+'</td>' +
              '<td style="color:var(--green-dark);font-weight:600">'+(saved?apv:'—')+'</td>' +
              '<td style="color:var(--red)">'+(saved?den:'—')+'</td>' +
              '<td style="font-weight:600">'+(saved?r+'%':'—')+'</td>' +
              '<td>'+(saved&&amt?'₹'+rptAmtL(amt):'—')+'</td>' +
              '<td style="color:var(--green-dark)">'+(saved?ikt:'—')+'</td>' +
              '<td>'+(saved?'<span class="rpt-badge rpt-badge-green">Saved</span>':'<span class="rpt-badge" style="background:var(--grey2);color:var(--grey6)">Pending</span>')+'</td>' +
              '</tr>';
          }).join('') +
          '</tbody>' +
          '<tfoot><tr>' +
            '<td colspan="3">TOTAL</td>' +
            '<td>'+applied+'</td>' +
            '<td style="color:var(--green-dark)">'+approved+'</td>' +
            '<td style="color:var(--red)">'+denied+'</td>' +
            '<td style="font-weight:600">'+rate+'%</td>' +
            '<td>₹'+rptAmtL(amount)+'</td>' +
            '<td>'+iktApv+'</td>' +
            '<td></td>' +
          '</tr></tfoot>' +
        '</table></div>' +
      '</div>' : '') +

    // Department breakdown
    (deptApv.length > 0 ?
      '<div class="rpt-section">' +
        '<div class="rpt-section-title">🏨 Department-wise Approved Cases</div>' +
        '<table class="rpt-table">' +
          '<thead><tr><th>Department</th><th>Approved Cases</th><th>Share %</th><th>Performance</th></tr></thead>' +
          '<tbody>' +
          depts.map(function(dept, i) {
            var apv2 = deptApv[i]||0;
            var share = approved > 0 ? (apv2/approved*100).toFixed(1) : '0';
            return '<tr>' +
              '<td style="font-weight:600">' + dept + '</td>' +
              '<td style="color:var(--green-dark);font-weight:600">' + apv2 + '</td>' +
              '<td>' + share + '%</td>' +
              '<td><div style="background:var(--grey3);border-radius:4px;height:6px;width:100%;overflow:hidden"><div style="width:'+share+'%;background:var(--blue);height:100%;border-radius:4px"></div></div></td>' +
              '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' : '') +

    '</div>' + rptDocFooter('monthly');
}

// ══════════════════════════
// QUARTERLY REPORT BUILDER
// ══════════════════════════
function rptBuildQuarterly() {
  var yrSel  = document.getElementById('rpt-qr-year');
  var qSel   = document.getElementById('rpt-qr-quarter');
  var doc    = document.getElementById('rpt-quarterly-doc');
  if (!yrSel || !qSel || !doc) return;

  var yr = parseInt(yrSel.value) || new Date().getFullYear();
  var q  = qSel.value;
  var qMap = {Q1:[0,1,2], Q2:[3,4,5], Q3:[6,7,8], Q4:[9,10,11]};
  var qMonthIdxs = qMap[q] || [0,1,2];
  var qMonths = qMonthIdxs.map(function(mi){ return MONTH_NAMES_SHORT[mi] + ' ' + yr; });
  var qLabel  = {Q1:'January – March', Q2:'April – June', Q3:'July – September', Q4:'October – December'};

  var totals = {applied:0, approved:0, denied:0, amount:0, iktApp:0, iktApv:0};
  var perMonth = qMonths.map(function(m) {
    var idx = rptMonthIdx(m);
    var app = (typeof MONTHLY_APPLIED_2025  !== 'undefined' && idx>=0) ? (MONTHLY_APPLIED_2025[idx] ||0) : 0;
    var apv = (typeof MONTHLY_APPROVED_2025 !== 'undefined' && idx>=0) ? (MONTHLY_APPROVED_2025[idx]||0) : 0;
    var den = (typeof MONTHLY_DENIED_2025   !== 'undefined' && idx>=0) ? (MONTHLY_DENIED_2025[idx]  ||0) : app-apv;
    var amt = (typeof MONTHLY_AMOUNT_2025   !== 'undefined' && idx>=0) ? (MONTHLY_AMOUNT_2025[idx]  ||0) : 0;
    var iApp= (typeof IKT_2025_APPLIED      !== 'undefined' && idx>=0) ? (IKT_2025_APPLIED[idx]     ||0) : 0;
    var iApv= (typeof IKT_2025_APPROVED     !== 'undefined' && idx>=0) ? (IKT_2025_APPROVED[idx]    ||0) : 0;
    totals.applied  += app; totals.approved += apv; totals.denied   += den;
    totals.amount   += amt; totals.iktApp   += iApp; totals.iktApv  += iApv;
    return {m:m, applied:app, approved:apv, denied:den, amount:amt, iktApp:iApp, iktApv:iApv};
  });

  var rate    = rptRate(totals.approved, totals.applied);
  var iktRate = rptRate(totals.iktApv, totals.iktApp);
  var depts   = typeof DEPTS !== 'undefined' ? DEPTS : [];

  // Dept quarterly totals
  var deptTotals = depts.map(function(_, i) {
    return qMonths.reduce(function(s, m) {
      return s + ((typeof DATA_2025 !== 'undefined' && DATA_2025[m] && DATA_2025[m][i]) || 0);
    }, 0);
  });
  var topDept = depts.reduce(function(best, d, i){ return deptTotals[i] > (deptTotals[depts.indexOf(best)]||0) ? d : best; }, depts[0]||'—');

  doc.innerHTML =
    '<div class="rpt-doc-head">' +
      '<div class="rpt-doc-hosp">MGH Mayiladuthurai · CMCHIS Cell</div>' +
      '<div class="rpt-doc-title">Quarterly Performance Report</div>' +
      '<div class="rpt-doc-period">' + q + ' ' + yr + ' — ' + qLabel[q] + '</div>' +
      '<div class="rpt-doc-meta">' +
        '<div class="rpt-doc-meta-item">Quarter <span>' + q + ' ' + yr + '</span></div>' +
        '<div class="rpt-doc-meta-item">Months <span>' + qMonths.join(', ') + '</span></div>' +
        '<div class="rpt-doc-meta-item">Generated <span>' + rptNow() + '</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="rpt-body">' +

    // Quarter KPIs
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">📊 Quarter ' + q + ' — ' + yr + ' Summary</div>' +
      '<div class="rpt-kpi-grid">' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Total Applied</div><div class="rpt-kpi-value">' + totals.applied + '</div><div class="rpt-kpi-sub">' + q + ' total</div></div>' +
        '<div class="rpt-kpi green"><div class="rpt-kpi-label">Total Approved</div><div class="rpt-kpi-value">' + totals.approved + '</div><div class="rpt-kpi-sub">Cases cleared</div></div>' +
        '<div class="rpt-kpi red"><div class="rpt-kpi-label">Total Denied</div><div class="rpt-kpi-value">' + totals.denied + '</div><div class="rpt-kpi-sub">Cases rejected</div></div>' +
        '<div class="rpt-kpi yellow"><div class="rpt-kpi-label">Approval Rate</div><div class="rpt-kpi-value">' + rate + '%</div><div class="rpt-kpi-sub">' + rptBadge(rate) + '</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Total Revenue</div><div class="rpt-kpi-value" style="font-size:16px">₹' + rptAmtL(totals.amount) + '</div><div class="rpt-kpi-sub">Amount claimed</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">IKT Approved</div><div class="rpt-kpi-value">' + totals.iktApv + '</div><div class="rpt-kpi-sub">Rate: ' + iktRate + '%</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Top Department</div><div class="rpt-kpi-value" style="font-size:14px">' + topDept + '</div><div class="rpt-kpi-sub">' + (deptTotals[depts.indexOf(topDept)]||0) + ' cases</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Avg / Month</div><div class="rpt-kpi-value">' + Math.round(totals.approved/3) + '</div><div class="rpt-kpi-sub">Approved cases</div></div>' +
      '</div>' +
    '</div>' +

    // Month-by-month
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">🗓️ Month-by-Month Breakdown</div>' +
      '<table class="rpt-table">' +
        '<thead><tr><th>Month</th><th>Applied</th><th>Approved</th><th>Denied</th><th>Rate %</th><th>Revenue (₹)</th><th>IKT App</th><th>IKT Apv</th><th>IKT Rate %</th><th>Status</th></tr></thead>' +
        '<tbody>' +
        perMonth.map(function(row) {
          var r = rptRate(row.approved, row.applied);
          var ir = rptRate(row.iktApv, row.iktApp);
          var hasData = row.applied > 0 || row.approved > 0;
          return '<tr>' +
            '<td style="font-weight:700">' + row.m + '</td>' +
            '<td>' + (hasData?row.applied:'—') + '</td>' +
            '<td style="color:var(--green-dark);font-weight:600">' + (hasData?row.approved:'—') + '</td>' +
            '<td style="color:var(--red)">' + (hasData?row.denied:'—') + '</td>' +
            '<td style="font-weight:600">' + (hasData?r+'%':'—') + '</td>' +
            '<td>' + (hasData&&row.amount?'₹'+rptAmtL(row.amount):'—') + '</td>' +
            '<td>' + (row.iktApp||'—') + '</td>' +
            '<td style="color:var(--green-dark)">' + (row.iktApv||'—') + '</td>' +
            '<td>' + (row.iktApp?ir+'%':'—') + '</td>' +
            '<td>' + rptBadge(r) + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody>' +
        '<tfoot><tr>' +
          '<td>QUARTER TOTAL</td>' +
          '<td>'+totals.applied+'</td>' +
          '<td style="color:var(--green-dark)">'+totals.approved+'</td>' +
          '<td style="color:var(--red)">'+totals.denied+'</td>' +
          '<td style="font-weight:600">'+rate+'%</td>' +
          '<td>₹'+rptAmtL(totals.amount)+'</td>' +
          '<td>'+totals.iktApp+'</td>' +
          '<td style="color:var(--green-dark)">'+totals.iktApv+'</td>' +
          '<td>'+iktRate+'%</td>' +
          '<td></td>' +
        '</tr></tfoot>' +
      '</table>' +
    '</div>' +

    // Dept quarterly table
    (deptTotals.some(function(v){return v>0;}) ?
      '<div class="rpt-section">' +
        '<div class="rpt-section-title">🏨 Department-wise ' + q + ' Performance</div>' +
        '<table class="rpt-table">' +
          '<thead><tr><th>Department</th>' +
          qMonths.map(function(m){ return '<th>'+m+'</th>'; }).join('') +
          '<th>Q Total</th><th>Share %</th></tr></thead>' +
          '<tbody>' +
          depts.map(function(dept, i) {
            var total = deptTotals[i];
            var share = totals.approved > 0 ? (total/totals.approved*100).toFixed(1) : '0';
            return '<tr>' +
              '<td style="font-weight:600">' + dept + '</td>' +
              qMonths.map(function(m) {
                var val = (typeof DATA_2025!=='undefined' && DATA_2025[m] && DATA_2025[m][i]) || 0;
                return '<td style="color:var(--green-dark)">' + (val||'—') + '</td>';
              }).join('') +
              '<td style="font-weight:700">' + total + '</td>' +
              '<td>' + share + '%</td>' +
              '</tr>';
          }).join('') +
          '</tbody>' +
          '<tfoot><tr><td>TOTAL</td>' +
          qMonths.map(function(m) {
            var tot = depts.reduce(function(s,_,i){return s+((typeof DATA_2025!=='undefined'&&DATA_2025[m]&&DATA_2025[m][i])||0);},0);
            return '<td style="font-weight:700">'+tot+'</td>';
          }).join('') +
          '<td style="font-weight:700">'+deptTotals.reduce(function(s,v){return s+v;},0)+'</td><td>100%</td>' +
          '</tr></tfoot>' +
        '</table>' +
      '</div>' : '') +

    '</div>' + rptDocFooter('quarterly');
}

// ════════════════
// PRINT / EXPORT
// ════════════════
function rptPrintCurrent() {
  var tab = RPT_ACTIVE_TAB;
  var docId = {weekly:'rpt-weekly-doc', monthly:'rpt-monthly-doc', quarterly:'rpt-quarterly-doc', custom:'rpt-custom-doc'}[tab] || 'rpt-weekly-doc';
  var docEl = document.getElementById(docId);
  if (!docEl || !docEl.innerHTML.trim()) {
    alert('Please build the report first by selecting the period above.');
    return;
  }
  var printWin = window.open('', '_blank', 'width=900,height=700');
  printWin.document.write('<!DOCTYPE html><html><head><title>CMCHIS Report</title>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;color:#202124;margin:0}' +
    '.rpt-doc-head{background:#1a73e8;color:#fff;padding:24px 32px}' +
    '.rpt-doc-hosp{font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;opacity:.85;margin-bottom:4px}' +
    '.rpt-doc-title{font-size:20px;font-weight:700;margin-bottom:4px}' +
    '.rpt-doc-period{font-size:13px;opacity:.85}' +
    '.rpt-doc-meta{display:flex;gap:20px;margin-top:12px;flex-wrap:wrap}' +
    '.rpt-doc-meta-item{font-size:11px;opacity:.75}' +
    '.rpt-doc-meta-item span{font-weight:700;font-size:12px}' +
    '.rpt-body{padding:24px 32px}' +
    '.rpt-section{margin-bottom:24px}' +
    '.rpt-section-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.3px;border-bottom:2px solid #e8eaed;padding-bottom:6px;margin-bottom:12px}' +
    '.rpt-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:4px}' +
    '.rpt-kpi{background:#f8f9fa;border-radius:8px;padding:12px 14px;border-left:4px solid #1a73e8}' +
    '.rpt-kpi.green{border-left-color:#34a853}.rpt-kpi.red{border-left-color:#ea4335}.rpt-kpi.yellow{border-left-color:#fbbc04}' +
    '.rpt-kpi-label{font-size:10px;color:#5f6368;font-weight:600;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}' +
    '.rpt-kpi-value{font-size:20px;font-weight:700;color:#202124;line-height:1}' +
    '.rpt-kpi-sub{font-size:10px;color:#5f6368;margin-top:3px}' +
    'table{width:100%;border-collapse:collapse;font-size:11px}' +
    'th{background:#f8f9fa;padding:7px 10px;text-align:left;font-size:10px;font-weight:700;color:#5f6368;text-transform:uppercase;border-bottom:2px solid #e8eaed}' +
    'th:not(:first-child){text-align:center}' +
    'td{padding:6px 10px;border-bottom:1px solid #e8eaed}' +
    'td:not(:first-child){text-align:center}' +
    'tfoot td{background:#f8f9fa;font-weight:700;border-top:2px solid #e8eaed}' +
    '.rpt-badge{display:inline-block;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:700}' +
    '.rpt-badge-green{background:#e6f4ea;color:#137333}' +
    '.rpt-badge-yellow{background:#fef7e0;color:#f29900}' +
    '.rpt-badge-red{background:#fce8e6;color:#c5221f}' +
    '.rpt-footer{background:#f8f9fa;padding:12px 32px;border-top:1px solid #e8eaed;display:flex;align-items:center;justify-content:space-between;margin-top:16px}' +
    '.rpt-footer-note{font-size:10px;color:#5f6368}' +
    '.rpt-footer-sign{font-size:10px;font-weight:600;color:#3c4043}' +
    '@media print{@page{margin:1cm}body{margin:0}}' +
    '</style></head><body>' +
    docEl.outerHTML +
    '</body></html>');
  printWin.document.close();
  printWin.focus();
  setTimeout(function(){ printWin.print(); }, 600);
}

function rptExportCSV(type) {
  type = type || RPT_ACTIVE_TAB;
  var lines = [];
  var filename = 'CMCHIS_Report';

  if (type === 'weekly') {
    var moSel = document.getElementById('rpt-wk-month');
    var wkSel = document.getElementById('rpt-wk-week');
    if (!moSel || !wkSel) return;
    var m = moSel.value, wi = parseInt(wkSel.value)||0;
    var store = typeof deLoadWeekly==='function'?deLoadWeekly():{};
    var wd = (store[m]&&store[m]['w'+wi])||{};
    var weeks = typeof deGetWeeksInMonth==='function'?deGetWeeksInMonth(m):[];
    var wk = weeks[wi]||{};
    filename = 'CMCHIS_Weekly_W'+(wi+1)+'_'+m.replace(' ','_');
    lines = [
      'CMCHIS Weekly Performance Report',
      'Hospital,MGH Mayiladuthurai',
      'Period,Week '+(wi+1)+' — '+(wk.richLabel||m),
      'Generated,'+rptNow(),
      '',
      'Metric,Value',
      'CMCHIS Applied,'+(wd.applied||0),
      'CMCHIS Approved,'+(wd.approved||0),
      'CMCHIS Denied,'+(wd.denied||0),
      'Approval Rate %,'+rptRate(wd.approved||0,wd.applied||1),
      'Amount Claimed (Rs),'+(wd.amount||0),
      'Pending,'+(wd.pending||0),
      'Disbursed,'+(wd.disbursed||0),
      'New Beneficiaries,'+(wd.beneficiaries||0),
      'IKT Applied,'+(wd['ikt-applied']||0),
      'IKT Approved,'+(wd['ikt-approved']||0),
      'IKT Denied,'+(wd['ikt-denied']||0),
      'IKT Amount (Rs),'+(wd['ikt-amount']||0),
      'Colposcopy Total,'+(wd['colpo-total']||0),
      'Colposcopy CMCHIS,'+(wd['colpo-cmchis']||0),
      '',
      'Department,Applied,Approved,Denied,Amount (Rs)',
    ];
    var depts = typeof DEPTS!=='undefined'?DEPTS:[];
    var deptApp=wd.deptApplied||[], deptApv=wd.deptApproved||[], deptAmt=wd.deptAmount||[];
    depts.forEach(function(d,i){ lines.push(d+','+(deptApp[i]||0)+','+(deptApv[i]||0)+','+(Math.max(0,(deptApp[i]||0)-(deptApv[i]||0)))+','+(deptAmt[i]||0)); });
  }
  else if (type === 'monthly') {
    var moSel2 = document.getElementById('rpt-mo-month');
    if (!moSel2) return;
    var m2 = moSel2.value, idx2 = rptMonthIdx(m2);
    filename = 'CMCHIS_Monthly_'+m2.replace(' ','_');
    var app = (typeof MONTHLY_APPLIED_2025!=='undefined'&&idx2>=0)?MONTHLY_APPLIED_2025[idx2]:0;
    var apv = (typeof MONTHLY_APPROVED_2025!=='undefined'&&idx2>=0)?MONTHLY_APPROVED_2025[idx2]:0;
    var den = (typeof MONTHLY_DENIED_2025!=='undefined'&&idx2>=0)?MONTHLY_DENIED_2025[idx2]:0;
    var amt = (typeof MONTHLY_AMOUNT_2025!=='undefined'&&idx2>=0)?MONTHLY_AMOUNT_2025[idx2]:0;
    lines = [
      'CMCHIS Monthly Performance Report','Hospital,MGH Mayiladuthurai','Month,'+m2,'Generated,'+rptNow(),'',
      'Metric,Value',
      'Total Applied,'+app,'Total Approved,'+apv,'Total Denied,'+den,
      'Approval Rate %,'+rptRate(apv,app),
      'Revenue (Rs),'+amt,
      'IKT Applied,'+((typeof IKT_2025_APPLIED!=='undefined'&&idx2>=0)?IKT_2025_APPLIED[idx2]:0),
      'IKT Approved,'+((typeof IKT_2025_APPROVED!=='undefined'&&idx2>=0)?IKT_2025_APPROVED[idx2]:0),
      '','Department,Approved Cases'
    ];
    var depts2=typeof DEPTS!=='undefined'?DEPTS:[];
    var dapv=typeof DATA_2025!=='undefined'&&DATA_2025[m2]?DATA_2025[m2]:[];
    depts2.forEach(function(d,i){lines.push(d+','+(dapv[i]||0));});
    // weekly breakdown
    var store2=typeof deLoadWeekly==='function'?deLoadWeekly():{};
    var mData2=store2[m2]||{};
    var wks2=typeof deGetWeeksInMonth==='function'?deGetWeeksInMonth(m2):[];
    lines.push('','Week,Dates,Days,Applied,Approved,Denied,Rate%,Amount(Rs),IKT Apv');
    wks2.forEach(function(wk2,wi2){
      var wd2=mData2['w'+wi2]||{};
      lines.push('W'+(wi2+1)+','+wk2.pillLabel+','+wk2.numDays+','+(wd2.applied||0)+','+(wd2.approved||0)+','+(wd2.denied||0)+','+rptRate(wd2.approved||0,wd2.applied||1)+','+(wd2.amount||0)+','+(wd2['ikt-approved']||0));
    });
  }
  else if (type === 'quarterly') {
    var yrSel2=document.getElementById('rpt-qr-year'), qSel2=document.getElementById('rpt-qr-quarter');
    if (!yrSel2||!qSel2) return;
    var yr2=yrSel2.value, q2=qSel2.value;
    filename='CMCHIS_Quarterly_'+q2+'_'+yr2;
    var qMap2={Q1:[0,1,2],Q2:[3,4,5],Q3:[6,7,8],Q4:[9,10,11]};
    var qMs=qMap2[q2].map(function(mi){return MONTH_NAMES_SHORT[mi]+' '+yr2;});
    lines=['CMCHIS Quarterly Performance Report','Hospital,MGH Mayiladuthurai','Quarter,'+q2+' '+yr2,'Months,'+qMs.join(' | '),'Generated,'+rptNow(),'','Month,Applied,Approved,Denied,Rate%,Revenue(Rs),IKT App,IKT Apv'];
    var tot2={applied:0,approved:0,denied:0,amount:0,iktApp:0,iktApv:0};
    qMs.forEach(function(m3){
      var i3=rptMonthIdx(m3);
      var app3=(typeof MONTHLY_APPLIED_2025!=='undefined'&&i3>=0)?MONTHLY_APPLIED_2025[i3]:0;
      var apv3=(typeof MONTHLY_APPROVED_2025!=='undefined'&&i3>=0)?MONTHLY_APPROVED_2025[i3]:0;
      var den3=(typeof MONTHLY_DENIED_2025!=='undefined'&&i3>=0)?MONTHLY_DENIED_2025[i3]:0;
      var amt3=(typeof MONTHLY_AMOUNT_2025!=='undefined'&&i3>=0)?MONTHLY_AMOUNT_2025[i3]:0;
      var iApp3=(typeof IKT_2025_APPLIED!=='undefined'&&i3>=0)?IKT_2025_APPLIED[i3]:0;
      var iApv3=(typeof IKT_2025_APPROVED!=='undefined'&&i3>=0)?IKT_2025_APPROVED[i3]:0;
      tot2.applied+=app3;tot2.approved+=apv3;tot2.denied+=den3;tot2.amount+=amt3;tot2.iktApp+=iApp3;tot2.iktApv+=iApv3;
      lines.push(m3+','+app3+','+apv3+','+den3+','+rptRate(apv3,app3)+','+amt3+','+iApp3+','+iApv3);
    });
    lines.push('TOTAL,'+tot2.applied+','+tot2.approved+','+tot2.denied+','+rptRate(tot2.approved,tot2.applied)+','+tot2.amount+','+tot2.iktApp+','+tot2.iktApv);
    lines.push('','Department,'+qMs.join(',')+',Q Total');
    var depts3=typeof DEPTS!=='undefined'?DEPTS:[];
    depts3.forEach(function(d,i){
      var vals=qMs.map(function(m3){return (typeof DATA_2025!=='undefined'&&DATA_2025[m3]&&DATA_2025[m3][i])||0;});
      lines.push(d+','+vals.join(',')+','+vals.reduce(function(s,v){return s+v;},0));
    });
  }

  else if (type === 'custom') {
    // Custom range CSV — pull from the already-built report
    var fromEl = document.getElementById('rpt-cr-from');
    var toEl   = document.getElementById('rpt-cr-to');
    if (!fromEl || !toEl || !fromEl.value || !toEl.value) { alert('Select a date range first.'); return; }
    var fromD = new Date(fromEl.value), toD = new Date(toEl.value);
    filename  = 'CMCHIS_Range_' + fromEl.value + '_to_' + toEl.value;
    var grain = (document.getElementById('rpt-cr-grain')||{}).value || 'month';
    var periods = rptCrGetPeriods(fromD, toD, grain);
    lines = [
      'CMCHIS Date Range Performance Report',
      'Hospital,MGH Mayiladuthurai',
      'From,' + fromEl.value,
      'To,'   + toEl.value,
      'Breakdown,' + grain,
      'Generated,' + rptNow(),
      '',
      'Period,Applied,Approved,Denied,Rate%,Revenue(Rs),IKT App,IKT Apv,IKT Rate%'
    ];
    var gTot = {app:0,apv:0,den:0,amt:0,iApp:0,iApv:0};
    periods.forEach(function(p) {
      var d = rptCrAggregatePeriod(p, fromD, toD, grain);
      gTot.app+=d.app; gTot.apv+=d.apv; gTot.den+=d.den; gTot.amt+=d.amt; gTot.iApp+=d.iApp; gTot.iApv+=d.iApv;
      lines.push(p.label+','+d.app+','+d.apv+','+d.den+','+rptRate(d.apv,d.app)+','+d.amt+','+d.iApp+','+d.iApv+','+rptRate(d.iApv,d.iApp));
    });
    lines.push('TOTAL,'+gTot.app+','+gTot.apv+','+gTot.den+','+rptRate(gTot.apv,gTot.app)+','+gTot.amt+','+gTot.iApp+','+gTot.iApv+','+rptRate(gTot.iApv,gTot.iApp));
    // dept breakdown
    var depts4 = typeof DEPTS!=='undefined'?DEPTS:[];
    if (depts4.length) {
      lines.push('','Department,Approved Cases');
      var deptTots4 = depts4.map(function(_,di){
        return periods.reduce(function(s,p){
          var d=rptCrAggregatePeriod(p,fromD,toD,grain);
          return s+(d.deptApv[di]||0);
        },0);
      });
      depts4.forEach(function(d,i){ lines.push(d+','+deptTots4[i]); });
    }
  }

  var csv = lines.join('\r\n');
  var a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = filename + '.csv';
  a.click();
  if (typeof showToast === 'function') showToast('\u2B07\uFE0F ' + filename + '.csv downloaded');
}

// ════════════════════════════════════
//  CUSTOM DATE RANGE — all functions
// ════════════════════════════════════

// Parse "Mon Yyyy" string to JS Date (1st of that month)
function rptParseMonth(m) {
  var parts = m.split(' ');
  var mi = MONTH_NAMES_SHORT.indexOf(parts[0]);
  return new Date(parseInt(parts[1]), mi, 1);
}

// Get last day of a month given Date
function rptLastDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth()+1, 0);
}

// Format Date → YYYY-MM-DD
function rptFmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}

// Format Date → "12 Mar 2026"
function rptFmtDateHuman(d) {
  return d.getDate() + ' ' + MONTH_NAMES_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}

// Format Date → "Mon Yyyy" (month key)
function rptDateToMonthKey(d) {
  return MONTH_NAMES_SHORT[d.getMonth()] + ' ' + d.getFullYear();
}

// Get list of week periods between two dates
function rptCrGetWeekPeriods(fromD, toD) {
  var periods = [];
  // Start from Monday of the week containing fromD
  var cur = new Date(fromD);
  var day = cur.getDay(); // 0=Sun
  var diffToMon = (day === 0) ? -6 : 1 - day;
  cur.setDate(cur.getDate() + diffToMon);
  var weekNum = 1;
  while (cur <= toD) {
    var wEnd = new Date(cur); wEnd.setDate(wEnd.getDate() + 6);
    var actualStart = new Date(Math.max(cur.getTime(), fromD.getTime()));
    var actualEnd   = new Date(Math.min(wEnd.getTime(), toD.getTime()));
    var days = Math.round((actualEnd - actualStart) / 86400000) + 1;
    periods.push({
      label: 'W'+weekNum + ' ' + rptFmtDateHuman(actualStart) + ' – ' + rptFmtDateHuman(actualEnd),
      shortLabel: 'W'+weekNum,
      startDate: new Date(actualStart),
      endDate:   new Date(actualEnd),
      numDays:   days,
      isPartial: days < 7,
      monthKeys: [] // computed in aggregate
    });
    cur.setDate(cur.getDate() + 7);
    weekNum++;
  }
  return periods;
}

// Get list of month periods between two dates
function rptCrGetMonthPeriods(fromD, toD) {
  var periods = [];
  var cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
  while (cur <= toD) {
    var mStart = new Date(Math.max(cur.getTime(), fromD.getTime()));
    var mEnd   = new Date(Math.min(rptLastDayOfMonth(cur).getTime(), toD.getTime()));
    var mk = rptDateToMonthKey(cur);
    var daysInMonth = rptLastDayOfMonth(cur).getDate();
    var coveredDays = Math.round((mEnd - mStart) / 86400000) + 1;
    periods.push({
      label: mk + (coveredDays < daysInMonth ? ' ('+coveredDays+' days)' : ''),
      shortLabel: mk,
      monthKey: mk,
      startDate: new Date(mStart),
      endDate:   new Date(mEnd),
      numDays: coveredDays,
      isPartial: coveredDays < daysInMonth,
      daysInMonth: daysInMonth
    });
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }
  return periods;
}

function rptCrGetPeriods(fromD, toD, grain) {
  return grain === 'week' ? rptCrGetWeekPeriods(fromD, toD) : rptCrGetMonthPeriods(fromD, toD);
}

// Aggregate data for a single period
function rptCrAggregatePeriod(period, fromD, toD, grain) {
  var result = {app:0, apv:0, den:0, amt:0, iApp:0, iApv:0, iDen:0, deptApv:[]};
  var depts = typeof DEPTS !== 'undefined' ? DEPTS : [];
  result.deptApv = depts.map(function(){return 0;});

  if (grain === 'month') {
    // Direct lookup in monthly arrays
    var mk = period.monthKey;
    var idx = rptMonthIdx(mk);
    if (idx >= 0) {
      var frac = period.isPartial ? (period.numDays / period.daysInMonth) : 1;
      // For partial months, pro-rate from weekly data if available
      if (period.isPartial && typeof deLoadWeekly === 'function') {
        var store = deLoadWeekly();
        var mData = store[mk] || {};
        var weeks = typeof deGetWeeksInMonth === 'function' ? deGetWeeksInMonth(mk) : [];
        weeks.forEach(function(wk, wi) {
          var wd = mData['w'+wi] || {};
          // Check overlap between week and period
          var wStart = new Date(mk.split(' ')[1], MONTH_NAMES_SHORT.indexOf(mk.split(' ')[0]), wk.start);
          var wEnd   = new Date(mk.split(' ')[1], MONTH_NAMES_SHORT.indexOf(mk.split(' ')[0]), wk.end);
          var overlapStart = new Date(Math.max(wStart.getTime(), period.startDate.getTime()));
          var overlapEnd   = new Date(Math.min(wEnd.getTime(), period.endDate.getTime()));
          if (overlapStart <= overlapEnd) {
            result.app  += wd.applied  || 0;
            result.apv  += wd.approved || 0;
            result.den  += wd.denied   || 0;
            result.amt  += wd.amount   || 0;
            result.iApp += wd['ikt-applied']  || 0;
            result.iApv += wd['ikt-approved'] || 0;
            result.iDen += wd['ikt-denied']   || 0;
            if (wd.deptApproved) wd.deptApproved.forEach(function(v,i){ result.deptApv[i]=(result.deptApv[i]||0)+(v||0); });
          }
        });
        // Fall back to pro-rated if no weekly data
        if (result.app === 0 && result.apv === 0) {
          result.app  = Math.round((MONTHLY_APPLIED_2025[idx]  ||0) * frac);
          result.apv  = Math.round((MONTHLY_APPROVED_2025[idx] ||0) * frac);
          result.den  = Math.round((MONTHLY_DENIED_2025[idx]   ||0) * frac);
          result.amt  = Math.round((MONTHLY_AMOUNT_2025[idx]   ||0) * frac);
          result.iApp = Math.round((IKT_2025_APPLIED[idx]      ||0) * frac);
          result.iApv = Math.round((IKT_2025_APPROVED[idx]     ||0) * frac);
          if (typeof DATA_2025 !== 'undefined' && DATA_2025[mk])
            result.deptApv = DATA_2025[mk].map(function(v){ return Math.round((v||0)*frac); });
        }
      } else {
        result.app  = MONTHLY_APPLIED_2025[idx]  || 0;
        result.apv  = MONTHLY_APPROVED_2025[idx] || 0;
        result.den  = MONTHLY_DENIED_2025[idx]   || 0;
        result.amt  = MONTHLY_AMOUNT_2025[idx]   || 0;
        result.iApp = (typeof IKT_2025_APPLIED  !== 'undefined') ? (IKT_2025_APPLIED[idx]  || 0) : 0;
        result.iApv = (typeof IKT_2025_APPROVED !== 'undefined') ? (IKT_2025_APPROVED[idx] || 0) : 0;
        if (typeof DATA_2025 !== 'undefined' && DATA_2025[mk])
          result.deptApv = DATA_2025[mk].slice();
      }
    }
  } else {
    // Week grain — pull from weekly store, matching by date overlap
    if (typeof deLoadWeekly !== 'function') return result;
    var store2 = deLoadWeekly();
    // Find all months that overlap this week
    var mCur = new Date(period.startDate.getFullYear(), period.startDate.getMonth(), 1);
    var mEnd = new Date(period.endDate.getFullYear(),   period.endDate.getMonth(), 1);
    while (mCur <= mEnd) {
      var mk2 = rptDateToMonthKey(mCur);
      var mData2 = store2[mk2] || {};
      var weeks2 = typeof deGetWeeksInMonth === 'function' ? deGetWeeksInMonth(mk2) : [];
      weeks2.forEach(function(wk2, wi2) {
        var yr2 = parseInt(mk2.split(' ')[1]);
        var mi2 = MONTH_NAMES_SHORT.indexOf(mk2.split(' ')[0]);
        var wStart2 = new Date(yr2, mi2, wk2.start);
        var wEnd2   = new Date(yr2, mi2, wk2.end);
        var overlapS = new Date(Math.max(wStart2.getTime(), period.startDate.getTime()));
        var overlapE = new Date(Math.min(wEnd2.getTime(), period.endDate.getTime()));
        if (overlapS <= overlapE) {
          var wd2 = mData2['w'+wi2] || {};
          var overlapDays = Math.round((overlapE - overlapS)/86400000)+1;
          var wkDays = wk2.numDays || 7;
          var frac2 = overlapDays / wkDays;
          result.app  += Math.round((wd2.applied  ||0)*frac2);
          result.apv  += Math.round((wd2.approved ||0)*frac2);
          result.den  += Math.round((wd2.denied   ||0)*frac2);
          result.amt  += Math.round((wd2.amount   ||0)*frac2);
          result.iApp += Math.round(((wd2['ikt-applied']  ||0))*frac2);
          result.iApv += Math.round(((wd2['ikt-approved'] ||0))*frac2);
          if (wd2.deptApproved) wd2.deptApproved.forEach(function(v,i){ result.deptApv[i]=(result.deptApv[i]||0)+Math.round((v||0)*frac2); });
        }
      });
      mCur = new Date(mCur.getFullYear(), mCur.getMonth()+1, 1);
    }
  }
  return result;
}

// Init the custom panel (set default dates)
function rptCrInit() {
  var fromEl = document.getElementById('rpt-cr-from');
  var toEl   = document.getElementById('rpt-cr-to');
  if (!fromEl || !toEl) return;
  if (!fromEl.value) {
    // Default: first day of current month → today
    var now = new Date();
    var firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    fromEl.value = rptFmtDate(firstOfMonth);
    toEl.value   = rptFmtDate(now);
  }
  // Set min/max from data availability
  if (typeof ALL_MONTHS_KEYS !== 'undefined' && ALL_MONTHS_KEYS.length) {
    var firstM = ALL_MONTHS_KEYS[0];
    var firstD = rptParseMonth(firstM);
    fromEl.min = rptFmtDate(firstD);
    toEl.min   = rptFmtDate(firstD);
    fromEl.max = rptFmtDate(new Date());
    toEl.max   = rptFmtDate(new Date(new Date().getFullYear()+10, 11, 31));
  }
}

function rptCrDateChanged() {
  var fromEl = document.getElementById('rpt-cr-from');
  var toEl   = document.getElementById('rpt-cr-to');
  if (!fromEl || !toEl) return;
  // Auto-correct if to < from
  if (fromEl.value && toEl.value && toEl.value < fromEl.value) toEl.value = fromEl.value;
}

// Quick preset setter
function rptCrPreset(key) {
  var fromEl = document.getElementById('rpt-cr-from');
  var toEl   = document.getElementById('rpt-cr-to');
  if (!fromEl || !toEl) return;
  var now = new Date();
  var from, to;
  if (key === 'thisweek') {
    var day = now.getDay();
    var diff = (day === 0) ? -6 : 1 - day; // Monday
    from = new Date(now); from.setDate(now.getDate() + diff);
    to   = new Date(from); to.setDate(from.getDate() + 6);
    to   = to > now ? now : to;
  } else if (key === 'lastweek') {
    var day2 = now.getDay();
    var diff2 = (day2 === 0) ? -13 : -6 - day2;
    from = new Date(now); from.setDate(now.getDate() + diff2);
    to   = new Date(from); to.setDate(from.getDate() + 6);
  } else if (key === 'thismonth') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to   = now;
  } else if (key === 'lastmonth') {
    from = new Date(now.getFullYear(), now.getMonth()-1, 1);
    to   = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (key === 'last30') {
    from = new Date(now); from.setDate(now.getDate() - 29);
    to   = now;
  } else if (key === 'last90') {
    from = new Date(now); from.setDate(now.getDate() - 89);
    to   = now;
  } else if (key === 'ytd') {
    from = new Date(now.getFullYear(), 0, 1);
    to   = now;
  }
  if (from && to) {
    fromEl.value = rptFmtDate(from);
    toEl.value   = rptFmtDate(to);
    rptBuildCustom();
  }
}

// Main builder
function rptBuildCustom() {
  var fromEl = document.getElementById('rpt-cr-from');
  var toEl   = document.getElementById('rpt-cr-to');
  var grainEl= document.getElementById('rpt-cr-grain');
  var doc    = document.getElementById('rpt-custom-doc');
  var statusEl = document.getElementById('rpt-cr-status');
  if (!fromEl || !toEl || !doc) return;
  if (!fromEl.value || !toEl.value) return;

  var fromD  = new Date(fromEl.value + 'T00:00:00');
  var toD    = new Date(toEl.value   + 'T23:59:59');
  var grain  = grainEl ? grainEl.value : 'month';

  if (fromD > toD) {
    if (statusEl) { statusEl.style.display='block'; statusEl.style.background='var(--red-light)'; statusEl.style.color='var(--red-dark)'; statusEl.textContent='⚠ "From" date must be before "To" date.'; }
    return;
  }
  if (statusEl) statusEl.style.display='none';

  var spanDays = Math.round((toD - fromD) / 86400000) + 1;
  var fromLabel = rptFmtDateHuman(fromD);
  var toLabel   = rptFmtDateHuman(toD);
  var periodLabel = fromLabel + ' – ' + toLabel + ' (' + spanDays + ' day' + (spanDays!==1?'s':'') + ')';

  var periods = rptCrGetPeriods(fromD, toD, grain);
  var depts   = typeof DEPTS !== 'undefined' ? DEPTS : [];

  // Aggregate everything
  var gTot = {app:0,apv:0,den:0,amt:0,iApp:0,iApv:0};
  var deptTots = depts.map(function(){return 0;});
  var perPeriod = periods.map(function(p) {
    var d = rptCrAggregatePeriod(p, fromD, toD, grain);
    gTot.app  += d.app;  gTot.apv  += d.apv;  gTot.den  += d.den;
    gTot.amt  += d.amt;  gTot.iApp += d.iApp; gTot.iApv += d.iApv;
    d.deptApv.forEach(function(v,i){ deptTots[i]=(deptTots[i]||0)+(v||0); });
    return {period:p, data:d};
  });

  var rate    = rptRate(gTot.apv, gTot.app);
  var iktRate = rptRate(gTot.iApv, gTot.iApp);
  var maxApv  = Math.max(1, perPeriod.reduce(function(mx,r){ return Math.max(mx,r.data.apv); },0));
  var hasData = gTot.app > 0 || gTot.apv > 0;

  doc.innerHTML =
    // Header
    '<div class="rpt-doc-head">' +
      '<div class="rpt-doc-hosp">MGH Mayiladuthurai · CMCHIS Cell</div>' +
      '<div class="rpt-doc-title">Custom Date Range Report</div>' +
      '<div class="rpt-doc-period">' + periodLabel + '</div>' +
      '<div class="rpt-doc-meta">' +
        '<div class="rpt-doc-meta-item">From <span>' + fromLabel + '</span></div>' +
        '<div class="rpt-doc-meta-item">To <span>' + toLabel + '</span></div>' +
        '<div class="rpt-doc-meta-item">Span <span>' + spanDays + ' days</span></div>' +
        '<div class="rpt-doc-meta-item">Breakdown <span>' + (grain==='week'?'Weekly':'Monthly') + '</span></div>' +
        '<div class="rpt-doc-meta-item">Generated <span>' + rptNow() + '</span></div>' +
      '</div>' +
    '</div>' +

    '<div class="rpt-body">' +

    (!hasData ? '<div class="rpt-note">⚠ No data found for this date range. Enter weekly data in Data Entry for the relevant months first.</div><br>' : '') +

    // Summary KPIs
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">📊 CMCHIS Summary — ' + fromLabel + ' to ' + toLabel + '</div>' +
      '<div class="rpt-kpi-grid">' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Total Applied</div><div class="rpt-kpi-value">' + gTot.app + '</div><div class="rpt-kpi-sub">' + spanDays + '-day range</div></div>' +
        '<div class="rpt-kpi green"><div class="rpt-kpi-label">Total Approved</div><div class="rpt-kpi-value">' + gTot.apv + '</div><div class="rpt-kpi-sub">Cases cleared</div></div>' +
        '<div class="rpt-kpi red"><div class="rpt-kpi-label">Total Denied</div><div class="rpt-kpi-value">' + gTot.den + '</div><div class="rpt-kpi-sub">Cases rejected</div></div>' +
        '<div class="rpt-kpi yellow"><div class="rpt-kpi-label">Approval Rate</div><div class="rpt-kpi-value">' + rate + '%</div><div class="rpt-kpi-sub">' + rptBadge(rate) + '</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">Total Revenue</div><div class="rpt-kpi-value" style="font-size:16px">₹' + rptAmtL(gTot.amt) + '</div><div class="rpt-kpi-sub">Amount claimed</div></div>' +
        '<div class="rpt-kpi"><div class="rpt-kpi-label">IKT Approved</div><div class="rpt-kpi-value">' + gTot.iApv + '</div><div class="rpt-kpi-sub">Rate: ' + iktRate + '%</div></div>' +
        (spanDays > 1 ? '<div class="rpt-kpi"><div class="rpt-kpi-label">Avg Approved/Day</div><div class="rpt-kpi-value">' + (gTot.apv/spanDays).toFixed(1) + '</div><div class="rpt-kpi-sub">Daily average</div></div>' : '') +
        (periods.length > 1 ? '<div class="rpt-kpi"><div class="rpt-kpi-label">Periods Covered</div><div class="rpt-kpi-value">' + periods.length + '</div><div class="rpt-kpi-sub">' + (grain==='week'?'weeks':'months') + '</div></div>' : '') +
      '</div>' +
    '</div>' +

    // Period breakdown table
    '<div class="rpt-section">' +
      '<div class="rpt-section-title">' + (grain==='week'?'📆 Week':'🗓️ Month') + '-by-' + (grain==='week'?'Week':'Month') + ' Breakdown</div>' +
      (periods.length > 0 ?
        '<div class="table-wrap"><table class="rpt-table">' +
          '<thead><tr>' +
            '<th>' + (grain==='week'?'Week':'Month') + '</th>' +
            '<th>Date Range</th>' +
            '<th>Days</th>' +
            '<th>Applied</th>' +
            '<th>Approved</th>' +
            '<th>Denied</th>' +
            '<th>Rate %</th>' +
            '<th>Revenue (₹)</th>' +
            '<th>IKT Apv</th>' +
            '<th>Trend</th>' +
          '</tr></thead>' +
          '<tbody>' +
          perPeriod.map(function(row, ri) {
            var p = row.period, d = row.data;
            var r = rptRate(d.apv, d.app);
            var barW = maxApv > 0 ? Math.round(d.apv/maxApv*80) : 0;
            return '<tr>' +
              '<td style="font-weight:700">' + p.shortLabel + (p.isPartial?'<span style="color:#e37400;font-size:10px"> ⚠</span>':'') + '</td>' +
              '<td style="font-size:11px;white-space:nowrap">' + rptFmtDateHuman(p.startDate) + '<br><span style="color:var(--grey6)">to ' + rptFmtDateHuman(p.endDate) + '</span></td>' +
              '<td style="color:var(--grey6)">' + p.numDays + (p.isPartial?'<span style="color:#e37400;font-size:9px"> partial</span>':'') + '</td>' +
              '<td>' + (d.app||'—') + '</td>' +
              '<td style="color:var(--green-dark);font-weight:600">' + (d.apv||'—') + '</td>' +
              '<td style="color:var(--red)">' + (d.den||'—') + '</td>' +
              '<td style="font-weight:600;color:'+(parseFloat(r)>=90?'var(--green-dark)':parseFloat(r)>=80?'var(--yellow-dark)':'var(--red)')+'">'+r+'%</td>' +
              '<td>' + (d.amt?'₹'+rptAmtL(d.amt):'—') + '</td>' +
              '<td style="color:var(--green-dark)">' + (d.iApv||'—') + '</td>' +
              '<td><div style="background:var(--grey3);border-radius:3px;height:6px;width:80px"><div style="width:'+barW+'px;background:var(--blue);height:100%;border-radius:3px"></div></div></td>' +
              '</tr>';
          }).join('') +
          '</tbody>' +
          '<tfoot><tr>' +
            '<td colspan="3" style="font-weight:700">TOTAL</td>' +
            '<td>' + gTot.app + '</td>' +
            '<td style="color:var(--green-dark)">' + gTot.apv + '</td>' +
            '<td style="color:var(--red)">' + gTot.den + '</td>' +
            '<td style="font-weight:600">' + rate + '%</td>' +
            '<td>₹' + rptAmtL(gTot.amt) + '</td>' +
            '<td style="color:var(--green-dark)">' + gTot.iApv + '</td>' +
            '<td></td>' +
          '</tr></tfoot>' +
        '</table></div>' : '<div class="rpt-note">No periods in this range.</div>') +
    '</div>' +

    // Department breakdown
    (deptTots.some(function(v){return v>0;}) ?
      '<div class="rpt-section">' +
        '<div class="rpt-section-title">🏨 Department-wise Approved Cases</div>' +
        '<table class="rpt-table">' +
          '<thead><tr><th>Department</th><th>Total Approved</th><th>Share %</th><th>Visual</th></tr></thead>' +
          '<tbody>' +
          depts.map(function(dept,i){
            var v = deptTots[i]||0;
            var share = gTot.apv>0?(v/gTot.apv*100).toFixed(1):'0';
            var barW2 = gTot.apv>0?Math.round(v/gTot.apv*120):0;
            return '<tr>' +
              '<td style="font-weight:600">'+dept+'</td>' +
              '<td style="color:var(--green-dark);font-weight:600">'+v+'</td>' +
              '<td>'+share+'%</td>' +
              '<td><div style="background:var(--grey3);border-radius:3px;height:6px;width:120px;overflow:hidden"><div style="width:'+barW2+'px;background:var(--blue);height:100%;border-radius:3px"></div></div></td>' +
              '</tr>';
          }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>' : '') +

    '</div>' + rptDocFooter('custom');
}

// ── Wire up month→week cascading in weekly panel ──
document.addEventListener('DOMContentLoaded', function() {
  var wkMoSel = document.getElementById('rpt-wk-month');
  if (wkMoSel) {
    wkMoSel.addEventListener('change', function() {
      rptPopulateWeekSel(this.value);
      rptBuildWeekly();
    });
  }
  // Init selectors after core data loads (slight delay for globals to settle)
  setTimeout(function() {
    rptInitSelectors();
    rptCrInit();
  }, 1200);
});