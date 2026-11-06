(() => {
  const section = document.getElementById('homeDraftContainer');
  const body = document.getElementById('homeDraftContent');
  const subtitle = document.getElementById('homeDraftSubtitle');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  const teamBrand = window.DBLHomeTeamLogo;
  if (!section || !body || !subtitle || !hub?.subscribe || !stream?.forEachTopLevelArrayItem) return;

  const PHASE_LOTTERY = 4;
  const PHASE_DRAFT = 5;
  const BOARD_PREVIEW = 30;
  let generation = 0;
  let activeFile = null;
  let showFullBoard = false;

  const integer = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  };
  const number = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const make = (tag, className, text) => {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = String(text);
    return result;
  };
  const nameFor = player =>
    [player?.firstName, player?.lastName].filter(Boolean).join(' ').trim() ||
    String(player?.name || 'Unknown prospect');
  function latestRatings(player, season) {
    let rating = null;
    for (const row of Array.isArray(player?.ratings) ? player.ratings : []) {
      const year = integer(row?.season);
      if (year === null || year <= season) {
        if (!rating || (year ?? -Infinity) >= (integer(rating.season) ?? -Infinity)) rating = row;
      }
    }
    return rating || (Array.isArray(player?.ratings) ? player.ratings.at(-1) : null) || {};
  }
  function prospect(player, season) {
    const ratings = latestRatings(player, season);
    const ovr = number(ratings.ovr), pot = number(ratings.pot);
    const score = number(player.valueFuzz) ?? number(player.value);
    const age = integer(player?.born?.year) !== null
      ? season - integer(player.born.year) : integer(player.age);
    const image = typeof player.imgURL === 'string' && /^https?:\/\//i.test(player.imgURL)
      ? player.imgURL : '';
    return {
      pid: integer(player.pid),
      name: nameFor(player),
      pos: String(ratings.pos || player.pos || '—'),
      age,
      ovr, pot,
      score: score ?? (ovr === null && pot === null
        ? -Infinity : (ovr ?? 0) * 0.35 + (pot ?? 0) * 0.65),
      hasValue: score !== null,
      imgURL: image,
      watch: integer(player.watch) ?? 0
    };
  }
  function extractPick(raw, season) {
    const year = integer(raw?.season);
    if (year !== null && year !== season) return null;
    if (year === null && raw?.season !== undefined) return null;
    const round = integer(raw?.round);
    const pick = integer(raw?.pick);
    if (round === null || round < 1 || pick === null || pick < 0) return null;
    return {
      dpid: integer(raw?.dpid),
      round, pick,
      tid: integer(raw?.tid), originalTid: integer(raw?.originalTid)
    };
  }
  const pickKey = p => p.round + ':' + p.pick;
  const byPick = (a, b) =>
    a.round - b.round || (a.pick > 0 ? a.pick : Infinity) -
      (b.pick > 0 ? b.pick : Infinity) || (a.tid ?? 9999) - (b.tid ?? 9999);
  function teamLabel(teams, tid) {
    if (tid === null) return 'Unknown team';
    return teams.get(tid)?.abbrev || 'Team ' + tid;
  }
  function teamDisplay(teams, pick) {
    const team = teamLabel(teams, pick.tid);
    if (pick.originalTid !== null && pick.originalTid !== pick.tid) {
      return team + ' (via ' + teamLabel(teams, pick.originalTid) + ')';
    }
    return team;
  }
  function selectedDisplay(teams, player) {
    const team = teamLabel(teams, player.tid);
    if (player.originalTid !== null && player.originalTid !== player.tid) {
      return team + ' (via ' + teamLabel(teams, player.originalTid) + ')';
    }
    return team;
  }
  function pickNumber(p) {
    return 'R' + p.round + (p.pick > 0 ? ' · #' + p.pick : ' · TBD');
  }
  function status(message) {
    body.replaceChildren(make('p', 'home-draft-status', message));
  }
  function portrait(url) {
    if (!url) return null;
    const img = make('img', 'home-draft-portrait');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.width = 40;
    img.height = 52;
    img.style.width = '40px';
    img.style.height = '52px';
    img.style.maxWidth = '40px';
    img.style.maxHeight = '52px';
    img.addEventListener('error', () => img.remove());
    return img;
  }
  function playerName(player) {
    // No in-site BBGM player profile URL is guaranteed by the exported file.
    return make('strong', 'home-draft-player-name', player.name);
  }
  function appendBoard(prospects) {
    const card = make('div', 'home-draft-card home-draft-big-board');
    card.appendChild(make('h4', '', 'Prospect Big Board'));
    card.appendChild(make('p', 'home-draft-card-note',
      prospects.length + ' undrafted prospects · Ranked by BBGM value where available, otherwise OVR/POT'));
    if (!prospects.length) {
      card.appendChild(make('p', 'home-draft-status', 'No undrafted prospects for this class were found.'));
      return card;
    }
    const list = make('ol', 'home-draft-board-list');
    const count = showFullBoard ? prospects.length : BOARD_PREVIEW;
    for (let i = 0; i < Math.min(count, prospects.length); i++) {
      const p = prospects[i];
      const item = make('li', 'home-draft-board-item');
      const rank = make('span', 'home-draft-board-rank');
      rank.textContent = String(i + 1);
      item.appendChild(rank);
      const image = portrait(p.imgURL);
      if (image) item.appendChild(image);
      const details = make('div', 'home-draft-prospect-details');
      details.appendChild(playerName(p));
      details.appendChild(make('span', 'home-draft-player-meta',
        [p.pos, p.age === null ? '' : 'Age ' + p.age].filter(Boolean).join(' · ')));
      item.appendChild(details);
      const ratings = make('div', 'home-draft-player-ratings');
      ratings.appendChild(make('span', '', 'OVR ' + (p.ovr ?? '—')));
      ratings.appendChild(make('span', '', 'POT ' + (p.pot ?? '—')));
      item.appendChild(ratings);
      list.appendChild(item);
    }
    card.appendChild(list);
    if (prospects.length > BOARD_PREVIEW) {
      const expand = make('button', 'home-draft-expand');
      expand.type = 'button';
      expand.textContent = showFullBoard ? 'Show top ' + BOARD_PREVIEW : 'Show all ' + prospects.length + ' prospects';
      expand.addEventListener('click', () => {
        showFullBoard = !showFullBoard;
        card.replaceWith(appendBoard(prospects));
      });
      card.appendChild(expand);
    }
    return card;
  }
  function appendPickList(title, picks, teams, mode) {
    const card = make('div', 'home-draft-card');
    card.appendChild(make('h4', '', title));
    if (!picks.length) {
      card.appendChild(make('p', 'home-draft-status', mode === 'selected'
        ? 'No selections have been recorded yet.' : 'No remaining picks in this export.'));
      return card;
    }
    const list = make('ol', 'home-draft-pick-list');
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      const item = make('li', 'home-draft-pick-item' + (mode === 'upcoming' && i === 0 && p.pick > 0
        ? ' is-next' : ''));
      item.appendChild(make('span', 'home-draft-pick-id', pickNumber(p)));
      const info = make('span', 'home-draft-pick-info');
      const clubs = make('strong', 'home-draft-pick-teams');
      const named = teams.get(p.tid) || {abbrev: teamLabel(teams, p.tid), logos: []};
      clubs.appendChild(teamBrand
        ? teamBrand.inline(named, teamLabel(teams, p.tid))
        : make('span', '', teamLabel(teams, p.tid)));
      if (p.originalTid !== null && p.originalTid !== p.tid) {
        clubs.appendChild(make('span', '', ' (via '));
        const previous = teams.get(p.originalTid) || {
          abbrev: teamLabel(teams, p.originalTid), logos: []
        };
        clubs.appendChild(teamBrand
          ? teamBrand.inline(previous, teamLabel(teams, p.originalTid), '', 'home-draft-via')
          : make('span', '', teamLabel(teams, p.originalTid)));
        clubs.appendChild(make('span', '', ')'));
      }
      // Keep the original complete description for hover/accessibility.
      clubs.title = mode === 'selected'
        ? selectedDisplay(teams, p) : teamDisplay(teams, p);
      info.appendChild(clubs);
      if (mode === 'selected') {
        info.appendChild(make('span', 'home-draft-pick-player',
          p.name + (p.pos ? ' · ' + p.pos : '')));
      } else if (p.pick === 0) {
        info.appendChild(make('span', 'home-draft-pick-player', 'Pick order not set'));
      } else if (i === 0) {
        info.appendChild(make('span', 'home-draft-pick-player', 'Next scheduled pick'));
      }
      item.appendChild(info);
      list.appendChild(item);
    }
    card.appendChild(list);
    return card;
  }
  function render(data) {
    const { prospects, selected, upcoming, teams, phase, season, lotteryAvailable, hasUnknownOrder } = data;
    const summary = make('div', 'home-draft-summary');
    const counter = [
      prospects.length + ' available prospects',
      selected.length + ' picks made',
      upcoming.length + ' picks remaining'
    ];
    for (const text of counter) summary.appendChild(make('span', 'home-draft-counter', text));
    const layout = make('div', 'home-draft-layout');
    layout.appendChild(appendBoard(prospects));
    const right = make('div', 'home-draft-picks');
    right.appendChild(appendPickList('Selections Made', selected, teams, 'selected'));
    right.appendChild(appendPickList(phase === PHASE_LOTTERY ? 'Upcoming Draft Picks' : 'Picks Yet to Go',
      upcoming, teams, 'upcoming'));
    if (hasUnknownOrder) right.appendChild(make('p', 'home-draft-note',
      lotteryAvailable
        ? 'Lottery results are partially known. Unassigned picks remain TBD.'
        : 'The lottery/draft order has not been finalized in this file. TBD picks are not ranked.'));
    layout.appendChild(right);
    body.replaceChildren(summary, layout);
    subtitle.textContent = season + ' draft · ' + (phase === PHASE_LOTTERY ? 'Draft lottery' : 'Draft in progress') +
      (hasUnknownOrder ? ' · Some picks TBD' : '');
  }
  async function load(file) {
    const token = ++generation;
    activeFile = file;
    showFullBoard = false;
    section.hidden = true;
    body.replaceChildren();
    if (!file) return;
    const current = () => token === generation && activeFile === file;
    try {
      const attrs = await stream.readTopLevelValue(file, 'gameAttributes') || {};
      if (!current()) return;
      const phase = integer(attrs.phase), season = integer(attrs.season);
      if ((phase !== PHASE_LOTTERY && phase !== PHASE_DRAFT) || season === null) return;
      section.hidden = false;
      subtitle.textContent = season + ' · ' + (phase === PHASE_LOTTERY ? 'Draft Lottery' : 'Draft');
      status('Reading draft class and pick order…');

      const teams = new Map();
      await stream.forEachTopLevelArrayItem(file, 'teams', team => {
        if (!current()) return;
        const tid = integer(team?.tid);
        if (tid === null) return;
        const seasonRow = (Array.isArray(team.seasons) ? team.seasons : [])
          .find(row => integer(row?.season) === season);
        teams.set(tid, {
          abbrev: String(seasonRow?.abbrev || team.abbrev || 'T' + tid),
          logos: teamBrand?.fromTeam(team, season).logos || []
        });
      });
      if (!current()) return;
      const draftPicks = [];
      await stream.forEachTopLevelArrayItem(file, 'draftPicks', row => {
        if (!current()) return;
        if (integer(row?.season) !== season) return;
        const pick = extractPick(row, season);
        if (pick) draftPicks.push(pick);
      });
      if (!current()) return;
      // Some exports provide a distinct draftOrder array for the current
      // draft. It may be the only source for a completed lottery's order.
      let draftOrder = [];
      if (!draftPicks.some(p => p.pick > 0)) {
        await stream.forEachTopLevelArrayItem(file, 'draftOrder', row => {
          if (!current()) return;
          const pick = extractPick(row, season);
          if (pick) draftOrder.push(pick);
        });
      }
      if (!current()) return;
      // Fallback for lottery files where only the lottery-results table
      // contains the numbered picks. An unassigned order remains TBD.
      const lottoByDpid = new Map();
      if (!draftPicks.some(p => p.pick > 0) && !draftOrder.some(p => p.pick > 0)) {
        await stream.forEachTopLevelArrayItem(file, 'draftLotteryResults', record => {
          if (integer(record?.season) !== season) return;
          for (const row of Array.isArray(record.result) ? record.result : []) {
            if (integer(row?.dpid) !== null && (integer(row?.pick) ?? 0) > 0) {
              lottoByDpid.set(integer(row.dpid), integer(row.pick));
            }
          }
        });
      }
      if (!current()) return;
      const prospects = [], selected = [];
      await stream.forEachTopLevelArrayItem(file, 'players', player => {
        if (!current()) return;
        const draft = player?.draft;
        if (integer(draft?.year) !== season) return;
        const round = integer(draft?.round), pick = integer(draft?.pick);
        if (integer(player?.tid) === -2 && (!round || !pick)) {
          prospects.push(prospect(player, season));
        } else if (round !== null && round > 0 && pick !== null && pick > 0) {
          const ratings = latestRatings(player, season);
          selected.push({
            round, pick,
            tid: integer(draft.tid), originalTid: integer(draft.originalTid),
            name: nameFor(player), pos: String(ratings.pos || player.pos || '')
          });
        }
      });
      if (!current()) return;
      prospects.sort((a, b) => b.score - a.score || (b.pot ?? -1) - (a.pot ?? -1) ||
        (b.ovr ?? -1) - (a.ovr ?? -1) || a.name.localeCompare(b.name));
      selected.sort(byPick);
      let remaining = draftPicks;
      if (!remaining.length && draftOrder.length) remaining = draftOrder;
      if (remaining.length && draftOrder.some(p => p.pick > 0)) {
        const orderedById = new Map(draftOrder.filter(p => p.dpid !== null).map(p => [p.dpid, p]));
        remaining = remaining.map(p => p.pick > 0 ? p : {
          ...p, pick: orderedById.get(p.dpid)?.pick || p.pick
        });
      }
      remaining = remaining.map(p => p.pick > 0 ? p : {
        ...p, pick: lottoByDpid.get(p.dpid) || p.pick
      });
      // Drafted players are removed from BBGM's draftPicks store. In custom
      // exports they may linger, so prevent listing a made pick twice.
      const taken = new Set(selected.map(pickKey));
      const byIdentity = new Set();
      const upcoming = remaining.filter(p => {
        if (p.pick > 0 && taken.has(pickKey(p))) return false;
        const id = p.dpid !== null ? 'd:' + p.dpid :
          [p.round, p.pick, p.tid, p.originalTid].join(':');
        if (byIdentity.has(id)) return false;
        byIdentity.add(id);
        return true;
      }).sort(byPick);
      render({
        prospects, selected, upcoming, teams, phase, season,
        lotteryAvailable: lottoByDpid.size > 0,
        hasUnknownOrder: upcoming.some(p => p.pick === 0)
      });
    } catch (error) {
      if (!current()) return;
      console.warn('Could not load Home draft board.', error);
      status('The draft board could not be read from this league file.');
    }
  }

  hub.subscribe(({ file }) => { void load(file); });
})();