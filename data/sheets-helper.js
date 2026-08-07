/* sheets-helper.js
   Helper untuk menyinkronkan data dengan Google Sheets via Apps Script Web App.
   Cara pakai:
   - Taruh file ini di repo dan tambahkan <script src="data/sheets-helper.js"></script> tepat sebelum </body>.
   - Pastikan Apps Script Web App URL sudah ter-deploy dan ditaruh pada APP_SCRIPT_URL di bawah.
   - Helper ini akan otomatis seed localStorage dari Sheets bila kosong,
     mengirim transaksi/expense/capital saat dibuat, dan memberi log ke console.
*/

(function(){
  // Ganti dengan Apps Script URL Anda (yang Anda berikan)
  const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz6nFx5d2ONxdQf2iIFCwbNALz8prY_Vm_gOi2Tfg4S8bmB-Jd2fzSqg79GWWCJ81hWNw/exec";

  // --- HTTP helpers -------------------------------------------------------
  async function fetchFromSheets(action) {
    try {
      const url = `${APP_SCRIPT_URL}?action=${encodeURIComponent(action)}`;
      const res = await fetch(url, { method: 'GET', headers: { 'Accept':'application/json' } });
      const json = await res.json();
      if (json && json.ok) return json.result;
      console.warn('fetchFromSheets: unexpected response', json);
      return null;
    } catch (err) {
      console.warn('fetchFromSheets error', err);
      return null;
    }
  }

  async function postToSheets(action, dataPayload) {
    try {
      const body = { action: action, data: dataPayload };
      const res = await fetch(APP_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      return json;
    } catch (err) {
      console.error('postToSheets error', err);
      throw err;
    }
  }

  // --- seed localStorage dari Sheets bila kosong -------------------------
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

  // --- override fungsi kirimKeGoogleSheets (compat) -----------------------
  // Jika index.html sudah punya fungsi kirimKeGoogleSheets, deklarasi berikut
  // akan menggantinya (garansi: script ini harus di-load setelah index.html main script).
  window.kirimKeGoogleSheets = function(tanggalStr, keteranganStr, masukNominal, metodeBayar) {
    // Bentuk data yang kita kirim ke Apps Script (sesuai doPost pada Apps Script)
    const dataKirim = {
      date: tanggalStr,
      desc: keteranganStr,
      in: masukNominal,
      out: 0,
      method: metodeBayar,
      timestamp: Date.now()
    };
    // Post ke Sheets menggunakan action 'addTransaction' (Apps Script harus menangani)
    postToSheets('addTransaction', dataKirim)
      .then(resp => {
        if (resp && resp.ok) console.log('[Sheets] Transaksi tersimpan via Apps Script');
        else console.warn('[Sheets] resp unexpected', resp);
      })
      .catch(err => console.warn('[Sheets] gagal post transaction', err));
  };

  // --- helper: kirim expense & capital jika form di-submit ----------------
  function attachFormSyncListeners() {
    // Expense
    const expenseForm = document.getElementById('add-expense-form');
    if (expenseForm) {
      expenseForm.addEventListener('submit', () => {
        // delay sedikit supaya handler asli menyimpan ke localStorage dahulu
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
        }, 120);
      });
    }

    // Capital
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
        }, 120);
      });
    }
  }

  // --- auto-run on load (seed + attach listeners) -------------------------
  function initSheetsHelper() {
    seedFromSheetsIfEmpty().finally(() => {
      attachFormSyncListeners();
    });
  }

  // Run after DOM ready (if script loaded at end of body it's fine)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSheetsHelper);
  } else {
    initSheetsHelper();
  }

  // expose a couple of helpers for debugging if needed
  window.__three4five_sheets = {
    postToSheets,
    fetchFromSheets,
    APP_SCRIPT_URL
  };

})();
