/* 1968 Underground — separate player portraits and one Headliners! insert.
   Static print design only; original game-file face is supplied by cards-ui. */
(() => {
  'use strict';
  if (window.DBLUndergroundCards) return;
  const isHeadliner = card => card?.rarity === 'underground-headliner';
  const isNickname = card => card?.rarity === 'underground-nickname';
  const quoted = text => '“' + String(text || '').trim().replace(/^["“”]+|["“”]+$/g, '') + '”';
  // 1968 novelty insert, independent of Base and Headliners artwork.
  function nicknameFront(card, {make, art}) {
    const face = make('span','dbl-cards-face dbl-cards-front dbl-underground-nickname-front');
    const top = make('span','dbl-nickname-top');
    top.appendChild(make('span','dbl-nickname-year','DBL · 1968'));
    top.appendChild(make('strong','dbl-nickname-title','THEY CALL HIM…'));
    face.appendChild(top);
    face.appendChild(make('span','dbl-nickname-sunburst'));
    const photo = make('span','dbl-nickname-portrait');
    const existingFace = art(card);
    existingFace.classList.add('dbl-underground-face-photo');
    photo.appendChild(existingFace);
    face.appendChild(photo);
    const caption = make('span','dbl-nickname-bottom');
    caption.appendChild(make('strong','dbl-nickname-alias',quoted(card.nickname)));
    caption.appendChild(make('span','dbl-nickname-identity',
      (card.name || 'Unknown player') + ' · ' + (card.teamName || card.team || 'DBL')));
    face.appendChild(caption);
    if (card.rookie === true)
      face.appendChild(make('span','dbl-nickname-rookie','NEW BREED · ROOKIE'));
    return face;
  }
  function front(card, {make, art}) {
    if (isNickname(card)) return nicknameFront(card, {make,art});
    const insert = isHeadliner(card);
    const face = make('span', 'dbl-cards-face dbl-cards-front dbl-underground-front' +
      (insert ? ' is-headliner' : ''));
    const heading = make('span', 'dbl-underground-masthead');
    // Headliners retain their big poster title. Base cards only carry
    // the small 1968 issue stamp so the portrait can sit higher.
    if (insert) heading.appendChild(make('strong', 'dbl-underground-title', 'HEADLINERS!'));
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
    face.appendChild(lower);
    return face;
  }
  function back(card, {make,format,favoriteAction}) {
    const insert = isHeadliner(card), nickname = isNickname(card);
    const reverse = make('span','dbl-cards-face dbl-cards-back dbl-underground-back' +
      (nickname ? ' is-nickname' : insert ? ' is-headliner' : ''));
    reverse.appendChild(make('strong','dbl-underground-back-mark',
      nickname ? 'THEY CALL HIM…' : insert ? 'HEADLINERS!' : 'THE UNDERGROUND'));
    reverse.appendChild(make('span','dbl-underground-back-edition',
      nickname ? '1968 · PLAYER NICKNAMES' :
        insert ? '1968 · SCREENPRINT HANDBILL INSERT' : '1968 · FREE PRESS BASKETBALL'));
    reverse.appendChild(make('strong','dbl-underground-back-name',
      nickname ? quoted(card.nickname) : card.name || 'Unknown player'));
    reverse.appendChild(make('span','dbl-underground-back-team',
      (nickname ? (card.name || 'Unknown player') + ' · ' : '') +
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
      nickname ? '1968 UNDERGROUND · THEY CALL HIM… ISSUE' :
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
