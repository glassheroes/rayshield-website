/* cf-sync.js — Cloudflare KV + R2 sync for Ray-Shield */
(function () {
  'use strict';

  var RS_KEYS = [
    'rs_film_plus', 'rs_film_std', 'rs_promotions', 'rs_branches', 'rs_reviews',
    'rs_homepage', 'rs_faqs', 'rs_articles', 'rs_seo', 'rs_banner', 'rs_popup',
    'rs_site_tags', 'rs_site_favicon'
  ];

  var _token = null;
  var _origSet = Storage.prototype.setItem;

  function setAdminToken(t) {
    _token = t;
  }

  /* Fetch all KV keys at once and populate localStorage before page renders */
  function initSync() {
    return fetch('/api/kv')
      .then(function (r) {
        if (!r.ok) throw new Error('kv fetch failed');
        return r.json();
      })
      .then(function (data) {
        RS_KEYS.forEach(function (key) {
          if (data[key] !== undefined && data[key] !== null) {
            try {
              var v = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
              _origSet.call(localStorage, key, v);
            } catch (e) { /* quota exceeded — skip */ }
          }
        });
      })
      .catch(function () { /* KV unavailable — silently fall back to localStorage */ });
  }

  /* Intercept localStorage writes: transparently push rs_* keys to KV */
  Storage.prototype.setItem = function (key, value) {
    _origSet.call(this, key, value);
    if (this === localStorage && RS_KEYS.indexOf(key) !== -1 && _token) {
      fetch('/api/kv/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json' },
        body: value
      }).catch(function () {});
    }
  };

  /* Upload image (base64 data URL) to R2; returns promise resolving to the served URL */
  function uploadImageToR2(base64, filename) {
    if (!_token) return Promise.reject(new Error('no admin token — call setAdminToken first'));
    var ext = 'jpg';
    if (filename) {
      var parts = filename.split('.');
      if (parts.length > 1) ext = parts[parts.length - 1];
    } else if (base64.indexOf('image/png') !== -1) {
      ext = 'png';
    } else if (base64.indexOf('image/webp') !== -1) {
      ext = 'webp';
    }
    return fetch('/api/r2/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64, name: filename || ('img_' + Date.now() + '.' + ext) })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('R2 upload failed: ' + r.status);
        return r.json();
      })
      .then(function (j) { return j.url; });
  }

  /* One-time migration: push all localStorage RS keys to KV */
  function migrateToKV() {
    if (!_token) return Promise.reject(new Error('no admin token'));
    var tasks = RS_KEYS.map(function (key) {
      var val = localStorage.getItem(key);
      if (!val) return Promise.resolve();
      return fetch('/api/kv/' + encodeURIComponent(key), {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json' },
        body: val
      }).catch(function () {});
    });
    return Promise.all(tasks);
  }

  window.cfSync = {
    initSync: initSync,
    setAdminToken: setAdminToken,
    uploadImageToR2: uploadImageToR2,
    migrateToKV: migrateToKV
  };
})();
