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

  function formationLabel(group) {
    const formation = group?.formation;
    if (typeof formation === 'string' || typeof formation === 'number') return String(formation);
    return formation?.displayName || formation?.name || formation?.formation || '';
  }

  function playerPosition(player) {
    return player?.position?.abbreviation || player?.position?.shortName || player?.position?.displayName || player?.position?.name || '';
  }

  function playerRow(player) {
    const number = player?.jersey ?? player?.athlete?.jersey ?? '—';
    const name = player?.athlete?.displayName || player?.athlete?.shortName || 'Unknown player';
    const position = playerPosition(player);
    return `<div class="player-row"><span class="shirt-number">${escapeHtml(number)}</span><span class="player-name">${escapeHtml(name)}</span><span class="player-position">${escapeHtml(position)}</span></div>`;
  }

  function renderTeamLineup(side, group) {
    const team = side === 'home' ? state.home?.team : state.away?.team;
    const players = Array.isArray(group?.roster) ? group.roster : [];
    const starters = players.filter(player => player?.starter === true)
      .sort((a, b) => (Number(a?.formationPlace) || 99) - (Number(b?.formationPlace) || 99));
    const bench = players.filter(player => player?.starter !== true);
    const formation = formationLabel(group);
    const teamName = team?.shortDisplayName || team?.displayName || group?.team?.shortDisplayName || group?.team?.displayName || side;
    const startersHtml = starters.length ? starters.map(playerRow).join('') : '<div class="lineup-message">Starting XI unavailable.</div>';
    const benchHtml = bench.length ? bench.map(playerRow).join('') : '<div class="lineup-message">Bench unavailable.</div>';

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
    const groups = { home: null, away: null };
    (state.summary.rosters || []).forEach((group, index) => {
      groups[rosterSide(group, index)] = group;
    });

    if (!groups.home && !groups.away) {
      root.innerHTML = '<div class="lineup-message">Lineups are not available for this match.</div>';
      return;
    }

    root.innerHTML = `<div class="lineups-grid">${renderTeamLineup('home', groups.home)}${renderTeamLineup('away', groups.away)}</div>`;
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

  const matchContent = $q('#matchContent');
  if (matchContent) {
    new MutationObserver(handleMatchReady).observe(matchContent, { attributes: true, attributeFilter: ['class'] });
  }
  handleMatchReady();
})();
