(() => {
  const root = document.documentElement;
  const MIN_TEXT_CONTRAST = 4.5;
  const SURFACES = ['#07110e', '#142b23'];
  let adjusting = false;

  function parseHex(value) {
    const hex = String(value || '').trim().replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return `#${hex.toLowerCase()}`;
  }

  function rgb(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }

  function channelLuminance(value) {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    const [r, g, b] = rgb(hex).map(channelLuminance);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a, b) {
    const l1 = luminance(a);
    const l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function minimumSurfaceContrast(color) {
    return Math.min(...SURFACES.map(surface => contrast(color, surface)));
  }

  function mixTowardWhite(hex, amount) {
    const [r, g, b] = rgb(hex);
    const mix = c => Math.round(c + (255 - c) * amount);
    return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  function accessibleVersion(value) {
    const original = parseHex(value);
    if (!original || minimumSurfaceContrast(original) >= MIN_TEXT_CONTRAST) return original || value;

    for (let amount = 0.05; amount <= 1; amount += 0.05) {
      const candidate = mixTowardWhite(original, amount);
      if (minimumSurfaceContrast(candidate) >= MIN_TEXT_CONTRAST) return candidate;
    }

    return '#f2f7f4';
  }

  function enforceTeamColorContrast() {
    if (adjusting) return;
    adjusting = true;

    const styles = getComputedStyle(root);
    const home = parseHex(styles.getPropertyValue('--home-color'));
    const away = parseHex(styles.getPropertyValue('--away-color'));
    const safeHome = accessibleVersion(home);
    const safeAway = accessibleVersion(away);

    if (home && safeHome !== home) root.style.setProperty('--home-color', safeHome);
    if (away && safeAway !== away) root.style.setProperty('--away-color', safeAway);

    adjusting = false;
  }

  const observer = new MutationObserver(() => requestAnimationFrame(enforceTeamColorContrast));
  observer.observe(root, { attributes: true, attributeFilter: ['style'] });

  enforceTeamColorContrast();
})();
