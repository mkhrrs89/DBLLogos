(() => {
  const button = document.getElementById('familiesTabBtn');
  const panel = document.getElementById('familiesPanel');
  const wrap = document.getElementById('familiesWrap');
  const summary = document.getElementById('familiesSummary');
  const sort = document.getElementById('familiesSort');
  const stream = window.DBLLeagueStream;
  const hub = window.DBLLeagueFileHub;
  const input = document.getElementById('leagueFile');
  const clearButton = document.getElementById('clearLeagueFileBtn');
  if (!button || !panel || !wrap || !summary || !sort || !stream) return;

  let sourceFile = null;
  let version = 0;
  let loadedVersion = -1;
  let loadingVersion = -1;
  let families = [];
  let totalMembers = 0;

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }

  function asText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function pidOf(value) {
    if (value === null || value === undefined || value === '') return null;
    const pid = Number(value);
    return Number.isInteger(pid) && pid >= 0 ? pid : null;
  }

  function surnameOf(name) {
    const surname = asText(name).replace(
      /\s+(?:Jr\.?|Sr\.?|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '',
    ).trim();
    return surname || 'Unknown surname';
  }

  function makePlayer(player) {
    const pid = pidOf(player?.pid);
    if (pid === null) return null;
    const firstName = asText(player.firstName);
    const lastName = asText(player.lastName);
    const name = asText(player.name) || [firstName, lastName].filter(Boolean).join(' ') || 'Unknown Player';
    const ratings = Array.isArray(player.ratings) ? player.ratings : [];
    let peakOvr = null;
    let peakYear = null;
    for (const rating of ratings) {
      const ovr = Number(rating?.ovr);
      const year = Number(rating?.season);
      if (!Number.isFinite(ovr)) continue;
      const rounded = Math.round(ovr);
      if (peakOvr === null || rounded > peakOvr ||
        (rounded === peakOvr && Number.isInteger(year) && year < (peakYear ?? Infinity))) {
        peakOvr = rounded;
        peakYear = Number.isInteger(year) ? year : null;
      }
    }
    return {
      pid, name, surname: surnameOf(lastName || name.split(/\s+/).slice(-1)[0]),
      imgURL: /^https?:\/\/\S+$/i.test(asText(player.imgURL)) ? asText(player.imgURL) : '',
      peakOvr, peakYear,
      relatives: Array.isArray(player.relatives)
        ? player.relatives.map(relative => pidOf(relative?.pid)).filter(id => id !== null)
        : [],
    };
  }

  function detectFamilies(players) {
    const parent = new Map([...players.keys()].map(pid => [pid, pid]));
    const find = pid => {
      let cursor = pid;
      while (parent.get(cursor) !== cursor) {
        parent.set(cursor, parent.get(parent.get(cursor)));
        cursor = parent.get(cursor);
      }
      return cursor;
    };
    const union = (left, right) => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent.set(b, a);
    };
    const linked = new Set();

    for (const person of players.values()) {
      for (const relativePid of person.relatives) {
        if (relativePid === person.pid || !players.has(relativePid)) continue;
        union(person.pid, relativePid);
        linked.add(person.pid);
        linked.add(relativePid);
      }
    }

    const groups = new Map();
    for (const pid of linked) {
      const root = find(pid);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(players.get(pid));
    }

    const detected = [];
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      members.sort((a, b) =>
        (b.peakOvr ?? -1) - (a.peakOvr ?? -1) || a.name.localeCompare(b.name));
      const surnameCounts = new Map();
      for (const member of members) {
        const key = member.surname.toLocaleLowerCase();
        if (!surnameCounts.has(key)) surnameCounts.set(key, { name: member.surname, count: 0, strongest: -1 });
        const entry = surnameCounts.get(key);
        entry.count++;
        entry.strongest = Math.max(entry.strongest, member.peakOvr ?? -1);
      }
      const leadingSurname = [...surnameCounts.values()].sort((a, b) =>
        b.count - a.count || b.strongest - a.strongest || a.name.localeCompare(b.name))[0].name;

      const withRating = members.filter(member => member.peakOvr !== null);
      const combined = withRating.reduce((sum, member) => sum + member.peakOvr, 0);
      detected.push({
        id: Math.min(...members.map(member => member.pid)),
        surname: leadingSurname,
        members, combined,
        average: withRating.length ? combined / withRating.length : 0,
        best: members[0].peakOvr ?? 0,
        branch: 1, branchCount: 1,
      });
    }

    // Different connected lineages can share a surname. Never silently
    // identify unrelated players as one family just because names match.
    const bySurname = new Map();
    for (const family of detected) {
      const key = family.surname.toLocaleLowerCase();
      if (!bySurname.has(key)) bySurname.set(key, []);
      bySurname.get(key).push(family);
    }
    for (const branches of bySurname.values()) {
      branches.sort((a, b) => b.combined - a.combined || a.id - b.id);
      branches.forEach((family, index) => {
        family.branch = index + 1;
        family.branchCount = branches.length;
      });
    }
    return { families: detected, totalMembers: linked.size };
  }

  function orderedFamilies() {
    const mode = sort.value;
    return families.slice().sort((a, b) => {
      let difference = 0;
      if (mode === 'average') difference = b.average - a.average;
      else if (mode === 'best') difference = b.best - a.best;
      else if (mode === 'members') difference = b.members.length - a.members.length;
      else if (mode === 'name') difference = a.surname.localeCompare(b.surname);
      else difference = b.combined - a.combined;
      return difference || b.combined - a.combined || b.average - a.average ||
        a.surname.localeCompare(b.surname) || a.id - b.id;
    });
  }

  function playerImage(player) {
    const portrait = el('div', 'families-player-photo');
    const initials = player.name.split(/\s+/).filter(Boolean).slice(0, 2)
      .map(part => part[0].toUpperCase()).join('') || '?';
    const placeholder = el('span', 'families-photo-fallback', initials);
    portrait.appendChild(placeholder);
    if (!player.imgURL) return portrait;
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => { placeholder.hidden = true; });
    img.addEventListener('error', () => { img.remove(); placeholder.hidden = false; });
    portrait.appendChild(img);
    img.src = player.imgURL;
    if (img.complete && img.naturalWidth > 0) placeholder.hidden = true;
    return portrait;
  }

  function buildMember(member) {
    const card = el('div', 'families-member');
    card.appendChild(playerImage(member));
    const details = el('div', 'families-member-details');
    const name = el('div', 'families-member-name', member.name);
    name.title = member.name;
    details.appendChild(name);
    details.appendChild(el('div', 'families-member-ovr',
      member.peakOvr !== null ? 'Peak OVR ' + member.peakOvr : 'OVR unavailable'));
    if (member.peakYear !== null) details.appendChild(el('div', 'families-member-year', String(member.peakYear)));
    card.appendChild(details);
    return card;
  }

  function buildFamily(family, index) {
    const card = el('article', 'families-card');
    const top = el('div', 'families-card-top');
    top.appendChild(el('span', 'families-rank', '#' + (index + 1)));
    const identity = el('div', 'families-identity');
    identity.appendChild(el('h3', 'families-name', family.surname + ' family'));
    identity.appendChild(el('div', 'families-family-meta',
      family.members.length + ' relatives' +
      (family.branchCount > 1 ? ' · Lineage ' + family.branch + ' of ' + family.branchCount : '')));
    top.appendChild(identity);
    const total = el('div', 'families-score');
    total.appendChild(el('strong', null, family.combined));
    total.appendChild(el('span', null, 'Combined peak OVR'));
    top.appendChild(total);
    card.appendChild(top);

    const metrics = el('div', 'families-metrics');
    metrics.appendChild(el('span', null, 'Avg peak OVR ' + family.average.toFixed(1)));
    metrics.appendChild(el('span', null, 'Best player OVR ' + family.best));
    card.appendChild(metrics);

    const roster = el('div', 'families-members');
    for (const member of family.members) roster.appendChild(buildMember(member));
    card.appendChild(roster);
    return card;
  }

  function showStatus(message) {
    wrap.replaceChildren(el('p', 'families-status', message));
    summary.textContent = '';
  }

  function render() {
    if (!families.length) {
      showStatus('No documented family relationships were found in this league file.');
      return;
    }
    const suffix = {
      combined: 'combined peak OVR',
      average: 'average peak OVR',
      best: 'best player peak OVR',
      members: 'family size',
      name: 'surname',
    }[sort.value] || 'combined peak OVR';
    summary.textContent = families.length + ' documented families · ' + totalMembers +
      ' related players · Ranked by ' + suffix;
    const fragment = document.createDocumentFragment();
    orderedFamilies().forEach((family, index) => fragment.appendChild(buildFamily(family, index)));
    wrap.replaceChildren(fragment);
  }

  function acceptFile(file) {
    if (sourceFile === file) return;
    sourceFile = file || null;
    version++;
    loadedVersion = -1;
    loadingVersion = -1;
    families = [];
    totalMembers = 0;
    showStatus(file ? 'Open Families to rank the league’s documented relatives.' :
      'Load a league file to discover player families.');
    if (file && !panel.hidden) void load();
  }

  async function load() {
    if (!sourceFile) {
      showStatus('Load a league file to discover player families.');
      return;
    }
    if (loadedVersion === version) {
      render();
      return;
    }
    if (loadingVersion === version) return;
    const file = sourceFile;
    const token = version;
    loadingVersion = token;
    showStatus('Scanning player family relationships and career ratings…');
    try {
      const players = new Map();
      await stream.forEachTopLevelArrayItem(file, 'players', raw => {
        if (token !== version) return;
        const player = makePlayer(raw);
        if (player) players.set(player.pid, player);
      });
      if (token !== version) return;
      const found = detectFamilies(players);
      families = found.families;
      totalMembers = found.totalMembers;
      loadedVersion = token;
      render();
    } catch (error) {
      if (token !== version) return;
      console.warn('Could not build Families ranking.', error);
      showStatus('Could not read family relationships from this league file.');
    } finally {
      if (loadingVersion === token) loadingVersion = -1;
    }
  }

  sort.addEventListener('change', render);
  if (hub) hub.subscribe(({ file }) => acceptFile(file));
  else {
    input?.addEventListener('change', event => acceptFile(event.target.files?.[0] || null));
    clearButton?.addEventListener('click', () => acceptFile(null));
  }
  window.addEventListener('dbl:tab-change', event => {
    if (event.detail?.tabId === 'familiesTabBtn') void load();
  });
  button.addEventListener('click', () => void load());
})();