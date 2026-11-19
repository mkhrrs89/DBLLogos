/* User-authored, league-independent ongoing storylines.
   Cards and order are durable in browser storage and Saved Links backups.
   Pointer drag supports iPhone without relying on desktop HTML5 drag events. */
(() => {
  'use strict';
  if (window.DBLStorylines) return;
  const KEY='dbl-storylines:v1';
  const MAX_TEXT=1200;
  const MAX_ITEMS=1000;
  const form=document.getElementById('storylinesForm');
  const input=document.getElementById('storylinesInput');
  const list=document.getElementById('storylinesList');
  const count=document.getElementById('storylinesCount');
  const status=document.getElementById('storylinesStatus');
  const add=document.getElementById('storylinesAdd');
  if(!form||!input||!list||!count||!status||!add)return;
  let items=[];
  let canSave=true,activeDrag=null;

  function validateSnapshot(raw) {
    if(!raw||raw.version!==1||!Array.isArray(raw.items)||
       raw.items.length>MAX_ITEMS)
      throw Error('Invalid Storylines backup data.');
    const seen=new Set();
    const cleaned=raw.items.map(row=>{
      if(!row||typeof row!=='object'||
         typeof row.id!=='string'||!/^[-\w:.]{1,96}$/.test(row.id)||
         seen.has(row.id)||typeof row.text!=='string'||
         !row.text.trim()||row.text.length>MAX_TEXT)
        throw Error('Invalid storyline entry in backup.');
      seen.add(row.id);
      const createdAt=Number.isSafeInteger(row.createdAt)&&row.createdAt>=0
        ?row.createdAt:0;
      return {id:row.id,text:row.text.trim(),createdAt};
    });
    return {version:1,items:cleaned};
  }
  function snapshot(){return {version:1,items:items.map(x=>({...x}))};}
  function read() {
    const raw=localStorage.getItem(KEY);
    return raw===null?{version:1,items:[]}:validateSnapshot(JSON.parse(raw));
  }
  function report(message,isError=false) {
    status.textContent=message;
    status.classList.toggle('is-error',isError);
  }
  function save(next,description) {
    if(!canSave) {
      report('Saved Storylines could not be read. Back up the existing data before editing.',true);
      return false;
    }
    try {
      const clean=validateSnapshot({version:1,items:next});
      localStorage.setItem(KEY,JSON.stringify(clean));
      items=clean.items;
      render();
      report(description||'Saved on this browser.');
      return true;
    }catch(error){
      report('Could not save Storylines. Your previous saved entries remain unchanged.',true);
      return false;
    }
  }
  function make(tag,cls,value) {
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(value!==undefined)node.textContent=String(value);
    return node;
  }
  function makeButton(text,cls,label) {
    const button=make('button',cls,text);
    button.type='button';
    if(label)button.setAttribute('aria-label',label);
    return button;
  }
  function makeId() {
    if(typeof window.crypto?.randomUUID==='function')return window.crypto.randomUUID();
    return 'sl-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,13);
  }
  function moveBy(id,delta) {
    const from=items.findIndex(x=>x.id===id);
    const to=from+delta;
    if(from<0||to<0||to>=items.length)return;
    const next=items.slice();
    next.splice(to,0,...next.splice(from,1));
    if(save(next,'Storyline order saved.')) {
      const grip=Array.from(list.querySelectorAll('.storylines-grip'))
        .find(node=>node.closest('.storylines-card')?.dataset.id===id);
      grip?.focus({preventScroll:true});
    }
  }
  function beginEdit(card,row) {
    if(activeDrag)return;
    const body=card.querySelector('.storylines-body');
    if(!body||body.querySelector('textarea'))return;
    const previous=body.textContent;
    const editForm=make('form','storylines-edit-form');
    const editor=make('textarea','storylines-edit-input');
    editor.value=row.text;
    editor.rows=Math.min(7,Math.max(3,row.text.split('\n').length));
    editor.maxLength=MAX_TEXT;
    editor.setAttribute('aria-label','Edit storyline');
    const actions=make('div','storylines-edit-actions');
    const saveButton=make('button','storylines-action is-save','Save');
    saveButton.type='submit';
    const cancel=makeButton('Cancel','storylines-action','Cancel editing');
    cancel.addEventListener('click',()=>{
      body.replaceChildren(make('p','storylines-copy',previous));
      card.querySelector('.storylines-edit-button')?.focus({preventScroll:true});
    });
    editForm.addEventListener('submit',event=>{
      event.preventDefault();
      const value=editor.value.trim();
      if(!value) {report('Enter a storyline before saving.',true);editor.focus();return;}
      const next=items.map(item=>item.id===row.id?{...item,text:value}:item);
      save(next,'Storyline updated.');
    });
    actions.append(saveButton,cancel);
    editForm.append(editor,actions);
    body.replaceChildren(editForm);
    editor.focus({preventScroll:true});
  }
  function erase(row) {
    if(activeDrag)return;
    if(!window.confirm('Delete this storyline?'))return;
    save(items.filter(x=>x.id!==row.id),'Storyline deleted.');
  }
  function cardFor(row,index) {
    const card=make('article','storylines-card');
    card.dataset.id=row.id;
    card.setAttribute('aria-label','Storyline '+(index+1));
    const meta=make('div','storylines-card-meta');
    const grab=makeButton('⠿','storylines-grip',
      'Drag to reorder storyline '+(index+1)+'. Use Alt and arrow keys to move with a keyboard.');
    grab.title='Drag to reorder · Alt + ↑ / ↓';
    grab.dataset.id=row.id;
    grab.addEventListener('pointerdown',ev=>startDrag(ev,card,grab,row.id));
    grab.addEventListener('keydown',ev=>{
      if(ev.altKey&&(ev.key==='ArrowUp'||ev.key==='ArrowDown')) {
        ev.preventDefault();
        moveBy(row.id,ev.key==='ArrowUp'?-1:1);
      }
    });
    meta.appendChild(grab);
    meta.appendChild(make('span','storylines-card-number',
      String(index+1).padStart(2,'0')));
    const controls=make('div','storylines-card-controls');
    const edit=makeButton('Edit','storylines-action storylines-edit-button','Edit storyline '+(index+1));
    edit.addEventListener('click',()=>beginEdit(card,row));
    const del=makeButton('Delete','storylines-action storylines-delete-button','Delete storyline '+(index+1));
    del.addEventListener('click',()=>erase(row));
    controls.append(edit,del);
    meta.appendChild(controls);
    card.appendChild(meta);
    const body=make('div','storylines-body');
    body.appendChild(make('p','storylines-copy',row.text));
    card.appendChild(body);
    return card;
  }
  function render() {
    if(activeDrag)cancelDrag();
    const fragment=document.createDocumentFragment();
    if(items.length===0){
      fragment.appendChild(make('p','storylines-empty',
        'No ongoing storylines yet. Add the first plot your league is following.'));
    }else{
      items.forEach((row,index)=>fragment.appendChild(cardFor(row,index)));
    }
    list.replaceChildren(fragment);
    count.textContent=items.length+' ongoing storyline'+(items.length===1?'':'s');
    add.disabled=!canSave||items.length>=MAX_ITEMS;
  }
  function chooseDrop(clientY) {
    const drag=activeDrag;
    if(!drag)return;
    const others=Array.from(list.querySelectorAll('.storylines-card'))
      .filter(card=>card!==drag.card);
    if(drag.target)drag.target.classList.remove('drop-before','drop-after');
    drag.target=null;
    drag.to=drag.from;
    if(!others.length)return;
    let target=null,distance=Infinity;
    for(const card of others){
      const rect=card.getBoundingClientRect();
      const dy=Math.abs(clientY-(rect.top+rect.height/2));
      if(dy<distance) {distance=dy;target=card;}
    }
    if(!target)return;
    const rect=target.getBoundingClientRect();
    const before=clientY<rect.top+rect.height/2;
    const index=Array.from(list.children).indexOf(target);
    // Translate the gap index into an index after removing the dragged card.
    let to=index+(before?0:1);
    if(to>drag.from)to--;
    drag.to=Math.max(0,Math.min(items.length-1,to));
    drag.target=target;
    if(drag.to!==drag.from)
      target.classList.add(before?'drop-before':'drop-after');
  }
  function onDragMove(event) {
    const drag=activeDrag;
    if(!drag||event.pointerId!==drag.pointerId)return;
    if(event.cancelable)event.preventDefault();
    drag.lastY=event.clientY;
    const delta=event.clientY-drag.startY;
    drag.card.style.transform='translate3d(0,'+delta+'px,0)';
    chooseDrop(event.clientY);
  }
  function scrollDuringDrag(){
    const drag=activeDrag;
    if(!drag)return;
    const zone=75;
    const height=window.innerHeight||0;
    const top=drag.lastY;
    let step=0;
    if(height>0&&top<zone)step=-Math.min(17,(zone-top)*.20);
    else if(height>0&&top>height-zone)step=Math.min(17,(top-(height-zone))*.20);
    if(step) {
      window.scrollBy(0,step);
      chooseDrop(drag.lastY);
    }
    if(activeDrag)drag.raf=window.requestAnimationFrame(scrollDuringDrag);
  }
  function detachDrag(drag) {
    document.removeEventListener('pointermove',onDragMove);
    document.removeEventListener('pointerup',onDragFinish);
    document.removeEventListener('pointercancel',onDragCancel);
    if(drag.raf!==null)window.cancelAnimationFrame?.(drag.raf);
    drag.target?.classList.remove('drop-before','drop-after');
    drag.card.classList.remove('is-dragging');
    drag.card.style.transform='';
    drag.handle.classList.remove('is-grabbing');
    if(drag.handle.hasPointerCapture?.(drag.pointerId)) {
      try{drag.handle.releasePointerCapture(drag.pointerId);}catch(_){}
    }
    activeDrag=null;
  }
  function cancelDrag(){
    const drag=activeDrag;if(drag)detachDrag(drag);
  }
  function onDragFinish(event) {
    const drag=activeDrag;
    if(!drag||event.pointerId!==drag.pointerId)return;
    const from=drag.from,to=drag.to;
    const id=drag.id;
    detachDrag(drag);
    if(from===to)return;
    const next=items.slice();
    const [moved]=next.splice(from,1);
    next.splice(to,0,moved);
    if(save(next,'Storyline order saved.')) {
      const handle=Array.from(list.querySelectorAll('.storylines-grip'))
        .find(node=>node.closest('.storylines-card')?.dataset.id===id);
      handle?.focus({preventScroll:true});
    }
  }
  function onDragCancel(event) {
    if(activeDrag&&event.pointerId===activeDrag.pointerId)cancelDrag();
  }
  function startDrag(event,card,handle,id) {
    if(!canSave||activeDrag||event.button!==0||!event.isPrimary)return;
    const index=items.findIndex(row=>row.id===id);
    if(index<0)return;
    if(event.cancelable)event.preventDefault();
    activeDrag={
      id,card,handle,from:index,to:index,target:null,
      pointerId:event.pointerId,startY:event.clientY,lastY:event.clientY,raf:null
    };
    card.classList.add('is-dragging');
    handle.classList.add('is-grabbing');
    try{handle.setPointerCapture?.(event.pointerId);}catch(_){}
    document.addEventListener('pointermove',onDragMove,{passive:false});
    document.addEventListener('pointerup',onDragFinish);
    document.addEventListener('pointercancel',onDragCancel);
    if(typeof window.requestAnimationFrame==='function')
      activeDrag.raf=window.requestAnimationFrame(scrollDuringDrag);
  }

  form.addEventListener('submit',event=>{
    event.preventDefault();
    const body=input.value.trim();
    if(!body) {report('Type a storyline before adding it.',true);input.focus();return;}
    if(items.length>=MAX_ITEMS){report('The storyline collection has reached its limit.',true);return;}
    const next=[...items,{id:makeId(),text:body,createdAt:Date.now()}];
    if(save(next,'Storyline added and saved.')) {
      input.value='';
      input.focus({preventScroll:true});
    }
  });
  window.addEventListener('storage',event=>{
    if(event.key!==KEY)return;
    try {
      const next=read();
      canSave=true;
      items=next.items;
      cancelDrag();
      render();
      report('Storylines refreshed from another browser tab.');
    }catch(error){
      canSave=false;cancelDrag();render();
      report('Saved Storylines cannot be read. Existing storage was not overwritten.',true);
    }
  });
  window.addEventListener('dbl:saved-links-imported',event=>{
    if(!event.detail?.storylines)return;
    try{
      const next=read();canSave=true;items=next.items;cancelDrag();render();
      report('Storylines restored from your Saved Links backup.');
    }catch(error){
      canSave=false;cancelDrag();render();
      report('Imported Storylines could not be read; existing storage was not overwritten.',true);
    }
  });
  try{
    items=read().items;
    report('Saved locally · included in Saved Links backups.');
  }catch(error){
    canSave=false;
    report('Existing Storylines could not be read. They were left untouched.',true);
  }
  render();
  window.DBLStorylines=Object.freeze({
    storageKey:KEY,validateSnapshot,snapshot,
  });
})();