(() => {
  const $q = selector => document.querySelector(selector);
  const $qa = selector => [...document.querySelectorAll(selector)];
  let renderedMatchId = null;

  function activateDetailTab(name) {
    $qa('.detail-tab').forEach(button => {
      const active = button.dataset.tab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });
    $qa('.detail-panel').forEach(panel => panel.classList.toggle('hidden', panel.id !== `${name}Panel`));
  }

  function rosterSide(group, index) {
    const explicit = String(group?.homeAway || '').toLowerCase();
    if (explicit === 'home' || explicit === 'away') return explicit;
    const id = String(group?.team?.id || '');
    if (id && id === String(state.home?.team?.id)) return 'home';
    if (id && id === String(state.away?.team?.id)) return 'away';
    const named = sideByName(group?.team?.displayName || group?.team?.shortDisplayName || group?.team?.name);
    return named || (index === 0 ? 'home' : 'away');
  }

  function rosterGroups() {
    const groups = { home: null, away: null };
    (state.summary?.rosters || []).forEach((group, index) => {
      groups[rosterSide(group, index)] = group;
    });
    return groups;
  }

  function formationLabel(group) {
    const formation = group?.formation;
    if (typeof formation === 'string' || typeof formation === 'number') return String(formation);
    return formation?.displayName || formation?.name || formation?.formation || '';
  }

  function playerPosition(player) {
    return player?.position?.abbreviation || player?.position?.shortName || player?.position?.displayName || player?.position?.name || '';
  }

  function playerName(player) {
    return player?.athlete?.displayName || player?.athlete?.fullName || player?.athlete?.shortName || 'Unknown player';
  }

  function playerKey(player) {
    return String(player?.athlete?.id || normalizeName(playerName(player)));
  }

  function playerVariants(player) {
    return [player?.athlete?.displayName, player?.athlete?.fullName, player?.athlete?.shortName]
      .map(normalizeName)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
  }

  function findPlayerInText(text, players) {
    const normalized = normalizeName(text);
    if (!normalized) return null;
    let best = null;
    let bestLength = 0;
    players.forEach(player => {
      playerVariants(player).forEach(name => {
        if (name.length > bestLength && normalized.includes(name)) {
          best = player;
          bestLength = name.length;
        }
      });
    });
    return best;
  }

  function substitutionEventsThrough(minute) {
    const sources = [
      ...(state.summary?.keyEvents || []),
      ...(state.summary?.header?.competitions?.[0]?.details || []),
      ...(state.summary?.commentary || [])
    ];
    const seen = new Set();
    return sources.filter(event => {
      const text = String(event?.text || event?.play?.text || '');
      const type = typeText(event?.play || event);
      if (!type.includes('substitution') && !/^substitution\b/i.test(text.trim())) return false;
      const eventMin = eventMinute(event?.play || event);
      if (!Number.isFinite(eventMin) || eventMin <= 0 || eventMin > minute) return false;
      const key = String(event?.id || event?.play?.id || `${eventMin}:${normalizeName(text)}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function substitutionState(minute, groups) {
    const changes = {
      home: { in: new Map(), out: new Map() },
      away: { in: new Map(), out: new Map() }
    };

    substitutionEventsThrough(minute).forEach(event => {
      const text = String(event?.text || event?.play?.text || '').trim();
      const parts = text.split(/\s+replaces\s+/i);
      if (parts.length < 2) return;

      const preferredSide = teamSideFrom(event?.play || event);
      const sides = preferredSide ? [preferredSide] : ['home', 'away'];
      let matched = null;

      for (const side of sides) {
        const players = Array.isArray(groups[side]?.roster) ? groups[side].roster : [];
        const incoming = findPlayerInText(parts[0], players);
        const outgoing = findPlayerInText(parts.slice(1).join(' replaces '), players);
        if (incoming && outgoing && playerKey(incoming) !== playerKey(outgoing)) {
          matched = { side, incoming, outgoing };
          break;
        }
      }

      if (!matched) return;
      const eventMin = eventMinute(event?.play || event);
      const minuteLabel = event?.clock?.displayValue || event?.play?.clock?.displayValue || `${eventMin}'`;
      changes[matched.side].in.set(playerKey(matched.incoming), minuteLabel);
      changes[matched.side].out.set(playerKey(matched.outgoing), minuteLabel);
    });

    return changes;
  }

  function substitutionMarkers(player, side, changes) {
    const key = playerKey(player);
    const incoming = changes?.[side]?.in.get(key);
    const outgoing = changes?.[side]?.out.get(key);
    const markers = [];
    if (incoming) markers.push(`<span class="sub-marker sub-in" title="Came on at ${escapeHtml(incoming)}" aria-label="Came on at ${escapeHtml(incoming)}">↑ <small>${escapeHtml(incoming)}</small></span>`);
    if (outgoing) markers.push(`<span class="sub-marker sub-out" title="Went off at ${escapeHtml(outgoing)}" aria-label="Went off at ${escapeHtml(outgoing)}">↓ <small>${escapeHtml(outgoing)}</small></span>`);
    return markers.join('');
  }

  function playerRow(player, side, changes) {
    const number = player?.jersey ?? player?.athlete?.jersey ?? '—';
    const name = playerName(player);
    const position = playerPosition(player);
    const markers = substitutionMarkers(player, side, changes);
    return `<div class="player-row"><span class="shirt-number">${escapeHtml(number)}</span><span class="player-name">${escapeHtml(name)}</span><span class="player-meta"><span class="player-position">${escapeHtml(position)}</span>${markers}</span></div>`;
  }

  function renderTeamLineup(side, group, changes) {
    const team = side === 'home' ? state.home?.team : state.away?.team;
    const players = Array.isArray(group?.roster) ? group.roster : [];
    const starters = players.filter(player => player?.starter === true)
      .sort((a, b) => (Number(a?.formationPlace) || 99) - (Number(b?.formationPlace) || 99));
    const bench = players.filter(player => player?.starter !== true);
    const formation = formationLabel(group);
    const teamName = team?.shortDisplayName || team?.displayName || group?.team?.shortDisplayName || group?.team?.displayName || side;
    const startersHtml = starters.length ? starters.map(player => playerRow(player, side, changes)).join('') : '<div class="lineup-message">Starting XI unavailable.</div>';
    const benchHtml = bench.length ? bench.map(player => playerRow(player, side, changes)).join('') : '<div class="lineup-message">Bench unavailable.</div>';

    return `<article class="lineup-team ${side}">
      <div class="lineup-head">
        <div><strong>${escapeHtml(teamName)}</strong><small>${side === 'home' ? 'HOME' : 'AWAY'}</small></div>
        ${formation ? `<span class="formation-badge">${escapeHtml(formation)}</span>` : ''}
      </div>
      <div class="lineup-section"><h3>Starting XI</h3><div class="player-list">${startersHtml}</div></div>
      <div class="lineup-section"><h3>Substitutes</h3><div class="player-list">${benchHtml}</div></div>
    </article>`;
  }

  function renderLineups() {
    const root = $q('#lineupsContent');
    if (!root || !state.summary) return;
    const groups = rosterGroups();

    if (!groups.home && !groups.away) {
      root.innerHTML = '<div class="lineup-message">Lineups are not available for this match.</div>';
      return;
    }

    const requested = Number(state.minute) || 0;
    const effectiveMinute = state.completed && state.endMinute ? Math.min(requested, state.endMinute) : requested;
    const changes = substitutionState(effectiveMinute, groups);
    root.innerHTML = `<div class="lineups-grid">${renderTeamLineup('home', groups.home, changes)}${renderTeamLineup('away', groups.away, changes)}</div>`;
  }

  function refreshLineupsAfterMinuteChange() {
    requestAnimationFrame(renderLineups);
  }

  function handleMatchReady() {
    const content = $q('#matchContent');
    if (!content || content.classList.contains('hidden') || !state.summary) return;
    const matchId = String(state.match?.id || '');
    if (matchId && matchId !== renderedMatchId) {
      renderedMatchId = matchId;
      renderLineups();
      activateDetailTab('stats');
    }
  }

  $qa('.detail-tab').forEach(button => {
    button.addEventListener('click', () => activateDetailTab(button.dataset.tab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const tabs = $qa('.detail-tab');
      const current = tabs.indexOf(button);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(current + delta + tabs.length) % tabs.length];
      event.preventDefault();
      activateDetailTab(next.dataset.tab);
      next.focus();
    });
  });

  $q('#minuteSlider')?.addEventListener('input', refreshLineupsAfterMinuteChange);
  $q('#minuteInput')?.addEventListener('change', refreshLineupsAfterMinuteChange);
  $qa('.quick-times button').forEach(button => button.addEventListener('click', refreshLineupsAfterMinuteChange));

  const matchContent = $q('#matchContent');
  if (matchContent) {
    new MutationObserver(handleMatchReady).observe(matchContent, { attributes: true, attributeFilter: ['class'] });
  }
  handleMatchReady();
})();
