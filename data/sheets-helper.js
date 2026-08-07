// sheets-helper.js
// Helper untuk menyinkronkan data dengan Google Sheets via Apps Script Web App.
// - Letakkan file ini di repo pada path data/sheets-helper.js
// - Pastikan tag <script src="data/sheets-helper.js"></script> dimuat DI AKHIR index.html (sebelum </body>)
// - Sesuaikan APP_SCRIPT_URL jika Anda redeploy Apps Script ke URL lain.

(function(){
  // === GANTI INI dengan Apps Script Web App URL Anda jika perlu ===
  const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz6nFx5d2ONxdQf2iIFCwbNALz8prY_Vm_gOi2Tfg4S8bmB-Jd2fzSqg79GWWCJ81hWNw/exec";

  // --- Helper HTTP ------------------------------------------------------
  async function fetchFromSheets(action) {
    try {
      const url = `${APP_SCRIPT_URL}?action=${encodeURIComponent(action)}`;
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        console.warn('[Sheets] fetchFromSheets non-OK status', res.status);
        return null;
      }
      const json = await res.json();
      if (json && json.ok) return json.result;
      console.warn('[Sheets] fetchFromSheets unexpected response', json);
      return null;
    } catch (err) {
      console.warn('[Sheets] fetchFromSheets error', err);
      return null;
    }
  }

  // POST as form-urlencoded to avoid CORS preflight
  async function postToSheets(action, dataPayload) {
    try {
      const body = new URLSearchParams();
      body.append('action', action);
      body.append('data', typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload));

      const res = await fetch(APP_SCRIPT_URL, {
        method: 'POST',
        body: body // no custom headers -> browser uses application/x-www-form-urlencoded
      });

      // try parse JSON, but guard if response not JSON
      let text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        // not JSON; return raw text
        return { ok: false, error: 'Non-JSON response', raw: text };
      }
    } catch (err) {
      console.error('[Sheets] postToSheets error', err);
      throw err;
    }
  }

  // --- Seed localStorage dari Sheets bila kosong ------------------------
  async function seedFromSheetsIfEmpty() {
    try {
      if (!localStorage.getItem('three4five_menu')) {
        const menu = await fetchFromSheets('getMenu');
        if (Array.isArray(menu) && menu.length) {
          localStorage.setItem('three4five_menu', JSON.stringify(menu));
          console.log('[Sheets] seeded menu from Google Sheets');
        }
      }
      if (!localStorage.getItem('three4five_users')) {
        const users = await fetchFromSheets('getUsers');
        if (Array.isArray(users) && users.length) {
          localStorage.setItem('three4five_users', JSON.stringify(users));
          console.log('[Sheets] seeded users from Google Sheets');
        }
      }
      if (!localStorage.getItem('three4five_ingredients')) {
        const ings = await fetchFromSheets('getIngredients');
        if (Array.isArray(ings) && ings.length) {
          localStorage.setItem('three4five_ingredients', JSON.stringify(ings));
          console.log('[Sheets] seeded ingredients from Google Sheets');
        }
      }
    } catch (e) {
      console.warn('[Sheets] seedFromSheetsIfEmpty error', e);
    }
  }

  // --- override fungsi kirimKeGoogleSheets supaya gunakan postToSheets ----
  // Pastikan script ini di-load setelah script utama index.html sehingga override bekerja.
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
        if (resp && resp.ok) console.log('[Sheets] Transaksi tersimpan via Apps Script');
        else console.warn('[Sheets] postToSheets response', resp);
      })
      .catch(err => console.warn('[Sheets] gagal post transaction', err));
  };

  // --- attach listeners untuk expense & capital forms -------------------
  function attachFormSyncListeners() {
    // Expense form
    const expenseForm = document.getElementById('add-expense-form');
    if (expenseForm) {
      expenseForm.addEventListener('submit', () => {
        // delay untuk memberi waktu handler asli menyimpan ke localStorage dulu
        setTimeout(() => {
          try {
            const list = JSON.parse(localStorage.getItem('three4five_expenses') || '[]');
            if (Array.isArray(list) && list.length) {
              const latest = list[list.length - 1];
              postToSheets('addExpense', latest).then(r => {
                if (r && r.ok) console.log('[Sheets] expense saved');
                else console.warn('[Sheets] expense save response', r);
              }).catch(e => console.warn('[Sheets] expense post error', e));
            }
          } catch (e) { console.warn('[Sheets] expense listener read error', e); }
        }, 150);
      });
    }

    // Capital form
    const capitalForm = document.getElementById('add-capital-form');
    if (capitalForm) {
      capitalForm.addEventListener('submit', () => {
        setTimeout(() => {
          try {
            const list = JSON.parse(localStorage.getItem('three4five_capital') || '[]');
            if (Array.isArray(list) && list.length) {
              const latest = list[list.length - 1];
              postToSheets('addCapital', latest).then(r => {
                if (r && r.ok) console.log('[Sheets] capital saved');
                else console.warn('[Sheets] capital save response', r);
              }).catch(e => console.warn('[Sheets] capital post error', e));
            }
          } catch (e) { console.warn('[Sheets] capital listener read error', e); }
        }, 150);
      });
    }
  }

  // --- manual sync helpers (optional UI calls) --------------------------
  async function syncMenuToLocal() {
    const menu = await fetchFromSheets('getMenu');
    if (Array.isArray(menu)) {
      localStorage.setItem('three4five_menu', JSON.stringify(menu));
      console.log('[Sheets] menu synced to localStorage');
      return true;
    }
    return false;
  }

  async function pushFullMenuToSheets(menuArray) {
    // Use action 'saveMenu' if Apps Script supports replacing menu sheet entirely
    // Otherwise push items individually with another action implementation
    return postToSheets('saveMenu', menuArray);
  }

  // --- init on load -----------------------------------------------------
  function initSheetsHelper() {
    seedFromSheetsIfEmpty().finally(() => {
      attachFormSyncListeners();
    });
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
    pushFullMenuToSheets,
    APP_SCRIPT_URL
  };

})();
