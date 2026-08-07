/* data/sheets-helper.js
   Helper untuk sinkronisasi dengan Google Sheets (Apps Script Web App).
   - Letakkan di repo path: data/sheets-helper.js
   - Pastikan <script src="data/sheets-helper.js"></script> sudah ada di index.html (sebelum </body>).
   - APP_SCRIPT_URL harus menunjuk ke Web App URL Anda (gunakan yang sudah Anda deploy).
*/

(function(){
  // GANTI DENGAN URL Apps Script Web App ANDA jika berbeda
  const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxC1XthuCVaKdhD1Jj9uJbOjgtbsleRe07TexKANAfscbBDWBXFfR5b5q2Iypin6b5ybw/exec";

  // --- GET helper (baca) ------------------------------------------------
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

  // --- Write via GET (encode data into querystring) ----------------------
  // Using GET avoids CORS preflight issues in Apps Script Web Apps.
  async function postToSheets(action, dataPayload) {
    try {
      const params = new URLSearchParams();
      params.append('action', action);
      params.append('data', typeof dataPayload === 'string' ? dataPayload : JSON.stringify(dataPayload));

      const url = APP_SCRIPT_URL + '?' + params.toString();
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        const txt = await res.text();
        console.warn('[Sheets] postToSheets GET non-OK', res.status, txt);
        return { ok: false, status: res.status, raw: txt };
      }
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('[Sheets] postToSheets error', err);
      throw err;
    }
  }

  // --- Seed localStorage from Sheets if empty ---------------------------
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

  // --- Override existing kirimKeGoogleSheets to use postToSheets ----------
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

  // --- Attach listeners for expense & capital forms (auto sync) ---------
  function attachFormSyncListeners() {
    const expenseForm = document.getElementById('add-expense-form');
    if (expenseForm) {
      expenseForm.addEventListener('submit', () => {
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

  // --- Optional helpers -------------------------------------------------
  async function syncMenuToLocal() {
    const menu = await fetchFromSheets('getMenu');
    if (Array.isArray(menu)) {
      localStorage.setItem('three4five_menu', JSON.stringify(menu));
      console.log('[Sheets] menu synced to localStorage');
      return true;
    }
    return false;
  }

  // --- Init -------------------------------------------------------------
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

  // Expose debug helpers
  window.__three4five_sheets = {
    postToSheets,
    fetchFromSheets,
    syncMenuToLocal,
    APP_SCRIPT_URL
  };
})();
