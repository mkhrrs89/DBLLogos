/* 1968 Underground — separate player portraits and one Headliners! insert.
   Static print design only; original game-file face is supplied by cards-ui. */
(() => {
  'use strict';
  if (window.DBLUndergroundCards) return;
  const isHeadliner = card => card?.rarity === 'underground-headliner';
  const isNickname = card => card?.rarity === 'underground-nickname';
  const quoted = text => '“' + String(text || '').trim().replace(/^["“”]+|["“”]+$/g, '') + '”';
  // A separate late-60s character handbill: nickname-first letterpress type,
  // asymmetric photo collage and a clipped red banner, unlike the Base and
  // Headliners layout. Original portraits, name overrides and rookie flags
  // still come from the existing collection/1968 league data.
  const nicknameLengthClass = nickname => {
    const length = String(nickname || '').length;
    return length > 20 ? ' is-long' : length > 13 ? ' is-medium' : '';
  };
  function nicknameFront(card, {make, art}) {
    const face = make('span', 'dbl-cards-face dbl-cards-front dbl-nickname-poster');
    face.appendChild(make('span', 'dbl-nickname-printtexture'));
    const banner = make('span', 'dbl-nickname-poster-banner');
    banner.appendChild(make('strong', '', 'THEY CALL HIM…'));
    face.appendChild(banner);

    const billboard = make('span', 'dbl-nickname-billboard');
    billboard.appendChild(make('strong', 'dbl-nickname-billboard-type' +
      nicknameLengthClass(card.nickname), quoted(card.nickname)));
    face.appendChild(billboard);

    const portrait = make('span', 'dbl-nickname-cutout');
    const photo = art(card);
    photo.classList.add('dbl-underground-face-photo');
    portrait.appendChild(photo);
    face.appendChild(portrait);


    const credit = make('span', 'dbl-nickname-poster-credit');
    credit.appendChild(make('strong', 'dbl-nickname-poster-realname',
      card.name || 'Unknown player'));
    credit.appendChild(make('span', 'dbl-nickname-poster-team',
      (card.teamName || card.team || '1968 DBL') + ' · ' + (card.pos || 'PLAYER')));
    face.appendChild(credit);
    if (card.rookie === true) {
      face.appendChild(make('span', 'dbl-nickname-poster-rookie', 'NEW BREED · ROOKIE'));
    }
    return face;
  }
  function front(card, {make, art}) {
    if (isNickname(card)) return nicknameFront(card, {make,art});
    const insert = isHeadliner(card);
    const face = make('span', 'dbl-cards-face dbl-cards-front dbl-underground-front' +
      (insert ? ' is-headliner' : ''));
    // Only Headliners carry the front masthead and issue stamp.
    if (insert) {
      const heading = make('span', 'dbl-underground-masthead');
      heading.appendChild(make('strong', 'dbl-underground-title', 'HEADLINERS!'));
      heading.appendChild(make('span', 'dbl-underground-date', 'DBL · 1968'));
      face.appendChild(heading);
    }
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
  // Personality-file reverse: a different layout and palette from the
  // regular Underground reverses, but identical statistics and heart action.
  function nicknameBack(card, {make,format,favoriteAction}) {
    const back = make('span', 'dbl-cards-face dbl-cards-back dbl-underground-back dbl-nickname-back is-nickname');
    const mast = make('span', 'dbl-nickname-back-mast');
    mast.appendChild(make('strong', '', 'THEY CALL HIM…'));
    mast.appendChild(make('span', '', 'PERSONALITY ISSUE · 1968'));
    back.appendChild(mast);

    const alias = make('span', 'dbl-nickname-back-alias');
    alias.appendChild(make('strong', 'dbl-nickname-back-alias-type' +
      nicknameLengthClass(card.nickname), quoted(card.nickname)));
    back.appendChild(alias);

    const player = make('span', 'dbl-nickname-back-player');
    player.appendChild(make('strong', '', card.name || 'Unknown player'));
    player.appendChild(make('span', '',
      (card.teamName || card.team || 'DBL') + ' · ' + (card.pos || 'PLAYER') +
      (card.rookie ? ' · NEW BREED ROOKIE' : '')));
    back.appendChild(player);

    const stats = make('span', 'dbl-nickname-back-stats');
    for (const [label,value] of [
      ['GP',format(card.gp)], ['PPG',format(card.ppg,1)],
      ['RPG',format(card.rpg,1)], ['APG',format(card.apg,1)]
    ]) {
      const cell = make('span', 'dbl-nickname-back-stat');
      cell.appendChild(make('strong', '', value));
      cell.appendChild(make('span', '', label));
      stats.appendChild(cell);
    }
    back.appendChild(stats);

    const biography = make('span', 'dbl-nickname-back-bio');
    const school = make('span', '', 'COLLEGE · ' + (card.college || '—'));
    school.title = card.college || '';
    biography.appendChild(school);
    biography.appendChild(make('span', '', 'DRAFT · ' +
      (Number.isSafeInteger(card.draftYear) && card.draftYear > 0 ?
        card.draftYear : '—')));
    back.appendChild(biography);

    back.appendChild(make('span', 'dbl-nickname-back-colophon',
      'THE UNDERGROUND · PLAYER NICKNAMES'));
    back.appendChild(favoriteAction(card));
    return back;
  }
  function back(card, {make,format,favoriteAction}) {
    if (isNickname(card)) return nicknameBack(card, {make,format,favoriteAction});
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
