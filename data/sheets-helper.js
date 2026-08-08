/* data/sheets-helper.js
   Improved, final-ready helper for syncing the app with Google Sheets (Apps Script Web App).

   Features:
   - Configurable APP_SCRIPT_URL via window.__three4five_config or script tag data-app-script-url.
   - Uses JSONP for cross-origin-safe GET-style calls (Apps Script must support callback param).
   - Robust seeding logic: seeds localStorage if empty or when forced.
   - Field mapping for transactions (handles common local keys -> canonical sheet headers).
   - Exposes debugging helpers and manual control functions (forceSync, clearLocal, setAppScriptUrl).
   - Non-invasive: won't delete local data unless you call clearLocalStorage().

   Usage:
   - Ensure Apps Script Web App is deployed and supports JSONP (doGet wraps response with callback when callback param present).
   - Set the web app URL in window.__three4five_config = { APP_SCRIPT_URL: 'https://.../exec' } before this script loads, or add data-app-script-url on the <script> tag that loads this file.
   - The helper auto-runs on DOMContentLoaded and will seed localStorage if missing. Use forceSync() to force overwrite.
*/

(function () {
  'use strict';

  // Default fallback URL (replace if you have a different deployment) - still override via config or data- attribute
  const DEFAULT_APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw6SuUR_2DVgvmvrMiAFZDFd69BV6hR7uzuYbWcslslPvLGInxzkl_Ytn2De4epuBrnUg/exec';

  // Read config from global if provided
  const GLOBAL_CONFIG = (window.__three4five_config && typeof window.__three4five_config === 'object') ? window.__three4five_config : {};

  function scriptTagAppScriptUrl() {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        const src = s.getAttribute('src') || '';
        if (src && src.indexOf('data/sheets-helper.js') !== -1) {
          const url = s.getAttribute('data-app-script-url');
          if (url) return url;
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function getAppScriptUrl() {
    // priority: explicit config > data- attribute on script tag > constant
    if (GLOBAL_CONFIG.APP_SCRIPT_URL) return GLOBAL_CONFIG.APP_SCRIPT_URL;
    const tagUrl = scriptTagAppScriptUrl();
    if (tagUrl) return tagUrl;
    return DEFAULT_APP_SCRIPT_URL;
  }

  let APP_SCRIPT_URL = getAppScriptUrl();

  // JSONP helper (works for GET with callback parameter)
  function jsonpRequest(params, timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 8000;
    return new Promise(function (resolve, reject) {
      const callbackName = '__three4five_cb_' + Math.random().toString(36).slice(2);
      params = params || {};
      params.callback = callbackName;

      const query = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]));
      }).join('&');

      const url = APP_SCRIPT_URL + (APP_SCRIPT_URL.indexOf('?') === -1 ? '?' : '&') + query;

      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      let timedOut = false;
      const timer = setTimeout(function () {
        timedOut = true;
        cleanup();
        reject(new Error('JSONP request timed out'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch (e) { /* ignore */ }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = function (response) {
        if (timedOut) return;
        cleanup();
        resolve(response);
      };

      script.onerror = function (err) {
        if (timedOut) return;
        cleanup();
        reject(new Error('JSONP script load error'));
      };

      document.head.appendChild(script);
    });
  }

  // High-level client helpers
  async function fetchFromSheets(action) {
    try {
      const resp = await jsonpRequest({ action: action });
      if (resp && resp.ok) return resp.result || [];
      console.warn('[Sheets] fetchFromSheets unexpected response', resp);
      return [];
    } catch (err) {
      console.warn('[Sheets] fetchFromSheets error', err);
      return [];
    }
  }

  async function postToSheets(action, dataPayload) {
    try {
      // Apps Script project supports GET with data param and JSONP callback; dataPayload should be serializable
      const resp = await jsonpRequest({ action: action, data: typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload) });
      return resp;
    } catch (err) {
      console.error('[Sheets] postToSheets error', err);
      throw err;
    }
  }

  // Field mapping for transactions: canonical names expected in sheet
  const TRANSACTION_MAP = {
    // local keys -> canonical sheet column names
    date: ['date', 'tanggal', 'time', 'datetime'],
    items: ['items', 'cart', 'order', 'products', 'detail'],
    method: ['method', 'paymentMethod', 'payment', 'metode'],
    cashReceived: ['cashReceived', 'paid', 'in', 'tunai', 'cash'],
    change: ['change', 'kembali', 'refund', 'out'],
    timestamp: ['timestamp', 'ts']
  };

  function mapTransactionObject(local) {
    // produce object with canonical keys used by sheet
    const out = {};
    function pickAny(keys) {
      for (let k of keys) {
        if (local && Object.prototype.hasOwnProperty.call(local, k) && local[k] != null) return local[k];
      }
      return undefined;
    }

    out.date = pickAny(TRANSACTION_MAP.date) || local.date || '';

    // items: if array, convert to summary string; if object or string, use appropriate form
    const rawItems = pickAny(TRANSACTION_MAP.items) || local.items || local.cart || '';
    if (Array.isArray(rawItems)) {
      out.items = rawItems.map(function (it) {
        if (!it) return '';
        if (typeof it === 'string') return it;
        const name = it.name || it.title || it.label || '';
        const qty = (it.qty || it.quantity || it.count || 1);
        return name ? (name + ' (x' + qty + ')') : JSON.stringify(it);
      }).filter(Boolean).join(', ');
    } else if (typeof rawItems === 'object') {
      // object - stringify
      out.items = JSON.stringify(rawItems);
    } else {
      out.items = rawItems || '';
    }

    out.method = pickAny(TRANSACTION_MAP.method) || local.method || '';

    const cashVal = pickAny(TRANSACTION_MAP.cashReceived) || local.cashReceived || local.paid || local.in;
    out.cashReceived = (cashVal == null) ? '' : cashVal;

    const changeVal = pickAny(TRANSACTION_MAP.change) || local.change || local.kembali || 0;
    out.change = (changeVal == null) ? '' : changeVal;

    out.timestamp = pickAny(TRANSACTION_MAP.timestamp) || local.timestamp || Date.now();

    return out;
  }

  // Seed localStorage keys from Sheets if empty or if force = true
  async function seedFromSheetsIfEmpty(options) {
    options = options || {};
    const force = !!options.force;
    try {
      // list of keys and actions
      const mappings = [
        { key: 'three4five_menu', action: 'getMenu' },
        { key: 'three4five_users', action: 'getUsers' },
        { key: 'three4five_ingredients', action: 'getIngredients' }
      ];

      for (let m of mappings) {
        const has = localStorage.getItem(m.key);
        if (!has || force) {
          const arr = await fetchFromSheets(m.action);
          if (Array.isArray(arr)) {
            localStorage.setItem(m.key, JSON.stringify(arr));
            console.log('[Sheets] seeded ' + m.key + ' from Google Sheets (' + (arr.length || 0) + ' rows)');
          } else {
            console.warn('[Sheets] seed for ' + m.key + ' returned non-array');
          }
        } else {
          console.log('[Sheets] localStorage has ' + m.key + ' - skipping seed (use force to override)');
        }
      }
      return true;
    } catch (err) {
      console.warn('[Sheets] seedFromSheetsIfEmpty error', err);
      return false;
    }
  }

  // Overwrite localStorage with data from sheets (forceful sync)
  async function forceSync() {
    return seedFromSheetsIfEmpty({ force: true });
  }

  function clearLocalStorage() {
    try {
      localStorage.removeItem('three4five_menu');
      localStorage.removeItem('three4five_users');
      localStorage.removeItem('three4five_ingredients');
      localStorage.removeItem('three4five_trx');
      console.log('[Sheets] localStorage cleared for three4five keys');
      return true;
    } catch (e) {
      console.warn('[Sheets] clearLocalStorage error', e);
      return false;
    }
  }

  // The function called by your app to send a transaction (used in existing codebase)
  window.kirimKeGoogleSheets = async function (localTransaction) {
    try {
      // If app calls without passing object, try reading localStorage entry
      let trx = localTransaction;
      if (!trx) {
        try {
          const trxs = JSON.parse(localStorage.getItem('three4five_trx') || '[]');
          if (Array.isArray(trxs) && trxs.length) trx = trxs[0] || trxs[trxs.length - 1];
        } catch (e) { /* ignore */ }
      }
      if (!trx) {
        console.warn('[Sheets] No transaction object provided or found in localStorage');
        return { ok: false, error: 'no_transaction' };
      }

      const payload = mapTransactionObject(trx);
      const resp = await postToSheets('addTransaction', payload);
      if (resp && resp.ok) {
        console.log('[Sheets] Transaksi tersimpan via Apps Script', resp);
        return resp;
      }
      console.warn('[Sheets] postToSheets response', resp);
      return resp;
    } catch (err) {
      console.error('[Sheets] gagal post transaction', err);
      throw err;
    }
  };

  // Attach form listeners (if forms exist) to auto-send expenses & capitals
  function attachFormSyncListeners() {
    const expenseForm = document.getElementById('add-expense-form');
    if (expenseForm) {
      expenseForm.addEventListener('submit', function () {
        setTimeout(async function () {
          try {
            const list = JSON.parse(localStorage.getItem('three4five_expenses') || '[]');
            if (Array.isArray(list) && list.length) {
              const latest = list[list.length - 1];
              const r = await postToSheets('addExpense', latest);
              if (r && r.ok) console.log('[Sheets] expense saved');
            }
          } catch (e) { console.warn('[Sheets] expense listener error', e); }
        }, 150);
      });
    }

    const capitalForm = document.getElementById('add-capital-form');
    if (capitalForm) {
      capitalForm.addEventListener('submit', function () {
        setTimeout(async function () {
          try {
            const list = JSON.parse(localStorage.getItem('three4five_capital') || '[]');
            if (Array.isArray(list) && list.length) {
              const latest = list[list.length - 1];
              const r = await postToSheets('addCapital', latest);
              if (r && r.ok) console.log('[Sheets] capital saved');
            }
          } catch (e) { console.warn('[Sheets] capital listener error', e); }
        }, 150);
      });
    }
  }

  // Expose debug helpers for manual testing
  window.__three4five_sheets = window.__three4five_sheets || {};
  Object.assign(window.__three4five_sheets, {
    APP_SCRIPT_URL: APP_SCRIPT_URL,
    fetchFromSheets: fetchFromSheets,
    postToSheets: postToSheets,
    seedFromSheetsIfEmpty: seedFromSheetsIfEmpty,
    forceSync: forceSync,
    clearLocalStorage: clearLocalStorage,
    mapTransactionObject: mapTransactionObject,
    setAppScriptUrl: function (url) { APP_SCRIPT_URL = url; window.__three4five_sheets.APP_SCRIPT_URL = url; console.log('[Sheets] APP_SCRIPT_URL updated'); },
    syncMenuToLocal: async function () { // convenience
      const menu = await fetchFromSheets('getMenu');
      if (Array.isArray(menu)) { localStorage.setItem('three4five_menu', JSON.stringify(menu)); console.log('[Sheets] menu synced'); return true; }
      return false;
    }
  });

  // Init on load
  async function initSheetsHelper() {
    // update APP_SCRIPT_URL if config changed at runtime
    if (GLOBAL_CONFIG.APP_SCRIPT_URL && GLOBAL_CONFIG.APP_SCRIPT_URL !== APP_SCRIPT_URL) {
      APP_SCRIPT_URL = GLOBAL_CONFIG.APP_SCRIPT_URL;
      window.__three4five_sheets.APP_SCRIPT_URL = APP_SCRIPT_URL;
    }

    // If the app has no local data, seed from sheets. If user wants forced sync, set window.__three4five_config.forceSyncOnLoad = true
    const force = !!(GLOBAL_CONFIG.forceSyncOnLoad || false);
    await seedFromSheetsIfEmpty({ force: force });
    attachFormSyncListeners();
    console.log('[Sheets] helper initialized (forceSyncOnLoad=' + force + ')');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSheetsHelper);
  } else {
    initSheetsHelper();
  }

})();
