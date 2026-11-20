/* 1968 Underground — separate player portraits and one Headliners! insert.
   Static print design only; original game-file face is supplied by cards-ui. */
(() => {
  'use strict';
  if (window.DBLUndergroundCards) return;
  const isHeadliner = card => card?.rarity === 'underground-headliner';
  function front(card, {make, art}) {
    const insert = isHeadliner(card);
    const face = make('span', 'dbl-cards-face dbl-cards-front dbl-underground-front' +
      (insert ? ' is-headliner' : ''));
    const heading = make('span', 'dbl-underground-masthead');
    heading.appendChild(make('strong', 'dbl-underground-title',
      insert ? 'HEADLINERS!' : 'THE UNDERGROUND'));
    heading.appendChild(make('span', 'dbl-underground-date', 'DBL · 1968'));
    face.appendChild(heading);
    face.appendChild(make('span', 'dbl-underground-radiant'));
    const portrait = make('span', 'dbl-underground-portrait');
    const original = art(card);
    original.classList.add('dbl-underground-face-photo');
    portrait.appendChild(original);
    face.appendChild(portrait);
    if (!insert) {
      face.appendChild(make('span','dbl-underground-flower','✿'));
    }
    if (card.rookie === true) {
      const rookie = make('span','dbl-underground-rookie');
      rookie.appendChild(make('strong','', 'NEW BREED'));
      rookie.appendChild(make('span','', 'ROOKIE'));
      face.appendChild(rookie);
    }
    const lower = make('span','dbl-underground-lower');
    lower.appendChild(make('strong','dbl-underground-player-name',
      card.name || 'Unknown player'));
    lower.appendChild(make('span','dbl-underground-team',
      (card.teamName || card.team || '1968 DBL') + ' · ' + (card.pos || 'PLAYER')));
    lower.appendChild(make('span','dbl-underground-strap',
      insert ? 'THE PEOPLE HAVE SPOKEN · COURTSIDE HEADLINER' :
        'BASKETBALL, BEAUTIFULLY UNCONVENTIONAL'));
    face.appendChild(lower);
    return face;
  }
  function back(card, {make,format,favoriteAction}) {
    const insert = isHeadliner(card);
    const reverse = make('span','dbl-cards-face dbl-cards-back dbl-underground-back' +
      (insert ? ' is-headliner' : ''));
    reverse.appendChild(make('strong','dbl-underground-back-mark',
      insert ? 'HEADLINERS!' : 'THE UNDERGROUND'));
    reverse.appendChild(make('span','dbl-underground-back-edition',
      insert ? '1968 · SCREENPRINT HANDBILL INSERT' : '1968 · FREE PRESS BASKETBALL'));
    reverse.appendChild(make('strong','dbl-underground-back-name',
      card.name || 'Unknown player'));
    reverse.appendChild(make('span','dbl-underground-back-team',
      (card.teamName || card.team || 'DBL') + ' · ' + (card.pos || 'PLAYER') +
      (card.rookie ? ' · NEW BREED ROOKIE' : '')));
    const panel = make('span','dbl-underground-back-panel');
    for (const [label,value] of [
      ['GP',format(card.gp)], ['PPG',format(card.ppg,1)],
      ['RPG',format(card.rpg,1)], ['APG',format(card.apg,1)]
    ]) {
      const stat = make('span','dbl-underground-back-stat');
      stat.appendChild(make('strong','',value));
      stat.appendChild(make('span','',label));
      panel.appendChild(stat);
    }
    reverse.appendChild(panel);
    const bio = make('span','dbl-underground-back-bio');
    const school = make('span','', 'COLLEGE · ' + (card.college || '—'));
    school.title = card.college || '';
    bio.appendChild(school);
    bio.appendChild(make('span','', 'DRAFT · ' +
      (Number.isSafeInteger(card.draftYear) && card.draftYear > 0 ?
        card.draftYear : '—')));
    reverse.appendChild(bio);
    reverse.appendChild(make('span','dbl-underground-back-fine',
      insert ? 'COLLECT THE BIG NAMES · 1968 UNDERGROUND' :
        'A FREE-SPIRITED ISSUE FROM THE DBL · 1968'));
    reverse.appendChild(favoriteAction(card));
    return reverse;
  }
  function cover(make) {
    const preview = make('span','dbl-cards-face dbl-cards-front dbl-underground-cover');
    preview.appendChild(make('span','dbl-underground-cover-date','1968 · DBL'));
    preview.appendChild(make('strong','dbl-underground-cover-title','THE UNDERGROUND'));
    preview.appendChild(make('span','dbl-underground-cover-flower','✿'));
    preview.appendChild(make('strong','dbl-underground-cover-foot','NEW BREED / HEADLINERS!'));
    return preview;
  }
  window.DBLUndergroundCards = Object.freeze({front,back,cover});
})();
