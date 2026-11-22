/* Per-device, six-hour pack limits, independent of league files and cards.
   Each regular pack type starts its own fixed window on its first opening.
   Background Test is deliberately unlimited. */
(() => {
  'use strict';
  if (window.DBLCardPackLimits) return;
  const STORAGE_KEY='dbl-card-pack-limits:v1';
  const WINDOW_MS=6*60*60*1000;
  const MAX_PACKS=5;
  // Older active six-hour windows can have up to ten successful pulls.
  // Continue reading those records until they expire instead of treating
  // them as corruption (which would fail closed indefinitely).
  const LEGACY_MAX_PACKS=10;
  const CAPPED_TYPES=new Set(['mixed','topps-1968','underground-1968']);
  const isValidRecord=row=>row&&typeof row==='object'&&
    Number.isSafeInteger(row.start)&&row.start>=0&&
    Number.isInteger(row.used)&&row.used>=1&&row.used<=LEGACY_MAX_PACKS;

  function read() {
    try {
      const value=window.localStorage.getItem(STORAGE_KEY);
      if(value===null) return {windows:{}};
      const parsed=JSON.parse(value);
      if(!parsed||parsed.version!==1||!parsed.windows||
         typeof parsed.windows!=='object') throw Error('Invalid pack-limit record');
      for(const type of CAPPED_TYPES) {
        const record=parsed.windows[type];
        if(record!==undefined&&record!==null&&!isValidRecord(record))
          throw Error('Invalid pack limit for '+type);
      }
      return {windows:parsed.windows};
    } catch(error) {
      // Fail closed on corrupt/unavailable storage rather than silently
      // giving more pack openings or deleting an existing usage record.
      return {error:'Pack limits cannot be read from browser storage.'};
    }
  }

  function describe(type, now=Date.now()) {
    if(!CAPPED_TYPES.has(type)) return {
      type,unlimited:true,available:true,remaining:null,used:0,resetAt:null,
      max:MAX_PACKS,windowMs:WINDOW_MS
    };
    const state=read();
    if(state.error) return {
      type,unlimited:false,available:false,remaining:0,used:MAX_PACKS,
      resetAt:null,error:state.error,max:MAX_PACKS,windowMs:WINDOW_MS
    };
    const record=state.windows[type];
    const active=isValidRecord(record)&&
      (now<record.start||now-record.start<WINDOW_MS);
    const used=active?record.used:0;
    return {type,unlimited:false,available:used<MAX_PACKS,
      remaining:Math.max(0,MAX_PACKS-used),used,
      resetAt:active?record.start+WINDOW_MS:null,
      max:MAX_PACKS,windowMs:WINDOW_MS};
  }

  function reserve(type, now=Date.now()) {
    if(!CAPPED_TYPES.has(type))return {ok:true,unlimited:true,type};
    const state=read();
    if(state.error)return {ok:false,error:state.error,...describe(type,now)};
    const previous=state.windows[type];
    const active=isValidRecord(previous)&&
      (now<previous.start||now-previous.start<WINDOW_MS);
    const start=active?previous.start:now;
    const used=active?previous.used:0;
    if(used>=MAX_PACKS)return {ok:false,...describe(type,now)};
    const next={start,used:used+1};
    try {
      window.localStorage.setItem(STORAGE_KEY,
        JSON.stringify({version:1,windows:{...state.windows,[type]:next}}));
      return {ok:true,type,start,used:next.used};
    } catch(error) {
      return {ok:false,error:'Pack limit could not be saved. Check browser storage.'};
    }
  }

  function release(reservation) {
    if(!reservation?.ok||reservation.unlimited||!CAPPED_TYPES.has(reservation.type))
      return;
    const state=read();
    if(state.error)return;
    const current=state.windows[reservation.type];
    if(current?.start!==reservation.start||!Number.isInteger(current.used)||
      current.used<1)return;
    const windows={...state.windows};
    if(current.used===1)delete windows[reservation.type];
    else windows[reservation.type]={...current,used:current.used-1};
    try {
      window.localStorage.setItem(STORAGE_KEY,
        JSON.stringify({version:1,windows}));
    } catch(error) {
      console.warn('Could not restore pack quota after unsuccessful pull.',error);
    }
  }

  window.DBLCardPackLimits=Object.freeze({
    key:STORAGE_KEY,max:MAX_PACKS,windowMs:WINDOW_MS,
    describe,reserve,release
  });
})();