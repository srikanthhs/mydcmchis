// js/firebase.js
// Phase 4 — browser no longer talks to Firebase directly.
// All data goes through /api/* routes instead.

window._fb = {

  saveSnapshot: function(ds, dm) {
    var payload = { data: ds, months: dm };
    return fetch('/api/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function(r) { return r.json(); });
  },

  loadSnapshot: function() {
    return fetch('/api/snapshots')
      .then(function(r) { return r.json(); })
      .catch(function() { return null; });
  },

  saveImport: function(rows, meta) {
    return fetch('/api/imports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: rows, months: meta.months, depts: meta.depts })
    }).then(function(r) { return r.json(); });
  },

  loadImportHistory: function() {
    return fetch('/api/imports')
      .then(function(r) { return r.json(); })
      .catch(function() { return []; });
  }

};

// Update the status badge in the sidebar
setTimeout(function() {
  var el = document.getElementById('storageStatus');
  if (!el) return;
  el.style.cssText = 'margin:8px 12px 0;padding:6px 10px;border-radius:8px;font-size:11px;font-weight:500;display:flex;align-items:center;gap:6px;background:#e6f4ea;color:#137333';
  el.innerHTML = '<span>☁️</span><span>API connected</span>';
}, 800);