/* Read-only timeline of player and team notes from the active BBGM league. */
(() => {
  'use strict';
  const panel=document.getElementById('notesTimelinePanel');
  const wrap=document.getElementById('notesTimelineEntries');
  const summary=document.getElementById('notesTimelineSummary');
  const search=document.getElementById('notesTimelineSearch');
  const typeFilter=document.getElementById('notesTimelineType');
  const yearFilter=document.getElementById('notesTimelineYear');
  const order=document.getElementById('notesTimelineOrder');
  const more=document.getElementById('notesTimelineMore');
  const tab=document.getElementById('notesTimelineTabBtn');
  const hub=window.DBLLeagueFileHub;
  const reader=window.DBLLeagueStream;
  if (![panel,wrap,summary,search,typeFilter,yearFilter,order,more,tab].every(Boolean)
      || !reader?.forEachTopLevelArrayItem) return;
  const BATCH=80;
  let file=null,revision=0,loadedRevision=-1,loadingRevision=-1;
  let entries=[],playerNotes=0,teamNotes=0,shown=BATCH;
  const integer=v=>v===null||v===undefined||v===''||!Number.isInteger(Number(v))
    ? null:Number(v);
  const cleanNote=v=>typeof v==='string'?v.trim():'';
  const fullName=(...parts)=>parts.map(v=>String(v??'').trim()).filter(Boolean).join(' ');
  // When a file hub exists, its explicit Clear action is authoritative.
  // Never fall back to a stale file-input selection after clearing.
  const currentFile=()=>hub?.getCurrentFile
    ? (file||hub.getCurrentFile()||null)
    : (file||document.getElementById('leagueFile')?.files?.[0]||null);
  const isCurrent=(f,rev)=>currentFile()===f&&revision===rev;
  function make(tag,cls,value) {
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(value!==undefined)el.textContent=String(value);
    return el;
  }
  function message(text){wrap.replaceChildren(make('p','notes-timeline-empty',text));}
  function mentionedYears(text) {
    return [...String(text).matchAll(/\b(?:18|19|20)\d{2}\b/g)]
      .map(match=>Number(match[0]));
  }
  function startingDate(line) {
    const text=line.trim().replace(/^[“”"‘’']+/, '');
    const start=text.match(/^(?:[-•*]\s*)?(?:\(|\[)?((?:18|19|20)\d{2})(?:\)|\])?(?=\s|[:.·,—–-]|$)/);
    if(start)return {year:Number(start[1]),label:start[1],basis:'explicit'};
    const month=text.match(/^(?:[-•*]\s*)?(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.?|Feb\.?|Mar\.?|Apr\.?|Jun\.?|Jul\.?|Aug\.?|Sep\.?|Sept\.?|Oct\.?|Nov\.?|Dec\.?)\s+(\d{1,2}),?\s+((?:18|19|20)\d{2})\b/i);
    if(month)return {year:Number(month[3]),
      label:month[1].slice(0,3)+' '+Number(month[2])+', '+month[3],basis:'explicit'};
    const intro=text.match(/^(?:[-•*]\s*)?(?:In|During|By|Around|After|From|Early in|Late in)\s+(?:the\s+)?((?:18|19|20)\d{2})\b/i);
    if(intro)return {year:Number(intro[1]),label:intro[1],basis:'explicit'};
    return null;
  }
  function dateFor(text) {
    const first=text.split('\n').find(line=>line.trim())||'';
    const heading=startingDate(first);
    if(heading)return heading;
    const years=[...new Set(mentionedYears(text))];
    return years.length===1
      ? {year:years[0],label:String(years[0]),basis:'mentioned'}:null;
  }
  function playerSections(note) {
    const original=cleanNote(note).replace(/\r\n?/g,'\n');
    if(!original)return [];
    const lines=original.split('\n');
    const dated=lines.map((line,i)=>startingDate(line)?i:-1).filter(i=>i>=0);
    if(!dated.length||(dated.length===1&&dated[0]===0))
      return [{text:original,date:dateFor(original)}];
    const starts=[0,...dated].filter((v,i,arr)=>i===0||v!==arr[i-1]);
    const segments=[];
    for(let i=0;i<starts.length;i++){
      const chunk=lines.slice(starts[i],starts[i+1]??lines.length).join('\n').trim();
      if(chunk)segments.push({text:chunk,date:dateFor(chunk)});
    }
    return segments;
  }
  function addEntry(collection,type,name,text,date,detail) {
    collection.push({key:collection.length,type,name,text,year:date?.year??null,
      label:date?.label||'',basis:date?.basis||'',detail:detail||''});
  }
  function populateYears() {
    const existing=yearFilter.value;
    const years=[...new Set(entries.map(e=>e.year).filter(Number.isInteger))]
      .sort((a,b)=>b-a);
    yearFilter.replaceChildren();
    const all=make('option','','All years');all.value='all';yearFilter.appendChild(all);
    for(const year of years) {
      const option=make('option','',year);option.value=String(year);
      yearFilter.appendChild(option);
    }
    const unknown=make('option','','Undated notes');unknown.value='undated';
    yearFilter.appendChild(unknown);
    yearFilter.value=existing==='undated'||years.some(y=>String(y)===existing)
      ?existing:'all';
  }
  function acceptFile(next) {
    if(file===next)return;
    file=next||null;
    revision+=1;loadedRevision=-1;loadingRevision=-1;
    entries=[];playerNotes=0;teamNotes=0;shown=BATCH;yearFilter.value='all';
    if(!file) {
      summary.textContent='No league file loaded.';
      message('Upload a league file to explore its player and team notes.');
    } else if(!panel.hidden)void load();
  }
  if(hub?.subscribe)hub.subscribe(({file:f})=>acceptFile(f));
  else document.getElementById('leagueFile')?.addEventListener('change',ev=>
    acceptFile(ev.target.files?.[0]||null));
  tab.addEventListener('click',()=>void load());
  window.addEventListener('dbl:tab-change',ev=>{
    if(ev.detail?.panelId==='notesTimelinePanel')void load();
  });
  for(const el of [search,typeFilter,yearFilter,order]) {
    el.addEventListener(el===search?'input':'change',()=>{shown=BATCH;render();});
  }
  more.addEventListener('click',()=>{shown+=BATCH;render();});

  async function load() {
    const chosen=currentFile();
    if(!chosen) {
      summary.textContent='No league file loaded.';
      message('Upload a .json or .json.gz league file to view its notes.');
      return;
    }
    const token=revision;
    if(loadedRevision===token){render();return;}
    if(loadingRevision===token)return;
    loadingRevision=token;
    summary.textContent='Reading player notes…';
    message('Building the timeline from notes in this league file…');
    const collected=[];
    let players=0,teams=0;
    try {
      await reader.forEachTopLevelArrayItem(chosen,'players',player=>{
        if(!isCurrent(chosen,token))return;
        const note=cleanNote(player?.note);
        if(!note)return;
        players++;
        const label=fullName(player?.firstName,player?.lastName)||
          fullName(player?.name)||'Player '+(integer(player?.pid)??'?');
        const pid=integer(player?.pid);
        const detail=pid===null?'':'Player #'+pid;
        for(const part of playerSections(note))
          addEntry(collected,'player',label,part.text,part.date,detail);
      });
      if(!isCurrent(chosen,token))return;
      summary.textContent='Reading team and season notes…';
      await reader.forEachTopLevelArrayItem(chosen,'teams',team=>{
        if(!isCurrent(chosen,token))return;
        const label=fullName(team?.region,team?.name)||
          'Team '+(integer(team?.tid)??'?');
        const teamNote=cleanNote(team?.note);
        if(teamNote){
          teams++;
          addEntry(collected,'team',label,teamNote,dateFor(teamNote),'Franchise note');
        }
        for(const season of Array.isArray(team?.seasons)?team.seasons:[]) {
          const text=cleanNote(season?.note);
          if(!text)continue;
          teams++;
          const year=integer(season?.season);
          const date=year===null?dateFor(text):
            {year,label:String(year),basis:'season'};
          const historical=fullName(season?.region??team?.region,
            season?.name??team?.name)||label;
          addEntry(collected,'team',historical,text,date,
            year===null?'Team note':'Recorded for '+year);
        }
      });
      if(!isCurrent(chosen,token))return;
      entries=collected;playerNotes=players;teamNotes=teams;
      loadedRevision=token;
      populateYears();
      render();
    }catch(error){
      if(!isCurrent(chosen,token))return;
      console.error('Could not scan player/team notes',error);
      summary.textContent='Unable to read notes from this league export.';
      message('Could not load notes. Try uploading the league file again.');
    }finally{
      if(loadingRevision===token)loadingRevision=-1;
    }
  }
  function filtered() {
    const query=search.value.trim().toLocaleLowerCase();
    const type=typeFilter.value||'all',year=yearFilter.value||'all';
    const matching=entries.filter(entry=>
      (type==='all'||entry.type===type)&&
      (year==='all'||(year==='undated'
        ?entry.year===null:String(entry.year)===year))&&
      (!query||(entry.name+' '+entry.text+' '+entry.detail)
        .toLocaleLowerCase().includes(query)));
    const oldest=order.value==='oldest';
    matching.sort((a,b)=>{
      if(a.year===null||b.year===null){
        if(a.year===null&&b.year!==null)return 1;
        if(b.year===null&&a.year!==null)return -1;
      }
      if(a.year!==b.year)return oldest?a.year-b.year:b.year-a.year;
      return a.key-b.key;
    });
    return matching;
  }
  function addYearHeading(container,year) {
    container.appendChild(make('h3','notes-timeline-year',
      year===null?'Undated notes':String(year)));
    if(year===null)container.appendChild(make('p','notes-timeline-undated-hint',
      'No unambiguous year was recorded. Original notes remain unchanged.'));
  }
  function addCard(container,entry) {
    const card=make('article','notes-timeline-item is-'+entry.type);
    const head=make('div','notes-timeline-eyebrow');
    head.appendChild(make('span','notes-timeline-kind',
      entry.type==='team'?'Team':'Player'));
    if(entry.basis==='mentioned')
      head.appendChild(make('span','notes-timeline-date-hint','Year mentioned'));
    else if(entry.basis==='season')
      head.appendChild(make('span','notes-timeline-date-hint','Team season'));
    else if(entry.label)
      head.appendChild(make('span','notes-timeline-date-hint',entry.label));
    card.appendChild(head);
    card.appendChild(make('h4','notes-timeline-name',entry.name));
    if(entry.detail)
      card.appendChild(make('p','notes-timeline-source',entry.detail));
    card.appendChild(make('div','notes-timeline-text',entry.text));
    container.appendChild(card);
  }
  function render(){
    if(loadedRevision!==revision)return;
    const list=filtered();
    summary.textContent=playerNotes+' player notes · '+teamNotes+
      ' team notes · '+entries.length+' timeline entries · '+list.length+' matching';
    wrap.replaceChildren();
    if(!list.length){
      message(entries.length?'No notes match those filters.':
        'This export contains no player or team notes.');
      more.hidden=true;return;
    }
    const timeline=make('div','notes-timeline-list');
    let last=undefined;
    for(const entry of list.slice(0,shown)){
      if(last!==entry.year){addYearHeading(timeline,entry.year);last=entry.year;}
      addCard(timeline,entry);
    }
    wrap.appendChild(timeline);
    more.hidden=list.length<=shown;
    more.textContent='Show '+Math.min(BATCH,list.length-shown)+
      ' more ('+Math.max(0,list.length-shown)+' remaining)';
  }
  if(!currentFile()){
    summary.textContent='No league file loaded.';
    message('Upload a league file to explore its notes.');
  }
})();