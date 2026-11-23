(() => {
  if (window.DBLBarChartRace) return;
  const tab = document.getElementById('barChartRaceTabBtn');
  const panel = document.getElementById('barChartRacePanel');
  const hub = window.DBLLeagueFileHub;
  const stream = window.DBLLeagueStream;
  if (!tab || !panel || !hub || !stream) return;
  const byId = id => document.getElementById(id);
  const controls = {
    category:byId('dblRaceCategory'), metric:byId('dblRaceMetric'),
    start:byId('dblRaceStart'),end:byId('dblRaceEnd'),
    top10:byId('dblRaceTop10'),top15:byId('dblRaceTop15'),
    pin:byId('dblRacePin'),pinList:byId('dblRacePinList'),
    pinLabel:byId('dblRacePinLabel'),pinHint:byId('dblRacePinHint'),
    unpin:byId('dblRaceUnpin'),status:byId('dblRaceStatus'),
    cumulative:byId('dblRaceCumulative'),
    rows:byId('dblRaceRows'),year:byId('dblRaceYear'),
    caption:byId('dblRaceCaption'),play:byId('dblRacePlay'),
    scrub:byId('dblRaceScrub'),speed:panel.querySelector('.dbl-race-speed')
  };

  const ALL_STATS = [
    {key:'pts',label:'Points',unit:'PTS'},
    {key:'trb',label:'Rebounds',unit:'REB'},
    {key:'ast',label:'Assists',unit:'AST'},
    {key:'ws',label:'Win shares',unit:'WS',decimals:1},
    {key:'gp',label:'Games played',unit:'GP'},
    {key:'stl',label:'Steals',unit:'STL'},
    {key:'blk',label:'Blocks',unit:'BLK'},
    {key:'tp',label:'3-pointers made',unit:'3PM'},
    {key:'fg',label:'Field goals made',unit:'FGM'},
    {key:'ft',label:'Free throws made',unit:'FTM'},
    {key:'orb',label:'Offensive rebounds',unit:'OREB'},
    {key:'drb',label:'Defensive rebounds',unit:'DREB'},
    {key:'vorp',label:'VORP',unit:'VORP',decimals:1},
    {key:'ewa',label:'Estimated wins added',unit:'EWA',decimals:1},
    {key:'tov',label:'Turnovers',unit:'TOV'},
    {key:'pf',label:'Personal fouls',unit:'PF'}
  ];
  const AWARD_PRIORITY = [
    'Most Valuable Player','Won Championship','Finals MVP','Semifinals MVP',
    'Defensive Player of the Year','Rookie of the Year','Sixth Man of the Year',
    'Most Improved Player','All-Star MVP','All-Star','First Team All-League',
    'Second Team All-League','Third Team All-League','First Team All-Defensive',
    'Second Team All-Defensive','Third Team All-Defensive','All-Rookie Team',
    'Inducted into the Hall of Fame'
  ];

  const numeric = value => value === null || value === undefined || value === '' ?
    null : Number.isFinite(Number(value)) ? Number(value) : null;
  const number = value => numeric(value) ?? 0;
  const yr = value => {
    const n = numeric(value);
    return Number.isInteger(n) && n >= 1800 && n < 3000 ? n : null;
  };
  const cleanString = value => typeof value === 'string' ? value.trim() : '';
  const imageURL = value => /^https?:\/\/[^\s]+$/i.test(cleanString(value)) ? value : '';
  function color(value) {
    let str=cleanString(value);
    if (!str) return '';
    if (!str.startsWith('#')) str='#'+str;
    if (/^#[0-9a-f]{3}$/i.test(str))
      str='#'+str.slice(1).split('').map(part=>part+part).join('');
    else if (/^#[0-9a-f]{8}$/i.test(str)) str=str.slice(0,7);
    return /^#[0-9a-f]{6}$/i.test(str) ? str.toUpperCase() : '';
  }
  const fallbackColor = '#57515A'; // Neutral only when no team primary color exists.
  function onBarTextColor(hex) {
    // Choose dark ink on bright uniforms, pale ink on dark uniforms.
    // Contrast switch uses WCAG relative luminance near the midpoint.
    const channel=[1,3,5].map(i=>{
      const c=parseInt(hex.slice(i,i+2),16)/255;
      return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
    });
    const luminance=.2126*channel[0]+.7152*channel[1]+.0722*channel[2];
    return luminance>.18?'#17110D':'#FFF9F2';
  }
  function isLight(hex) {
    const rgb=[1,3,5].map(i=>{
      const c=parseInt(hex.slice(i,i+2),16)/255;
      return c<=.04045 ? c/12.92 : Math.pow((c+.055)/1.055,2.4);
    });
    return rgb[0]*.2126 + rgb[1]*.7152 + rgb[2]*.0722 > .42;
  }
  const playerName = p => cleanString(p?.name) ||
    [cleanString(p?.firstName), cleanString(p?.lastName)].filter(Boolean).join(' ') ||
    'Unknown player';
  const POSITIVE = ALL_STATS.map(s=>s.key);
  function statValue(row,key) {
    if(key==='trb') return numeric(row?.trb) ?? (number(row?.orb)+number(row?.drb));
    if(key==='ws') return numeric(row?.ws) ?? (number(row?.ows)+number(row?.dws));
    return number(row?.[key]);
  }
  const cacheByFile = new WeakMap();
  let file=null, generation=0, loading=-1, dataset=null, timer=null;
  let metricCache=null, currentYear=0, firstYear=0, lastYear=0;
  let topN=10,speed=1,pinnedId='',paused=true;
  let lastFrameTime=null,lastPaintTime=null;
  const MS_PER_SEASON=950;
  const PAINT_INTERVAL=1000/30;
  const rowNodes=new Map();
  const requestFrame=window.requestAnimationFrame ?
    callback=>window.requestAnimationFrame(callback) :
    callback=>window.setTimeout(()=>callback(Date.now()),16);
  const cancelFrame=window.cancelAnimationFrame ?
    handle=>window.cancelAnimationFrame(handle) :
    handle=>window.clearTimeout(handle);
  const rowHeight=()=>window.innerWidth<=640?44:48;

  function makeTeam(raw) {
    const tid=numeric(raw?.tid);
    if (!Number.isSafeInteger(tid)) return null;
    const playoffRows=new Map((Array.isArray(raw.stats)?raw.stats:[])
      .filter(row=>row?.playoffs && yr(row?.season)!==null)
      .map(row=>[yr(row.season),number(row.won ?? row.wins)]));
    const seasons=(Array.isArray(raw.seasons)?raw.seasons:[])
      .filter(s=>yr(s?.season)!==null)
      .map(s=>({
        year:yr(s.season),won:number(s.won),lost:number(s.lost),
        playoffWins:numeric(s.playoffWins) ?? numeric(s.playoffWon) ??
          playoffRows.get(yr(s.season)) ?? 0,
        rounds:numeric(s.playoffRoundsWon) ?? numeric(s.roundsWon),
        champ:s.champ===true || s.champion===true || s.playoffFinish==='champion',
        name:([cleanString(s.region)||cleanString(raw.region),
          cleanString(s.name)||cleanString(raw.name)].filter(Boolean).join(' ') ||
          cleanString(s.abbrev)||cleanString(raw.abbrev)||'Unknown team'),
        primary:color(Array.isArray(s.colors)?s.colors[0]:null) ||
          color(Array.isArray(raw.colors)?raw.colors[0]:null) || fallbackColor,
        logo:imageURL(s.imgURL)||imageURL(s.imgURLSmall)||
          imageURL(raw.imgURL)||imageURL(raw.imgURLSmall)
      })).sort((a,b)=>a.year-b.year);
    if (!seasons.length) return null;
    return {id:'t'+tid,tid,seasons};
  }
  function buildTeamData(rawTeams,attrs) {
    const teams=new Map();
    const roundsByYear=new Map();
    for(const raw of rawTeams) {
      const team=makeTeam(raw);
      if(!team) continue;
      teams.set(team.tid,team);
      for(const s of team.seasons) {
        if(!roundsByYear.has(s.year)) roundsByYear.set(s.year,[]);
        roundsByYear.get(s.year).push(s);
      }
    }
    const activeYear=yr(attrs?.season), activePhase=numeric(attrs?.phase);
    for(const [year,seasons] of roundsByYear) {
      const max=Math.max(0,...seasons.map(s=>s.rounds ?? -1));
      const explicit=seasons.filter(s=>s.champ);
      // A still-active season cannot have an inferred champion.
      const currentUnfinished=year===activeYear &&
        (activePhase===null || activePhase<=2);
      if(!explicit.length && !currentUnfinished && max>0){
        const finalists=seasons.filter(s=>s.rounds===max);
        if(finalists.length===1) finalists[0].champ=true;
      }
    }
    // Historical team season rows are authoritative for wins/colors/titles.
    return teams;
  }
  function makePlayer(raw) {
    const pid=numeric(raw?.pid);
    if(!Number.isSafeInteger(pid) || pid<0) return null;
    const statRows=Array.isArray(raw.stats)?raw.stats:[];
    const awards=Array.isArray(raw.awards)?raw.awards:[];
    const stats={regular:new Map(),playoffs:new Map()};
    const teamYears=new Map(),byYear=new Map();
    const careerTeams=new Map();
    for(const s of statRows){
      const year=yr(s?.season);
      if(year===null)continue;
      const key=year+'|'+(s?.playoffs?'p':'r');
      if(!byYear.has(key))byYear.set(key,[]);
      byYear.get(key).push(s);
      // When a player moved teams, use the most-played actual franchise,
      // never the summary "TOT" row, for historical jersey/bar color.
      const tid=numeric(s?.tid),games=number(s?.gp);
      const realTeam=Number.isSafeInteger(tid) && tid>=0 &&
        cleanString(s?.abbrev).toUpperCase()!=='TOT';
      if(!s?.playoffs && realTeam){
        if(!teamYears.has(year)||games>=teamYears.get(year).gp)
          teamYears.set(year,{tid,gp:games});
        const totals=careerTeams.get(tid)||{games:0,minutes:0,lastSeason:year};
        totals.games+=games;
        totals.minutes+=number(s.min);
        totals.lastSeason=Math.max(totals.lastSeason,year);
        careerTeams.set(tid,totals);
      }
    }
    for(const [key,rows] of byYear){
      const [yearText,period]=key.split('|'),year=Number(yearText);
      const group=period==='p'?stats.playoffs:stats.regular;
      // Basketball GM may include a TOT summary alongside split-team rows.
      // Counting both silently doubles a traded player's career totals.
      const total=rows.filter(row=>number(row?.tid)===-1 ||
        cleanString(row?.abbrev).toUpperCase()==='TOT');
      const counted=total.length?[total[total.length-1]]:rows;
      const values={};
      for(const row of counted)
        for(const stat of POSITIVE)
          values[stat]=(values[stat]||0)+statValue(row,stat);
      group.set(year,values);
    }
    const awardsByYear=new Map();
    for(const award of awards) {
      const year=yr(award?.season),type=cleanString(award?.type);
      if(year===null || !type) continue;
      let row=awardsByYear.get(year);
      if(!row){row=new Map();awardsByYear.set(year,row);}
      row.set(type,(row.get(type)||0)+1);
    }
    const latestTid=numeric(raw.tid);
    const majority=[...careerTeams.entries()].sort((a,b)=>
      b[1].games-a[1].games ||
      b[1].minutes-a[1].minutes ||
      b[1].lastSeason-a[1].lastSeason ||
      a[0]-b[0])[0];
    const lastPlayed=teamYears.size?Math.max(...teamYears.keys()):null;
    // Basketball GM marks retirees with retiredYear and/or tid=-3.
    // When only the retired roster marker exists, freeze after the last
    // played season rather than recoloring the final playing season.
    const retiredAt=yr(raw.retiredYear) ??
      (latestTid===-3 && lastPlayed!==null?lastPlayed+1:null);
    return {
      id:'p'+pid,pid,name:playerName(raw),image:imageURL(raw.imgURL),
      score:statRows.length*2+awards.length,
      regular:stats.regular,playoffs:stats.playoffs,awards:awardsByYear,
      teamYears:[...teamYears].sort((a,b)=>a[0]-b[0]),
      majorityTid:majority?.[0]??null,
      majorityYear:majority?.[1].lastSeason??null,
      retiredAt,
      latestTid:Number.isSafeInteger(latestTid)?latestTid:null
    };
  }
  async function build(fileObject,token) {
    if(cacheByFile.has(fileObject)) return cacheByFile.get(fileObject);
    const attrs=await stream.readTopLevelValue(fileObject,'gameAttributes')||{};
    const rawTeams=[];
    controls.status.textContent='Reading historical franchise seasons…';
    await stream.forEachTopLevelArrayItem(fileObject,'teams',team=>{
      if(token===generation) rawTeams.push(team);
    });
    if(token!==generation) return null;
    const teams=buildTeamData(rawTeams,attrs);
    rawTeams.length=0;
    if(!teams.size) throw Error('No historical team seasons found in this league file.');
    // Some BBGM exports hold playoff team wins in the top-level teamStats
    // array instead of each team's own stats. Reconcile without touching wins.
    const teamPostWins=new Map();
    await stream.forEachTopLevelArrayItem(fileObject,'teamStats',row=>{
      if(token!==generation||!row?.playoffs)return;
      const tid=numeric(row.tid),year=yr(row.season);
      if(!Number.isSafeInteger(tid)||year===null)return;
      const wins=numeric(row.won)??numeric(row.wins);
      if(wins!==null)teamPostWins.set(tid+'|'+year,wins);
    });
    if(token!==generation)return null;
    for(const team of teams.values())
      for(const season of team.seasons){
        const wins=teamPostWins.get(team.tid+'|'+season.year);
        if(wins!==undefined)season.playoffWins=wins;
      }
    controls.status.textContent='Reading player statistics and awards…';
    const players=new Map(),awardTypes=new Set();
    const addPlayer=raw=>{
      if(token!==generation) return;
      const p=makePlayer(raw);
      if(!p) return;
      const older=players.get(p.pid);
      if(older&&older.score>=p.score) {
        if(!older.image) older.image=p.image;
        if(older.retiredAt===null && p.retiredAt!==null)
          older.retiredAt=p.retiredAt;
        return;
      }
      players.set(p.pid,p);
    };
    let seenPlayers=0;
    await stream.forEachTopLevelArrayItem(fileObject,'players',raw=>{
      seenPlayers++;
      addPlayer(raw);
    });
    if(token!==generation)return null;
    if(!seenPlayers) {
      // A few older exports store people in one of the auxiliary arrays.
      for(const key of ['retiredPlayers','releasedPlayers','freeAgents']){
        await stream.forEachTopLevelArrayItem(fileObject,key,addPlayer);
        if(token!==generation)return null;
      }
    }
    for(const player of players.values())
      for(const awards of player.awards.values())
        for(const name of awards.keys())awardTypes.add(name);
    const years=[];
    for(const team of teams.values())
      for(const season of team.seasons) years.push(season.year);
    if(!years.length)throw Error('No season history found.');
    const min=Math.min(...years),max=Math.max(...years);
    // Prevent unbounded year arrays from corrupted files.
    if(max-min>300)throw Error('Season history has an unsupported date range.');
    const data={players,teams,awards:[...awardTypes],min,max};
    cacheByFile.set(fileObject,data);
    return data;
  }
  function setFile(next) {
    if(file===next)return;
    file=next;generation++;loading=-1;dataset=null;metricCache=null;
    stop();rowNodes.clear();controls.rows.replaceChildren();
    controls.year.textContent='—';
    controls.scrub.disabled=true;controls.play.disabled=true;
    controls.status.textContent=file?
      'Open Bar Chart Race to load historical rankings.' :
      'Load a league file to start the race.';
    if(file&&!panel.hidden)void load();
  }
  async function waitForMainImport(token) {
    const status=document.getElementById('statusMessage');
    const started=Date.now();
    // Avoid racing the main importer over a large compressed league file.
    while(token===generation && Date.now()-started<90000){
      const message=status?.textContent?.trim()||'';
      if(!/^(Loading|Restoring)\s/i.test(message))break;
      await new Promise(resolve=>window.setTimeout(resolve,100));
    }
  }
  async function load() {
    if(!file || panel.hidden || dataset || loading===generation)return;
    const token=generation, target=file;
    loading=token;
    try {
      await waitForMainImport(token);
      if(token!==generation)return;
      const data=await build(target,token);
      if(token!==generation||!data)return;
      dataset=data;
      firstYear=data.min;lastYear=data.max;currentYear=firstYear;
      fillYears();
      rebuildMetricOptions();
      controls.scrub.disabled=false;controls.play.disabled=false;
      controls.status.textContent='';
      refreshPinList();
      render();
    }catch(error){
      if(token!==generation)return;
      console.error('Could not build Bar Chart Race.',error);
      controls.status.textContent='Could not calculate this race from the league file. '+
        (error?.message||'Please re-upload your league file.');
    }finally{if(loading===token)loading=-1;}
  }
  function fillYears() {
    controls.start.replaceChildren();controls.end.replaceChildren();
    for(let y=dataset.min;y<=dataset.max;y++){
      for(const select of [controls.start,controls.end]){
        const option=document.createElement('option');option.value=String(y);
        option.textContent=String(y);select.appendChild(option);
      }
    }
    controls.start.value=String(dataset.min);
    controls.end.value=String(dataset.max);
    controls.scrub.min=String(dataset.min);
    controls.scrub.max=String(dataset.max);
    controls.scrub.value=String(dataset.min);
  }
  function rebuildMetricOptions() {
    const previous=controls.metric.value;
    const kind=controls.category.value;
    controls.metric.replaceChildren();
    const add=(value,label,group)=>{
      const option=document.createElement('option');option.value=value;option.textContent=label;
      (group||controls.metric).appendChild(option);
    };
    if(kind==='stats') {
      for(const playoffs of [false,true]) {
        const g=document.createElement('optgroup');
        g.label=playoffs?'Playoffs · cumulative':'Regular season · cumulative';
        for(const stat of ALL_STATS)
          add((playoffs?'post:':'reg:')+stat.key,
            (playoffs?'Playoff ':'')+stat.label,g);
        controls.metric.appendChild(g);
      }
    } else if(kind==='awards'){
      const order=[...dataset.awards].sort((a,b)=>{
        const ai=AWARD_PRIORITY.indexOf(a),bi=AWARD_PRIORITY.indexOf(b);
        return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b);
      });
      for(const award of order)add('award:'+award,award);
    }else if(kind==='wins'){
      add('wins:regular','Regular-season wins');
      add('wins:playoffs','Playoff wins');
    }else{add('titles:championships','League championships');}
    if([...controls.metric.options].some(opt=>opt.value===previous))
      controls.metric.value=previous;
    else if(kind==='stats')controls.metric.value='reg:pts';
    else if(kind==='awards' &&
      [...controls.metric.options].some(opt=>opt.value==='award:Most Valuable Player'))
      controls.metric.value='award:Most Valuable Player';
    metricCache=null;
    pinnedId='';controls.pin.value='';controls.unpin.hidden=true;
    updatePinText();
  }
  function updatePinText() {
    const team=controls.category.value==='wins'||controls.category.value==='titles';
    controls.pinLabel.textContent=team?'Pin team':'Pin player';
    controls.pin.placeholder=team?'Pin a team...':'Pin a player...';
    controls.pinHint.textContent=team?
      'Keep one franchise on the board, with its actual rank.' :
      'Keep one player on the board, with their actual rank.';
  }
  function teamAt(tid,year) {
    const team=dataset?.teams.get(tid);
    if(!team)return null;
    let item=null;
    for(const season of team.seasons){
      if(season.year>year)break;
      item=season;
    }
    return item;
  }
  function playerAt(player,year) {
    if(player.retiredAt!==null && year>=player.retiredAt &&
      player.majorityTid!==null) {
      const franchise=teamAt(player.majorityTid,player.majorityYear??year);
      if(franchise)return franchise;
    }
    let tid=null;
    for(const [season,record] of player.teamYears){
      if(season>year)break;
      tid=record.tid;
    }
    if(tid===null)tid=player.latestTid;
    return teamAt(tid,year);
  }
  function series(source,metric,start,end) {
    const result=new Float64Array(end-start+1);
    let total=0;
    for(let y=start;y<=end;y++){
      const row=source.get(y);
      if(metric.startsWith('award:'))
        total+=row instanceof Map?(row.get(metric.slice(6))||0):0;
      else
        total+=number(row?.[metric.split(':')[1]]);
      result[y-start]=total;
    }
    return result;
  }
  function prepareMetric() {
    if(!dataset)return;
    const metric=controls.metric.value,category=controls.category.value;
    if(!metric) {
      metricCache={key:'empty',metric:'',category,items:[]};
      return;
    }
    const key=category+'|'+metric+'|'+firstYear+'|'+lastYear;
    if(metricCache?.key===key)return;
    const items=[];
    if(category==='stats'||category==='awards'){
      for(const player of dataset.players.values()){
        const collection=category==='awards'?player.awards:
          metric.startsWith('post:')?player.playoffs:player.regular;
        const ys=series(collection,metric,firstYear,lastYear);
        // Keep zero-total players available for pinning even when they
        // have not yet recorded this stat or award.
        items.push({id:player.id,name:player.name,image:player.image,player,values:ys});
      }
    }else{
      for(const team of dataset.teams.values()){
        const arr=new Float64Array(lastYear-firstYear+1);
        let total=0;
        const seasonMap=new Map(team.seasons.map(s=>[s.year,s]));
        for(let y=firstYear;y<=lastYear;y++){
          const s=seasonMap.get(y);
          if(s){
            if(category==='titles')total+=s.champ?1:0;
            else if(metric==='wins:playoffs')total+=number(s.playoffWins);
            else total+=number(s.won);
          }
          arr[y-firstYear]=total;
        }
        // Teams without a title/win remain valid manual pin targets.
        items.push({id:team.id,name:'',image:'',team,values:arr});
      }
    }
    metricCache={key,metric,category,items};
  }
  function details(item,year) {
    const season=item.player?playerAt(item.player,year):teamAt(item.team.tid,year);
    return {
      name:item.player?item.name:(season?.name||item.team.seasons[0].name),
      image:item.player?item.image:(season?.logo||''),
      primary:season?.primary||fallbackColor
    };
  }
  function formatValue(value) {
    const k=controls.metric.value;
    const decimals=k==='reg:ws'||k==='post:ws'||/:(vorp|ewa)$/.test(k)?1:
      ((k.startsWith('award:')||k.startsWith('titles:')) &&
       Math.abs(value-Math.round(value))>.001 ? 1:0);
    return Number(value).toLocaleString(undefined,{minimumFractionDigits:decimals,
      maximumFractionDigits:decimals});
  }
  function unitName() {
    const metric=controls.metric.value;
    if(metric.startsWith('award:'))return 'awards';
    if(metric==='titles:championships')return 'titles';
    if(metric.startsWith('wins:'))return 'wins';
    const stat=ALL_STATS.find(s=>s.key===metric.split(':')[1]);
    return stat?.unit||'';
  }
  function valueAt(values,position=currentYear) {
    const relative=Math.max(0,Math.min(values.length-1,position-firstYear));
    const index=Math.floor(relative),fraction=relative-index;
    const start=values[index]||0,end=values[Math.min(values.length-1,index+1)]||0;
    return start+(end-start)*fraction;
  }
  function ranking() {
    prepareMetric();
    if(!metricCache)return [];
    return metricCache.items.map(item=>({...item,value:valueAt(item.values)}))
      .filter(item=>item.value>0).sort((a,b)=>b.value-a.value||
        a.id.localeCompare(b.id));
  }
  function makeAvatar(parent,image,name) {
    parent.replaceChildren();
    if(image){
      const img=document.createElement('img');img.src=image;img.alt='';
      img.loading='lazy';
      img.addEventListener('error',()=>{
        img.remove();
        if(!parent.textContent)parent.textContent=(name.match(/\b\w/g)||[]).slice(0,2).join('');
      },{once:true});
      parent.appendChild(img);
    }else parent.textContent=(name.match(/\b\w/g)||[]).slice(0,2).join('');
  }
  function getNode(id) {
    let node=rowNodes.get(id);
    if(node)return node;
    const root=document.createElement('div');root.className='dbl-race-row';
    const avatar=document.createElement('span');avatar.className='dbl-race-avatar';
    const track=document.createElement('div');track.className='dbl-race-track';
    const bar=document.createElement('span');bar.className='dbl-race-bar';
    const label=document.createElement('span');label.className='dbl-race-label';
    const name=document.createElement('span');name.className='dbl-race-name';
    const rank=document.createElement('small');rank.className='dbl-race-rank';
    label.append(name);
    const score=document.createElement('span');score.className='dbl-race-score';
    // Rank precedes the portrait. The tally lives inside the colored bar,
    // never at the far edge of the unfilled track.
    bar.appendChild(score);
    track.append(bar,label);
    root.append(rank,avatar,track);
    controls.rows.appendChild(root);
    node={root,avatar,track,bar,label,name,rank,score,image:'',avatarName:'',
      slot:null,missingSince:null};
    rowNodes.set(id,node);
    return node;
  }
  function render(frameMs=0) {
    if(!dataset || panel.hidden)return;
    prepareMetric();
    const rows=ranking(),limit=rows.slice(0,topN);
    if(pinnedId && !limit.some(row=>row.id===pinnedId)){
      const selected=rows.find(row=>row.id===pinnedId);
      const missing=metricCache.items.find(row=>row.id===pinnedId);
      if(selected)limit.push(selected);
      else if(missing)limit.push({...missing,value:valueAt(missing.values)});
    }
    const unit=unitName();
    const top=rows[0],max=Math.max(1,top?.value||0);
    const space=rowHeight();
    controls.rows.style.height=(Math.max(10,limit.length)*space+8)+'px';
    const active=new Set(),atYear=Math.floor(currentYear+1e-7);
    const now=Date.now();
    limit.forEach((entry,index)=>{
      const id=entry.id;
      active.add(id);
      const node=getNode(id);
      const info=details(entry,atYear);
      if(node.image!==info.image||node.avatarName!==info.name) {
        makeAvatar(node.avatar,info.image,info.name);
        node.image=info.image;node.avatarName=info.name;
      }
      node.name.textContent=info.name;
      const actual=rows.findIndex(row=>row.id===id);
      const rank=actual<0?'unranked':String(actual+1);
      node.rank.textContent=actual<0?'(unranked)':'#'+rank;
      node.bar.style.backgroundColor=info.primary;
      const valueText=formatValue(entry.value);
      // Keep even a tiny bar wide enough for its total. CSS min/max
      // constrains the label-bearing bar inside the actual track.
      const tallyRoom=valueText.length*(window.innerWidth<=640?7.5:8.5)+17;
      const proportionalWidth=Math.min(100,entry.value/max*100);
      node.bar.style.width='min(100%, max('+Math.ceil(Math.max(48,tallyRoom))+
        'px, '+proportionalWidth+'%))';
      node.label.style.color=isLight(info.primary)&&entry.value/max>.38?'#1A1414':'var(--text)';
      node.label.style.textShadow=isLight(info.primary)&&entry.value/max>.38?
        'none':'0 1px 2px rgba(0,0,0,.55)';
      node.score.textContent=valueText;
      node.score.style.color=onBarTextColor(info.primary);
      node.score.style.textShadow=node.score.style.color==='#FFF9F2'?
        '0 1px 2px rgba(0,0,0,.65)':'none';
      node.root.classList.toggle('is-pinned',id===pinnedId);
      node.root.style.opacity='1';
      // Smooth crossover choreography, independent of year boundaries.
      const ease=paused?1:1-Math.exp(-Math.min(100,Math.max(0,frameMs))/125);
      node.slot=node.slot===null?index:node.slot+(index-node.slot)*ease;
      node.root.style.transform='translateY('+(node.slot*space).toFixed(2)+'px)';
      node.root.setAttribute('aria-label',
        (actual<0?'Unranked ':'#'+rank+' ')+info.name+', '+valueText+' '+unit);
      node.missingSince=null;
    });
    for(const [id,node] of rowNodes){
      if(active.has(id))continue;
      if(paused){
        node.root.remove();rowNodes.delete(id);
        continue;
      }
      if(node.missingSince===null)node.missingSince=now;
      node.root.style.opacity='0';
      if(now-node.missingSince>300){
        node.root.remove();rowNodes.delete(id);
      }
    }
    controls.rows.setAttribute('aria-label',atYear+' top '+topN+' for '+
      (controls.metric.selectedOptions[0]?.textContent||'metric'));
    controls.year.textContent=String(atYear);
    controls.scrub.value=String(currentYear);
    const label=controls.metric.selectedOptions[0]?.textContent||'';
    // The descriptor is static for a chosen metric; avoid rebuilding its DOM
    // on every animation frame.
    const description=label+' counted from '+firstYear;
    if(controls.cumulative.dataset.description!==description){
      controls.cumulative.dataset.description=description;
      controls.cumulative.replaceChildren();
      const bold=document.createElement('strong');bold.textContent=label;
      controls.cumulative.append(bold,document.createTextNode(' counted from '+firstYear));
    }
    const movingTo=Math.min(lastYear,atYear+1);
    controls.caption.textContent=(currentYear>atYear+.005 && movingTo>atYear?
      'Cumulative totals progressing toward '+movingTo :
      'Totals through the end of '+atYear)+
      (pinnedId?' · Pinned entrant remains visible with their overall rank':'');
  }
  function yearsChanged(changed) {
    if(!dataset)return;
    let first=Number(controls.start.value),last=Number(controls.end.value);
    if(changed==='start'&&first>last){last=first;controls.end.value=String(last);}
    if(changed==='end'&&last<first){first=last;controls.start.value=String(first);}
    stop();
    firstYear=first;lastYear=last;
    currentYear=Math.max(firstYear,Math.min(lastYear,currentYear));
    controls.scrub.min=String(firstYear);
    controls.scrub.max=String(lastYear);
    controls.scrub.value=String(currentYear);
    metricCache=null;render();
  }
  function stop() {
    paused=true;
    if(timer!==null){cancelFrame(timer);timer=null;}
    lastFrameTime=null;lastPaintTime=null;
    controls.play.textContent='▶ Play';
    controls.play.setAttribute('aria-pressed','false');
  }
  function tick(timestamp) {
    timer=null;
    if(paused||panel.hidden||!dataset){stop();return;}
    if(!Number.isFinite(timestamp))timestamp=Date.now();
    const previous=lastFrameTime;
    const elapsed=previous===null?0:Math.min(120,Math.max(0,timestamp-previous));
    lastFrameTime=timestamp;
    currentYear=Math.min(lastYear,currentYear+elapsed*speed/MS_PER_SEASON);
    const paintDelta=lastPaintTime===null?PAINT_INTERVAL:
      Math.max(0,timestamp-lastPaintTime);
    if(paintDelta>=PAINT_INTERVAL || currentYear>=lastYear){
      render(paintDelta);
      lastPaintTime=timestamp;
    }
    if(currentYear>=lastYear){stop();render();return;}
    timer=requestFrame(tick);
  }
  function togglePlay() {
    if(!dataset)return;
    if(!paused){stop();render();return;}
    if(currentYear>=lastYear)currentYear=firstYear;
    paused=false;
    lastFrameTime=null;lastPaintTime=null;
    controls.play.textContent='Ⅱ Pause';
    controls.play.setAttribute('aria-pressed','true');
    render();
    timer=requestFrame(tick);
  }
  function refreshPinList() {
    controls.pinList.replaceChildren();
    if(!dataset)return;
    const isTeam=controls.category.value==='wins'||controls.category.value==='titles';
    const query=controls.pin.value.trim().toLowerCase();
    const sources=isTeam?[...dataset.teams.values()].map(team=>({
      id:team.id,label:team.seasons[team.seasons.length-1].name
    })):[...dataset.players.values()].map(player=>({
      id:player.id,label:player.name
    }));
    let shown=0;
    for(const record of sources){
      const label=record.label+' · '+record.id;
      if(query&&!label.toLowerCase().includes(query))continue;
      const option=document.createElement('option');
      option.value=label;
      controls.pinList.appendChild(option);
      if(++shown>=75)break;
    }
  }
  function pinFromInput() {
    if(!dataset)return;
    const query=controls.pin.value.trim();
    if(!query){pinnedId='';controls.unpin.hidden=true;render();return;}
    const isTeam=controls.category.value==='wins'||controls.category.value==='titles';
    const collection=isTeam?
      [...dataset.teams.values()].map(x=>({id:x.id,name:x.seasons[x.seasons.length-1].name})):
      [...dataset.players.values()].map(x=>({id:x.id,name:x.name}));
    const found=collection.find(x=>x.name+' · '+x.id===query)||
      collection.find(x=>x.id===query)||
      collection.find(x=>x.name.toLowerCase()===query.toLowerCase());
    if(!found)return;
    pinnedId=found.id;
    controls.pin.value=found.name+' · '+found.id;
    controls.unpin.hidden=false;
    render();
  }

  controls.category.addEventListener('change',()=>{
    stop();
    if(dataset){rebuildMetricOptions();refreshPinList();render();}
    else updatePinText();
  });
  controls.metric.addEventListener('change',()=>{stop();metricCache=null;render();});
  controls.start.addEventListener('change',()=>yearsChanged('start'));
  controls.end.addEventListener('change',()=>yearsChanged('end'));
  for(const [btn,limit] of [[controls.top10,10],[controls.top15,15]]) {
    btn.addEventListener('click',()=>{
      topN=limit;
      controls.top10.classList.toggle('is-active',limit===10);
      controls.top15.classList.toggle('is-active',limit===15);
      controls.top10.setAttribute('aria-pressed',String(limit===10));
      controls.top15.setAttribute('aria-pressed',String(limit===15));
      render();
    });
  }
  controls.play.addEventListener('click',togglePlay);
  controls.scrub.addEventListener('input',()=>{
    stop();currentYear=Number(controls.scrub.value);render();
  });
  for(const button of controls.speed.querySelectorAll('button[data-speed]')) {
    button.addEventListener('click',()=>{
      speed=Number(button.dataset.speed)||1;
      controls.speed.querySelectorAll('button').forEach(item=>{
        const active=item===button;
        item.classList.toggle('is-active',active);
        item.setAttribute('aria-pressed',String(active));
      });
      // The current animation frame reads the new multiplier immediately.
      render();
    });
  }
  controls.pin.addEventListener('input',refreshPinList);
  controls.pin.addEventListener('change',pinFromInput);
  controls.pin.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();pinFromInput();}
  });
  controls.unpin.addEventListener('click',()=>{
    pinnedId='';controls.pin.value='';controls.unpin.hidden=true;
    refreshPinList();render();
  });
  window.addEventListener('dbl:tab-change',event=>{
    if(event.detail?.panelId==='barChartRacePanel')void load();
    else stop();
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && !paused)stop();
  });
  window.addEventListener('resize',()=>{
    if(dataset&&!panel.hidden)render();
  });
  hub.subscribe(({file:next})=>setFile(next));
  setFile(hub.getCurrentFile?.()||null);
  updatePinText();controls.scrub.disabled=true;controls.play.disabled=true;
  window.DBLBarChartRace=Object.freeze({getReady:()=>Boolean(dataset),getYear:()=>currentYear});
})();