/* Curated mid-regular-season headlines.
   Consumes the existing Home upload comparison; NEVER scans a second copy
   of the user's league file or alters the full Since Last Update digest. */
(() => {
  'use strict';
  if(window.DBLHomeMajorEvents)return;
  const section=document.getElementById('homeMajorEvents');
  const feed=document.getElementById('homeMajorEventsList');
  const context=document.getElementById('homeMajorEventsContext');
  const count=document.getElementById('homeMajorEventsCount');
  const more=document.getElementById('homeMajorEventsMore');
  const TYPES={trade:'Trades',award:'Awards & honors',injury:'Injuries',
    feat:'Big performances',game:'Memorable games',league:'League news',
    standings:'Standings',move:'Roster movement'};
  const LIMITS={trade:3,award:2,injury:2,feat:3,game:2,
    league:2,standings:2,move:2};
  const validNumber=x=>typeof x==='number'&&Number.isFinite(x)?x:0;
  const asText=value=>String(value??'').trim();
  const teamName=(teams,tid)=>asText(teams?.[String(tid)]?.name||
    teams?.[String(tid)]?.abbrev||'Team '+tid);

  function build(previous,latest,delta,names,describeEvent) {
    if(!previous||!latest||!delta||typeof describeEvent!=='function')return [];
    const candidates=[],seen=new Set();
    function add(kind,text,priority) {
      const title=asText(text);
      if(!title)return;
      const key=title.toLocaleLowerCase().replace(/\s+/g,' ');
      if(seen.has(key))return;
      seen.add(key);
      candidates.push({kind,title,priority:validNumber(priority),index:candidates.length});
    }
    const events=delta.events||{};
    const score=row=>validNumber(row?.score);
    for(const row of (events.trades||[]))
      add('trade',describeEvent(row,latest.teams,names),100+Math.min(45,score(row)));
    for(const row of (events.awards||[]))
      add('award',describeEvent(row,latest.teams,names),88+Math.min(35,score(row)));
    // Major developments from the league event log, not a fabricated story.
    for(const row of (events.news||[])) {
      if(score(row)>=10 || ['expansionDraft','newTeam','teamLost','teamRelocated','contraction'].includes(row.type))
        add('league',describeEvent(row,latest.teams,names),78+Math.min(40,score(row)));
    }
    for(const row of (events.moves||[])) {
      if(score(row)>=10 || ['retired','draft'].includes(row.type))
        add('move',describeEvent(row,latest.teams,names),68+Math.min(34,score(row)));
    }
    const beforePlayers=previous.players||{};
    const afterPlayers=latest.players||{};
    for(const [pid,player] of Object.entries(afterPlayers)) {
      const old=beforePlayers[pid];
      if(!old)continue;
      const remaining=validNumber(player.gamesRemaining);
      const before=validNumber(old.gamesRemaining);
      const ovr=validNumber(player.ovr);
      const newInjury=remaining>0 && (!before || old.injury!==player.injury && remaining>=before);
      if(newInjury && (remaining>=20 || remaining>=7 && ovr>=65))
        add('injury',player.name+' ('+teamName(latest.teams,player.tid)+
          ') sidelined: '+player.injury+' ('+remaining+' games remaining).',
          82+Math.min(30,remaining/2+ovr/10));
      if(old.tid!==player.tid && old.tid>=0 && ovr>=70)
        add('move',player.name+' moved from '+teamName(previous.teams,old.tid)+
          ' to '+teamName(latest.teams,player.tid)+'.',74+Math.min(20,ovr/5));
    }
    for(const row of (events.injuries||[])) {
      if(score(row)>=10)
        add('injury',describeEvent(row,latest.teams,names),70+Math.min(30,score(row)));
    }
    for(const feat of (delta.feats||[])) {
      const pts=validNumber(feat.pts),reb=validNumber(feat.reb),
        ast=validNumber(feat.ast),blk=validNumber(feat.blk);
      const extraordinary=pts>=35||ast>=15||reb>=20||blk>=8||
        (pts>=10&&reb>=10&&ast>=10)||score(feat)>=60;
      if(extraordinary)
        add('feat',feat.text,76+Math.min(45,score(feat)/4));
    }
    // One-point contests and overtime games, not all routine scores.
    for(const game of (delta.recentGames||[])) {
      if(game.playoffs||!(game.overtime>0||game.margin<=2))continue;
      add('game',game.label,43+Math.min(22,game.overtime*8+
        (game.margin===1?6:0)));
    }
    if(previous.season===latest.season) {
      const beforeTeams=previous.teams||{};
      const currentTeams=latest.teams||{};
      for(const [tid,team] of Object.entries(currentTeams)) {
        const old=beforeTeams[tid];
        if(!old)continue;
        const wins=validNumber(team.won)-validNumber(old.won);
        const losses=validNumber(team.lost)-validNumber(old.lost);
        if(wins>=5&&losses>=0&&wins/(wins+losses)>=.8) {
          add('standings',teamName(currentTeams,tid)+' went '+wins+'–'+losses+
            ' since the previous upload (now '+team.won+'–'+team.lost+').',
            48+Math.min(15,wins));
        }
      }
      function leader(teams) {
        const rows=Object.entries(teams||{}).map(([tid,t])=>{
          const played=validNumber(t.won)+validNumber(t.lost);
          return {tid,played,pct:played?validNumber(t.won)/played:-1};
        }).filter(x=>x.played>=5).sort((a,b)=>b.pct-a.pct||a.tid.localeCompare(b.tid));
        return rows[0]||null;
      }
      const prev=leader(beforeTeams),next=leader(currentTeams);
      if(prev&&next&&prev.tid!==next.tid)
        add('standings',teamName(currentTeams,next.tid)+
          ' moved ahead of '+teamName(beforeTeams,prev.tid)+
          ' in the league standings by winning percentage.',61);
    }
    const sorted=candidates.sort((a,b)=>b.priority-a.priority||a.index-b.index);
    const selected=[],tally={};
    for(const item of sorted){
      if((tally[item.kind]||0)>=(LIMITS[item.kind]||2))continue;
      selected.push({kind:item.kind,title:item.title});
      tally[item.kind]=(tally[item.kind]||0)+1;
      if(selected.length>=8)break;
    }
    return selected;
  }

  // Reports created before this feature already contain grouped descriptions.
  // Reuse those rather than requiring an unnecessary re-upload.
  function fromExistingReport(report) {
    const map={
      'Trades':'trade','Awards and honors':'award',
      'Injuries and recoveries':'injury','Player feats and standout performances':'feat',
      'Other league news':'league','Signings, releases and roster moves':'move',
      'Recent games':'game','Standings and team progress':'standings'
    };
    const groups=Object.fromEntries((report?.sections||[]).map(row=>[row.title,row]));
    const order=['Trades','Awards and honors','Injuries and recoveries',
      'Other league news','Player feats and standout performances',
      'Signings, releases and roster moves','Recent games','Standings and team progress'];
    const items=[];
    for(const title of order) {
      const group=groups[title];
      if(!group)continue;
      const kind=map[title];
      let seen=0;
      for(const original of group.entries||[]) {
        const line=asText(original);
        if(!line)continue;
        // A legacy report lacks feat scores, so show only obviously strong
        // performances rather than presenting every routine result as major.
        if(kind==='feat'&&!/\b(?:3[5-9]|[4-9]\d)\s*(?:pts|points)\b|triple.double|\b(?:1[5-9]|[2-9]\d)\s*ast\b/i.test(line))continue;
        if(kind==='game'&&!/overtime|\b\d+\s*OT\b/i.test(line)&&
          items.length>0)continue;
        items.push({kind,title:line});
        if(++seen>=((LIMITS[kind]||2)<2?1:2)||items.length===8)break;
      }
      if(items.length>=8)break;
    }
    return items;
  }
  function isMidseason(snapshot) {
    if(!snapshot||![1,2].includes(snapshot.phase))return false;
    const games=Object.values(snapshot.teams||{}).reduce((sum,team)=>
      sum+validNumber(team.won)+validNumber(team.lost),0);
    return games>0;
  }
  function render(report,snapshot) {
    if(!section||!feed||!context||!count)return;
    const eligible=!!report&&isMidseason(snapshot);
    section.hidden=!eligible;
    if(!eligible) {feed.replaceChildren();return;}
    const items=Array.isArray(report.majors)
      ?report.majors.slice(0,8):fromExistingReport(report);
    context.textContent='Since '+(report.olderName||'previous file')+
      ' → '+(report.newerName||'current file');
    count.textContent=items.length+' notable development'+
      (items.length===1?'':'s');
    const fragment=document.createDocumentFragment();
    for(const event of items) {
      const card=document.createElement('article');
      card.className='home-major-event';
      const kind=document.createElement('span');
      kind.className='home-major-event-type';
      kind.textContent=TYPES[event.kind]||'League update';
      const body=document.createElement('p');
      body.className='home-major-event-text';
      body.textContent=asText(event.title);
      card.append(kind,body);
      fragment.appendChild(card);
    }
    if(!items.length) {
      const empty=document.createElement('p');
      empty.className='home-major-empty';
      empty.textContent='No major developments were identified since the last upload. The complete game and transaction changes are listed below.';
      fragment.appendChild(empty);
    }
    feed.replaceChildren(fragment);
  }
  more?.addEventListener('click',()=>{
    document.querySelector('.home-updates-container')?.scrollIntoView({
      behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
        ?'instant':'smooth',block:'start'
    });
  });
  window.DBLHomeMajorEvents=Object.freeze({build,render,isMidseason,fromExistingReport});
})();