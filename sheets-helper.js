/* data/sheets-helper.js - JSONP client for Apps Script Web App */
(function(){
  'use strict';
  const cfg = (window.__three4five_config && typeof window.__three4five_config === 'object') ? window.__three4five_config : {};
  function scriptTagUrl() {
    try {
      const scripts = document.getElementsByTagName('script');
      for (let s of scripts) {
        const src = s.getAttribute('src') || '';
        if (src && src.indexOf('data/sheets-helper.js') !== -1) {
          const u = s.getAttribute('data-app-script-url');
          if (u) return u;
        }
      }
    } catch(e) {}
    return null;
  }
  let APP_SCRIPT_URL = cfg.APP_SCRIPT_URL || scriptTagUrl() || '';

  function jsonp(params, timeoutMs=8000) {
    return new Promise((resolve, reject) => {
      const cb = '__three4five_cb_' + Math.random().toString(36).slice(2);
      params = params || {}; params.callback = cb;
      const qs = Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(typeof params[k] === 'string' ? params[k] : JSON.stringify(params[k]))).join('&');
      const url = APP_SCRIPT_URL + (APP_SCRIPT_URL.indexOf('?') === -1 ? '?' : '&') + qs;
      const s = document.createElement('script'); s.src = url; s.async = true;
      let timed=false;
      const timer = setTimeout(()=>{ timed=true; cleanup(); reject(new Error('timeout')); }, timeoutMs);
      function cleanup(){ clearTimeout(timer); try{ delete window[cb]; }catch(e){} if(s.parentNode) s.parentNode.removeChild(s); }
      window[cb] = function(resp){ if(timed) return; cleanup(); resolve(resp); };
      s.onerror = function(){ if(timed) return; cleanup(); reject(new Error('script error')); };
      document.head.appendChild(s);
    });
  }

  async function fetchAction(action) {
    const r = await jsonp({ action: action });
    if (!r || !r.ok) throw r || new Error('no_response');
    return r.result || [];
  }
  async function postAction(action, data) {
    return jsonp({ action: action, data: typeof data === 'string' ? data : JSON.stringify(data) });
  }

  window.__three4five_sheets = {
    setAppScriptUrl: function(u){ APP_SCRIPT_URL = u; this.APP_SCRIPT_URL = u; },
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
  };
})();
