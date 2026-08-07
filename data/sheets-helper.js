/* data/sheets-helper.js - JSONP version
   Paste ke data/sheets-helper.js di repo dan pastikan <script src="data/sheets-helper.js"></script> dimuat DI AKHIR index.html
   Sesuaikan APP_SCRIPT_URL jika perlu (deploy URL Apps Script).
*/

(function(){
  const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxUp_UL_DiP6gwiDmF5cf1NwtgMYE7mifqPEakDJ7r7artxS61l3pgaKfCYgx0af0n34A/exec";

  // JSONP helper: buat callback, inject script tag, cleanup
  function jsonpRequest(params, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const callbackName = '__three4five_cb_' + Math.random().toString(36).slice(2);
      // build url with callback param
      params.callback = callbackName;
      const url = APP_SCRIPT_URL + '?' + Object.keys(params).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))}`).join('&');

      const script = document.createElement('script');
      script.src = url;
      script.async = true;

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        cleanup();
        reject(new Error('JSONP request timed out'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        try { delete window[callbackName]; } catch(e) {}
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = (response) => {
        if (timedOut) return;
        cleanup();
        resolve(response);
      };

      script.onerror = function(e) {
        if (timedOut) return;
        cleanup();
        reject(new Error('JSONP script error'));
      };

      document.head.appendChild(script);
    });
  }

  // fetchFromSheets via JSONP (action: getMenu/getUsers/getIngredients)
  async function fetchFromSheets(action) {
    try {
      const resp = await jsonpRequest({ action: action });
      if (resp && resp.ok) return resp.result || [];
      console.warn('[Sheets JSONP] unexpected response', resp);
      return [];
    } catch (e) {
      console.warn('[Sheets JSONP] fetchFromSheets error', e);
      return [];
    }
  }

  // postToSheets via JSONP (write actions: addTransaction/addExpense/addCapital)
  async function postToSheets(action, dataPayload) {
    try {
      const resp = await jsonpRequest({ action: action, data: typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload) });
      return resp;
    } catch (e) {
      console.error('[Sheets JSONP] postToSheets error', e);
      throw e;
    }
  }

  // Seed localStorage from Sheets if empty
  async function seedFromSheetsIfEmpty() {
    try {
      if (!localStorage.getItem('three4five_menu')) {
        const menu = await fetchFromSheets('getMenu');
        if (Array.isArray(menu) && menu.length) {
          localStorage.setItem('three4five_menu', JSON.stringify(menu));
          console.log('[Sheets] seeded menu from Google Sheets (JSONP)');
        }
      }
      if (!localStorage.getItem('three4five_users')) {
        const users = await fetchFromSheets('getUsers');
        if (Array.isArray(users) && users.length) {
          localStorage.setItem('three4five_users', JSON.stringify(users));
          console.log('[Sheets] seeded users from Google Sheets (JSONP)');
        }
      }
      if (!localStorage.getItem('three4five_ingredients')) {
        const ings = await fetchFromSheets('getIngredients');
        if (Array.isArray(ings) && ings.length) {
          localStorage.setItem('three4five_ingredients', JSON.stringify(ings));
          console.log('[Sheets] seeded ingredients from Google Sheets (JSONP)');
        }
      }
    } catch (e) {
      console.warn('[Sheets] seedFromSheetsIfEmpty error', e);
    }
  }

  // Override kirimKeGoogleSheets to use JSONP postToSheets
  window.kirimKeGoogleSheets = function(tanggalStr, keteranganStr, masukNominal, metodeBayar) {
    const dataKirim = {
      date: tanggalStr,
      desc: keteranganStr,
      in: masukNominal,
      out: 0,
      method: metodeBayar,
      timestamp: Date.now()
    };
    postToSheets('addTransaction', dataKirim)
      .then(resp => {
        if (resp && resp.ok) console.log('[Sheets] Transaksi tersimpan via JSONP');
        else console.warn('[Sheets] postToSheets response', resp);
      })
      .catch(err => console.warn('[Sheets] gagal post transaction', err));
  };

  // Attach listeners for expense & capital forms
  function attachFormSyncListeners() {
    const expenseForm = document.getElementById('add-expense-form');
    if (expenseForm) {
      expenseForm.addEventListener('submit', () => {
        setTimeout(async () => {
          try {
            const list = JSON.parse(localStorage.getItem('three4five_expenses') || '[]');
            if (Array.isArray(list) && list.length) {
              const latest = list[list.length - 1];
              const r = await postToSheets('addExpense', latest);
              if (r && r.ok) console.log('[Sheets] expense saved (JSONP)');
            }
          } catch (e) { console.warn('[Sheets] expense listener read error', e); }
        }, 150);
      });
    }

    const capitalForm = document.getElementById('add-capital-form');
    if (capitalForm) {
      capitalForm.addEventListener('submit', () => {
        setTimeout(async () => {
          try {
            const list = JSON.parse(localStorage.getItem('three4five_capital') || '[]');
            if (Array.isArray(list) && list.length) {
              const latest = list[list.length - 1];
              const r = await postToSheets('addCapital', latest);
              if (r && r.ok) console.log('[Sheets] capital saved (JSONP)');
            }
          } catch (e) { console.warn('[Sheets] capital listener read error', e); }
        }, 150);
      });
    }
  }

  // Init
  function initSheetsHelper() {
    seedFromSheetsIfEmpty().finally(() => attachFormSyncListeners());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSheetsHelper);
  else initSheetsHelper();

  // expose debug helpers
  window.__three4five_sheets = {
    postToSheets,
    fetchFromSheets,
    APP_SCRIPT_URL
  };

})();
