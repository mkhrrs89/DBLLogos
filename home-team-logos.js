(() => {
  'use strict';
  if (window.DBLHomeTeamLogo) return;
  const imageSource = source => {
    if (typeof source !== 'string') return '';
    const url = source.trim();
    return /^(https?:\/\/\S+|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(url) &&
      url.length < 500000 ? url : '';
  };
  const yearNumber = value => Number.isInteger(Number(value)) ? Number(value) : null;
  function fromTeam(team, season) {
    if (!team) return {abbrev: '?', logos: []};
    const history = (Array.isArray(team.seasons) ? team.seasons : [])
      .filter(row => row && yearNumber(row.season) !== null &&
        yearNumber(row.season) <= season)
      .sort((a, b) => yearNumber(b.season) - yearNumber(a.season));
    const entry = history[0] || {};
    const abbrev = String(entry.abbrev || team.abbrev || '?');
    const candidates = [
      entry.imgURLSmall, entry.imgURL,
      ...history.slice(1).flatMap(row => [row.imgURLSmall, row.imgURL]),
      team.imgURLSmall, team.imgURL
    ].map(imageSource).filter(Boolean);
    return {abbrev, logos: [...new Set(candidates)]};
  }
  function logo(team, extraClass = '') {
    const wrapper = document.createElement('span');
    wrapper.className = 'home-team-inline-logo' + (extraClass ? ' ' + extraClass : '');
    const abbrev = String(team?.abbrev || '?');
    const initials = document.createElement('span');
    initials.className = 'home-team-inline-fallback';
    initials.textContent = abbrev.slice(0, 3);
    wrapper.appendChild(initials);
    const sources = Array.isArray(team?.logos) ? team.logos.filter(Boolean) : [];
    if (sources.length) {
      const img = document.createElement('img');
      img.alt = '';
      img.width = 24;
      img.height = 24;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      let index = 0;
      img.addEventListener('load', () => { initials.hidden = true; });
      img.addEventListener('error', () => {
        index++;
        if (index < sources.length) img.src = sources[index];
        else { img.remove(); initials.hidden = false; }
      });
      wrapper.appendChild(img);
      img.src = sources[index];
      if (img.complete && img.naturalWidth > 0) initials.hidden = true;
    }
    return wrapper;
  }
  function inline(team, label, textClass = '', containerClass = '') {
    const root = document.createElement('span');
    root.className = 'home-team-inline' + (containerClass ? ' ' + containerClass : '');
    root.appendChild(logo(team));
    const caption = document.createElement('span');
    if (textClass) caption.className = textClass;
    caption.textContent = String(label ?? team?.abbrev ?? 'Unknown');
    root.appendChild(caption);
    return root;
  }
  window.DBLHomeTeamLogo = Object.freeze({fromTeam, logo, inline});
})();
