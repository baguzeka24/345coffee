/* data/sheets-helper.js - JSONP version with transactions mapping
   Paste ke data/sheets-helper.js di repo dan pastikan <script src="data/sheets-helper.js"></script>
   dimuat DI AKHIR index.html (sebelum </body>).

   Catatan:
   - Sesuaikan APP_SCRIPT_URL jika Anda redeploy Apps Script ke URL lain.
   - Fungsi kirimKeGoogleSheets mengambil transaksi terbaru dari localStorage key 'three4five_trx'
     dan memetakan field ke header sheet: date, items, method, cashReceived, change, timestamp
     (sesuaikan jika header sheet Anda berbeda).
*/

(function(){
  // === GANTI INI dengan Apps Script Web App URL Anda jika perlu ===
  const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw8ACEtNB_Ek_tFhHPh6LPd4Sa-o1ZbBXW2ckIudxcBfU4fZp5xnnLEFLlp5CALN5c48w/exec";

  // ---------------- JSONP helper --------------------------------------
  function jsonpRequest(params, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const callbackName = '__three4five_cb_' + Math.random().toString(36).slice(2);
      // build url with callback param
      params = params || {};
      params.callback = callbackName;
      const url = APP_SCRIPT_URL + '?' + Object.keys(params).map(k =>
        `${encodeURIComponent(k)}=${encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))}`
      ).join('&');

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

  // ---------------- client helpers ------------------------------------
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

  async function postToSheets(action, dataPayload) {
    try {
      const resp = await jsonpRequest({ action: action, data: typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload) });
      return resp;
    } catch (e) {
      console.error('[Sheets JSONP] postToSheets error', e);
      throw e;
    }
  }

  // ---------------- seed localStorage from Sheets ----------------------
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

  // ---------------- mapping & send transaction -------------------------
  // This function reads the latest transaction from localStorage and maps fields
  // to the sheet headers: date, items, method, cashReceived, change, timestamp.
  window.kirimKeGoogleSheets = async function() {
    try {
      const trxs = JSON.parse(localStorage.getItem('three4five_trx') || '[]');
      if (!Array.isArray(trxs) || trxs.length === 0) {
        console.warn('[Sheets] Tidak ada transaksi di localStorage untuk dikirim.');
        return;
      }
      // Many implementations add new trx at start (unshift). Adjust if needed.
      const latest = trxs[0] || trxs[trxs.length - 1];

      const payload = {
        // Adjust property names below if your sheet headers differ.
        date: latest.date || '',
        items: Array.isArray(latest.items) ? latest.items.map(i => {
          // handle different item shapes
          if (typeof i === 'string') return i;
          const name = i.name || i.title || i.label || '';
          const qty = i.qty || i.quantity || i.count || 1;
          return `${name} (x${qty})`;
        }).join(', ') : (latest.items || ''),
        method: latest.method || latest.paymentMethod || '',
        cashReceived: latest.cashReceived != null ? latest.cashReceived : (latest.paid || 0),
        change: latest.change != null ? latest.change : 0,
        timestamp: latest.timestamp || Date.now()
      };

      const resp = await postToSheets('addTransaction', payload);
      if (resp && resp.ok) console.log('[Sheets] Transaksi terbaru tersimpan via JSONP');
      else console.warn('[Sheets] Response saat menyimpan transaksi:', resp);
    } catch (err) {
      console.error('[Sheets] gagal post transaction', err);
    }
  };

  // ---------------- attach listeners for expense & capital forms --------
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
              else console.warn('[Sheets] expense save response', r);
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
              else console.warn('[Sheets] capital save response', r);
            }
          } catch (e) { console.warn('[Sheets] capital listener read error', e); }
        }, 150);
      });
    }
  }

  // ---------------- optional helper functions ---------------------------
  async function syncMenuToLocal() {
    const menu = await fetchFromSheets('getMenu');
    if (Array.isArray(menu)) {
      localStorage.setItem('three4five_menu', JSON.stringify(menu));
      console.log('[Sheets] menu synced to localStorage');
      return true;
    }
    return false;
  }

  // ---------------- init on load ---------------------------------------
  function initSheetsHelper() {
    seedFromSheetsIfEmpty().finally(() => attachFormSyncListeners());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSheetsHelper);
  } else {
    initSheetsHelper();
  }

  // expose debug helpers
  window.__three4five_sheets = {
    postToSheets,
    fetchFromSheets,
    syncMenuToLocal,
    APP_SCRIPT_URL
  };

})();
