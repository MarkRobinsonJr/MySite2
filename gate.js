(() => {
  const STORAGE_KEY = 'catchup:access-code';
  const config = window.CATCHUP_CONFIG || {};
  const expectedCode = String(config.accessCode || '');
  const gate = document.querySelector('#accessGate');
  const shell = document.querySelector('#appShell');
  const form = document.querySelector('#accessForm');
  const input = document.querySelector('#accessCode');
  const error = document.querySelector('#accessError');
  let appLoaded = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function unlock() {
    if (!expectedCode) {
      if (error) {
        error.textContent = 'Access is not configured. Set accessCode in config.js.';
        error.classList.remove('hidden');
      }
      return;
    }

    localStorage.setItem(STORAGE_KEY, expectedCode);
    gate?.classList.add('hidden');
    shell?.classList.remove('hidden');

    if (!appLoaded) {
      appLoaded = true;
      try {
        await loadScript('app.js');
        await loadScript('stoppage.js');
        await loadScript('accessibility.js');
        await loadScript('features.js');
      } catch {
        appLoaded = false;
        shell?.classList.add('hidden');
        gate?.classList.remove('hidden');
        if (error) {
          error.textContent = 'CatchUp could not load. Refresh and try again.';
          error.classList.remove('hidden');
        }
      }
    }
  }

  if (expectedCode && localStorage.getItem(STORAGE_KEY) === expectedCode) {
    unlock();
  } else {
    gate?.classList.remove('hidden');
    shell?.classList.add('hidden');
    setTimeout(() => input?.focus(), 0);
  }

  form?.addEventListener('submit', event => {
    event.preventDefault();
    if (String(input?.value || '') === expectedCode) {
      if (error) error.classList.add('hidden');
      unlock();
    } else {
      if (error) {
        error.textContent = 'That access code is not correct.';
        error.classList.remove('hidden');
      }
      if (input) {
        input.select();
        input.focus();
      }
    }
  });
})();
