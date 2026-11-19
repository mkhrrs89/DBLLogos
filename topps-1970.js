/*
 * 1970 Topps — PRELAUNCH / DORMANT.
 * Standalone 1970 player-card catalog, front and reverse. Nothing in this
 * module registers a pack, rarity, checklist, collection, or site tab.
 * Do NOT enable on the 1970 season rollover without an explicit release.
 * No storage writes, downloads, automatic league scans, or background work.
 */
(() => {
  'use strict';
  if (window.DBLTopps1970) return;

  const YEAR = 1970;
  const SERIES = 3; // Reserved: existing collections are Series 0/1/2.
  const TYPE = 'topps-1970-player';
  const RARITY = 'topps-1970';
  const BRICK = '#B63911'; // Sampled from the supplied design, never team-dependent.
  const NEUTRAL_INK = '#222222';
  const text = value => typeof value === 'string' ? value.trim() : '';
  const integer = value => value === null || value === undefined ||
    value === '' || !Number.isSafeInteger(Number(value)) ? null : Number(value);
  const num = value => value === null || value === undefined ||
    value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const safePhoto = value => {
    const source = text(value);
    if (/^https?:\/\/\S+$/i.test(source) && source.length < 1800) return source;
    if (source.length < 450000 &&
        /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i.test(source)) return source;
    return '';
  };
  const hexColor = color => {
    const hex = text(color);
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return hex.toUpperCase();
    return null;
  };
  function palette(row, team, fallback, current1970) {
    // Never borrow a future franchise rebrand for the 1970 border.
    const candidates=current1970
      ? [row?.colors?.[0],team?.colors?.[0],fallback?.colors?.[0]]
      : [row?.colors?.[0],fallback?.colors?.[0]];
    return candidates.map(hexColor).find(Boolean) || NEUTRAL_INK;
  }
  function historicalTeam(team,year=YEAR,fileSeason=year) {
    const rows = (Array.isArray(team?.seasons)?team.seasons:[])
      .filter(r=>integer(r?.season)!==null && integer(r.season)<=year)
      .sort((a,b)=>integer(a.season)-integer(b.season));
    const yearRow=rows.findLast?.(r=>integer(r.season)===year) ||
      [...rows].reverse().find(r=>integer(r.season)===year) || null;
    const nearest=rows.at(-1)||null;
    const current1970=fileSeason===year;
    // Current 1970 preseason exports may not yet have a 1970 seasons row.
    // In that case the franchise's live identity is the 1970 identity.
    // In later exports, never take current team names/colors from the future.
    if(!nearest && !current1970)return null;
    const row=yearRow||(current1970?null:nearest);
    const previousColorRow=[...rows].reverse().find(r=>hexColor(r?.colors?.[0]))||null;
    const region=text(row?.region)||
      (current1970?text(team?.region):text(nearest?.region));
    const nickname=text(row?.name)||
      (current1970?text(team?.name):text(nearest?.name));
    return {
      region, nickname,
      name:[region,nickname].filter(Boolean).join(' ')||'Unknown team',
      wordmark:(region||nickname||'DBL').toLocaleUpperCase(),
      abbrev:text(row?.abbrev)||
        (current1970?text(team?.abbrev):text(nearest?.abbrev))||'DBL',
      primaryColor:palette(yearRow,team,previousColorRow,current1970),
      season:year, tid:integer(team?.tid),
    };
  }
  function positionLabel(pos) {
    const p=text(pos).toUpperCase();
    if (p==='PG'||p==='SG'||p==='G'||p==='GF'||p==='G-F') return 'guard';
    if (p==='SF'||p==='PF'||p==='F'||p==='FG'||p==='F-G') return 'forward';
    if (p==='C'||p==='FC'||p==='F-C'||p==='CF'||p==='C-F') return 'center';
    return text(pos).toLocaleLowerCase()||'player';
  }
  function mostRecent1970Rating(player) {
    const snapshots=(Array.isArray(player?.ratings)?player.ratings:[])
      .filter(row=>integer(row?.season)===YEAR);
    return snapshots.at(-1)||{};
  }
  function toCard(player, teams, fileSeason) {
    const pid=integer(player?.pid);
    if (pid===null||pid<0||fileSeason<YEAR) return null;
    const regular=(Array.isArray(player.stats)?player.stats:[])
      .filter(row=>integer(row?.season)===YEAR && !row?.playoffs &&
        (integer(row?.tid)??-1)>=0 && (num(row?.gp)??0)>0);
    // A file at the 1970 season start can have no played games yet.
    const current1970=fileSeason===YEAR && (integer(player?.tid)??-1)>=0;
    if (!regular.length && !current1970) return null;
    // For a later league export, recover the player's 1970 team from
    // historical games instead of their current post-1970 franchise.
    const gamesByTid=new Map();
    for (const row of regular) {
      const tid=integer(row.tid),gp=num(row.gp)||0;
      gamesByTid.set(tid,(gamesByTid.get(tid)||0)+gp);
    }
    let tid=null,most=-1;
    for(const [key,games] of gamesByTid) {
      if(games>most) {tid=key;most=games;}
    }
    if(tid===null && current1970) tid=integer(player.tid);
    const rawTeam=teams.get(tid);
    if(!rawTeam) return null;
    const team=historicalTeam(rawTeam,YEAR,fileSeason);
    if(!team)return null;
    const rating=mostRecent1970Rating(player);
    const firstName=text(player.firstName);
    const lastName=text(player.lastName);
    const name=[firstName,lastName].filter(Boolean).join(' ')||
      text(player.name)||'Unknown player';
    const previousSeasonPlayed=(Array.isArray(player.stats)?player.stats:[])
      .some(row=>!row?.playoffs && (integer(row.season)??Infinity)<YEAR &&
        (num(row.gp)??0)>0);
    const teamGames=regular.filter(r=>integer(r.tid)===tid);
    const gp=teamGames.reduce((sum,row)=>sum+(num(row.gp)||0),0);
    const totals=key=>teamGames.reduce((sum,row)=>sum+(num(row[key])||0),0);
    const safeMean=key=>gp>0?Math.round(totals(key)/gp*10)/10:0;
    return Object.freeze({
      id:'topps:1970:player:'+pid,
      type:TYPE,rarity:RARITY,series:SERIES,year:YEAR,era:YEAR,
      pid,tid,firstName,lastName,name,
      position:positionLabel(rating.pos||player.pos),
      rookie:!previousSeasonPlayed,
      team:team.abbrev,teamName:team.name,teamWordmark:team.wordmark,
      teamRegion:team.region,teamPrimary:team.primaryColor,
      photo:safePhoto(player.imgURL)||safePhoto(player.imgURLSmall),
      ovr:num(rating.ovr),gp,ppg:safeMean('pts'),
      rpg:safeMean('trb'),apg:safeMean('ast'),
      draftPick:integer(player.draft?.pick),
    });
  }
  function buildCatalog({season,players,teams}={}) {
    const fileSeason=integer(season);
    if(fileSeason===null||fileSeason<YEAR) return Object.freeze([]);
    const map=new Map();
    for(const team of Array.isArray(teams)?teams:[]) {
      const tid=integer(team?.tid);
      if(tid!==null)map.set(tid,team);
    }
    const found=new Map();
    for(const player of Array.isArray(players)?players:[]) {
      const card=toCard(player,map,fileSeason);
      if(card&&!found.has(card.pid))found.set(card.pid,card);
    }
    return Object.freeze([...found.values()]
      .sort((a,b)=>a.name.localeCompare(b.name)||a.pid-b.pid));
  }
  async function buildFromGameFile(file,reader) {
    if(!file||typeof reader?.readTopLevelValue!=='function'||
       typeof reader?.forEachTopLevelArrayItem!=='function')
      throw Error('A readable DBL league export is required.');
    const attrs=await reader.readTopLevelValue(file,'gameAttributes')||{};
    const season=integer(attrs.season);
    if(season===null||season<YEAR)return Object.freeze([]);
    const teams=[];
    await reader.forEachTopLevelArrayItem(file,'teams',team=>{
      if(integer(team?.tid)!==null)teams.push(team);
    });
    const teamMap=new Map(teams.map(team=>[integer(team.tid),team]));
    const found=new Map();
    await reader.forEachTopLevelArrayItem(file,'players',player=>{
      const card=toCard(player,teamMap,season);
      if(card&&!found.has(card.pid))found.set(card.pid,card);
    });
    return Object.freeze([...found.values()]
      .sort((a,b)=>a.name.localeCompare(b.name)||a.pid-b.pid));
  }
  function el(tag,cls,content) {
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(content!==undefined)node.textContent=String(content);
    return node;
  }
  function star(cls) {
    const wrapper=el('span','dbl-topps70-star '+cls);
    wrapper.setAttribute('aria-hidden','true');
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 60 60');
    svg.setAttribute('aria-hidden','true');
    const polygon=document.createElementNS(ns,'polygon');
    polygon.setAttribute('points',
      '30,2 38,22 59,22 43,35 49,56 30,43 11,56 17,35 1,22 22,22');
    polygon.setAttribute('fill','#fff');
    polygon.setAttribute('stroke','#111');
    polygon.setAttribute('stroke-width','2.7');
    polygon.setAttribute('stroke-linejoin','miter');
    svg.appendChild(polygon);
    wrapper.appendChild(svg);
    return wrapper;
  }
  // A renderer, deliberately not registered as a live collectible.
  function renderFront(card) {
    if(card?.type!==TYPE||card.year!==YEAR)
      throw Error('Expected a 1970 Topps player card.');
    const face=el('span','dbl-cards-face dbl-cards-front dbl-topps70-front');
    face.style.setProperty('--topps70-team',hexColor(card.teamPrimary)||NEUTRAL_INK);
    const displayName=text(card.name)||[text(card.firstName),text(card.lastName)]
      .filter(Boolean).join(' ')||'Unknown player';
    const title=el('strong','dbl-topps70-player-name',displayName);
    // Compress very long names without changing the layout or type color.
    title.style.setProperty('--topps70-name-stretch',String(
      Math.min(1,19/Math.max(displayName.length,19)).toFixed(3)));
    face.appendChild(title);
    face.appendChild(el('span','dbl-topps70-position',
      text(card.position)||'player'));
    if(card.rookie)face.appendChild(el('span','dbl-topps70-rookie','rookie'));
    const portrait=el('span','dbl-topps70-photo-oval');
    const src=safePhoto(card.photo);
    if(src){
      const img=el('img','dbl-topps70-photo');
      img.alt='';
      img.loading='lazy';
      img.decoding='async';
      img.referrerPolicy='no-referrer';
      img.src=src;
      portrait.appendChild(img);
    }else{
      portrait.appendChild(el('span','dbl-topps70-photo-missing',
        [text(card.firstName).charAt(0),text(card.lastName).charAt(0)]
          .filter(Boolean).join('')||'?'));
    }
    face.appendChild(portrait);
    for(const where of ['top-left','top-right','bottom-left','bottom-right'])
      face.appendChild(star('is-'+where));
    face.appendChild(el('strong','dbl-topps70-team-wordmark',
      text(card.teamWordmark)||text(card.teamRegion).toUpperCase()||
      text(card.teamName).toUpperCase()||'DBL'));
    return face;
  }
  // The supplied reference specifies the front. This conservative reverse
  // keeps basic player information ready without inventing collectible odds.
  function renderBack(card) {
    if(card?.type!==TYPE||card.year!==YEAR)
      throw Error('Expected a 1970 Topps player card.');
    const face=el('span','dbl-cards-face dbl-cards-back dbl-topps70-back');
    face.appendChild(el('strong','dbl-topps70-back-heading','1970 TOPPS'));
    face.appendChild(el('strong','dbl-topps70-back-player',card.name));
    face.appendChild(el('span','dbl-topps70-back-team',card.teamName));
    const metrics=el('span','dbl-topps70-back-stats');
    for(const [name,value] of [
      ['GP',card.gp],['PTS',card.ppg],['REB',card.rpg],['AST',card.apg]
    ]){
      const stat=el('span','dbl-topps70-back-stat');
      stat.appendChild(el('strong','',value??'—'));
      stat.appendChild(el('span','',name));
      metrics.appendChild(stat);
    }
    face.appendChild(metrics);
    face.appendChild(el('span','dbl-topps70-back-foot',
      '1970 SEASON · '+(card.rookie?'ROOKIE':'PLAYER')));
    return face;
  }
  // Activation intentionally requires a future explicit code change.
  // No live Cards subsystem imports or calls this module today.
  window.DBLTopps1970=Object.freeze({
    year:YEAR,series:SERIES,type:TYPE,rarity:RARITY,
    brick:BRICK,dormant:true,
    buildCatalog,buildFromGameFile,renderFront,renderBack
  });
})();