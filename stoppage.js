(() => {
  // First-half stoppage time needs its own position on the timeline. Treating
  // 45+2 as 47 can expose events from 46' and 47' of the second half.
  function clockParts(clock) {
    const raw = clock?.displayValue ?? clock ?? '';
    const match = String(raw).match(/(\d+)\s*'?\s*(?:\+\s*(\d+)\s*'?)?/);
    if (match) {
      const base = Number(match[1]);
      const added = Number(match[2] || 0);
      return { base, added, flat: base + added };
    }

    const value = Number(clock?.value);
    const base = Number.isFinite(value) ? Math.floor(value / 60) : 0;
    return { base, added: 0, flat: base };
  }

  function matchItems() {
    return [
      ...(state.summary?.commentary || []),
      ...(state.summary?.keyEvents || []),
      ...(state.summary?.header?.competitions?.[0]?.details || [])
    ];
  }

  function firstHalfAddedMax() {
    return matchItems().reduce((max, item) => {
      const p = clockParts(item.clock || item.time);
      return p.base === 45 && p.added > max ? p.added : max;
    }, 0);
  }

  function encodeFirstHalfAdded(added) {
    return 45 + Math.max(0, Math.min(99, added)) / 100;
  }

  function parseWatchPoint(value) {
    if (typeof value === 'string') {
      const text = value.trim().replace(/[’′']/g, '');
      if (/^ht$/i.test(text)) {
        const added = firstHalfAddedMax();
        return added ? { kind: 'firstHalfAdded', added } : { kind: 'normal', minute: 45 };
      }
      const addedMatch = text.match(/^45\s*\+\s*(\d{1,2})$/);
      if (addedMatch) {
        return { kind: 'firstHalfAdded', added: Math.max(0, Math.min(99, Number(addedMatch[1]))) };
      }
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 45 && numeric < 46) {
      const added = Math.round((numeric - 45) * 100);
      if (added > 0) return { kind: 'firstHalfAdded', added };
    }

    return { kind: 'normal', minute: Math.max(0, Math.min(120, Math.round(numeric || 0))) };
  }

  function watchPointValue(point) {
    return point.kind === 'firstHalfAdded' ? encodeFirstHalfAdded(point.added) : point.minute;
  }

  function watchPointLabel(point) {
    return point.kind === 'firstHalfAdded' ? `45+${point.added}` : String(point.minute);
  }

  function eventVisibleAt(item, point) {
    const p = clockParts(item.clock || item.time);

    if (p.base === 45 && p.added > 0) {
      if (point.kind === 'firstHalfAdded') return p.added <= point.added;
      return point.minute >= 46;
    }

    if (point.kind === 'firstHalfAdded') {
      return p.base < 45 || (p.base === 45 && p.added === 0);
    }

    if (p.added > 0) return p.flat <= point.minute;
    return p.base <= point.minute;
  }

  function eventSortKey(item) {
    const p = clockParts(item.clock || item.time);
    if (p.base === 45 && p.added > 0) return 45 + p.added / 100;
    return p.added > 0 ? p.flat : p.base;
  }

  // Improve the base parser too, so ESPN variants such as "45' + 2'" work.
  clockMinute = function clockMinutePatched(clock) {
    return clockParts(clock).flat;
  };

  eventMinute = function eventMinutePatched(e) {
    return clockMinute(e.clock || e.time);
  };

  filteredMajor = function filteredMajorPatched(point) {
    const watchPoint = typeof point === 'object' && point?.kind ? point : parseWatchPoint(point);
    return (state.summary.keyEvents || state.summary.header?.competitions?.[0]?.details || [])
      .filter(e => eventVisibleAt(e, watchPoint))
      .filter(e => {
        const t = typeText(e);
        return isGoal(e) || t.includes('substitution') || t.includes('yellow') || t.includes('red-card') || t.includes('red card') || t.includes('penalty-missed') || e.yellowCard || e.redCard || e.substitution;
      });
  };

  reconstruct = function reconstructPatched(point) {
    const watchPoint = typeof point === 'object' && point?.kind ? point : parseWatchPoint(point);
    const stats = {
      home: { shots: 0, onTarget: 0, corners: 0, fouls: 0, offsides: 0, yellow: 0, red: 0 },
      away: { shots: 0, onTarget: 0, corners: 0, fouls: 0, offsides: 0, yellow: 0, red: 0 }
    };
    const commentary = (state.summary.commentary || []).filter(c => eventVisibleAt(c, watchPoint));
    const seen = new Set();

    commentary.forEach(c => {
      const p = c.play || c;
      const key = p.id ? String(p.id) : `seq:${c.sequence}`;
      if (seen.has(key)) return;
      seen.add(key);
      const t = typeText(p);
      const txt = String(c.text || p.text || '').trim();
      const lower = txt.toLowerCase();
      const shot = t.includes('shot') || t.includes('goal') || /^attempt\b/i.test(txt) || /^goal!/i.test(txt);
      if (shot) {
        const side = teamSideFrom(c);
        if (side) {
          stats[side].shots++;
          if (t.includes('on-target') || t.includes('on target') || t.includes('goal') || /^attempt saved/i.test(txt) || /^goal!/i.test(txt)) stats[side].onTarget++;
        }
      }
      if (t.includes('corner') || lower.startsWith('corner,')) {
        const side = cornerSide(c);
        if (side) stats[side].corners++;
      }
      if (t === 'foul' || t.includes('foul') || lower.startsWith('foul by')) {
        const side = teamSideFrom(c);
        if (side) stats[side].fouls++;
      }
      if (t.includes('offside') || lower.startsWith('offside,')) {
        const side = teamSideFrom(c);
        if (side) stats[side].offsides++;
      }
    });

    const major = filteredMajor(watchPoint);
    major.forEach(e => {
      const side = teamSideFrom(e);
      if (!side) return;
      const t = typeText(e);
      if (t.includes('yellow') || e.yellowCard) stats[side].yellow++;
      if (t.includes('red-card') || t.includes('red card') || e.redCard) stats[side].red++;
    });

    const score = { home: 0, away: 0 };
    major.filter(isGoal).forEach(e => {
      const side = teamSideFrom(e);
      if (side) score[side]++;
    });
    return { stats, major, score };
  };

  renderTimeline = function renderTimelinePatched(events) {
    const el = $('#timeline');
    if (!events.length) {
      el.innerHTML = '<div class="empty-events">Nothing major has happened yet. Safe to keep watching.</div>';
      return;
    }
    el.innerHTML = [...events]
      .sort((a, b) => eventSortKey(a) - eventSortKey(b))
      .map(e => {
        const x = eventInfo(e);
        const side = teamSideFrom(e);
        const team = side === 'home' ? state.home.team.shortDisplayName : side === 'away' ? state.away.team.shortDisplayName : '';
        return `<article class="event ${side ? `${side}-event` : ''}"><span class="event-icon">${x.icon}</span><span class="event-minute">${escapeHtml(e.clock?.displayValue || `${eventMinute(e)}'`)}</span><div class="event-card"><strong>${escapeHtml(x.title)}${team ? ` · ${escapeHtml(team)}` : ''}</strong>${x.detail ? `<p>${escapeHtml(x.detail)}</p>` : ''}</div></article>`;
      })
      .join('');
  };

  renderAtMinute = function renderAtMinutePatched(value) {
    const requested = parseWatchPoint(value);
    let effective = requested;
    if (requested.kind === 'normal' && state.completed && state.endMinute) {
      effective = { kind: 'normal', minute: Math.min(requested.minute, state.endMinute) };
    }

    const storedValue = watchPointValue(requested);
    const label = watchPointLabel(requested);
    state.minute = storedValue;
    els.slider.value = requested.kind === 'firstHalfAdded' ? 45 : Math.min(requested.minute, Number(els.slider.max));
    els.minute.value = label;
    localStorage.setItem(`catchup:${state.match.id}`, String(storedValue));

    const r = reconstruct(effective);
    $('#homeScore').textContent = r.score.home;
    $('#awayScore').textContent = r.score.away;

    const ended = requested.kind === 'normal' && Boolean(state.completed && state.endMinute && requested.minute >= state.endMinute);
    if (ended) {
      $('#scoreAsOf').textContent = `FULL TIME · ${state.endMinute}'`;
      $('#statsStatus').textContent = `FINAL · ${state.endMinute}'`;
      $('#matchEndedNotice').textContent = requested.minute > state.endMinute
        ? `The match was already over by ${requested.minute}'. Full time was ${state.endMinute}'.`
        : `Full time · the match ended at ${state.endMinute}'.`;
      show($('#matchEndedNotice'));
    } else {
      $('#scoreAsOf').textContent = `AT ${label}'`;
      $('#statsStatus').textContent = `THROUGH ${label}'`;
      show($('#matchEndedNotice'), false);
    }

    renderStats(r.stats);
    renderTimeline(r.major);
    $('#eventCount').textContent = `${r.major.length} EVENT${r.major.length === 1 ? '' : 'S'}`;
  };

  function setupFirstHalfControls() {
    const input = $('#minuteInput');
    if (input) {
      input.type = 'text';
      input.inputMode = 'text';
      input.removeAttribute('min');
      input.removeAttribute('max');
      input.setAttribute('placeholder', '45+2');
      input.setAttribute('aria-label', 'Minute watched, for example 45+2 for first-half stoppage time');
    }

    const helper = document.querySelector('.time-heading p');
    if (helper) helper.textContent = 'Everything below stops here. First-half stoppage time works too — e.g. 45+2.';

    const maxAdded = firstHalfAddedMax();
    const htButton = document.querySelector('.quick-times button[data-minute="45"], .quick-times button[data-half-time="true"]');
    if (htButton) {
      htButton.dataset.halfTime = 'true';
      htButton.dataset.minute = maxAdded ? `45+${maxAdded}` : '45';
      htButton.textContent = 'HT';
    }
  }

  const originalHydrateMatch = hydrateMatch;
  hydrateMatch = function hydrateMatchPatched() {
    originalHydrateMatch();
    setupFirstHalfControls();
  };
})();
