(() => {
  'use strict';
  const panel = document.getElementById('storiesPanel');
  const engine = window.DBLStoryGeneratorEngine;
  const hub = window.DBLLeagueFileHub;
  const reader = window.DBLLeagueStream;
  if (!panel || !engine || !hub?.subscribe || !reader) return;

  const yearTabs = document.getElementById('storiesYearTabs');
  const availableList = document.getElementById('storiesAvailableList');
  const availableCount = document.getElementById('storiesAvailableCount');
  const rollButton = document.getElementById('storiesRollButton');
  const status = document.getElementById('storiesStatus');
  const result = document.getElementById('storiesResult');
  const resultNumber = document.getElementById('storiesResultNumber');
  const resultTitle = document.getElementById('storiesResultTitle');
  const resultText = document.getElementById('storiesResultText');
  const participants = document.getElementById('storiesParticipants');
  const teams = document.getElementById('storiesTeams');
  const notes = document.getElementById('storiesNotes');
  const resultCopy = document.getElementById('storiesCopyButton');
  if ([yearTabs,availableList,availableCount,rollButton,status,result,
    resultNumber,resultTitle,resultText,participants,teams,notes,resultCopy]
    .some(x=>!x)) return;

  let year = 1968;
  let leagueVersion = hub.getVersion?.() || 0;
  let file = hub.getCurrentFile?.() || null;
  let roster = null;
  let scanPromise = null;
  let scanNonce = 0;
  let lastStory = null;

  const element = (tag, cls, content) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (content !== undefined) el.textContent = String(content);
    return el;
  };
  function updateStatus(message, busy = false) {
    status.textContent = message;
    status.dataset.busy = busy ? 'true' : 'false';
  }
  function clearResult() {
    lastStory = null;
    result.hidden = true;
    resultNumber.textContent = '';
    resultTitle.textContent = '';
    resultText.textContent = '';
    participants.replaceChildren();
    teams.replaceChildren();
    notes.replaceChildren();
  }
  function renderYears() {
    yearTabs.replaceChildren();
    for (const label of Object.keys(engine.catalogs).sort()) {
      const selected = Number(label) === year;
      const button = element('button', 'story-gen-year-tab' +
        (selected ? ' is-active' : ''), label);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(selected));
      button.setAttribute('aria-controls', 'storiesYearView');
      button.tabIndex = selected ? 0 : -1;
      button.addEventListener('click', () => selectYear(Number(label)));
      button.addEventListener('keydown', ev => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key)) return;
        ev.preventDefault();
        const labels = Object.keys(engine.catalogs).map(Number).sort();
        const current = labels.indexOf(Number(label));
        const next = ev.key === 'Home' ? labels[0] : ev.key === 'End' ?
          labels[labels.length - 1] :
          labels[(current + (ev.key === 'ArrowRight' ? 1 : -1) + labels.length) % labels.length];
        selectYear(next);
        yearTabs.querySelector('[aria-selected="true"]')?.focus();
      });
      yearTabs.appendChild(button);
    }
  }
  function renderCatalog() {
    const catalog = engine.catalogs[year] || [];
    availableCount.textContent = catalog.length + ' available stories';
    const fragment = document.createDocumentFragment();
    for (const story of catalog) {
      const row = element('details', 'story-gen-entry');
      const summary = element('summary', 'story-gen-entry-head');
      summary.appendChild(element('span', 'story-gen-entry-number',
        String(story.id).padStart(2,'0')));
      summary.appendChild(element('span', 'story-gen-entry-title', story.title));
      summary.appendChild(element('span', 'story-gen-entry-category', story.category));
      row.appendChild(summary);
      row.appendChild(element('p', 'story-gen-entry-description', story.text));
      fragment.appendChild(row);
    }
    availableList.replaceChildren(fragment);
  }
  function selectYear(next) {
    if (!engine.catalogs[next] || next === year) return;
    year = next;
    roster = null;
    scanNonce++;
    scanPromise = null;
    clearResult();
    renderYears();
    renderCatalog();
    void ensureRoster();
  }
  function renderAssignment(assignment) {
    const story = assignment.story;
    lastStory = assignment;
    resultNumber.textContent = '1968 · STORY NO. ' +
      String(story.id).padStart(2,'0') + ' · ' + story.category.toUpperCase();
    resultTitle.textContent = story.title;
    resultText.textContent = story.text;
    participants.replaceChildren();
    teams.replaceChildren();
    notes.replaceChildren();

    if (assignment.participants.length) {
      participants.appendChild(element('h4', 'story-gen-group-title',
        'Players involved'));
      const cast = element('div','story-gen-cast-list');
      for (const player of assignment.participants) {
        const line = element('div','story-gen-cast-row');
        line.appendChild(element('span','story-gen-cast-role',player.label));
        line.appendChild(element('strong','story-gen-cast-name',player.name));
        line.appendChild(element('span','story-gen-cast-team',player.team || 'DBL'));
        cast.appendChild(line);
      }
      participants.appendChild(cast);
    }
    if (assignment.teams.length) {
      teams.appendChild(element('h4','story-gen-group-title',
        assignment.teams.length === 1 ? 'Club involved' : 'Clubs involved'));
      const list = element('div','story-gen-team-list');
      for (const team of assignment.teams)
        list.appendChild(element('span','story-gen-team-pill',team.name));
      teams.appendChild(list);
    }
    for (const caution of assignment.notes)
      notes.appendChild(element('p','story-gen-verification',caution));
    result.hidden = false;
    result.scrollIntoView?.({behavior: 'smooth', block: 'nearest'});
  }
  function exportText() {
    if (!lastStory) return '';
    const story = lastStory.story;
    const lines = [String(year) + ' · STORY NO. ' + story.id,
      story.title, story.text, '',
      'Players involved:'];
    if (!lastStory.participants.length) lines.push('(No specific players)');
    else for (const p of lastStory.participants)
      lines.push(p.label + ': ' + p.name + ' (' + p.team + ')');
    lines.push('Clubs involved: ' +
      (lastStory.teams.map(t=>t.name).join('; ') || '(none)'));
    if (lastStory.notes.length) {
      lines.push('', 'Details to verify:');
      lines.push(...lastStory.notes);
    }
    lines.push('', 'Fictional DBL storyline; not a factual news report.');
    return lines.join('\n');
  }
  resultCopy.addEventListener('click', async () => {
    const text = exportText();
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      resultCopy.textContent = 'Copied!';
      // Restored on the next roll; no timer or persistent state needed.
    } catch {
      resultCopy.textContent = 'Copy unavailable — select the story text';
    }
  });
  function statusFor(roster) {
    const count = (engine.catalogs[year] || [])
      .filter(story => engine.available(story,roster)).length;
    return roster.players.length + ' active players · ' + roster.teams.length +
      ' teams · ' + count + ' stories can be cast';
  }
  async function ensureRoster() {
    if (!file) {
      rollButton.disabled = true;
      updateStatus('Upload a DBL league file above to cast 1968 players and teams.');
      return null;
    }
    if (roster) return roster;
    if (scanPromise) return scanPromise;
    const nonce = ++scanNonce, version = leagueVersion, thisFile = file;
    rollButton.disabled = true;
    updateStatus('Reading the uploaded league file for 1968 rosters…', true);
    const work = engine.buildRoster(thisFile,reader,year).then(data => {
      if (nonce !== scanNonce || version !== leagueVersion) return null;
      roster = data;
      const feasible = (engine.catalogs[year] || []).filter(
        story => engine.available(story,data));
      rollButton.disabled = !feasible.length;
      updateStatus(feasible.length ? statusFor(data) :
        'This file has no eligible ' + year + ' stories. Check the season and roster history.');
      return data;
    }).catch(error => {
      if (nonce !== scanNonce || version !== leagueVersion) return null;
      rollButton.disabled = true;
      updateStatus('Could not read ' + year + ' participants: ' +
        (error?.message || 'Unknown file error'));
      return null;
    }).finally(() => {
      if (nonce === scanNonce) scanPromise = null;
    });
    scanPromise = work;
    return work;
  }
  async function rollStory() {
    if (rollButton.disabled) return;
    const data = roster || await ensureRoster();
    if (!data) return;
    const assignment = engine.roll(data,year);
    if (!assignment) {
      updateStatus('Not enough eligible 1968 players and teams to cast these stories.');
      return;
    }
    resultCopy.textContent = 'Copy story';
    renderAssignment(assignment);
  }
  rollButton.addEventListener('click', () => { void rollStory(); });
  hub.subscribe(snapshot => {
    leagueVersion = snapshot.version;
    file = snapshot.file;
    roster = null;
    scanPromise = null;
    scanNonce++;
    clearResult();
    rollButton.disabled = true;
    if (!file) updateStatus('Upload a league file above to assign story participants.');
    else {
      updateStatus('League file ready. Open Stories to load 1968 participants.');
      if (!panel.hidden) void ensureRoster();
    }
  });
  window.addEventListener('dbl:tab-change',event => {
    if (event.detail?.panelId === 'storiesPanel') void ensureRoster();
  });

  renderYears();
  renderCatalog();
  clearResult();
  rollButton.disabled = true;
  updateStatus('Upload a DBL league file above to cast the stories.');
  if (!panel.hidden) void ensureRoster();
})();