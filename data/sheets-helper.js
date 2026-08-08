/* data/sheets-helper.js
   Client helper (JSONP) — uses Google Apps Script Web App (must support callback param).
   Exposes:
     __three4five_sheets.getMenu()
     __three4five_sheets.getUsers()
     __three4five_sheets.getIngredients()
     __three4five_sheets.addTransaction(obj)
     __three4five_sheets.addExpense(obj)
     __three4five_sheets.addCapital(obj)
     __three4five_sheets.saveMenu(array)
     __three4five_sheets.saveUsers(array)
     __three4five_sheets.saveIngredients(array)
*/
(function(){
  'use strict';

  // Config detection (set window.__three4five_config before loading if needed)
  const GLOBAL = (window.__three4five_config && typeof window.__three4five_config === 'object') ? window.__three4five_config : {};
  function scriptTagUrl() {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let s of scripts) {
        const src = s.getAttribute('src') || '';
        if (src && src.indexOf('data/sheets-helper.js') !== -1) {
          const url = s.getAttribute('data-app-script-url');
          if (url) return url;
        }
      }
    } catch(e){}
    return null;
  }
  const DEFAULT = GLOBAL.APP_SCRIPT_URL || scriptTagUrl() || '';

  let APP_SCRIPT_URL = DEFAULT;

  function jsonpRequest(params, timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 8000;
    return new Promise((resolve, reject) => {
      const cbName = '__three4five_cb_' + Math.random().toString(36).slice(2);
      params = params || {};
      params.callback = cbName;
      const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))).join('&');
      const url = APP_SCRIPT_URL + (APP_SCRIPT_URL.indexOf('?') === -1 ? '?' : '&') + qs;
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      let timed = false;
      const timer = setTimeout(() => {
        timed = true; cleanup(); reject(new Error('JSONP timeout'));
      }, timeoutMs);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[cbName]; } catch(e) {}
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cbName] = function(resp){
        if (timed) return;
        cleanup();
        resolve(resp);
      };
      script.onerror = function(){ if (timed) return; cleanup(); reject(new Error('JSONP script error')); };
      document.head.appendChild(script);
    });
  }

  async function fetchAction(action) {
    try {
      const resp = await jsonpRequest({ action: action });
      if (resp && resp.ok) return resp.result || [];
      throw new Error(resp && resp.error ? resp.error : 'unexpected_response');
    } catch (err) { throw err; }
  }
  async function postAction(action, data) {
    try {
      const resp = await jsonpRequest({ action: action, data: typeof data === 'string' ? data : JSON.stringify(data) });
      return resp;
    } catch (err) { throw err; }
  }

  window.__three4five_sheets = window.__three4five_sheets || {};
  Object.assign(window.__three4five_sheets, {
    setAppScriptUrl: function(url){ APP_SCRIPT_URL = url; console.log('[SheetsHelper] APP_SCRIPT_URL set'); },
    getMenu: () => fetchAction('getMenu'),
    getUsers: () => fetchAction('getUsers'),
    getIngredients: () => fetchAction('getIngredients'),
    addTransaction: (obj) => postAction('addTransaction', obj),
    addExpense: (obj) => postAction('addExpense', obj),
    addCapital: (obj) => postAction('addCapital', obj),
    saveMenu: (arr) => postAction('saveMenu', arr),
    saveUsers: (arr) => postAction('saveUsers', arr),
    saveIngredients: (arr) => postAction('saveIngredients', arr),
    APP_SCRIPT_URL: APP_SCRIPT_URL
  });
})();
