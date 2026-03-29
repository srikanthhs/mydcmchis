// Auto-extracted from index.html by split.js
// Module: dataentry
// ══════════════════════════════════════════════════════════════
//  DATA ENTRY PAGE — Comprehensive Logic (Daily/Weekly/Monthly)
// ══════════════════════════════════════════════════════════════

// ── Persistent stores ──
var DE_STORE_KEY   = 'cmchis_de_v2';
var DE_DAILY_KEY   = 'cmchis_de_daily';
var DE_WEEKLY_KEY  = 'cmchis_de_weekly';
var DE_MANAGE_KEY  = 'cmchis_de_manage';
function deLoad()        { try{return JSON.parse(localStorage.getItem(DE_STORE_KEY)||'{}');}catch(e){return {};} }
function deLoadDaily()   { try{return JSON.parse(localStorage.getItem(DE_DAILY_KEY)||'{}');}catch(e){return {};} }
function deLoadWeekly()  { try{return JSON.parse(localStorage.getItem(DE_WEEKLY_KEY)||'{}');}catch(e){return {};} }
function deLoadManage()  { try{return JSON.parse(localStorage.getItem(DE_MANAGE_KEY)||'null');}catch(e){return null;} }
function dePersist(s)    { try{localStorage.setItem(DE_STORE_KEY, JSON.stringify(s));}catch(e){} }
function dePersistDaily(s)  { try{localStorage.setItem(DE_DAILY_KEY, JSON.stringify(s));}catch(e){} }
function dePersistWeekly(s) { try{localStorage.setItem(DE_WEEKLY_KEY, JSON.stringify(s));}catch(e){} }
function dePersistManage(s) { try{localStorage.setItem(DE_MANAGE_KEY, JSON.stringify(s));}catch(e){} }

// ── Granularity ──
var DE_GRANULARITY = 'monthly';
var DE_SELECTED_DATE = null;
var DE_HISTORY_FILTER = 'all';

function deSetGranularity(g, el) {
  DE_GRANULARITY = g;
  document.querySelectorAll('.de-gran-pill').forEach(function(p){p.classList.remove('active');});
  // no-op: mode is always weekly
  if (typeof el !== 'undefined' && el) {
    document.querySelectorAll('.de-gran-pill').forEach(function(p){p.classList.remove('active');});
    el.classList.add('active');
  }
  var hintEl = document.getElementById('de-gran-hint');
  if (hintEl) hintEl.textContent = 'Weekly entry mode — select month and week above';

  // Show/hide dailyweekly tab (kept for compat, hidden)
  var dwtab = document.getElementById('de-tab-dailyweekly');
  if (dwtab) dwtab.style.display = 'none';
}

// ── Tab switch ──
function deShowTab(id, el) {
  document.querySelectorAll('.de-tab').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.de-panel').forEach(function(p){p.classList.remove('active');});
  if (el) el.classList.add('active');
  var panel = document.getElementById('depanel-'+id);
  if (panel) panel.classList.add('active');
  if(id==='history') deRenderHistory();
  // Refresh month view when switching to it
  if(id==='monthly') deMvRefresh(DE_GLOBAL_MONTH);
  // Refresh weekly entry summary when switching back
  if(id==='weeklyentry') { deWkRenderMonthSummary(DE_GLOBAL_MONTH); deUpdateWeekPills(); }
}

// ── Toast ──
function deToast(msg, type) {
  var el = document.getElementById('deToast');
  el.className='de-toast show-'+(type||'info');
  el.innerHTML=msg;
  clearTimeout(el._t);
  el._t=setTimeout(function(){el.className='de-toast';},3500);
}

// ── Month index helper ──
function deMonthIdx(m){ return ALL_MONTHS_KEYS.indexOf(m); }

// ── Denial reasons config ──
var DE_DENIAL_REASONS = [
  'Document incomplete / Missing',
  'Pre-authorization not obtained',
  'Package not eligible / Not covered',
  'Diagnosis mismatch',
  'Patient details mismatch',
  'Duplicate claim',
  'Late submission',
  'Treatment not done at empanelled centre'
];

// ── IKT procedures config ──
var DE_IKT_PROCS = [
  'Cataract Surgery','Hip Replacement','Knee Replacement','Cardiac Surgery',
  'Dialysis','Neurological Procedures','Oncology / Cancer','Burns / Plastic',
  'Obstetrics & Gynae','Paediatric Surgery'
];

// ══════════════════════════════════
// DAILY ENTRY
// ══════════════════════════════════
function deRenderCalendar() {
  var monthSel = document.getElementById('de-daily-month');
  if(!monthSel) return;
  var m = monthSel.value;
  // Parse month
  var parts = m.split(' ');
  var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = monthNames.indexOf(parts[0]);
  var yr = parseInt(parts[1]);
  if(mi<0||isNaN(yr)) return;

  var daily = deLoadDaily();
  var grid = document.getElementById('de-cal-grid');
  if(!grid) return;

  var firstDay = new Date(yr, mi, 1).getDay();
  var daysInMonth = new Date(yr, mi+1, 0).getDate();

  var cells = '';
  // Empty cells before day 1
  for(var e=0;e<firstDay;e++) cells += '<div></div>';

  for(var d=1;d<=daysInMonth;d++) {
    var dateStr = yr+'-'+(mi+1<10?'0'+(mi+1):mi+1)+'-'+(d<10?'0'+d:d);
    var hasData = !!daily[dateStr];
    var isSel = DE_SELECTED_DATE===dateStr;
    var cls = 'de-cal-cell' + (hasData?' has-data':'') + (isSel?' selected':'');
    cells += '<div class="'+cls+'" onclick="deSelectDate(\''+dateStr+'\')">'+
      '<div class="de-cal-day">'+d+'</div>'+
      (hasData&&!isSel?'<div class="de-cal-dot"></div>':'')+
      '</div>';
  }
  grid.innerHTML = cells;
  deRenderDailyLog();
}

function deSelectDate(dateStr) {
  DE_SELECTED_DATE = dateStr;
  var form = document.getElementById('de-daily-form');
  var label = document.getElementById('de-daily-date-label');
  if(!form||!label) return;
  form.style.display='block';

  var d = new Date(dateStr+'T00:00:00');
  var days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  label.textContent = days[d.getDay()]+', '+dateStr;

  // Load existing data
  var daily = deLoadDaily();
  var rec = daily[dateStr]||{};
  document.getElementById('de-daily-applied').value   = rec.applied||'';
  document.getElementById('de-daily-approved').value  = rec.approved||'';
  document.getElementById('de-daily-denied').value    = rec.denied||'';
  document.getElementById('de-daily-amount').value    = rec.amount||'';
  document.getElementById('de-daily-ikt-applied').value  = rec.iktApp||'';
  document.getElementById('de-daily-ikt-approved').value = rec.iktApv||'';
  document.getElementById('de-daily-ikt-denied').value   = rec.iktDen||'';

  deRenderCalendar(); // re-render to show selection
}

function deCalcDailyDerived() {
  var app = parseInt(document.getElementById('de-daily-applied').value)||0;
  var apv = parseInt(document.getElementById('de-daily-approved').value)||0;
  if(app>0&&apv>=0&&app>=apv) document.getElementById('de-daily-denied').value=app-apv;
}

function deClearDailyForm() {
  ['de-daily-applied','de-daily-approved','de-daily-denied','de-daily-amount',
   'de-daily-ikt-applied','de-daily-ikt-approved','de-daily-ikt-denied'].forEach(function(id){
    document.getElementById(id).value='';
  });
}

function deSaveDaily() {
  if(!DE_SELECTED_DATE){deToast('⚠️ Click a date in the calendar first','err');return;}
  var applied  = parseInt(document.getElementById('de-daily-applied').value)||0;
  var approved = parseInt(document.getElementById('de-daily-approved').value)||0;
  var denied   = parseInt(document.getElementById('de-daily-denied').value)||(applied-approved)||0;
  var amount   = parseInt(document.getElementById('de-daily-amount').value)||0;
  var iktApp   = parseInt(document.getElementById('de-daily-ikt-applied').value)||0;
  var iktApv   = parseInt(document.getElementById('de-daily-ikt-approved').value)||0;
  var iktDen   = parseInt(document.getElementById('de-daily-ikt-denied').value)||0;

  var daily = deLoadDaily();
  daily[DE_SELECTED_DATE] = {applied,approved,denied,amount,iktApp,iktApv,iktDen,savedAt:new Date().toLocaleString('en-IN')};
  dePersistDaily(daily);
  deToast('✅ Daily data for '+DE_SELECTED_DATE+' saved!','ok');
  deRenderCalendar();
  deUpdateHero();
}

function deRenderDailyLog() {
  var monthSel = document.getElementById('de-daily-month');
  if(!monthSel) return;
  var m = monthSel.value;
  var parts = m.split(' ');
  var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = monthNames.indexOf(parts[0]);
  var yr = parseInt(parts[1]);
  var daily = deLoadDaily();
  var tbody = document.getElementById('de-daily-log-body');
  if(!tbody) return;
  var days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var rows = Object.keys(daily).filter(function(k){
    return k.startsWith(yr+'-'+(mi+1<10?'0'+(mi+1):mi+1));
  }).sort();
  if(!rows.length){tbody.innerHTML='<tr><td colspan="9" class="de-prev-empty">No daily data for '+m+'. Click a date in the calendar above.</td></tr>';return;}
  tbody.innerHTML = rows.map(function(dateStr){
    var r=daily[dateStr];
    var d=new Date(dateStr+'T00:00:00');
    return '<tr onclick="deSelectDate(\''+dateStr+'\')"><td><strong>'+dateStr+'</strong></td><td>'+days[d.getDay()]+'</td>'+
      '<td style="text-align:center">'+(r.applied||0)+'</td>'+
      '<td style="text-align:center;color:var(--green-dark);font-weight:600">'+(r.approved||0)+'</td>'+
      '<td style="text-align:center;color:var(--red)">'+(r.denied||0)+'</td>'+
      '<td style="text-align:center">₹'+((r.amount||0)).toLocaleString('en-IN')+'</td>'+
      '<td style="text-align:center">'+(r.iktApp||0)+'</td>'+
      '<td style="text-align:center;color:var(--green-dark)">'+(r.iktApv||0)+'</td>'+
      '<td><button onclick="event.stopPropagation();deDeleteDaily(\''+dateStr+'\')" style="background:var(--red-light);border:none;color:var(--red-dark);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px">🗑</button></td>'+
      '</tr>';
  }).join('');
}

function deDeleteDaily(dateStr) {
  if(!confirm('Delete entry for '+dateStr+'?')) return;
  var daily = deLoadDaily();
  delete daily[dateStr];
  dePersistDaily(daily);
  if(DE_SELECTED_DATE===dateStr){DE_SELECTED_DATE=null;document.getElementById('de-daily-form').style.display='none';}
  deRenderCalendar();
  deUpdateHero();
}

// ══════════════════════════════════
// WEEKLY ENTRY
// ══════════════════════════════════
function deGetWeeksInMonth(m) {
  var DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONTH_FULL = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  var parts = m.split(' ');
  var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = mNames.indexOf(parts[0]);
  var yr = parseInt(parts[1]);
  var daysInMonth = new Date(yr, mi+1, 0).getDate();
  var weeks = [];
  var wstart = 1;
  while (wstart <= daysInMonth) {
    var wend    = Math.min(wstart + 6, daysInMonth);
    var numDays = wend - wstart + 1;
    var isPartial = numDays < 7;
    // Day-of-week names for start and end
    var startDate = new Date(yr, mi, wstart);
    var endDate   = new Date(yr, mi, wend);
    var startDay  = DAY_SHORT[startDate.getDay()];
    var endDay    = DAY_SHORT[endDate.getDay()];
    // Dropdown label — compact, shows day+date range + partial warning
    var dropLabel = 'W' + (weeks.length+1) + '  ■  '
      + startDay + ' ' + wstart + ' – ' + endDay + ' ' + wend + ' ' + parts[0];
    if (isPartial) dropLabel += '  (' + numDays + ' day' + (numDays>1?'s':'')+')  ⚠';
    // Rich label for banner/tooltips
    var richLabel = startDay + ', ' + wstart + ' ' + MONTH_FULL[mi]
      + ' – ' + endDay + ', ' + wend + ' ' + MONTH_FULL[mi] + ' ' + yr;
    // Short label for pills e.g. "1-7 Mar" and "Mon-Sun"
    var pillLabel = wstart + '–' + wend + ' ' + parts[0];
    var pillDays  = startDay + '–' + endDay;
    weeks.push({
      start:     wstart,
      end:       wend,
      numDays:   numDays,
      isPartial: isPartial,
      startDay:  startDay,
      endDay:    endDay,
      label:     dropLabel,      // used in <option>
      richLabel: richLabel,      // used in banner heading
      pillLabel: pillLabel,      // short date range
      pillDays:  pillDays        // short day range
    });
    wstart += 7;
  }
  return weeks;
}


function deRenderWeeklyPanel() {
  var monthSel = document.getElementById('de-weekly-month');
  if(!monthSel) return;
  var m = monthSel.value;
  var weeks = deGetWeeksInMonth(m);
  var weekly = deLoadWeekly();
  var mData = weekly[m]||{};
  var fields=['applied','approved','denied','amount','iktApp','iktApv'];

  var tbody = document.getElementById('de-weekly-body');
  if(!tbody) return;
  tbody.innerHTML = weeks.map(function(wk,wi){
    return '<tr>'+
      '<td style="padding:7px 10px;border-bottom:1px solid var(--grey3);font-weight:600;font-size:12px">'+('W'+(wi+1))+'</td>'+
      '<td style="padding:7px 10px;border-bottom:1px solid var(--grey3)">'+'<div style="font-size:11px;font-weight:600;color:var(--grey8)">'+wk.pillLabel+'</div>'+'<div style="font-size:10px;color:var(--grey6)">'+wk.startDay+' – '+wk.endDay+(wk.isPartial?' <span style=\'color:#e37400\'>⚠ '+wk.numDays+' days</span>':'')+'</div>'+'</td>'+
      fields.map(function(f){
        return '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center">'+
          '<input type="number" class="de-dt-input" id="de-wk-'+wi+'-'+f+'" placeholder="0" min="0" value="'+(mData['w'+wi]&&mData['w'+wi][f]||'')+'" oninput="deWeeklyTotals()">'+
          '</td>';
      }).join('')+
      '</tr>';
  }).join('');
  deWeeklyTotals();
}

function deWeeklyTotals() {
  var monthSel = document.getElementById('de-weekly-month');
  if(!monthSel) return;
  var m = monthSel.value;
  var weeks = deGetWeeksInMonth(m);
  var fields=['applied','approved','denied','amount','iktApp','iktApv'];
  var totals = {};
  fields.forEach(function(f){totals[f]=0;});
  weeks.forEach(function(_,wi){
    fields.forEach(function(f){
      totals[f] += parseInt(document.getElementById('de-wk-'+wi+'-'+f)&&document.getElementById('de-wk-'+wi+'-'+f).value||0)||0;
    });
  });
  var setT = function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
  setT('de-wk-tot-applied',totals.applied);
  setT('de-wk-tot-approved',totals.approved);
  setT('de-wk-tot-denied',totals.denied);
  setT('de-wk-tot-amount','₹'+totals.amount.toLocaleString('en-IN'));
  setT('de-wk-tot-ikt-applied',totals.iktApp);
  setT('de-wk-tot-ikt-approved',totals.iktApv);
  setT('de-weekly-total-display','Total Approved: '+totals.approved);
}

function deClearWeekly() {
  var monthSel = document.getElementById('de-weekly-month');
  if(!monthSel) return;
  var weeks = deGetWeeksInMonth(monthSel.value);
  ['applied','approved','denied','amount','iktApp','iktApv'].forEach(function(f){
    weeks.forEach(function(_,wi){var el=document.getElementById('de-wk-'+wi+'-'+f);if(el)el.value='';});
  });
  deWeeklyTotals();
}

function deSaveWeekly() {
  var monthSel = document.getElementById('de-weekly-month');
  if(!monthSel) return;
  var m = monthSel.value;
  var weeks = deGetWeeksInMonth(m);
  var fields=['applied','approved','denied','amount','iktApp','iktApv'];
  var mData={};
  var totals={applied:0,approved:0,denied:0,amount:0,iktApp:0,iktApv:0};
  weeks.forEach(function(_,wi){
    mData['w'+wi]={};
    fields.forEach(function(f){
      var v=parseInt(document.getElementById('de-wk-'+wi+'-'+f)&&document.getElementById('de-wk-'+wi+'-'+f).value||0)||0;
      mData['w'+wi][f]=v;
      totals[f]+=v;
    });
  });
  mData.savedAt=new Date().toLocaleString('en-IN');
  var weekly=deLoadWeekly();
  weekly[m]=mData;
  dePersistWeekly(weekly);

  // Sync totals → monthly summary arrays
  var idx = deMonthIdx(m);
  if(idx>=0){
    MONTHLY_APPLIED_2025[idx]  = totals.applied;
    MONTHLY_APPROVED_2025[idx] = totals.approved;
    MONTHLY_DENIED_2025[idx]   = totals.denied;
    MONTHLY_AMOUNT_2025[idx]   = totals.amount;
    IKT_2025_APPLIED[idx]      = totals.iktApp;
    IKT_2025_APPROVED[idx]     = totals.iktApv;
  } else {
    ALL_MONTHS_KEYS.push(m);
    ALL_MONTHS_LABELS.push(m.slice(0,3)+' '+m.slice(-2));
    MONTHLY_APPLIED_2025.push(totals.applied);
    MONTHLY_APPROVED_2025.push(totals.approved);
    MONTHLY_DENIED_2025.push(totals.denied);
    MONTHLY_AMOUNT_2025.push(totals.amount);
    IKT_2025_APPLIED.push(totals.iktApp);
    IKT_2025_APPROVED.push(totals.iktApv);
    IKT_2025_DENIED.push(totals.denied);
    DATA_2025[m]=DEPTS.map(function(){return 0;});
  }
  deRefreshDashboard();
  deUpdateHero();
  deAutoSync('weekly-entry');
  deToast('✅ Weekly data for '+m+' saved — synced!','ok');
}

// ══════════════════════════════════
// MONTHLY SUMMARY
// ══════════════════════════════════
function deMonthChanged() {
  var m = document.getElementById('de-month-sel').value;
  if(!m) return;
  var idx = deMonthIdx(m);
  var status = document.getElementById('de-month-status');
  if(idx>=0){
    document.getElementById('de-applied').value   = MONTHLY_APPLIED_2025[idx]  ||'';
    document.getElementById('de-approved').value  = MONTHLY_APPROVED_2025[idx] ||'';
    document.getElementById('de-denied').value    = MONTHLY_DENIED_2025[idx]   ||'';
    document.getElementById('de-amount').value    = MONTHLY_AMOUNT_2025[idx]   ||'';
    document.getElementById('de-ikt-applied').value  = IKT_2025_APPLIED[idx]  ||'';
    document.getElementById('de-ikt-approved').value = IKT_2025_APPROVED[idx] ||'';
    document.getElementById('de-ikt-denied').value   = IKT_2025_DENIED[idx]   ||'';
    status.textContent='✏️ Existing data loaded — edit and save to update';
    status.style.color='#f29900';
    // Load extras
    var store=deLoad();
    if(store.monthly&&store.monthly[m]){
      var r=store.monthly[m];
      if(r.pending) document.getElementById('de-pending').value=r.pending;
      if(r.disbursed) document.getElementById('de-disbursed').value=r.disbursed;
      if(r.beneficiaries) document.getElementById('de-beneficiaries').value=r.beneficiaries;
      if(r.iktAmount) document.getElementById('de-ikt-amount').value=r.iktAmount;
      if(r.colpoTotal) document.getElementById('de-colpo-total').value=r.colpoTotal;
      if(r.colpoCmchis) document.getElementById('de-colpo-cmchis').value=r.colpoCmchis;
      if(r.colpoTnhsp) document.getElementById('de-colpo-tnhsp').value=r.colpoTnhsp;
      if(r.colpoAmount) document.getElementById('de-colpo-amount').value=r.colpoAmount;
      // Denial reasons
      if(r.denialReasons) r.denialReasons.forEach(function(v,i){
        var el=document.getElementById('de-denial-'+i);if(el)el.value=v||'';
      });
      if(r.denialOther) document.getElementById('de-denial-other').value=r.denialOther;
    }
  } else {
    deClearMonthly();
    status.textContent='🆕 New month — enter data below';
    status.style.color='#34a853';
  }
  deLivePreview();
  deUpdateCompleteness(m);
  deUpdateDenialTotal();
}

function deCalcDenied() {
  var app=parseInt(document.getElementById('de-applied').value)||0;
  var apv=parseInt(document.getElementById('de-approved').value)||0;
  if(app>0&&apv>=0&&app>=apv) document.getElementById('de-denied').value=app-apv;
}

function deLivePreview() {
  var applied  = parseInt(document.getElementById('de-applied').value)||0;
  var approved = parseInt(document.getElementById('de-approved').value)||0;
  var denied   = parseInt(document.getElementById('de-denied').value)||0;
  var amount   = parseInt(document.getElementById('de-amount').value)||0;
  var iktApv   = parseInt(document.getElementById('de-ikt-approved').value)||0;
  var rate     = applied>0?(approved/applied*100).toFixed(1):'—';
  document.getElementById('mp-applied').textContent   = applied||'—';
  document.getElementById('mp-approved').textContent  = approved||'—';
  document.getElementById('mp-denied').textContent    = denied||'—';
  document.getElementById('mp-rate').textContent      = rate!='—'?rate+'%':'—';
  document.getElementById('mp-amount').textContent    = amount>0?'₹'+(amount/100000).toFixed(1)+'L':'—';
  document.getElementById('mp-ikt').textContent       = iktApv||'—';
  // Color rate
  var rateEl=document.getElementById('mp-rate');
  var rv=parseFloat(rate);
  if(!isNaN(rv)) rateEl.style.color=rv>=90?'var(--green-dark)':rv>=80?'var(--yellow-dark)':'var(--red)';
}

function deUpdateDenialTotal() {
  var t=0;
  DE_DENIAL_REASONS.forEach(function(_,i){
    var el=document.getElementById('de-denial-'+i);
    t+=el?parseInt(el.value)||0:0;
  });
  t+=parseInt(document.getElementById('de-denial-other')?document.getElementById('de-denial-other').value:0)||0;
  var pill=document.getElementById('de-denial-total-pill');
  if(pill) pill.textContent='Total: '+t;
}

function deClearMonthly() {
  ['de-applied','de-approved','de-denied','de-amount',
   'de-ikt-applied','de-ikt-approved','de-ikt-denied','de-ikt-amount',
   'de-pending','de-disbursed','de-beneficiaries',
   'de-colpo-total','de-colpo-cmchis','de-colpo-tnhsp','de-colpo-amount',
   'de-denial-other'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  DE_DENIAL_REASONS.forEach(function(_,i){var el=document.getElementById('de-denial-'+i);if(el)el.value='';});
  deLivePreview();deUpdateDenialTotal();
}

function deSaveMonthly() {
  var m=document.getElementById('de-month-sel').value;
  if(!m){deToast('⚠️ Select a month first','err');return;}

  var applied   = parseInt(document.getElementById('de-applied').value)||0;
  var approved  = parseInt(document.getElementById('de-approved').value)||0;
  var denied    = parseInt(document.getElementById('de-denied').value)||(applied-approved)||0;
  var amount    = parseInt(document.getElementById('de-amount').value)||0;
  var iktApp    = parseInt(document.getElementById('de-ikt-applied').value)||0;
  var iktApv    = parseInt(document.getElementById('de-ikt-approved').value)||0;
  var iktDen    = parseInt(document.getElementById('de-ikt-denied').value)||0;
  var iktAmount = parseInt(document.getElementById('de-ikt-amount').value)||0;
  var pending       = parseInt(document.getElementById('de-pending').value)||0;
  var disbursed     = parseInt(document.getElementById('de-disbursed').value)||0;
  var beneficiaries = parseInt(document.getElementById('de-beneficiaries').value)||0;
  var colpoTotal    = parseInt(document.getElementById('de-colpo-total').value)||0;
  var colpoCmchis   = parseInt(document.getElementById('de-colpo-cmchis').value)||0;
  var colpoTnhsp    = parseInt(document.getElementById('de-colpo-tnhsp').value)||0;
  var colpoAmount   = parseInt(document.getElementById('de-colpo-amount').value)||0;
  var denialOther   = parseInt(document.getElementById('de-denial-other').value)||0;
  var denialReasons = DE_DENIAL_REASONS.map(function(_,i){
    var el=document.getElementById('de-denial-'+i);return el?parseInt(el.value)||0:0;
  });

  var idx=deMonthIdx(m);
  if(idx>=0){
    MONTHLY_APPLIED_2025[idx]  = applied;
    MONTHLY_APPROVED_2025[idx] = approved;
    MONTHLY_DENIED_2025[idx]   = denied;
    MONTHLY_AMOUNT_2025[idx]   = amount;
    IKT_2025_APPLIED[idx]      = iktApp;
    IKT_2025_APPROVED[idx]     = iktApv;
    IKT_2025_DENIED[idx]       = iktDen;
  } else {
    ALL_MONTHS_KEYS.push(m);
    ALL_MONTHS_LABELS.push(m.slice(0,3)+' '+m.slice(-2));
    MONTHLY_APPLIED_2025.push(applied); MONTHLY_APPROVED_2025.push(approved);
    MONTHLY_DENIED_2025.push(denied);   MONTHLY_AMOUNT_2025.push(amount);
    IKT_2025_APPLIED.push(iktApp);      IKT_2025_APPROVED.push(iktApv); IKT_2025_DENIED.push(iktDen);
    DATA_2025[m]=DEPTS.map(function(){return 0;});
  }

  var store=deLoad();
  if(!store.monthly) store.monthly={};
  store.monthly[m]={applied,approved,denied,amount,iktApp,iktApv,iktDen,iktAmount,
    pending,disbursed,beneficiaries,colpoTotal,colpoCmchis,colpoTnhsp,colpoAmount,
    denialReasons,denialOther,savedAt:new Date().toLocaleString('en-IN')};
  dePersist(store);
  deRefreshDashboard();
  deAutoSync('monthly-override');
  deUpdateHero();
  deUpdateCompleteness(m);
  deToast('✅ Monthly summary for '+m+' saved and dashboard updated!','ok');
  document.getElementById('de-month-status').textContent='✅ Saved at '+new Date().toLocaleTimeString('en-IN');
  document.getElementById('de-month-status').style.color='#137333';
}

// ══════════════════════════════════
// DEPT-WISE
// ══════════════════════════════════
function deRenderDeptTable(m) {
  var tbody=document.getElementById('de-dept-table-body');
  if(!tbody||typeof DEPTS==='undefined') return;
  var store=deLoad();
  var deptData = m&&store.dept&&store.dept[m] ? store.dept[m] : null;
  var approvals = (m&&DATA_2025[m])||DEPTS.map(function(){return 0;});

  tbody.innerHTML = DEPTS.map(function(dept,i){
    var apv = deptData&&deptData.approved ? deptData.approved[i]||0 : approvals[i]||0;
    var app = deptData&&deptData.applied  ? deptData.applied[i]||0  : 0;
    var amt = deptData&&deptData.amount   ? deptData.amount[i]||0   : 0;
    return '<tr>'+
      '<td style="font-weight:600;color:var(--grey9);font-size:12px">'+dept+'</td>'+
      '<td style="text-align:center"><input type="number" class="de-dt-input" id="de-da-'+i+'" placeholder="0" min="0" value="'+(app||'')+'" oninput="deDeptRecalc('+i+')"></td>'+
      '<td style="text-align:center"><input type="number" class="de-dt-input" id="de-dv-'+i+'" placeholder="0" min="0" value="'+(apv||'')+'" oninput="deDeptRecalc('+i+')"></td>'+
      '<td style="text-align:center"><input type="number" class="de-dt-input de-dt-derived" id="de-dd-'+i+'" placeholder="auto" min="0" value="" readonly></td>'+
      '<td style="text-align:center"><input type="number" class="de-dt-input" id="de-dm-'+i+'" placeholder="0" min="0" value="'+(amt||'')+'" oninput="deDeptTotals()"></td>'+
      '<td style="text-align:center;font-size:11px;color:var(--grey7)" id="de-dr-'+i+'">—</td>'+
      '</tr>';
  }).join('');
  DEPTS.forEach(function(_,i){deDeptRecalc(i);});
}

function deDeptRecalc(i) {
  var app=parseInt(document.getElementById('de-da-'+i)&&document.getElementById('de-da-'+i).value)||0;
  var apv=parseInt(document.getElementById('de-dv-'+i)&&document.getElementById('de-dv-'+i).value)||0;
  var denEl=document.getElementById('de-dd-'+i);
  var rateEl=document.getElementById('de-dr-'+i);
  if(denEl&&app>=apv&&app>0){denEl.value=app-apv;}
  if(rateEl){
    var rate=app>0?(((app-apv)/app)*100).toFixed(1)+'%':'—';
    rateEl.textContent=rate;
    rateEl.style.color=app>0?(app-apv)/app<0.1?'var(--green-dark)':'var(--red)':'var(--grey6)';
  }
  deDeptTotals();
}

function deDeptTotals() {
  if(typeof DEPTS==='undefined') return;
  var totA=0,totV=0,totD=0,totM=0;
  DEPTS.forEach(function(_,i){
    totA+=parseInt(document.getElementById('de-da-'+i)&&document.getElementById('de-da-'+i).value)||0;
    totV+=parseInt(document.getElementById('de-dv-'+i)&&document.getElementById('de-dv-'+i).value)||0;
    totD+=parseInt(document.getElementById('de-dd-'+i)&&document.getElementById('de-dd-'+i).value)||0;
    totM+=parseInt(document.getElementById('de-dm-'+i)&&document.getElementById('de-dm-'+i).value)||0;
  });
  var s=function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
  s('de-dept-total',totV);
  s('de-dept-denied-total',totD);
  s('de-dept-tot-applied',totA);
  s('de-dept-tot-approved',totV);
  s('de-dept-tot-denied',totD);
  s('de-dept-tot-amount','₹'+totM.toLocaleString('en-IN'));
  s('de-dept-tot-rate',totA>0?(totD/totA*100).toFixed(1)+'%':'—');
}

function deDeptMonthChanged() {
  var m=document.getElementById('de-dept-month-sel') ? document.getElementById('de-dept-month-sel').value : DE_GLOBAL_MONTH;
  if (!m) m = DE_GLOBAL_MONTH;
  var st=document.getElementById('de-dept-month-status');
  if(!m){deRenderDeptTable(null);return;}
  deRenderDeptTable(m);
  if(st){ st.textContent=deMonthIdx(m)>=0?'✏️ Existing data':'🆕 New'; st.style.color=deMonthIdx(m)>=0?'#f29900':'#34a853'; }
  var lbl=document.getElementById('de-dept-ctx-label'); if(lbl) lbl.textContent='Dept data — '+m;
  st.style.color=deMonthIdx(m)>=0?'#f29900':'#34a853';
}

function deClearDept() {
  DEPTS.forEach(function(_,i){
    ['de-da-','de-dv-','de-dm-'].forEach(function(p){var el=document.getElementById(p+i);if(el)el.value='';});
    var dd=document.getElementById('de-dd-'+i);if(dd)dd.value='';
    var dr=document.getElementById('de-dr-'+i);if(dr)dr.textContent='—';
  });
  deDeptTotals();
}

function deSaveDept() {
  var m=document.getElementById('de-dept-month-sel').value;
  if(!m){deToast('⚠️ Select a month first','err');return;}
  var approved=DEPTS.map(function(_,i){return parseInt(document.getElementById('de-dv-'+i)&&document.getElementById('de-dv-'+i).value)||0;});
  var applied =DEPTS.map(function(_,i){return parseInt(document.getElementById('de-da-'+i)&&document.getElementById('de-da-'+i).value)||0;});
  var amount  =DEPTS.map(function(_,i){return parseInt(document.getElementById('de-dm-'+i)&&document.getElementById('de-dm-'+i).value)||0;});
  DATA_2025[m]=approved;
  if(ALL_MONTHS_KEYS.indexOf(m)<0){
    ALL_MONTHS_KEYS.push(m);ALL_MONTHS_LABELS.push(m.slice(0,3)+' '+m.slice(-2));
    MONTHLY_APPLIED_2025.push(0);MONTHLY_APPROVED_2025.push(0);
    MONTHLY_DENIED_2025.push(0);MONTHLY_AMOUNT_2025.push(0);
    IKT_2025_APPLIED.push(0);IKT_2025_APPROVED.push(0);IKT_2025_DENIED.push(0);
  }
  var store=deLoad();
  if(!store.dept) store.dept={};
  store.dept[m]={approved,applied,amount,savedAt:new Date().toLocaleString('en-IN')};
  dePersist(store);
  deRefreshDashboard();
  deAutoSync('dept-wise');
  deUpdateCompleteness(m);
  deToast('✅ Department data for '+m+' saved!','ok');
  document.getElementById('de-dept-month-status').textContent='✅ Saved';
  document.getElementById('de-dept-month-status').style.color='#137333';
}

// ══════════════════════════════════
// IKT SCHEME
// ══════════════════════════════════
function deRenderIktDocs(m) {
  if(typeof IKT_DOC_DATA==='undefined') return;
  var idx=deMonthIdx(m);
  var container=document.getElementById('de-ikt-doc-rows');
  if(!container) return;
  container.innerHTML = '<div class="de-grid-3">'+IKT_DOC_DATA.map(function(doc,di){
    var curVal='';
    if(m&&idx>=0){
      if(idx===0&&CMCHIS_DOC_JAN) curVal=IKT_DOC_DATA[di]&&typeof IKT_DOC_DATA[di].jan!=='undefined'?IKT_DOC_DATA[di].jan:'';
    }
    var store=deLoad();
    if(store.ikt&&store.ikt[m]&&store.ikt[m].vals) curVal=store.ikt[m].vals[di]||'';
    return '<div class="de-field"><label>'+doc.name+'<span style="font-weight:400;color:var(--grey6);font-size:9px;text-transform:none;letter-spacing:0"> — '+doc.dept+'</span></label>'+
      '<input type="number" id="de-ikt-doc-'+di+'" placeholder="0" min="0" value="'+curVal+'" oninput="deIktDocTotal()"></div>';
  }).join('')+'</div>';
  deIktDocTotal();

  // IKT procedures
  var pgrid=document.getElementById('de-ikt-proc-grid');
  if(pgrid){
    var store2=deLoad();
    var procVals=(store2.ikt&&store2.ikt[m]&&store2.ikt[m].procs)||{};
    pgrid.innerHTML=DE_IKT_PROCS.map(function(proc,pi){
      return '<div class="de-field"><label>'+proc+'</label>'+
        '<input type="number" id="de-ikt-proc-'+pi+'" placeholder="0" min="0" value="'+(procVals[pi]||'')+'"></div>';
    }).join('');
  }
}

function deIktDocTotal() {
  var t=0;
  IKT_DOC_DATA.forEach(function(_,di){
    var el=document.getElementById('de-ikt-doc-'+di);t+=el?parseInt(el.value)||0:0;
  });
  var tot=document.getElementById('de-ikt-doc-total');if(tot)tot.textContent=t;
}

function deIktMonthChanged() {
  var m=document.getElementById('de-ikt-month-sel').value;
  var st=document.getElementById('de-ikt-month-status');
  if(!m){return;}
  deRenderIktDocs(m);
  st.textContent=deMonthIdx(m)>=0?'✏️ Existing data loaded':'🆕 New month';
  st.style.color=deMonthIdx(m)>=0?'#f29900':'#34a853';
}

function deClearIkt() {
  IKT_DOC_DATA.forEach(function(_,di){var el=document.getElementById('de-ikt-doc-'+di);if(el)el.value='';});
  DE_IKT_PROCS.forEach(function(_,pi){var el=document.getElementById('de-ikt-proc-'+pi);if(el)el.value='';});
  deIktDocTotal();
}

function deSaveIkt() {
  var m=document.getElementById('de-ikt-month-sel').value;
  if(!m){deToast('⚠️ Select a month first','err');return;}
  var vals=IKT_DOC_DATA.map(function(_,di){var el=document.getElementById('de-ikt-doc-'+di);return el?parseInt(el.value)||0:0;});
  var procs={};
  DE_IKT_PROCS.forEach(function(_,pi){var el=document.getElementById('de-ikt-proc-'+pi);procs[pi]=el?parseInt(el.value)||0:0;});
  var store=deLoad();
  if(!store.ikt) store.ikt={};
  store.ikt[m]={vals,procs,savedAt:new Date().toLocaleString('en-IN')};
  dePersist(store);
  deUpdateCompleteness(m);
  deAutoSync('ikt-scheme');
  deToast('✅ IKT data for '+m+' saved — synced!','ok');
  document.getElementById('de-ikt-month-status').textContent='✅ Saved';
  document.getElementById('de-ikt-month-status').style.color='#137333';
}

// ══════════════════════════════════
// DOCTOR-WISE
// ══════════════════════════════════
function deRenderCmchisDocs(m) {
  var tbody=document.getElementById('de-cmchis-doc-rows');
  if(!tbody) return;
  var store=deLoad();
  var docData=store.doctors&&store.doctors[m]?store.doctors[m]:{};
  var idx=deMonthIdx(m);
  tbody.innerHTML=CMCHIS_DOCTORS.map(function(name,di){
    var cases=docData.cmchis?docData.cmchis[di]||'':'';
    var rev=docData.cmchisRev?docData.cmchisRev[di]||'':'';
    if(!cases&&idx>=0){
      if(idx===0&&typeof CMCHIS_DOC_JAN!=='undefined') cases=CMCHIS_DOC_JAN[di]||'';
      else if(idx===1&&typeof CMCHIS_DOC_FEB!=='undefined') cases=CMCHIS_DOC_FEB[di]||'';
      else if(idx===2&&typeof CMCHIS_DOC_MAR!=='undefined') cases=CMCHIS_DOC_MAR[di]||'';
    }
    return '<tr>'+
      '<td style="padding:7px 10px;border-bottom:1px solid var(--grey3);font-weight:600;font-size:12px">'+name+'</td>'+
      '<td style="padding:7px 10px;border-bottom:1px solid var(--grey3);font-size:11px;color:var(--grey6);text-align:center">CMCHIS</td>'+
      '<td style="padding:4px 8px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-cmchis-'+di+'" placeholder="0" min="0" value="'+cases+'" oninput="deCmchisDocTotal()"></td>'+
      '<td style="padding:4px 8px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-cmchis-rev-'+di+'" placeholder="0" min="0" value="'+rev+'"></td>'+
      '</tr>';
  }).join('');
  deCmchisDocTotal();
}

function deCmchisDocTotal(){
  var t=0;
  CMCHIS_DOCTORS.forEach(function(_,di){var el=document.getElementById('de-cmchis-'+di);t+=el?parseInt(el.value)||0:0;});
  var el=document.getElementById('de-cmchis-doc-total');if(el)el.textContent=t;
}

function deRenderColpoDocs(m) {
  var container=document.getElementById('de-colpo-doc-rows');
  if(!container) return;
  var store=deLoad();
  var docData=store.doctors&&store.doctors[m]?store.doctors[m]:{};
  container.innerHTML='<div class="de-grid-3">'+DOCTORS.map(function(name,di){
    var v=docData.colpo?docData.colpo[di]||'':'';
    if(!v){var idx=deMonthIdx(m);if(idx>=0&&typeof COLPO_DOC_MONTHLY!=='undefined'&&COLPO_DOC_MONTHLY[di])v=COLPO_DOC_MONTHLY[di][idx]||'';}
    return '<div class="de-field"><label>'+name+'</label>'+
      '<input type="number" id="de-colpo-'+di+'" placeholder="0" min="0" value="'+v+'" oninput="deColpoDocTotal()"></div>';
  }).join('')+'</div>';
  deColpoDocTotal();
}

function deColpoDocTotal(){
  var t=0;
  DOCTORS.forEach(function(_,di){var el=document.getElementById('de-colpo-'+di);t+=el?parseInt(el.value)||0:0;});
  var el=document.getElementById('de-colpo-doc-total');if(el)el.textContent=t;
}

function deDocMonthChanged() {
  var m=document.getElementById('de-doc-month-sel').value;
  var st=document.getElementById('de-doc-month-status');
  if(!m) return;
  deRenderCmchisDocs(m);
  deRenderColpoDocs(m);
  st.textContent=deMonthIdx(m)>=0?'✏️ Existing data loaded':'🆕 New month';
  st.style.color=deMonthIdx(m)>=0?'#f29900':'#34a853';
}

function deClearDoctors() {
  CMCHIS_DOCTORS.forEach(function(_,di){
    var el=document.getElementById('de-cmchis-'+di);if(el)el.value='';
    var el2=document.getElementById('de-cmchis-rev-'+di);if(el2)el2.value='';
  });
  DOCTORS.forEach(function(_,di){var el=document.getElementById('de-colpo-'+di);if(el)el.value='';});
  deCmchisDocTotal();deColpoDocTotal();
}

function deSaveDoctors() {
  var m=document.getElementById('de-doc-month-sel').value;
  if(!m){deToast('⚠️ Select a month first','err');return;}
  var idx=deMonthIdx(m);
  CMCHIS_DOCTORS.forEach(function(_,di){
    var el=document.getElementById('de-cmchis-'+di);
    if(!el)return;
    var v=parseInt(el.value)||0;
    if(idx===0&&typeof CMCHIS_DOC_JAN!=='undefined') CMCHIS_DOC_JAN[di]=v;
    else if(idx===1&&typeof CMCHIS_DOC_FEB!=='undefined') CMCHIS_DOC_FEB[di]=v;
    else if(idx===2&&typeof CMCHIS_DOC_MAR!=='undefined') CMCHIS_DOC_MAR[di]=v;
  });
  DOCTORS.forEach(function(_,di){
    var el=document.getElementById('de-colpo-'+di);if(!el)return;
    var v=parseInt(el.value)||0;
    if(idx>=0&&typeof COLPO_DOC_MONTHLY!=='undefined'&&COLPO_DOC_MONTHLY[di])COLPO_DOC_MONTHLY[di][idx]=v;
  });
  var store=deLoad();
  if(!store.doctors)store.doctors={};
  store.doctors[m]={
    cmchis:CMCHIS_DOCTORS.map(function(_,di){var el=document.getElementById('de-cmchis-'+di);return el?parseInt(el.value)||0:0;}),
    cmchisRev:CMCHIS_DOCTORS.map(function(_,di){var el=document.getElementById('de-cmchis-rev-'+di);return el?parseInt(el.value)||0:0;}),
    colpo:DOCTORS.map(function(_,di){var el=document.getElementById('de-colpo-'+di);return el?parseInt(el.value)||0:0;}),
    savedAt:new Date().toLocaleString('en-IN')
  };
  dePersist(store);
  deUpdateCompleteness(m);
  deAutoSync('doctor-wise');
  deToast('✅ Doctor data for '+m+' saved — synced!','ok');
  document.getElementById('de-doc-month-status').textContent='✅ Saved';
  document.getElementById('de-doc-month-status').style.color='#137333';
}

// ══════════════════════════════════
// TARGETS
// ══════════════════════════════════
function deRenderDeptTargetGrid() {
  var grid=document.getElementById('de-dept-target-grid');
  if(!grid||typeof DEPTS==='undefined') return;
  grid.innerHTML=DEPTS.map(function(dept,i){
    return '<div class="de-field de-target"><label>🎯 '+dept+'</label>'+
      '<input type="number" id="de-tgt-dept-'+i+'" placeholder="0" min="0"></div>';
  }).join('');
}

function deTargetMonthChanged() {
  var m=document.getElementById('de-tgt-month-sel').value;
  var st=document.getElementById('de-tgt-month-status');
  if(!m) return;
  var store=deLoad();
  var tgt=store.targets&&store.targets[m]?store.targets[m]:{};
  ['applied','approved','denial-rate','amount','ikt','approval-rate'].forEach(function(f){
    var el=document.getElementById('de-tgt-'+f);if(el)el.value=tgt[f]||'';
  });
  ['annual-approved','annual-amount','annual-colpo'].forEach(function(f){
    var el=document.getElementById('de-tgt-'+f);if(el)el.value=tgt[f]||'';
  });
  DEPTS.forEach(function(_,i){
    var el=document.getElementById('de-tgt-dept-'+i);
    if(el)el.value=tgt.depts?tgt.depts[i]||'':'';
  });
  st.textContent=tgt.savedAt?'✏️ Targets loaded — edit and save':'🆕 No targets set yet';
  st.style.color=tgt.savedAt?'#f29900':'#34a853';
  // Show gap vs actual
  deShowTargetGap(m,tgt);
}

function deShowTargetGap(m,tgt) {
  var div=document.getElementById('de-tgt-gap-display');
  var idx=deMonthIdx(m);
  if(!div) return;
  if(idx<0||!tgt.approved){div.style.display='none';return;}
  div.style.display='block';
  var actual=MONTHLY_APPROVED_2025[idx]||0;
  var tgtVal=tgt.approved||0;
  var gap=actual-tgtVal;
  var cls=gap>=0?'de-target-pos':'de-target-neg';
  var gapStr=(gap>=0?'+':'')+gap+' cases';
  var rows=[
    {name:'Approved Cases',actual:actual,target:tgtVal,gap:gap},
    {name:'Applied Cases',actual:MONTHLY_APPLIED_2025[idx]||0,target:tgt.applied||0,gap:(MONTHLY_APPLIED_2025[idx]||0)-(tgt.applied||0)},
    {name:'IKT Approved',actual:IKT_2025_APPROVED[idx]||0,target:tgt.ikt||0,gap:(IKT_2025_APPROVED[idx]||0)-(tgt.ikt||0)},
  ];
  document.getElementById('de-tgt-gap-rows').innerHTML=rows.map(function(r){
    var cls2=r.gap>=0?'de-target-pos':'de-target-neg';
    return '<div class="de-target-row">'+
      '<div class="de-target-name">'+r.name+'</div>'+
      '<div class="de-target-current">Actual: '+r.actual+'</div>'+
      '<div style="font-size:12px;color:var(--grey7)">Target: '+r.target+'</div>'+
      '<div class="de-target-gap '+cls2+'">'+(r.gap>=0?'+':'')+r.gap+'</div>'+
      '</div>';
  }).join('');
}

function deClearTargets() {
  ['applied','approved','denial-rate','amount','ikt','approval-rate',
   'annual-approved','annual-amount','annual-colpo'].forEach(function(f){
    var el=document.getElementById('de-tgt-'+f);if(el)el.value='';
  });
  DEPTS.forEach(function(_,i){var el=document.getElementById('de-tgt-dept-'+i);if(el)el.value='';});
}

function deSaveTargets() {
  var m=document.getElementById('de-tgt-month-sel').value;
  if(!m){deToast('⚠️ Select a month first','err');return;}
  var tgt={};
  ['applied','approved','denial-rate','amount','ikt','approval-rate',
   'annual-approved','annual-amount','annual-colpo'].forEach(function(f){
    var el=document.getElementById('de-tgt-'+f);tgt[f]=el?parseFloat(el.value)||0:0;
  });
  tgt.depts=DEPTS.map(function(_,i){var el=document.getElementById('de-tgt-dept-'+i);return el?parseInt(el.value)||0:0;});
  tgt.savedAt=new Date().toLocaleString('en-IN');
  var store=deLoad();
  if(!store.targets)store.targets={};
  store.targets[m]=tgt;
  dePersist(store);
  deUpdateCompleteness(m);
  deAutoSync('targets');
  deToast('✅ Targets for '+m+' saved — synced!','ok');
  document.getElementById('de-tgt-month-status').textContent='✅ Saved at '+new Date().toLocaleTimeString('en-IN');
  document.getElementById('de-tgt-month-status').style.color='#137333';
}

// ══════════════════════════════════
// PACKAGES
// ══════════════════════════════════
var DE_DEFAULT_PKGS=[
  {name:'Total Knee Replacement',dept:'ORTHO'},{name:'Hip Replacement',dept:'ORTHO'},
  {name:'TURP',dept:'ORTHO'},{name:'Colposcopy',dept:'OG'},{name:'LSCS (C-Section)',dept:'OG'},
  {name:'Dialysis (per session)',dept:'DIALYSIS'},{name:'CABG',dept:'MI'},
  {name:'Appendectomy',dept:'GS'},{name:'Cataract Surgery',dept:'ENT SURGERY'},
  {name:'Tympanoplasty',dept:'ENT SURGERY'}
];

function deRenderPkgTable(m) {
  var tbody=document.getElementById('de-pkg-body');
  if(!tbody) return;
  var store=deLoad();
  var pkgData=store.packages&&store.packages[m]?store.packages[m].rows:DE_DEFAULT_PKGS.map(function(){return {};});
  tbody.innerHTML=DE_DEFAULT_PKGS.map(function(p,pi){
    var r=pkgData[pi]||{};
    return '<tr id="de-pkg-row-'+pi+'">'+
      '<td style="padding:6px 8px;border-bottom:1px solid var(--grey3);font-weight:600;font-size:12px">'+p.name+'</td>'+
      '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center;font-size:11px;color:var(--grey6)">'+p.dept+'</td>'+
      '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-pkg-vol-'+pi+'" placeholder="0" min="0" value="'+(r.vol||'')+'" oninput="dePkgTotal()"></td>'+
      '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-pkg-amt-'+pi+'" placeholder="0" min="0" value="'+(r.amt||'')+'"></td>'+
      '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center">'+
        '<select class="de-dt-input" id="de-pkg-status-'+pi+'" style="width:90px;font-size:11px">'+
          '<option value="active"'+(r.status==='active'?' selected':'')+'>Active</option>'+
          '<option value="partial"'+(r.status==='partial'?' selected':'')+'>Partial</option>'+
          '<option value="inactive"'+(r.status==='inactive'?' selected':'')+'>Inactive</option>'+
        '</select>'+
      '</td>'+
      '</tr>';
  }).join('');
  dePkgTotal();
}

function dePkgTotal(){
  var t=0;
  DE_DEFAULT_PKGS.forEach(function(_,pi){var el=document.getElementById('de-pkg-vol-'+pi);t+=el?parseInt(el.value)||0:0;});
  var el=document.getElementById('de-pkg-total-vol');if(el)el.textContent=t;
}

var DE_PKG_CUSTOM=[];
function deAddPackageRow(){
  var name=prompt('Package name:');
  if(!name) return;
  var dept=prompt('Department (e.g. ORTHO):');
  DE_PKG_CUSTOM.push({name:name||'Custom',dept:dept||'—'});
  var tbody=document.getElementById('de-pkg-body');
  if(!tbody) return;
  var pi=DE_DEFAULT_PKGS.length+DE_PKG_CUSTOM.length-1;
  var tr=document.createElement('tr');
  tr.id='de-pkg-row-'+pi;
  tr.innerHTML='<td style="padding:6px 8px;border-bottom:1px solid var(--grey3);font-weight:600;font-size:12px">'+name+'</td>'+
    '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center;font-size:11px;color:var(--grey6)">'+(dept||'—')+'</td>'+
    '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-pkg-vol-'+pi+'" placeholder="0" min="0" value="" oninput="dePkgTotal()"></td>'+
    '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-pkg-amt-'+pi+'" placeholder="0" min="0" value=""></td>'+
    '<td style="padding:4px 6px;border-bottom:1px solid var(--grey3)"><select class="de-dt-input" id="de-pkg-status-'+pi+'" style="width:90px;font-size:11px"><option value="active">Active</option><option value="partial">Partial</option><option value="inactive">Inactive</option></select></td>';
  tbody.appendChild(tr);
}

function dePkgMonthChanged(){
  var m=document.getElementById('de-pkg-month-sel').value;
  if(!m) return;
  deRenderPkgTable(m);
  document.getElementById('de-pkg-month-status').textContent='Package data loaded';
  document.getElementById('de-pkg-month-status').style.color='#f29900';
}

function deClearPackages(){
  DE_DEFAULT_PKGS.forEach(function(_,pi){
    var v=document.getElementById('de-pkg-vol-'+pi);if(v)v.value='';
    var a=document.getElementById('de-pkg-amt-'+pi);if(a)a.value='';
  });
  dePkgTotal();
}

function deSavePackages(){
  var m=document.getElementById('de-pkg-month-sel').value;
  if(!m){deToast('⚠️ Select a month first','err');return;}
  var rows=DE_DEFAULT_PKGS.map(function(_,pi){
    return {
      vol:parseInt(document.getElementById('de-pkg-vol-'+pi)&&document.getElementById('de-pkg-vol-'+pi).value)||0,
      amt:parseInt(document.getElementById('de-pkg-amt-'+pi)&&document.getElementById('de-pkg-amt-'+pi).value)||0,
      status:document.getElementById('de-pkg-status-'+pi)?document.getElementById('de-pkg-status-'+pi).value:'active'
    };
  });
  var store=deLoad();
  if(!store.packages)store.packages={};
  store.packages[m]={rows,savedAt:new Date().toLocaleString('en-IN')};
  dePersist(store);
  deAutoSync('packages');
  deToast('✅ Package data for '+m+' saved — synced!','ok');
  document.getElementById('de-pkg-month-status').textContent='✅ Saved';
  document.getElementById('de-pkg-month-status').style.color='#137333';
}

// ══════════════════════════════════
// COMPLETENESS TRACKER
// ══════════════════════════════════
function deUpdateCompleteness(m) {
  // In week-first mode, completeness is handled by deUpdateWeekPills + deUpdateWeekSectionChips
  deUpdateWeekPills();
  deUpdateWeekSectionChips(DE_GLOBAL_MONTH, DE_GLOBAL_WEEK);
}

// ══════════════════════════════════
// HISTORY & EXPORT
// ══════════════════════════════════
function deRefreshHistory(){deRenderHistory();}
function deFilterHistory(f){DE_HISTORY_FILTER=f;deRenderHistory();}

function deRenderHistory() {
  var store=deLoad();
  var daily=deLoadDaily();
  var weekly=deLoadWeekly();
  var rows=[];

  // Monthly
  if(store.monthly) Object.keys(store.monthly).forEach(function(m){
    var d=store.monthly[m];
    if(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='monthly')
      rows.push({period:m,type:'🗓️',typeCls:'edit',section:'Monthly Summary',applied:d.applied,approved:d.approved,denied:d.denied,amount:d.amount,savedAt:d.savedAt});
  });
  // Dept
  if(store.dept&&(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='monthly')) Object.keys(store.dept).forEach(function(m){
    var d=store.dept[m];
    var total=(d.approved||d.vals||[]).reduce(function(s,v){return s+(v||0);},0);
    rows.push({period:m,type:'🗓️',typeCls:'edit',section:'Dept-wise',applied:'-',approved:total,denied:'-',amount:'-',savedAt:d.savedAt});
  });
  // IKT
  if(store.ikt&&(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='monthly')) Object.keys(store.ikt).forEach(function(m){
    var d=store.ikt[m];
    var total=(d.vals||[]).reduce(function(s,v){return s+(v||0);},0);
    rows.push({period:m,type:'🗓️',typeCls:'edit',section:'IKT Doctors',applied:'-',approved:total,denied:'-',amount:'-',savedAt:d.savedAt});
  });
  // Doctors
  if(store.doctors&&(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='monthly')) Object.keys(store.doctors).forEach(function(m){
    var d=store.doctors[m];
    rows.push({period:m,type:'🗓️',typeCls:'edit',section:'Doctor-wise',applied:'-',approved:'-',denied:'-',amount:'-',savedAt:d.savedAt});
  });
  // Targets
  if(store.targets&&(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='target')) Object.keys(store.targets).forEach(function(m){
    var d=store.targets[m];
    rows.push({period:m,type:'🎯',typeCls:'target',section:'Targets',applied:d.applied||'-',approved:d.approved||'-',denied:'-',amount:d.amount||'-',savedAt:d.savedAt});
  });
  // Weekly
  if(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='weekly') Object.keys(weekly).forEach(function(m){
    var d=weekly[m];
    rows.push({period:m,type:'📆',typeCls:'weekly',section:'Weekly',applied:'-',approved:'-',denied:'-',amount:'-',savedAt:d.savedAt});
  });
  // Daily
  if(DE_HISTORY_FILTER==='all'||DE_HISTORY_FILTER==='daily') Object.keys(daily).forEach(function(dateStr){
    var d=daily[dateStr];
    rows.push({period:dateStr,type:'📅',typeCls:'daily',section:'Daily',applied:d.applied,approved:d.approved,denied:d.denied,amount:d.amount,savedAt:d.savedAt});
  });

  var tbody=document.getElementById('de-history-body');
  if(!rows.length){
    tbody.innerHTML='<tr><td colspan="8" class="de-prev-empty">No entries saved yet.</td></tr>';
    return;
  }
  tbody.innerHTML=rows.sort(function(a,b){return a.period>b.period?-1:1;}).map(function(r){
    return '<tr><td><strong>'+r.period+'</strong></td>'+
      '<td><span class="de-badge '+r.typeCls+'">'+r.type+' '+r.typeCls.charAt(0).toUpperCase()+r.typeCls.slice(1)+'</span></td>'+
      '<td>'+r.section+'</td>'+
      '<td style="text-align:center">'+(r.applied!==undefined?r.applied:'-')+'</td>'+
      '<td style="text-align:center;color:var(--green-dark);font-weight:600">'+(r.approved!==undefined?r.approved:'-')+'</td>'+
      '<td style="text-align:center;color:var(--red)">'+(r.denied!==undefined?r.denied:'-')+'</td>'+
      '<td>'+(r.amount!=='-'&&r.amount?'₹'+(+r.amount).toLocaleString('en-IN'):'-')+'</td>'+
      '<td style="font-size:11px;color:var(--grey6)">'+(r.savedAt||'—')+'</td>'+
      '</tr>';
  }).join('');
}

function deGenerateExport(type) {
  var store=deLoad();
  var daily=deLoadDaily();
  var weekly=deLoadWeekly();
  var lines=[];
  if(type==='monthly'){
    lines=['Month,Applied,Approved,Denied,Amount,IKTApp,IKTApv'];
    ALL_MONTHS_KEYS.forEach(function(m,i){
      lines.push([m,MONTHLY_APPLIED_2025[i]||0,MONTHLY_APPROVED_2025[i]||0,MONTHLY_DENIED_2025[i]||0,MONTHLY_AMOUNT_2025[i]||0,IKT_2025_APPLIED[i]||0,IKT_2025_APPROVED[i]||0].join(','));
    });
  } else if(type==='weekly'){
    lines=['Month,Week,Applied,Approved,Denied,Amount,IKTApp,IKTApv'];
    Object.keys(weekly).sort().forEach(function(m){
      var d=weekly[m];
      Object.keys(d).filter(function(k){return k.startsWith('w');}).forEach(function(wk){
        var r=d[wk];
        lines.push([m,wk,r.applied||0,r.approved||0,r.denied||0,r.amount||0,r.iktApp||0,r.iktApv||0].join(','));
      });
    });
  } else if(type==='daily'){
    lines=['Date,Applied,Approved,Denied,Amount,IKTApp,IKTApv'];
    Object.keys(daily).sort().forEach(function(dateStr){
      var r=daily[dateStr];
      lines.push([dateStr,r.applied||0,r.approved||0,r.denied||0,r.amount||0,r.iktApp||0,r.iktApv||0].join(','));
    });
  } else if(type==='dept'){
    lines=['Month,'+DEPTS.join(',')];
    ALL_MONTHS_KEYS.forEach(function(m){
      lines.push([m].concat((DATA_2025[m]||DEPTS.map(function(){return 0;}))).join(','));
    });
  }
  document.getElementById('de-export-csv').value=lines.join('\n');
}

function deCopyCSV(){var ta=document.getElementById('de-export-csv');ta.select();document.execCommand('copy');deToast('📋 CSV copied to clipboard','ok');}
function deDownloadCSV(){
  var csv=document.getElementById('de-export-csv').value;
  if(!csv){deToast('⚠️ Generate a CSV first','err');return;}
  var blob=new Blob([csv],{type:'text/csv'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='CMCHIS_Data_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
  deToast('⬇️ CSV downloaded','ok');
}
function deExportAll(){deShowTab('history',document.getElementById('de-tab-history'));deGenerateExport('monthly');}
function deClearAll(){
  if(!confirm('Clear ALL saved data entry records? (Live dashboard data is NOT affected)')) return;
  localStorage.removeItem(DE_STORE_KEY);localStorage.removeItem(DE_DAILY_KEY);localStorage.removeItem(DE_WEEKLY_KEY);
  deRenderHistory();deUpdateHero();
  deToast('🗑️ All saved entry records cleared','info');
}

// ══════════════════════════════════
// DASHBOARD REFRESH
// ══════════════════════════════════

// ── Auto-sync to Firebase + localStorage on every save ──

// ── Weekly dept table ──
function deWkRenderDeptTable(m, wi) {
  var tbody = document.getElementById('de-wk-dept-body');
  if (!tbody || typeof DEPTS === 'undefined') return;
  var store = deLoadWeekly();
  var wd = (store[m] && store[m]['w'+wi]) ? store[m]['w'+wi] : {};
  tbody.innerHTML = DEPTS.map(function(dept, i) {
    var app = wd.deptApplied  ? (wd.deptApplied[i]  || '') : '';
    var apv = wd.deptApproved ? (wd.deptApproved[i] || '') : '';
    var amt = wd.deptAmount   ? (wd.deptAmount[i]   || '') : '';
    var color = (typeof COLORS !== 'undefined' && COLORS[i]) || '#1a73e8';
    return '<tr>' +
      '<td style="padding:5px 8px;border-bottom:1px solid var(--grey3);font-weight:600;font-size:12px;border-left:3px solid '+color+'">'+dept+'</td>' +
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:4px 6px"><input type="number" class="de-dt-input" id="de-wk-da-'+i+'" placeholder="0" min="0" value="'+app+'" oninput="deWkDeptRecalc('+i+')"></td>' +
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:4px 6px"><input type="number" class="de-dt-input" id="de-wk-dv-'+i+'" placeholder="0" min="0" value="'+apv+'" oninput="deWkDeptRecalc('+i+')"></td>' +
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:4px 6px;font-style:italic;color:var(--grey6);font-size:11px" id="de-wk-dd-'+i+'">—</td>' +
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:4px 6px"><input type="number" class="de-dt-input" id="de-wk-dm-'+i+'" placeholder="0" min="0" value="'+amt+'" oninput="deWkDeptTotals()"></td>' +
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:4px 6px;font-size:11px" id="de-wk-dr-'+i+'">—</td>' +
      '</tr>';
  }).join('');
  DEPTS.forEach(function(_, i) { deWkDeptRecalc(i); });
}

function deWkDeptRecalc(i) {
  var app = parseInt((document.getElementById('de-wk-da-'+i)||{}).value)||0;
  var apv = parseInt((document.getElementById('de-wk-dv-'+i)||{}).value)||0;
  var den = app > apv ? app - apv : 0;
  var denEl  = document.getElementById('de-wk-dd-'+i);
  var rateEl = document.getElementById('de-wk-dr-'+i);
  if (denEl)  denEl.textContent  = app > 0 ? den : '—';
  if (rateEl) { 
    var rate = app > 0 ? (den/app*100).toFixed(1)+'%' : '—';
    rateEl.textContent = rate;
    rateEl.style.color = app>0 ? (den/app<0.1?'var(--green-dark)':'var(--red)') : 'var(--grey6)';
  }
  deWkDeptTotals();
}

function deWkDeptTotals() {
  if (typeof DEPTS === 'undefined') return;
  var totA=0, totV=0, totD=0, totM=0;
  DEPTS.forEach(function(_, i) {
    totA += parseInt((document.getElementById('de-wk-da-'+i)||{}).value)||0;
    totV += parseInt((document.getElementById('de-wk-dv-'+i)||{}).value)||0;
    totD += parseInt((document.getElementById('de-wk-dd-'+i)||{}).textContent)||0;
    totM += parseInt((document.getElementById('de-wk-dm-'+i)||{}).value)||0;
  });
  var s = function(id,v){var e=document.getElementById(id);if(e)e.textContent=v;};
  s('de-wk-dept-tot-app',  totA);
  s('de-wk-dept-tot-apv',  totV);
  s('de-wk-dept-tot-den',  totD);
  s('de-wk-dept-tot-amt',  '₹'+totM.toLocaleString('en-IN'));
  s('de-wk-dept-tot-rate', totA>0?(totD/totA*100).toFixed(1)+'%':'—');
  s('de-wk-dept-total',    totV);
}

function deAutoSync(source) {
  try {
    // Build a compact snapshot of all current data
    var weekly  = deLoadWeekly();
    var store   = deLoad();
    var payload = {
      savedAt:    new Date().toISOString(),
      source:     source || 'data-entry',
      months:     ALL_MONTHS_KEYS.join(', '),
      data: {
        monthly:  { applied: MONTHLY_APPLIED_2025.slice(), approved: MONTHLY_APPROVED_2025.slice(),
                    denied:  MONTHLY_DENIED_2025.slice(),  amount:   MONTHLY_AMOUNT_2025.slice() },
        ikt:      { applied: IKT_2025_APPLIED.slice(), approved: IKT_2025_APPROVED.slice(), denied: IKT_2025_DENIED.slice() },
        deptwise: DATA_2025,
        weekly:   weekly,
        store:    store
      }
    };
    // Save snapshot to Firebase (or localStorage fallback)
    if (window._fb && typeof window._fb.saveSnapshot === 'function') {
      window._fb.saveSnapshot(DATA_STORE, ALL_MONTHS_KEYS).catch(function(){});
    }
    // Also persist full entry store to localStorage as backup
    try { localStorage.setItem('cmchis_entry_snapshot', JSON.stringify(payload)); } catch(e) {}
    // Update storage status badge
    if (typeof setStorageStatus === 'function') {
      setStorageStatus(window._storageMode || 'local',
        (window._storageMode === 'firebase' ? '☁️ Synced' : '💾 Saved locally') +
        ' · ' + new Date().toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'}));
    }
  } catch(e) { console.warn('[deAutoSync]', e); }
}

function deRefreshDashboard() {
  try {
    DATA_MONTHS=[...ALL_MONTHS_KEYS];
    DEPTS.forEach(function(d,i){
      DATA_STORE[d] =ALL_MONTHS_KEYS.map(function(m){return (DATA_2025[m]||[])[i]||0;});
      DETAIL_STORE[d]=ALL_MONTHS_KEYS.map(function(m,gi){return {
        month:m,applied:MONTHLY_APPLIED_2025[gi]||0,
        approved:(DATA_2025[m]||[])[i]||0,
        denied:MONTHLY_DENIED_2025[gi]||0,amount:MONTHLY_AMOUNT_2025[gi]||0
      };});
    });
    if(typeof initAll==='function') initAll();
  } catch(e){console.warn('[DataEntry] Refresh error:',e);}
}

// ══════════════════════════════════
// HERO STATS
// ══════════════════════════════════
function deUpdateHero() {
  var total=MONTHLY_APPROVED_2025.reduce(function(s,v){return s+(v||0);},0);
  var last=ALL_MONTHS_KEYS[ALL_MONTHS_KEYS.length-1]||'—';
  var weekly=deLoadWeekly();
  // Count total saved weeks across all months
  var weeksEntered = 0;
  var monthsWithData = 0;
  Object.keys(weekly).forEach(function(m) {
    var mData = weekly[m];
    var hasAny = false;
    Object.keys(mData).forEach(function(k) {
      if (k.startsWith('w') && (mData[k].applied || mData[k].approved)) { weeksEntered++; hasAny=true; }
    });
    if (hasAny) monthsWithData++;
  });
  var setEl=function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
  setEl('de-months-entered', monthsWithData || ALL_MONTHS_KEYS.length);
  setEl('de-last-month', last);
  setEl('de-total-approved', total.toLocaleString('en-IN'));
  setEl('de-daily-count', weeksEntered);        // reuse slot for weeks count
  setEl('de-weekly-count', ALL_MONTHS_KEYS.length);
  setEl('de-doctors-count',(typeof CMCHIS_DOCTORS!=='undefined'?CMCHIS_DOCTORS.length:0)+(typeof DOCTORS!=='undefined'?DOCTORS.length:0));
  setEl('de-depts-count', typeof DEPTS!=='undefined'?DEPTS.length:0);
}

// ══════════════════════════════════
// GLOBAL MONTH + WEEK SELECTOR
// ══════════════════════════════════
var DE_GLOBAL_MONTH = '';
var DE_GLOBAL_WEEK  = -1;   // 0-based week index within the month
var DE_ALL_MONTHS_LIST = ['Jan 2025','Feb 2025','Mar 2025','Apr 2025','May 2025','Jun 2025','Jul 2025','Aug 2025','Sep 2025','Oct 2025','Nov 2025','Dec 2025','Jan 2026','Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026','Jan 2027','Feb 2027','Mar 2027','Apr 2027','May 2027','Jun 2027','Jul 2027','Aug 2027','Sep 2027','Oct 2027','Nov 2027','Dec 2027','Jan 2028','Feb 2028','Mar 2028','Apr 2028','May 2028','Jun 2028','Jul 2028','Aug 2028','Sep 2028','Oct 2028','Nov 2028','Dec 2028','Jan 2029','Feb 2029','Mar 2029','Apr 2029','May 2029','Jun 2029','Jul 2029','Aug 2029','Sep 2029','Oct 2029','Nov 2029','Dec 2029','Jan 2030','Feb 2030','Mar 2030','Apr 2030','May 2030','Jun 2030','Jul 2030','Aug 2030','Sep 2030','Oct 2030','Nov 2030','Dec 2030','Jan 2031','Feb 2031','Mar 2031','Apr 2031','May 2031','Jun 2031','Jul 2031','Aug 2031','Sep 2031','Oct 2031','Nov 2031','Dec 2031','Jan 2032','Feb 2032','Mar 2032','Apr 2032','May 2032','Jun 2032','Jul 2032','Aug 2032','Sep 2032','Oct 2032','Nov 2032','Dec 2032','Jan 2033','Feb 2033','Mar 2033','Apr 2033','May 2033','Jun 2033','Jul 2033','Aug 2033','Sep 2033','Oct 2033','Nov 2033','Dec 2033','Jan 2034','Feb 2034','Mar 2034','Apr 2034','May 2034','Jun 2034','Jul 2034','Aug 2034','Sep 2034','Oct 2034','Nov 2034','Dec 2034','Jan 2035','Feb 2035','Mar 2035','Apr 2035','May 2035','Jun 2035','Jul 2035','Aug 2035','Sep 2035','Oct 2035','Nov 2035','Dec 2035','Jan 2036','Feb 2036','Mar 2036','Apr 2036','May 2036','Jun 2036','Jul 2036','Aug 2036','Sep 2036','Oct 2036','Nov 2036','Dec 2036','Jan 2037','Feb 2037','Mar 2037','Apr 2037','May 2037','Jun 2037','Jul 2037','Aug 2037','Sep 2037','Oct 2037','Nov 2037','Dec 2037','Jan 2038','Feb 2038','Mar 2038','Apr 2038','May 2038','Jun 2038','Jul 2038','Aug 2038','Sep 2038','Oct 2038','Nov 2038','Dec 2038','Jan 2039','Feb 2039','Mar 2039','Apr 2039','May 2039','Jun 2039','Jul 2039','Aug 2039','Sep 2039','Oct 2039','Nov 2039','Dec 2039','Jan 2040','Feb 2040','Mar 2040','Apr 2040','May 2040','Jun 2040','Jul 2040','Aug 2040','Sep 2040','Oct 2040','Nov 2040','Dec 2040','Jan 2041','Feb 2041','Mar 2041','Apr 2041','May 2041','Jun 2041','Jul 2041','Aug 2041','Sep 2041','Oct 2041','Nov 2041','Dec 2041','Jan 2042','Feb 2042','Mar 2042','Apr 2042','May 2042','Jun 2042','Jul 2042','Aug 2042','Sep 2042','Oct 2042','Nov 2042','Dec 2042','Jan 2043','Feb 2043','Mar 2043','Apr 2043','May 2043','Jun 2043','Jul 2043','Aug 2043','Sep 2043','Oct 2043','Nov 2043','Dec 2043','Jan 2044','Feb 2044','Mar 2044','Apr 2044','May 2044','Jun 2044','Jul 2044','Aug 2044','Sep 2044','Oct 2044','Nov 2044','Dec 2044','Jan 2045','Feb 2045','Mar 2045','Apr 2045','May 2045','Jun 2045','Jul 2045','Aug 2045','Sep 2045','Oct 2045','Nov 2045','Dec 2045','Jan 2046','Feb 2046','Mar 2046','Apr 2046','May 2046','Jun 2046','Jul 2046','Aug 2046','Sep 2046','Oct 2046','Nov 2046','Dec 2046','Jan 2047','Feb 2047','Mar 2047','Apr 2047','May 2047','Jun 2047','Jul 2047','Aug 2047','Sep 2047','Oct 2047','Nov 2047','Dec 2047','Jan 2048','Feb 2048','Mar 2048','Apr 2048','May 2048','Jun 2048','Jul 2048','Aug 2048','Sep 2048','Oct 2048','Nov 2048','Dec 2048','Jan 2049','Feb 2049','Mar 2049','Apr 2049','May 2049','Jun 2049','Jul 2049','Aug 2049','Sep 2049','Oct 2049','Nov 2049','Dec 2049','Jan 2050','Feb 2050','Mar 2050','Apr 2050','May 2050','Jun 2050','Jul 2050','Aug 2050','Sep 2050','Oct 2050','Nov 2050','Dec 2050','Jan 2051','Feb 2051','Mar 2051','Apr 2051','May 2051','Jun 2051','Jul 2051','Aug 2051','Sep 2051','Oct 2051','Nov 2051','Dec 2051','Jan 2052','Feb 2052','Mar 2052','Apr 2052','May 2052','Jun 2052','Jul 2052','Aug 2052','Sep 2052','Oct 2052','Nov 2052','Dec 2052','Jan 2053','Feb 2053','Mar 2053','Apr 2053','May 2053','Jun 2053','Jul 2053','Aug 2053','Sep 2053','Oct 2053','Nov 2053','Dec 2053','Jan 2054','Feb 2054','Mar 2054','Apr 2054','May 2054','Jun 2054','Jul 2054','Aug 2054','Sep 2054','Oct 2054','Nov 2054','Dec 2054','Jan 2055','Feb 2055','Mar 2055','Apr 2055','May 2055','Jun 2055','Jul 2055','Aug 2055','Sep 2055','Oct 2055','Nov 2055','Dec 2055','Jan 2056','Feb 2056','Mar 2056','Apr 2056','May 2056','Jun 2056','Jul 2056','Aug 2056','Sep 2056','Oct 2056','Nov 2056','Dec 2056','Jan 2057','Feb 2057','Mar 2057','Apr 2057','May 2057','Jun 2057','Jul 2057','Aug 2057','Sep 2057','Oct 2057','Nov 2057','Dec 2057','Jan 2058','Feb 2058','Mar 2058','Apr 2058','May 2058','Jun 2058','Jul 2058','Aug 2058','Sep 2058','Oct 2058','Nov 2058','Dec 2058','Jan 2059','Feb 2059','Mar 2059','Apr 2059','May 2059','Jun 2059','Jul 2059','Aug 2059','Sep 2059','Oct 2059','Nov 2059','Dec 2059','Jan 2060','Feb 2060','Mar 2060','Apr 2060','May 2060','Jun 2060','Jul 2060','Aug 2060','Sep 2060','Oct 2060','Nov 2060','Dec 2060','Jan 2061','Feb 2061','Mar 2061','Apr 2061','May 2061','Jun 2061','Jul 2061','Aug 2061','Sep 2061','Oct 2061','Nov 2061','Dec 2061','Jan 2062','Feb 2062','Mar 2062','Apr 2062','May 2062','Jun 2062','Jul 2062','Aug 2062','Sep 2062','Oct 2062','Nov 2062','Dec 2062','Jan 2063','Feb 2063','Mar 2063','Apr 2063','May 2063','Jun 2063','Jul 2063','Aug 2063','Sep 2063','Oct 2063','Nov 2063','Dec 2063','Jan 2064','Feb 2064','Mar 2064','Apr 2064','May 2064','Jun 2064','Jul 2064','Aug 2064','Sep 2064','Oct 2064','Nov 2064','Dec 2064','Jan 2065','Feb 2065','Mar 2065','Apr 2065','May 2065','Jun 2065','Jul 2065','Aug 2065','Sep 2065','Oct 2065','Nov 2065','Dec 2065','Jan 2066','Feb 2066','Mar 2066','Apr 2066','May 2066','Jun 2066','Jul 2066','Aug 2066','Sep 2066','Oct 2066','Nov 2066','Dec 2066','Jan 2067','Feb 2067','Mar 2067','Apr 2067','May 2067','Jun 2067','Jul 2067','Aug 2067','Sep 2067','Oct 2067','Nov 2067','Dec 2067','Jan 2068','Feb 2068','Mar 2068','Apr 2068','May 2068','Jun 2068','Jul 2068','Aug 2068','Sep 2068','Oct 2068','Nov 2068','Dec 2068','Jan 2069','Feb 2069','Mar 2069','Apr 2069','May 2069','Jun 2069','Jul 2069','Aug 2069','Sep 2069','Oct 2069','Nov 2069','Dec 2069','Jan 2070','Feb 2070','Mar 2070','Apr 2070','May 2070','Jun 2070','Jul 2070','Aug 2070','Sep 2070','Oct 2070','Nov 2070','Dec 2070','Jan 2071','Feb 2071','Mar 2071','Apr 2071','May 2071','Jun 2071','Jul 2071','Aug 2071','Sep 2071','Oct 2071','Nov 2071','Dec 2071','Jan 2072','Feb 2072','Mar 2072','Apr 2072','May 2072','Jun 2072','Jul 2072','Aug 2072','Sep 2072','Oct 2072','Nov 2072','Dec 2072','Jan 2073','Feb 2073','Mar 2073','Apr 2073','May 2073','Jun 2073','Jul 2073','Aug 2073','Sep 2073','Oct 2073','Nov 2073','Dec 2073','Jan 2074','Feb 2074','Mar 2074','Apr 2074','May 2074','Jun 2074','Jul 2074','Aug 2074','Sep 2074','Oct 2074','Nov 2074','Dec 2074','Jan 2075','Feb 2075','Mar 2075','Apr 2075','May 2075','Jun 2075','Jul 2075','Aug 2075','Sep 2075','Oct 2075','Nov 2075','Dec 2075','Jan 2076','Feb 2076','Mar 2076','Apr 2076','May 2076','Jun 2076','Jul 2076','Aug 2076','Sep 2076','Oct 2076','Nov 2076','Dec 2076','Jan 2077','Feb 2077','Mar 2077','Apr 2077','May 2077','Jun 2077','Jul 2077','Aug 2077','Sep 2077','Oct 2077','Nov 2077','Dec 2077','Jan 2078','Feb 2078','Mar 2078','Apr 2078','May 2078','Jun 2078','Jul 2078','Aug 2078','Sep 2078','Oct 2078','Nov 2078','Dec 2078','Jan 2079','Feb 2079','Mar 2079','Apr 2079','May 2079','Jun 2079','Jul 2079','Aug 2079','Sep 2079','Oct 2079','Nov 2079','Dec 2079','Jan 2080','Feb 2080','Mar 2080','Apr 2080','May 2080','Jun 2080','Jul 2080','Aug 2080','Sep 2080','Oct 2080','Nov 2080','Dec 2080','Jan 2081','Feb 2081','Mar 2081','Apr 2081','May 2081','Jun 2081','Jul 2081','Aug 2081','Sep 2081','Oct 2081','Nov 2081','Dec 2081','Jan 2082','Feb 2082','Mar 2082','Apr 2082','May 2082','Jun 2082','Jul 2082','Aug 2082','Sep 2082','Oct 2082','Nov 2082','Dec 2082','Jan 2083','Feb 2083','Mar 2083','Apr 2083','May 2083','Jun 2083','Jul 2083','Aug 2083','Sep 2083','Oct 2083','Nov 2083','Dec 2083','Jan 2084','Feb 2084','Mar 2084','Apr 2084','May 2084','Jun 2084','Jul 2084','Aug 2084','Sep 2084','Oct 2084','Nov 2084','Dec 2084','Jan 2085','Feb 2085','Mar 2085','Apr 2085','May 2085','Jun 2085','Jul 2085','Aug 2085','Sep 2085','Oct 2085','Nov 2085','Dec 2085','Jan 2086','Feb 2086','Mar 2086','Apr 2086','May 2086','Jun 2086','Jul 2086','Aug 2086','Sep 2086','Oct 2086','Nov 2086','Dec 2086','Jan 2087','Feb 2087','Mar 2087','Apr 2087','May 2087','Jun 2087','Jul 2087','Aug 2087','Sep 2087','Oct 2087','Nov 2087','Dec 2087','Jan 2088','Feb 2088','Mar 2088','Apr 2088','May 2088','Jun 2088','Jul 2088','Aug 2088','Sep 2088','Oct 2088','Nov 2088','Dec 2088','Jan 2089','Feb 2089','Mar 2089','Apr 2089','May 2089','Jun 2089','Jul 2089','Aug 2089','Sep 2089','Oct 2089','Nov 2089','Dec 2089','Jan 2090','Feb 2090','Mar 2090','Apr 2090','May 2090','Jun 2090','Jul 2090','Aug 2090','Sep 2090','Oct 2090','Nov 2090','Dec 2090','Jan 2091','Feb 2091','Mar 2091','Apr 2091','May 2091','Jun 2091','Jul 2091','Aug 2091','Sep 2091','Oct 2091','Nov 2091','Dec 2091','Jan 2092','Feb 2092','Mar 2092','Apr 2092','May 2092','Jun 2092','Jul 2092','Aug 2092','Sep 2092','Oct 2092','Nov 2092','Dec 2092','Jan 2093','Feb 2093','Mar 2093','Apr 2093','May 2093','Jun 2093','Jul 2093','Aug 2093','Sep 2093','Oct 2093','Nov 2093','Dec 2093','Jan 2094','Feb 2094','Mar 2094','Apr 2094','May 2094','Jun 2094','Jul 2094','Aug 2094','Sep 2094','Oct 2094','Nov 2094','Dec 2094','Jan 2095','Feb 2095','Mar 2095','Apr 2095','May 2095','Jun 2095','Jul 2095','Aug 2095','Sep 2095','Oct 2095','Nov 2095','Dec 2095','Jan 2096','Feb 2096','Mar 2096','Apr 2096','May 2096','Jun 2096','Jul 2096','Aug 2096','Sep 2096','Oct 2096','Nov 2096','Dec 2096','Jan 2097','Feb 2097','Mar 2097','Apr 2097','May 2097','Jun 2097','Jul 2097','Aug 2097','Sep 2097','Oct 2097','Nov 2097','Dec 2097','Jan 2098','Feb 2098','Mar 2098','Apr 2098','May 2098','Jun 2098','Jul 2098','Aug 2098','Sep 2098','Oct 2098','Nov 2098','Dec 2098','Jan 2099','Feb 2099','Mar 2099','Apr 2099','May 2099','Jun 2099','Jul 2099','Aug 2099','Sep 2099','Oct 2099','Nov 2099','Dec 2099'];

// Compute all weeks for a month string like "Mar 2026"
function deGetWeeksInMonth(m) {
  var DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MONTH_FULL = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
  var parts = m.split(' ');
  var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = mNames.indexOf(parts[0]);
  var yr = parseInt(parts[1]);
  var daysInMonth = new Date(yr, mi+1, 0).getDate();
  var weeks = [];
  var wstart = 1;
  while (wstart <= daysInMonth) {
    var wend    = Math.min(wstart + 6, daysInMonth);
    var numDays = wend - wstart + 1;
    var isPartial = numDays < 7;
    // Day-of-week names for start and end
    var startDate = new Date(yr, mi, wstart);
    var endDate   = new Date(yr, mi, wend);
    var startDay  = DAY_SHORT[startDate.getDay()];
    var endDay    = DAY_SHORT[endDate.getDay()];
    // Dropdown label — compact, shows day+date range + partial warning
    var dropLabel = 'W' + (weeks.length+1) + '  ■  '
      + startDay + ' ' + wstart + ' – ' + endDay + ' ' + wend + ' ' + parts[0];
    if (isPartial) dropLabel += '  (' + numDays + ' day' + (numDays>1?'s':'')+')  ⚠';
    // Rich label for banner/tooltips
    var richLabel = startDay + ', ' + wstart + ' ' + MONTH_FULL[mi]
      + ' – ' + endDay + ', ' + wend + ' ' + MONTH_FULL[mi] + ' ' + yr;
    // Short label for pills e.g. "1-7 Mar" and "Mon-Sun"
    var pillLabel = wstart + '–' + wend + ' ' + parts[0];
    var pillDays  = startDay + '–' + endDay;
    weeks.push({
      start:     wstart,
      end:       wend,
      numDays:   numDays,
      isPartial: isPartial,
      startDay:  startDay,
      endDay:    endDay,
      label:     dropLabel,      // used in <option>
      richLabel: richLabel,      // used in banner heading
      pillLabel: pillLabel,      // short date range
      pillDays:  pillDays        // short day range
    });
    wstart += 7;
  }
  return weeks;
}


// Populate week dropdown from a month
function dePopulateWeekSelector(m, selectWeekIdx) {
  var sel = document.getElementById('de-global-week');
  if (!sel || !m) return;
  var weeks = deGetWeeksInMonth(m);
  sel.innerHTML = weeks.map(function(wk, i) {
    var cls = wk.isPartial ? ' style="color:#e37400;font-weight:600"' : '';
    return '<option value="'+i+'"'+cls+'>'+wk.label+'</option>';
  }).join('');
  if (typeof selectWeekIdx === 'number' && selectWeekIdx >= 0 && selectWeekIdx < weeks.length) {
    sel.selectedIndex = selectWeekIdx;
  }
  DE_GLOBAL_WEEK = parseInt(sel.value) || 0;
}

// Called when Month dropdown changes
function deGlobalMonthChanged() {
  var sel = document.getElementById('de-global-month');
  if (!sel) return;
  var m = sel.value || sel.options[sel.selectedIndex].text;
  DE_GLOBAL_MONTH = m;
  // Repopulate weeks, default to week 0
  dePopulateWeekSelector(m, 0);
  deGlobalWeekChanged();
}

// Called when Week dropdown changes
function deGlobalWeekChanged() {
  var wsel = document.getElementById('de-global-week');
  if (!wsel) return;
  DE_GLOBAL_WEEK = parseInt(wsel.value) || 0;

  // Sync old tab-level month selectors (for dept/ikt/doctors tabs)
  var allSelIds = ['de-month-sel','de-dept-month-sel','de-ikt-month-sel','de-doc-month-sel','de-tgt-month-sel','de-pkg-month-sel','de-daily-month','de-weekly-month'];
  allSelIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    for (var i = 0; i < el.options.length; i++) {
      if (el.options[i].text === DE_GLOBAL_MONTH || el.options[i].value === DE_GLOBAL_MONTH) {
        el.selectedIndex = i; break;
      }
    }
  });

  // Load weekly entry form for selected week
  deWkLoad(DE_GLOBAL_MONTH, DE_GLOBAL_WEEK);
  deWkRenderDeptTable(DE_GLOBAL_MONTH, DE_GLOBAL_WEEK);

  // Update week banner
  deWkUpdateBanner();

  // Update completeness
  deUpdateWeekPills();
  deUpdateWeekSectionChips(DE_GLOBAL_MONTH, DE_GLOBAL_WEEK);
  deUpdateGlobalStatus(DE_GLOBAL_MONTH, DE_GLOBAL_WEEK);

  // Refresh all-weeks summary table
  deWkRenderMonthSummary(DE_GLOBAL_MONTH);

  // Refresh month view if it's active
  deMvRefresh(DE_GLOBAL_MONTH);

  // Sync dept/ikt/doctor panels
  if (typeof deDeptMonthChanged === 'function') deDeptMonthChanged();
  if (typeof deIktMonthChanged  === 'function') deIktMonthChanged();
  if (typeof deDocMonthChanged  === 'function') deDocMonthChanged();
}

function deGlobalSyncFrom(sourceId) {
  var src = document.getElementById(sourceId);
  var gbl = document.getElementById('de-global-month');
  if (!src || !gbl || !src.value) return;
  for (var i = 0; i < gbl.options.length; i++) {
    if (gbl.options[i].text === src.value || gbl.options[i].value === src.value) {
      gbl.selectedIndex = i;
      DE_GLOBAL_MONTH = src.value;
      dePopulateWeekSelector(src.value, DE_GLOBAL_WEEK);
      deUpdateGlobalStatus(DE_GLOBAL_MONTH, DE_GLOBAL_WEEK);
      deUpdateWeekPills();
      break;
    }
  }
}

function deGlobalPrevWeek() {
  var wsel = document.getElementById('de-global-week');
  if (!wsel) return;
  if (wsel.selectedIndex > 0) {
    wsel.selectedIndex--;
    deGlobalWeekChanged();
  } else {
    // Go to prev month last week
    var msel = document.getElementById('de-global-month');
    if (msel && msel.selectedIndex > 0) {
      msel.selectedIndex--;
      var m = msel.options[msel.selectedIndex].text;
      DE_GLOBAL_MONTH = m;
      var weeks = deGetWeeksInMonth(m);
      dePopulateWeekSelector(m, weeks.length - 1);
      deGlobalWeekChanged();
    }
  }
}

function deGlobalNextWeek() {
  var wsel = document.getElementById('de-global-week');
  if (!wsel) return;
  if (wsel.selectedIndex < wsel.options.length - 1) {
    wsel.selectedIndex++;
    deGlobalWeekChanged();
  } else {
    // Go to next month week 0
    var msel = document.getElementById('de-global-month');
    if (msel && msel.selectedIndex < msel.options.length - 1) {
      msel.selectedIndex++;
      var m = msel.options[msel.selectedIndex].text;
      DE_GLOBAL_MONTH = m;
      dePopulateWeekSelector(m, 0);
      deGlobalWeekChanged();
    }
  }
}

function deGlobalSetCurrent() {
  var now = new Date();
  var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var curMonth = mNames[now.getMonth()] + ' ' + now.getFullYear();
  var msel = document.getElementById('de-global-month');
  if (msel) {
    for (var i = 0; i < msel.options.length; i++) {
      if (msel.options[i].text === curMonth) { msel.selectedIndex = i; break; }
    }
    DE_GLOBAL_MONTH = curMonth;
  }
  // Figure out current week
  var day = now.getDate();
  var wi = Math.min(Math.floor((day - 1) / 7), 4);
  dePopulateWeekSelector(curMonth, wi);
  deGlobalWeekChanged();
}

function deUpdateGlobalStatus(m, wi) {
  var store = deLoadWeekly();
  var key = m + ':w' + wi;
  var wkData = (store[m] && store[m]['w' + wi]) ? store[m]['w' + wi] : null;
  var statusEl = document.getElementById('de-global-status');
  if (!statusEl) return;
  if (!wkData || (!wkData.applied && !wkData.approved)) {
    statusEl.className = 'de-global-status de-gs-none';
    statusEl.textContent = '⬤ No data yet';
  } else if (wkData.applied && wkData.approved) {
    statusEl.className = 'de-global-status de-gs-new';
    statusEl.textContent = '✅ Saved · ' + wkData.approved + ' approved';
  } else {
    statusEl.className = 'de-global-status de-gs-edit';
    statusEl.textContent = '✏️ Partially saved';
  }
}

// Render the week pills for the whole month (W1 ✅ W2 ✅ W3 ❌ …)
function deUpdateWeekPills() {
  var m = DE_GLOBAL_MONTH;
  if (!m) return;
  var weeks = deGetWeeksInMonth(m);
  var store = deLoadWeekly();
  var mData = store[m] || {};

  var pillsEl = document.getElementById('de-week-pills');
  var compLbl = document.getElementById('de-comp-month-label');
  if (compLbl) compLbl.textContent = m + ' — week completeness:';

  var savedCount = 0;
  if (pillsEl) {
    pillsEl.innerHTML = weeks.map(function(wk, wi) {
      var wData = mData['w' + wi];
      var hasSaved = wData && (wData.applied || wData.approved);
      if (hasSaved) savedCount++;
      var isActive = (wi === DE_GLOBAL_WEEK);
      var pillBg    = isActive?'var(--blue)':hasSaved?'var(--green-light)':'#fff';
      var pillBdr   = isActive?'var(--blue)':hasSaved?'var(--green)':wk.isPartial?'#e37400':'var(--grey4)';
      var pillColor = isActive?'#fff':hasSaved?'var(--green-dark)':wk.isPartial?'#e37400':'var(--grey6)';
      var pillText  = (isActive?'▶ ':'')+'W'+(wi+1)+(hasSaved?' ✓':'')+(wk.isPartial?'⚠':'');
      var pillSub   = wk.pillLabel;
      return '<button onclick="deJumpToWeek('+wi+')" title="'+wk.richLabel+(wk.isPartial?' — Partial week ('+wk.numDays+' days)':'')+'" style="padding:5px 12px 5px;border-radius:12px;font-size:11px;font-weight:600;cursor:pointer;border:2px solid '+pillBdr+';background:'+pillBg+';color:'+pillColor+';transition:.15s;text-align:center;line-height:1.3;min-width:56px">'+
        '<div>'+pillText+'</div>'+
        '<div style="font-size:10px;font-weight:400;opacity:.85">'+pillSub+'</div>'+
        '</button>';
    }).join('');
  }

  var pct = weeks.length > 0 ? Math.round(savedCount / weeks.length * 100) : 0;
  var fillEl = document.getElementById('de-comp-fill');
  var pctEl  = document.getElementById('de-comp-pct');
  if (fillEl) fillEl.style.width = pct + '%';
  if (pctEl)  { pctEl.textContent = pct + '%'; pctEl.style.color = pct === 100 ? 'var(--green-dark)' : pct >= 50 ? 'var(--yellow-dark)' : 'var(--red)'; }
}

function deJumpToWeek(wi) {
  var wsel = document.getElementById('de-global-week');
  if (wsel) { wsel.selectedIndex = wi; deGlobalWeekChanged(); }
}

// Section chips for the selected week
function deUpdateWeekSectionChips(m, wi) {
  var store = deLoadWeekly();
  var wData = (store[m] && store[m]['w' + wi]) ? store[m]['w' + wi] : {};
  var sections = [
    {key:'summary', label:'📊 Summary',  done: !!(wData.applied || wData.approved)},
    {key:'dept',    label:'🏨 Depts',    done: !!(wData.deptData)},
    {key:'ikt',     label:'🔵 IKT',      done: !!(wData.iktApproved || wData['ikt-approved'])},
    {key:'doctors', label:'👨‍⚕️ Doctors', done: !!(wData.doctors)},
  ];
  var selLbl = document.getElementById('de-sel-week-label');
  var weeks = deGetWeeksInMonth(m);
  if (selLbl && weeks[wi]) selLbl.textContent = weeks[wi].richLabel + (weeks[wi].isPartial ? ' ⚠ Partial (' + weeks[wi].numDays + ' days)' : '') + ' — sections:';
  var chips = document.getElementById('de-comp-chips');
  if (chips) chips.innerHTML = sections.map(function(s) {
    return '<span class="de-comp-chip '+(s.done?'done':'todo')+'">'+s.label+'</span>';
  }).join('');
}

// ══════════════════════════════════
// WEEKLY ENTRY FORM — single week
// ══════════════════════════════════
var WK_FIELDS = ['applied','approved','denied','amount','ikt-applied','ikt-approved','ikt-denied','ikt-amount',
                 'colpo-total','colpo-cmchis','colpo-tnhsp','colpo-amount','pending','disbursed','beneficiaries'];

function deWkLoad(m, wi) {
  if (!m) return;
  var store = deLoadWeekly();
  var wData = (store[m] && store[m]['w' + wi]) ? store[m]['w' + wi] : {};
  WK_FIELDS.forEach(function(f) {
    var el = document.getElementById('de-wk-' + f);
    if (el) el.value = wData[f] || '';
  });
  // Denial reasons
  if (typeof DE_DENIAL_REASONS !== 'undefined') {
    DE_DENIAL_REASONS.forEach(function(_, i) {
      var el = document.getElementById('de-wk-denial-' + i);
      if (el) el.value = (wData.denialReasons && wData.denialReasons[i]) || '';
    });
  }
  var otherEl = document.getElementById('de-wk-denial-other');
  if (otherEl) otherEl.value = wData.denialOther || '';
  deWkLivePreview();
  deWkUpdateDenialTotal();
  deWkRenderDeptTable(m, wi);
  // Show saved-at badge
  var savedEl = document.getElementById('de-wk-saved-at');
  if (savedEl) {
    savedEl.style.display = wData.savedAt ? 'inline-flex' : 'none';
    if (wData.savedAt) savedEl.textContent = '💾 Saved ' + wData.savedAt;
  }
}

function deWkCalcDerived() {
  var app = parseInt(document.getElementById('de-wk-applied').value) || 0;
  var apv = parseInt(document.getElementById('de-wk-approved').value) || 0;
  if (app > 0 && apv >= 0 && app >= apv) {
    var den = document.getElementById('de-wk-denied');
    if (den) den.value = app - apv;
  }
}

function deWkLivePreview() {
  var applied  = parseInt(document.getElementById('de-wk-applied').value) || 0;
  var approved = parseInt(document.getElementById('de-wk-approved').value) || 0;
  var denied   = parseInt(document.getElementById('de-wk-denied').value) || 0;
  var amount   = parseInt(document.getElementById('de-wk-amount').value) || 0;
  var iktApv   = parseInt(document.getElementById('de-wk-ikt-approved').value) || 0;
  var rate     = applied > 0 ? (approved / applied * 100).toFixed(1) + '%' : '—';
  var set = function(id, v) { var el = document.getElementById(id); if(el) el.textContent = v; };
  set('wkp-applied',  applied  || '—');
  set('wkp-approved', approved || '—');
  set('wkp-denied',   denied   || '—');
  set('wkp-rate',     rate);
  set('wkp-amount',   amount > 0 ? '₹' + (amount/100000).toFixed(2) + 'L' : '—');
  set('wkp-ikt',      iktApv   || '—');
}

function deWkUpdateDenialTotal() {
  var t = 0;
  if (typeof DE_DENIAL_REASONS !== 'undefined') {
    DE_DENIAL_REASONS.forEach(function(_, i) {
      var el = document.getElementById('de-wk-denial-' + i);
      t += el ? (parseInt(el.value) || 0) : 0;
    });
  }
  var other = document.getElementById('de-wk-denial-other');
  t += other ? (parseInt(other.value) || 0) : 0;
  var pill = document.getElementById('de-wk-denial-total-pill');
  if (pill) pill.textContent = 'Total: ' + t;
}

function deWkUpdateBanner() {
  var m  = DE_GLOBAL_MONTH;
  var wi = DE_GLOBAL_WEEK;
  if (!m) return;
  var weeks = deGetWeeksInMonth(m);
  var wk = weeks[wi];
  if (!wk) return;
  var titleEl = document.getElementById('de-wk-banner-title');
  var subEl   = document.getElementById('de-wk-banner-sub');
  if (titleEl) titleEl.textContent = 'W' + (wi+1) + ' · ' + wk.label + ' — ' + m;
  if (subEl)   subEl.textContent   = 'Enter the CMCHIS and IKT figures for this week and click Save.';
  // Status
  var store = deLoadWeekly();
  var wData = (store[m] && store[m]['w' + wi]) ? store[m]['w' + wi] : {};
  var stEl  = document.getElementById('de-wk-banner-status');
  if (stEl) {
    var hasSaved = wData.savedAt;
    stEl.style.background = hasSaved ? 'var(--green-light)' : 'var(--grey2)';
    stEl.style.color = hasSaved ? 'var(--green-dark)' : 'var(--grey6)';
    stEl.textContent = hasSaved ? '✅ Week saved' : '⬤ Not yet saved';
  }
}

function deWkClear() {
  WK_FIELDS.forEach(function(f) { var el = document.getElementById('de-wk-'+f); if(el) el.value=''; });
  if (typeof DE_DENIAL_REASONS !== 'undefined') {
    DE_DENIAL_REASONS.forEach(function(_, i) { var el = document.getElementById('de-wk-denial-'+i); if(el) el.value=''; });
  }
  var other = document.getElementById('de-wk-denial-other'); if(other) other.value='';
  deWkLivePreview(); deWkUpdateDenialTotal();
}

function deWkSave() {
  var m  = DE_GLOBAL_MONTH;
  var wi = DE_GLOBAL_WEEK;
  if (!m) { deToast('⚠️ Select a month and week first', 'err'); return; }

  var gv = function(id) { var el=document.getElementById('de-wk-'+id); return el?(parseInt(el.value)||0):0; };
  var denialReasons = typeof DE_DENIAL_REASONS!=='undefined' ? DE_DENIAL_REASONS.map(function(_,i){
    var el=document.getElementById('de-wk-denial-'+i); return el?parseInt(el.value)||0:0;
  }) : [];
  var denialOther = gv('denial-other');

  var wData = {
    applied:      gv('applied'),
    approved:     gv('approved'),
    denied:       gv('denied') || Math.max(0, gv('applied') - gv('approved')),
    amount:       gv('amount'),
    'ikt-applied':  gv('ikt-applied'),
    'ikt-approved': gv('ikt-approved'),
    'ikt-denied':   gv('ikt-denied'),
    'ikt-amount':   gv('ikt-amount'),
    'colpo-total':  gv('colpo-total'),
    'colpo-cmchis': gv('colpo-cmchis'),
    'colpo-tnhsp':  gv('colpo-tnhsp'),
    'colpo-amount': gv('colpo-amount'),
    pending:      gv('pending'),
    disbursed:    gv('disbursed'),
    beneficiaries:gv('beneficiaries'),
    denialReasons:denialReasons,
    denialOther:  denialOther,
    deptApplied:  typeof DEPTS!=='undefined' ? DEPTS.map(function(_,i){var e=document.getElementById('de-wk-da-'+i);return e?parseInt(e.value)||0:0;}) : [],
    deptApproved: typeof DEPTS!=='undefined' ? DEPTS.map(function(_,i){var e=document.getElementById('de-wk-dv-'+i);return e?parseInt(e.value)||0:0;}) : [],
    deptAmount:   typeof DEPTS!=='undefined' ? DEPTS.map(function(_,i){var e=document.getElementById('de-wk-dm-'+i);return e?parseInt(e.value)||0:0;}) : [],
    savedAt:      new Date().toLocaleString('en-IN')
  };

  var store = deLoadWeekly();
  if (!store[m]) store[m] = {};
  store[m]['w' + wi] = wData;
  dePersistWeekly(store);

  // Roll up all weeks → monthly arrays
  deWkRollUpMonth(m);
  deRefreshDashboard();
  deAutoSync('weekly-entry');
  deUpdateHero();
  deWkUpdateBanner();
  deWkRenderMonthSummary(m);
  deUpdateWeekPills();
  deUpdateWeekSectionChips(m, wi);
  deUpdateGlobalStatus(m, wi);
  deMvRefresh(m);

  // Update saved-at badge
  var savedEl = document.getElementById('de-wk-saved-at');
  if (savedEl) { savedEl.style.display='inline-flex'; savedEl.textContent='💾 Saved '+wData.savedAt; }

  var weeks = deGetWeeksInMonth(m);
  deToast('✅ W' + (wi+1) + ' (' + (weeks[wi]?weeks[wi].pillLabel:'') + ') saved and synced to dashboard!', 'ok');
}

// Sum all saved weeks → monthly totals
function deWkRollUpMonth(m) {
  var store = deLoadWeekly();
  var mData = store[m] || {};
  var weeks = deGetWeeksInMonth(m);
  var totals = {applied:0,approved:0,denied:0,amount:0,iktApp:0,iktApv:0,iktDen:0,iktAmt:0};
  weeks.forEach(function(_, wi) {
    var wd = mData['w' + wi] || {};
    totals.applied  += wd.applied  || 0;
    totals.approved += wd.approved || 0;
    totals.denied   += wd.denied   || 0;
    totals.amount   += wd.amount   || 0;
    totals.iktApp   += wd['ikt-applied']  || 0;
    totals.iktApv   += wd['ikt-approved'] || 0;
    totals.iktDen   += wd['ikt-denied']   || 0;
    totals.iktAmt   += wd['ikt-amount']   || 0;
  });
  // Sum dept approved across all weeks
  var deptTotals = typeof DEPTS!=='undefined' ? DEPTS.map(function(){return 0;}) : [];
  weeks.forEach(function(_, wi) {
    var wd = mData['w' + wi] || {};
    if (wd.deptApproved) {
      wd.deptApproved.forEach(function(v, di) { deptTotals[di] = (deptTotals[di]||0) + (v||0); });
    }
  });

  var idx = deMonthIdx(m);
  if (idx >= 0) {
    MONTHLY_APPLIED_2025[idx]  = totals.applied;
    MONTHLY_APPROVED_2025[idx] = totals.approved;
    MONTHLY_DENIED_2025[idx]   = totals.denied;
    MONTHLY_AMOUNT_2025[idx]   = totals.amount;
    IKT_2025_APPLIED[idx]      = totals.iktApp;
    IKT_2025_APPROVED[idx]     = totals.iktApv;
    IKT_2025_DENIED[idx]       = totals.iktDen;
    // Update dept breakdown if we have it
    if (deptTotals.some(function(v){return v>0;})) DATA_2025[m] = deptTotals;
  } else {
    ALL_MONTHS_KEYS.push(m);
    ALL_MONTHS_LABELS.push(m.slice(0,3)+' '+m.slice(-2));
    MONTHLY_APPLIED_2025.push(totals.applied);
    MONTHLY_APPROVED_2025.push(totals.approved);
    MONTHLY_DENIED_2025.push(totals.denied);
    MONTHLY_AMOUNT_2025.push(totals.amount);
    IKT_2025_APPLIED.push(totals.iktApp);
    IKT_2025_APPROVED.push(totals.iktApv);
    IKT_2025_DENIED.push(totals.iktDen);
    DATA_2025[m] = deptTotals.some(function(v){return v>0;}) ? deptTotals : (typeof DEPTS!=='undefined' ? DEPTS.map(function(){return 0;}) : []);
  }
  return totals;
}

// Render all-weeks summary table inside weekly entry tab
function deWkRenderMonthSummary(m) {
  if (!m) return;
  var store = deLoadWeekly();
  var mData = store[m] || {};
  var weeks = deGetWeeksInMonth(m);
  var tbody = document.getElementById('de-wk-month-summary-body');
  if (!tbody) return;
  var totals = {applied:0,approved:0,denied:0,amount:0,ikt:0};
  tbody.innerHTML = weeks.map(function(wk, wi) {
    var wd = mData['w' + wi] || {};
    var app=wd.applied||0, apv=wd.approved||0, den=wd.denied||0, amt=wd.amount||0, ikt=wd['ikt-approved']||0;
    totals.applied+=app; totals.approved+=apv; totals.denied+=den; totals.amount+=amt; totals.ikt+=ikt;
    var hasSaved = wd.savedAt;
    var isCurrent = (wi === DE_GLOBAL_WEEK);
    return '<tr style="'+(isCurrent?'background:var(--blue-light)':hasSaved?'':'opacity:.55')+';cursor:pointer" onclick="deJumpToWeek('+wi+')" title="Click to edit this week">'+
      '<td style="padding:8px 10px;border-bottom:1px solid var(--grey3);font-weight:700;color:'+(isCurrent?'var(--blue)':'var(--grey9)')+'">W'+(wi+1)+(isCurrent?' ◀':'')+' </td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid var(--grey3)">'+'<div style="font-size:12px;font-weight:600;color:var(--grey9)">'+wk.pillLabel+'</div>'+'<div style="font-size:10px;color:var(--grey6)">'+wk.startDay+' – '+wk.endDay+(wk.isPartial?' · <span style=\'color:#e37400\'>⚠ '+wk.numDays+' days</span>':' · 7 days')+'</div>'+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px">'+( hasSaved?app:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px;color:var(--green-dark);font-weight:600">'+( hasSaved?apv:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px;color:var(--red)">'+( hasSaved?den:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px">'+( hasSaved?('₹'+(amt/100000).toFixed(2)+'L'):'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px;color:var(--green-dark)">'+( hasSaved?ikt:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px">'+( hasSaved?'<span style="background:var(--green-light);color:var(--green-dark);border-radius:8px;padding:2px 8px;font-size:10px;font-weight:700">✓ Saved</span>':'<span style="background:var(--grey2);color:var(--grey6);border-radius:8px;padding:2px 8px;font-size:10px">Pending</span>')+'</td>'+
      '</tr>';
  }).join('');
  // foot totals
  var s = function(id,v){var el=document.getElementById(id);if(el)el.textContent=v;};
  s('wks-tot-applied',  totals.applied);
  s('wks-tot-approved', totals.approved);
  s('wks-tot-denied',   totals.denied);
  s('wks-tot-amount',   '₹'+(totals.amount/100000).toFixed(2)+'L');
  s('wks-tot-ikt',      totals.ikt);
  var dispEl = document.getElementById('de-wk-month-total-disp');
  if (dispEl) dispEl.textContent = 'Month Approved: '+totals.approved;
  var titleEl = document.getElementById('de-wk-month-sum-title');
  if (titleEl) titleEl.textContent = '📈 '+m+' — All Weeks Summary';
}

// Month view tab refresh
function deMvRefresh(m) {
  if (!m) return;
  var store = deLoadWeekly();
  var mData = store[m] || {};
  var weeks = deGetWeeksInMonth(m);
  // mini cards
  var totals = deWkRollUpMonth(m);
  var set = function(id, v) { var el=document.getElementById(id); if(el) el.textContent=v; };
  set('mv-applied',  totals.applied||'—');
  set('mv-approved', totals.approved||'—');
  set('mv-denied',   totals.denied||'—');
  set('mv-rate',     totals.applied>0?(totals.approved/totals.applied*100).toFixed(1)+'%':'—');
  set('mv-amount',   totals.amount>0?'₹'+(totals.amount/100000).toFixed(2)+'L':'—');
  set('mv-ikt',      totals.iktApv||'—');
  var title=document.getElementById('de-monthly-view-title'); if(title) title.textContent='📊 '+m+' — Month View';
  // weeks body
  var tbody = document.getElementById('de-mv-weeks-body');
  if (!tbody) return;
  tbody.innerHTML = weeks.map(function(wk, wi) {
    var wd = mData['w'+wi]||{};
    var hasSaved = wd.savedAt;
    return '<tr style="'+(hasSaved?'':'opacity:.55')+'" onclick="deShowTab(\'weeklyentry\',document.getElementById(\'de-tab-weeklyentry\'));deJumpToWeek('+wi+')" style="cursor:pointer">'+
      '<td style="padding:8px 10px;border-bottom:1px solid var(--grey3);font-weight:600">'+'W'+(wi+1)+(wk.isPartial?' <span style=\'color:#e37400;font-size:10px\'>⚠</span>':'')+' </td>'+
      '<td style="padding:8px 10px;border-bottom:1px solid var(--grey3)">'+'<div style="font-size:12px;font-weight:600;color:var(--grey9)">'+wk.pillLabel+'</div>'+'<div style="font-size:10px;color:var(--grey6)">'+wk.startDay+' – '+wk.endDay+(wk.isPartial?' · <span style=\'color:#e37400\'>⚠ '+wk.numDays+' days</span>':' · 7 days')+'</div>'+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px">'+(hasSaved?wd.applied:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px;color:var(--green-dark);font-weight:600">'+(hasSaved?wd.approved:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px;color:var(--red)">'+(hasSaved?wd.denied:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px">'+(hasSaved?'₹'+((wd.amount||0)/100000).toFixed(2)+'L':'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px;color:var(--green-dark)">'+(hasSaved?wd['ikt-approved']||0:'—')+'</td>'+
      '<td style="text-align:center;border-bottom:1px solid var(--grey3);padding:8px">'+
        (hasSaved?'<button onclick="event.stopPropagation();deShowTab(\'weeklyentry\',document.getElementById(\'de-tab-weeklyentry\'));deJumpToWeek('+wi+')" style="background:var(--blue-light);border:1px solid var(--blue);color:var(--blue);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px;font-weight:600">✏️ Edit</button>':
                  '<button onclick="event.stopPropagation();deShowTab(\'weeklyentry\',document.getElementById(\'de-tab-weeklyentry\'));deJumpToWeek('+wi+')" style="background:var(--grey2);border:1px solid var(--grey4);color:var(--grey6);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:11px">+ Enter</button>')+
      '</td>'+
      '</tr>';
  }).join('');
}

// Render denial grid for weekly entry
function deWkRenderDenialGrid() {
  var grid = document.getElementById('de-wk-denial-grid');
  if (!grid || typeof DE_DENIAL_REASONS === 'undefined') return;
  grid.innerHTML = '<div class="de-grid-2">'+DE_DENIAL_REASONS.map(function(r,i){
    return '<div class="de-denial-row"><div class="de-denial-label">'+r+'</div>'+
      '<div class="de-field" style="min-width:120px"><input type="number" id="de-wk-denial-'+i+'" placeholder="0" min="0" value="" oninput="deWkUpdateDenialTotal()"></div></div>';
  }).join('')+'</div>';
}

// Deprecated wrappers kept for backward compat
function deRenderWeeklyPanel() { deWkRenderMonthSummary(DE_GLOBAL_MONTH); }
function deSaveWeekly() { deWkSave(); }
function deClearWeekly() { deWkClear(); }
function deSetGranularity() {} // no-op, mode is always weekly now

// ══════════════════════════════════
// MANAGE TAB FUNCTIONS
// ══════════════════════════════════
var DE_MANAGE_EDIT_TYPE = '';
var DE_MANAGE_EDIT_IDX  = -1;

function deMgGetData() {
  var saved = deLoadManage();
  if (saved) return saved;
  // Default: copy from global arrays
  return {
    cmchisDoctors: (typeof CMCHIS_DOCTORS !== 'undefined' ? CMCHIS_DOCTORS.slice() : []).map(function(n, i) {
      var meta = (typeof CMCHIS_DOC_META !== 'undefined' && CMCHIS_DOC_META[i]) || {};
      return { name: n, dept: meta.spec || 'CMCHIS', active: true };
    }),
    colpoDoctors: (typeof DOCTORS !== 'undefined' ? DOCTORS.slice() : []).map(function(n) {
      return { name: n, dept: 'OG / Colposcopy', active: true };
    }),
    iktDoctors: (typeof IKT_DOC_DATA !== 'undefined' ? IKT_DOC_DATA : []).map(function(d) {
      return { name: d.name, dept: d.dept, spec: d.spec || '', active: true };
    }),
    depts: (typeof DEPTS !== 'undefined' ? DEPTS.slice() : []).map(function(d, i) {
      return { name: d, color: (typeof COLORS !== 'undefined' && COLORS[i]) || '#1a73e8', active: true };
    }),
    iktProcs: (typeof DE_IKT_PROCS !== 'undefined' ? DE_IKT_PROCS.slice() : []).map(function(p) {
      return { name: p, active: true };
    }),
    denialReasons: (typeof DE_DENIAL_REASONS !== 'undefined' ? DE_DENIAL_REASONS.slice() : []).map(function(r) {
      return { name: r, active: true };
    })
  };
}

function deMgRenderAll() {
  var data = deMgGetData();
  deMgRenderList('cmchis', data.cmchisDoctors, ['name','dept']);
  deMgRenderList('colpo', data.colpoDoctors, ['name','dept']);
  deMgRenderList('ikt', data.iktDoctors, ['name','dept','spec']);
  deMgRenderDepts(data.depts);
  deMgRenderSimpleList('procs', data.iktProcs);
  deMgRenderSimpleList('denial', data.denialReasons);
  // Update counts
  var setCount = function(id, arr) {
    var el = document.getElementById('mg-'+id+'-count');
    if (el) el.textContent = '(' + arr.filter(function(x){return x.active;}).length + ' active, ' + arr.length + ' total)';
  };
  setCount('cmchis', data.cmchisDoctors);
  setCount('colpo', data.colpoDoctors);
  setCount('ikt', data.iktDoctors);
  setCount('depts', data.depts);
  setCount('procs', data.iktProcs);
  setCount('denial', data.denialReasons);
}

function deMgRenderList(type, arr, fields) {
  var listEl = document.getElementById('mg-'+type+'-list');
  if (!listEl) return;
  if (!arr || !arr.length) {
    listEl.innerHTML = '<div style="color:var(--grey6);font-size:12px;padding:10px">No entries yet. Click + Add to begin.</div>';
    return;
  }
  listEl.innerHTML = arr.map(function(item, idx) {
    return '<div class="de-manage-row" id="mg-'+type+'-row-'+idx+'">' +
      '<div class="de-manage-name">' + (item.active ? '' : '<s style="color:var(--grey5)">') + item.name + (item.active ? '' : '</s>') + '</div>' +
      '<div class="de-manage-meta">' + (item.dept || '') + (item.spec ? ' · <em style="color:var(--grey6)">' + item.spec.substring(0,50) + (item.spec.length>50?'…':'') + '</em>' : '') + '</div>' +
      '<span class="de-manage-badge' + (item.active?'':' inactive') + '">' + (item.active ? 'Active' : 'Inactive') + '</span>' +
      '<div class="de-manage-actions">' +
        '<button class="de-icon-btn" title="Edit" onclick="deOpenEditDoctor(\''+type+'\','+idx+')">✏️</button>' +
        '<button class="de-icon-btn" title="Toggle active" onclick="deMgToggle(\''+type+'\','+idx+')">' + (item.active ? '⏸' : '▶') + '</button>' +
        '<button class="de-icon-btn del" title="Remove" onclick="deMgRemove(\''+type+'\','+idx+')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function deMgRenderDepts(arr) {
  var listEl = document.getElementById('mg-depts-list');
  if (!listEl) return;
  if (!arr || !arr.length) { listEl.innerHTML = '<div style="color:var(--grey6);font-size:12px;padding:10px">No departments.</div>'; return; }
  listEl.innerHTML = arr.map(function(item, idx) {
    return '<div class="de-manage-row" id="mg-depts-row-'+idx+'">' +
      '<div class="de-dept-color" style="background:' + (item.color||'#1a73e8') + '"></div>' +
      '<div class="de-manage-name">' + item.name + '</div>' +
      '<div class="de-manage-meta">Color: <input type="color" value="' + (item.color||'#1a73e8') + '" style="width:28px;height:20px;border:none;border-radius:4px;cursor:pointer;vertical-align:middle" onchange="deMgDeptColorChange('+idx+',this.value)"></div>' +
      '<span class="de-manage-badge dept' + (item.active?'':' inactive') + '">' + (item.active ? 'Active' : 'Inactive') + '</span>' +
      '<div class="de-manage-actions">' +
        '<button class="de-icon-btn" title="Rename" onclick="deOpenEditDept('+idx+')">✏️</button>' +
        '<button class="de-icon-btn" title="Toggle" onclick="deMgToggle(\'depts\','+idx+')">' + (item.active ? '⏸' : '▶') + '</button>' +
        '<button class="de-icon-btn del" title="Remove" onclick="deMgRemove(\'depts\','+idx+')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function deMgRenderSimpleList(type, arr) {
  var listEl = document.getElementById('mg-'+type+'-list');
  if (!listEl) return;
  if (!arr || !arr.length) { listEl.innerHTML = '<div style="color:var(--grey6);font-size:12px;padding:10px">No entries.</div>'; return; }
  listEl.innerHTML = arr.map(function(item, idx) {
    return '<div class="de-manage-row" id="mg-'+type+'-row-'+idx+'">' +
      '<div class="de-manage-name" style="flex:2">' + item.name + '</div>' +
      '<span class="de-manage-badge' + (item.active?'':' inactive') + '">' + (item.active?'Active':'Inactive') + '</span>' +
      '<div class="de-manage-actions">' +
        '<button class="de-icon-btn" onclick="deOpenEditSimple(\''+type+'\','+idx+')">✏️</button>' +
        '<button class="de-icon-btn" onclick="deMgToggle(\''+type+'\','+idx+')">' + (item.active?'⏸':'▶') + '</button>' +
        '<button class="de-icon-btn del" onclick="deMgRemove(\''+type+'\','+idx+')">🗑️</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function deMgToggle(type, idx) {
  var data = deMgGetData();
  var arr = type === 'cmchis' ? data.cmchisDoctors : type === 'colpo' ? data.colpoDoctors :
            type === 'ikt' ? data.iktDoctors : type === 'depts' ? data.depts :
            type === 'procs' ? data.iktProcs : data.denialReasons;
  if (!arr || !arr[idx]) return;
  arr[idx].active = !arr[idx].active;
  dePersistManage(data);
  deMgRenderAll();
}

function deMgRemove(type, idx) {
  if (!confirm('Remove this entry? This does not delete saved monthly data.')) return;
  var data = deMgGetData();
  var arr = type === 'cmchis' ? data.cmchisDoctors : type === 'colpo' ? data.colpoDoctors :
            type === 'ikt' ? data.iktDoctors : type === 'depts' ? data.depts :
            type === 'procs' ? data.iktProcs : data.denialReasons;
  if (!arr) return;
  arr.splice(idx, 1);
  dePersistManage(data);
  deMgRenderAll();
}

function deMgDeptColorChange(idx, color) {
  var data = deMgGetData();
  if (data.depts[idx]) { data.depts[idx].color = color; dePersistManage(data); }
}

// MODALS
function deOpenAddDoctor(type) {
  DE_MANAGE_EDIT_TYPE = type;
  DE_MANAGE_EDIT_IDX  = -1;
  var labels = {cmchis:'CMCHIS Doctor', colpo:'Colposcopy Doctor', ikt:'IKT Doctor'};
  document.getElementById('deMgModalTitle').textContent = 'Add ' + (labels[type]||'Doctor');
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Doctor Name *</label><input class="de-form-input" id="mg-f-name" placeholder="e.g. Dr. S.Ramasubramanian"></div>' +
    '<div class="de-form-row"><label class="de-form-label">Department / Specialty</label><input class="de-form-input" id="mg-f-dept" placeholder="e.g. General Surgery"></div>' +
    (type==='ikt' ? '<div class="de-form-row"><label class="de-form-label">Procedures (comma-separated)</label><input class="de-form-input" id="mg-f-spec" placeholder="e.g. Appendicectomy, Hernia repair"></div>' : '') +
    '<div class="de-form-row"><label class="de-form-label">Status</label><select class="de-form-select" id="mg-f-active"><option value="1">Active</option><option value="0">Inactive</option></select></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deOpenEditDoctor(type, idx) {
  DE_MANAGE_EDIT_TYPE = type;
  DE_MANAGE_EDIT_IDX  = idx;
  var data = deMgGetData();
  var arr = type === 'cmchis' ? data.cmchisDoctors : type === 'colpo' ? data.colpoDoctors : data.iktDoctors;
  var item = arr[idx] || {};
  var labels = {cmchis:'CMCHIS Doctor', colpo:'Colposcopy Doctor', ikt:'IKT Doctor'};
  document.getElementById('deMgModalTitle').textContent = 'Edit ' + (labels[type]||'Doctor');
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Doctor Name *</label><input class="de-form-input" id="mg-f-name" value="' + (item.name||'') + '"></div>' +
    '<div class="de-form-row"><label class="de-form-label">Department / Specialty</label><input class="de-form-input" id="mg-f-dept" value="' + (item.dept||'') + '"></div>' +
    (type==='ikt' ? '<div class="de-form-row"><label class="de-form-label">Procedures</label><input class="de-form-input" id="mg-f-spec" value="' + (item.spec||'') + '"></div>' : '') +
    '<div class="de-form-row"><label class="de-form-label">Status</label><select class="de-form-select" id="mg-f-active"><option value="1"' + (item.active?'selected':'') + '>Active</option><option value="0"' + (!item.active?'selected':'') + '>Inactive</option></select></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deOpenAddDept() {
  DE_MANAGE_EDIT_TYPE = 'depts';
  DE_MANAGE_EDIT_IDX  = -1;
  document.getElementById('deMgModalTitle').textContent = 'Add Department';
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Department Name *</label><input class="de-form-input" id="mg-f-name" placeholder="e.g. CARDIO"></div>' +
    '<div class="de-form-row"><label class="de-form-label">Color</label><input type="color" class="de-form-input" id="mg-f-color" value="#1a73e8" style="height:44px;padding:4px"></div>' +
    '<div class="de-info-note"><span>⚡</span><span>The new department will appear in Department-wise entry and Targets tabs. Add monthly data there to track it on the dashboard.</span></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deOpenEditDept(idx) {
  DE_MANAGE_EDIT_TYPE = 'depts';
  DE_MANAGE_EDIT_IDX  = idx;
  var data = deMgGetData();
  var item = data.depts[idx] || {};
  document.getElementById('deMgModalTitle').textContent = 'Edit Department';
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Department Name *</label><input class="de-form-input" id="mg-f-name" value="' + (item.name||'') + '"></div>' +
    '<div class="de-form-row"><label class="de-form-label">Color</label><input type="color" class="de-form-input" id="mg-f-color" value="' + (item.color||'#1a73e8') + '" style="height:44px;padding:4px"></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deOpenAddProc() {
  DE_MANAGE_EDIT_TYPE = 'procs';
  DE_MANAGE_EDIT_IDX  = -1;
  document.getElementById('deMgModalTitle').textContent = 'Add IKT Procedure';
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Procedure Name *</label><input class="de-form-input" id="mg-f-name" placeholder="e.g. Chest / Abdominal Stab Injury"></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deOpenEditSimple(type, idx) {
  DE_MANAGE_EDIT_TYPE = type;
  DE_MANAGE_EDIT_IDX  = idx;
  var data = deMgGetData();
  var arr = type === 'procs' ? data.iktProcs : data.denialReasons;
  var item = arr[idx] || {};
  var labels = {procs:'IKT Procedure', denial:'Denial Reason'};
  document.getElementById('deMgModalTitle').textContent = 'Edit ' + (labels[type]||'Item');
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Name *</label><input class="de-form-input" id="mg-f-name" value="' + (item.name||'') + '"></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deOpenAddDenial() {
  DE_MANAGE_EDIT_TYPE = 'denial';
  DE_MANAGE_EDIT_IDX  = -1;
  document.getElementById('deMgModalTitle').textContent = 'Add Denial Reason';
  document.getElementById('deMgModalBody').innerHTML =
    '<div class="de-form-row"><label class="de-form-label">Reason *</label><input class="de-form-input" id="mg-f-name" placeholder="e.g. Duplicate claim"></div>';
  document.getElementById('deMgModal').classList.add('open');
}

function deCloseMgModal() {
  document.getElementById('deMgModal').classList.remove('open');
}

function deMgModalSaveAction() {
  var name  = (document.getElementById('mg-f-name') || {}).value || '';
  var dept  = (document.getElementById('mg-f-dept') || {}).value || '';
  var spec  = (document.getElementById('mg-f-spec') || {}).value || '';
  var color = (document.getElementById('mg-f-color') || {}).value || '#1a73e8';
  var activeEl = document.getElementById('mg-f-active');
  var active = activeEl ? activeEl.value === '1' : true;

  if (!name.trim()) { alert('Name is required.'); return; }
  var data = deMgGetData();
  var type = DE_MANAGE_EDIT_TYPE;
  var idx  = DE_MANAGE_EDIT_IDX;

  if (type === 'cmchis') {
    var item = {name: name.trim(), dept: dept.trim(), active: active};
    if (idx < 0) data.cmchisDoctors.push(item); else data.cmchisDoctors[idx] = item;
  } else if (type === 'colpo') {
    var item2 = {name: name.trim(), dept: dept.trim(), active: active};
    if (idx < 0) data.colpoDoctors.push(item2); else data.colpoDoctors[idx] = item2;
  } else if (type === 'ikt') {
    var item3 = {name: name.trim(), dept: dept.trim(), spec: spec.trim(), active: active};
    if (idx < 0) data.iktDoctors.push(item3); else data.iktDoctors[idx] = item3;
  } else if (type === 'depts') {
    var item4 = {name: name.trim().toUpperCase(), color: color, active: true};
    if (idx < 0) data.depts.push(item4); else { data.depts[idx].name = item4.name; data.depts[idx].color = color; }
  } else if (type === 'procs') {
    var item5 = {name: name.trim(), active: true};
    if (idx < 0) data.iktProcs.push(item5); else data.iktProcs[idx].name = item5.name;
  } else if (type === 'denial') {
    var item6 = {name: name.trim(), active: true};
    if (idx < 0) data.denialReasons.push(item6); else data.denialReasons[idx].name = item6.name;
  }
  dePersistManage(data);
  deCloseMgModal();
  deMgRenderAll();
  deToast('✅ Saved successfully!', 'ok');
}

function deMgApply() {
  var data = deMgGetData();
  // Apply doctors to live arrays
  if (typeof CMCHIS_DOCTORS !== 'undefined') {
    var active = data.cmchisDoctors.filter(function(d){return d.active;});
    CMCHIS_DOCTORS.length = 0;
    active.forEach(function(d){CMCHIS_DOCTORS.push(d.name);});
  }
  if (typeof DOCTORS !== 'undefined') {
    var activeColpo = data.colpoDoctors.filter(function(d){return d.active;});
    DOCTORS.length = 0;
    activeColpo.forEach(function(d){DOCTORS.push(d.name);});
  }
  // Apply depts
  if (typeof DEPTS !== 'undefined') {
    var activeDepts = data.depts.filter(function(d){return d.active;});
    var newNames = activeDepts.map(function(d){return d.name;});
    // Add any completely new depts to DATA_2025 etc.
    newNames.forEach(function(n) {
      if (DEPTS.indexOf(n) < 0) {
        DEPTS.push(n);
        if (typeof DATA_2025 !== 'undefined') {
          Object.keys(DATA_2025).forEach(function(m){ DATA_2025[m].push(0); });
        }
        if (typeof COLORS !== 'undefined') {
          var d2 = activeDepts.find(function(x){return x.name===n;});
          COLORS.push(d2 ? d2.color : '#607d8b');
        }
        if (typeof PALE !== 'undefined') PALE.push('#f5f5f5');
      }
    });
  }
  // Apply IKT procs
  if (typeof DE_IKT_PROCS !== 'undefined') {
    DE_IKT_PROCS.length = 0;
    data.iktProcs.filter(function(p){return p.active;}).forEach(function(p){DE_IKT_PROCS.push(p.name);});
  }
  // Apply denial reasons
  if (typeof DE_DENIAL_REASONS !== 'undefined') {
    DE_DENIAL_REASONS.length = 0;
    data.denialReasons.filter(function(r){return r.active;}).forEach(function(r){DE_DENIAL_REASONS.push(r.name);});
  }
  // Re-init data entry UI
  deInit();
  deRefreshDashboard();
  deUpdateHero();
  deToast('✅ Changes applied to dashboard and all data entry forms!', 'ok');
}

function deMgReset() {
  if (!confirm('Reset all Manage settings to built-in defaults? Saved monthly data is NOT affected.')) return;
  localStorage.removeItem(DE_MANAGE_KEY);
  deMgRenderAll();
  deToast('🔄 Reset to defaults', 'info');
}

function deGlobalSyncFrom(sourceId) {
  // When user changes a tab-level selector, also update the global one
  var src = document.getElementById(sourceId);
  var gbl = document.getElementById('de-global-month');
  if (!src || !gbl || !src.value) return;
  for (var i = 0; i < gbl.options.length; i++) {
    if (gbl.options[i].text === src.value || gbl.options[i].value === src.value) {
      gbl.selectedIndex = i;
      DE_GLOBAL_MONTH = src.value;
      deUpdateGlobalStatus(src.value);
      deUpdateCompleteness(src.value);
      break;
    }
  }
}

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
function deInit() {
  // Guard: don't run until core globals exist
  if(typeof DEPTS==='undefined'||typeof IKT_DOC_DATA==='undefined') return;

  // Load manage overrides and apply to live arrays once
  (function() {
    var saved = deLoadManage();
    if (!saved) return;
    if (saved.cmchisDoctors && typeof CMCHIS_DOCTORS !== 'undefined') {
      var active = saved.cmchisDoctors.filter(function(d){return d.active;});
      CMCHIS_DOCTORS.length = 0;
      active.forEach(function(d){CMCHIS_DOCTORS.push(d.name);});
    }
    if (saved.colpoDoctors && typeof DOCTORS !== 'undefined') {
      var ac = saved.colpoDoctors.filter(function(d){return d.active;});
      DOCTORS.length = 0;
      ac.forEach(function(d){DOCTORS.push(d.name);});
    }
    if (saved.depts && typeof DEPTS !== 'undefined') {
      saved.depts.filter(function(d){return d.active;}).forEach(function(d) {
        if (DEPTS.indexOf(d.name) < 0) {
          DEPTS.push(d.name);
          if (typeof DATA_2025 !== 'undefined') Object.keys(DATA_2025).forEach(function(m){DATA_2025[m].push(0);});
          if (typeof COLORS !== 'undefined') COLORS.push(d.color||'#607d8b');
          if (typeof PALE !== 'undefined') PALE.push('#f5f5f5');
        }
      });
    }
    if (saved.iktProcs && typeof DE_IKT_PROCS !== 'undefined') {
      DE_IKT_PROCS.length = 0;
      saved.iktProcs.filter(function(p){return p.active;}).forEach(function(p){DE_IKT_PROCS.push(p.name);});
    }
    if (saved.denialReasons && typeof DE_DENIAL_REASONS !== 'undefined') {
      DE_DENIAL_REASONS.length = 0;
      saved.denialReasons.filter(function(r){return r.active;}).forEach(function(r){DE_DENIAL_REASONS.push(r.name);});
    }
  })();

  // Render denial grid for weekly entry
  deWkRenderDenialGrid();

  // Render denial reasons grid (for legacy month override tab)
  var dGrid=document.getElementById('de-denial-reasons-grid');
  if(dGrid && !dGrid.hasChildNodes()){
    dGrid.innerHTML='<div class="de-grid-2">'+DE_DENIAL_REASONS.map(function(r,i){
      return '<div class="de-denial-row"><div class="de-denial-label">'+r+'</div>'+
        '<div class="de-field" style="min-width:120px"><input type="number" id="de-denial-'+i+'" placeholder="0" min="0" value="" oninput="deUpdateDenialTotal()"></div></div>';
    }).join('')+'</div>';
  }

  // Render dept target grid
  deRenderDeptTargetGrid();

  // Render initial dept table (empty)
  deRenderDeptTable(null);

  // Render IKT docs (empty)
  var iktRows=document.getElementById('de-ikt-doc-rows');
  if(iktRows&&typeof IKT_DOC_DATA!=='undefined'){
    iktRows.innerHTML='<div class="de-grid-3">'+IKT_DOC_DATA.map(function(doc,di){
      return '<div class="de-field"><label>'+doc.name+'<span style="font-weight:400;color:var(--grey6);font-size:9px;text-transform:none;letter-spacing:0"> — '+doc.dept+'</span></label>'+
        '<input type="number" id="de-ikt-doc-'+di+'" placeholder="0" min="0" value="" oninput="deIktDocTotal()"></div>';
    }).join('')+'</div>';
  }
  // IKT procedures grid
  var pgrid=document.getElementById('de-ikt-proc-grid');
  if(pgrid){
    pgrid.innerHTML=DE_IKT_PROCS.map(function(proc,pi){
      return '<div class="de-field"><label>'+proc+'</label>'+
        '<input type="number" id="de-ikt-proc-'+pi+'" placeholder="0" min="0" value=""></div>';
    }).join('');
  }

  // Render CMCHIS doc table (empty)
  var cmchisRows=document.getElementById('de-cmchis-doc-rows');
  if(cmchisRows&&typeof CMCHIS_DOCTORS!=='undefined'){
    cmchisRows.innerHTML=CMCHIS_DOCTORS.map(function(name,di){
      return '<tr>'+
        '<td style="padding:7px 10px;border-bottom:1px solid var(--grey3);font-weight:600;font-size:12px">'+name+'</td>'+
        '<td style="padding:7px 10px;border-bottom:1px solid var(--grey3);font-size:11px;color:var(--grey6);text-align:center">CMCHIS</td>'+
        '<td style="padding:4px 8px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-cmchis-'+di+'" placeholder="0" min="0" value="" oninput="deCmchisDocTotal()"></td>'+
        '<td style="padding:4px 8px;border-bottom:1px solid var(--grey3);text-align:center"><input type="number" class="de-dt-input" id="de-cmchis-rev-'+di+'" placeholder="0" min="0" value=""></td>'+
        '</tr>';
    }).join('');
  }

  // Render colpo rows (empty)
  var colpoRows=document.getElementById('de-colpo-doc-rows');
  if(colpoRows&&typeof DOCTORS!=='undefined'){
    colpoRows.innerHTML='<div class="de-grid-3">'+DOCTORS.map(function(name,di){
      return '<div class="de-field"><label>'+name+'</label>'+
        '<input type="number" id="de-colpo-'+di+'" placeholder="0" min="0" value="" oninput="deColpoDocTotal()"></div>';
    }).join('')+'</div>';
  }

  // Render default package table
  deRenderPkgTable(null);

  // Render calendar
  deRenderCalendar();

  // Render weekly panel
  deRenderWeeklyPanel();

  // Render manage tab
  deMgRenderAll();

  deUpdateHero();

  // Set current month + week as default in global selector
  var now=new Date();
  var mNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var curMonth=mNames[now.getMonth()]+' '+now.getFullYear();
  var curDay = now.getDate();
  var curWeek = Math.min(Math.floor((curDay - 1) / 7), 4);

  // Set global month
  var globalSel = document.getElementById('de-global-month');
  if (globalSel) {
    for (var gi = 0; gi < globalSel.options.length; gi++) {
      if (globalSel.options[gi].text === curMonth) { globalSel.selectedIndex = gi; break; }
    }
    DE_GLOBAL_MONTH = globalSel.options[globalSel.selectedIndex].text;
  }

  // Populate weeks and select current
  dePopulateWeekSelector(DE_GLOBAL_MONTH, curWeek);

  // Sync all tab selectors
  ['de-month-sel','de-dept-month-sel','de-ikt-month-sel','de-doc-month-sel','de-tgt-month-sel','de-pkg-month-sel','de-daily-month','de-weekly-month'].forEach(function(id){
    var el=document.getElementById(id);
    if(el){
      for(var i=0;i<el.options.length;i++){
        if(el.options[i].text===DE_GLOBAL_MONTH){el.selectedIndex=i;break;}
      }
    }
  });

  // Load the selected week's data into the form
  deWkLoad(DE_GLOBAL_MONTH, curWeek);
  deWkUpdateBanner();
  deUpdateWeekPills();
  deUpdateWeekSectionChips(DE_GLOBAL_MONTH, curWeek);
  deUpdateGlobalStatus(DE_GLOBAL_MONTH, curWeek);
  deWkRenderMonthSummary(DE_GLOBAL_MONTH);
  deMvRefresh(DE_GLOBAL_MONTH);
}

// Run after all scripts have parsed so DEPTS / IKT_DOC_DATA etc. are defined
window.addEventListener('DOMContentLoaded', function() { deInit(); });