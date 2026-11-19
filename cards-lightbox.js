/* Animated, non-destructive card zoom.
   Moves the original card DOM node instead of duplicating images, signatures,
   foil, flip state, or Background Test processing. */
(() => {
  'use strict';
  if (window.DBLCardLightbox) return;
  let active=null;

  const reducedMotion=()=>
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

  function node(tag,cls,text) {
    const el=document.createElement(tag);
    if(cls) el.className=cls;
    if(text!==undefined) el.textContent=text;
    return el;
  }
  function position(rect) {
    return {left:rect.left,top:rect.top,width:rect.width,height:rect.height};
  }
  function motion(frame,fromRect,toRect,duration,done) {
    const dx=fromRect.left-toRect.left;
    const dy=fromRect.top-toRect.top;
    const sx=fromRect.width/toRect.width;
    const sy=fromRect.height/toRect.height;
    if(!(sx>0&&sy>0) || !Number.isFinite(dx+dy+sx+sy) ||
       duration===0) {done?.();return null;}
    const transforms=[
      'translate3d('+dx+'px,'+dy+'px,0) scale('+sx+','+sy+')',
      'translate3d(0,0,0) scale(1,1)'
    ];
    if(typeof frame.animate==='function') {
      const animation=frame.animate([
        {transform:transforms[0]},{transform:transforms[1]}
      ],{duration,easing:'cubic-bezier(.2,.77,.25,1)',fill:'both'});
      if(done) animation.onfinish=done;
      return animation;
    }
    // Keep the zoom animation working if Web Animations is unavailable.
    frame.style.transform=transforms[0];
    frame.style.transition='none';
    frame.offsetWidth; // flush initial layout before the transition
    frame.style.transition='transform '+duration+'ms cubic-bezier(.2,.77,.25,1)';
    window.requestAnimationFrame?.(()=>{frame.style.transform=transforms[1];});
    if(done) window.setTimeout(done,duration+32);
    return null;
  }
  function restore(session,focus=true) {
    if(session.done)return;
    session.done=true;
    session.openingAnimation?.cancel();
    session.closingAnimation?.cancel();
    if(session.placeholder.isConnected) {
      session.placeholder.replaceWith(session.card);
      if(focus)session.card.focus({preventScroll:true});
    } else {
      // A collection re-render may have removed the original slot. In that
      // case the new collection render owns the visible replacement.
      session.card.remove();
    }
    session.overlay.remove();
    document.body.style.overflow=session.oldOverflow;
    if(active===session)active=null;
    window.dispatchEvent?.(new Event('dbl:card-lightbox-close'));
  }

  function close(immediate=false) {
    const session=active;
    if(!session||session.closing)return;
    session.closing=true;
    session.openingAnimation?.cancel();
    session.overlay.classList.remove('is-open');
    if(immediate||reducedMotion()||!session.placeholder.isConnected) {
      restore(session,!immediate);
      return;
    }
    const source=position(session.frame.getBoundingClientRect());
    const destination=position(session.placeholder.getBoundingClientRect());
    // Reverse the exact original viewport-to-card animation.
    const dx=destination.left-source.left,dy=destination.top-source.top;
    const sx=destination.width/source.width,sy=destination.height/source.height;
    if(!(sx>0&&sy>0)||!Number.isFinite(dx+dy+sx+sy)) {
      restore(session);return;
    }
    if(typeof session.frame.animate==='function') {
      session.closingAnimation=session.frame.animate([
        {transform:'translate3d(0,0,0) scale(1,1)'},
        {transform:'translate3d('+dx+'px,'+dy+'px,0) scale('+sx+','+sy+')'}
      ],{duration:280,easing:'cubic-bezier(.35,0,.6,1)',fill:'forwards'});
      session.closingAnimation.onfinish=()=>restore(session);
    } else {
      session.frame.style.transition='transform 280ms cubic-bezier(.35,0,.6,1)';
      session.frame.style.transform='translate3d('+dx+'px,'+dy+'px,0) scale('+sx+','+sy+')';
      window.setTimeout(()=>restore(session),312);
    }
  }

  function open(card) {
    if(!card||!card.parentNode)return false;
    if(active) {
      if(active.card===card)return true;
      close(true);
    }
    const rect=position(card.getBoundingClientRect());
    if(!(rect.width>0&&rect.height>0))return false;
    const placeholder=node('div','dbl-cards-card dbl-cards-lightbox-placeholder');
    placeholder.setAttribute('aria-hidden','true');
    placeholder.tabIndex=-1;
    placeholder.dataset.cardId=card.dataset.cardId;
    placeholder.dataset.cardName=card.dataset.cardName;

    const overlay=node('div','dbl-cards-lightbox');
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Enlarged basketball card. Tap the card to flip; tap outside or press Escape to close.');
    const backdrop=node('div','dbl-cards-lightbox-backdrop');
    backdrop.setAttribute('aria-hidden','true');
    const frame=node('div','dbl-cards-lightbox-frame');
    const hint=node('p','dbl-cards-lightbox-hint',
      'Tap card to flip · Tap outside to close');
    overlay.append(backdrop,frame,hint);

    card.replaceWith(placeholder);
    card.classList.remove('dbl-cards-appearing');
    frame.appendChild(card);
    const oldOverflow=document.body.style.overflow;
    document.body.appendChild(overlay);
    const session={card,placeholder,overlay,frame,oldOverflow,
      done:false,closing:false,openingAnimation:null,closingAnimation:null};
    active=session;
    document.body.style.overflow='hidden';
    overlay.addEventListener('click',event=>{
      if(active===session&&!card.contains(event.target))close();
    });
    const frameRect=position(frame.getBoundingClientRect());
    const duration=reducedMotion()?0:340;
    session.openingAnimation=motion(frame,rect,frameRect,duration);
    window.requestAnimationFrame?.(()=>{
      if(active===session&&!session.closing)overlay.classList.add('is-open');
    });
    if(duration===0)overlay.classList.add('is-open');
    card.focus({preventScroll:true});
    window.dispatchEvent?.(new Event('dbl:card-lightbox-open'));
    return true;
  }
  // Escape dismisses the lightbox. Tab stays within the active card, so
  // offscreen pack/collection controls cannot steal keyboard focus.
  document.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.key==='Escape') {
      event.preventDefault();
      close();
    } else if(event.key==='Tab') {
      const card=active.card;
      const controls=[card,...card.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), '+
        'input:not([disabled]):not([tabindex="-1"]), '+
        '[tabindex="0"]'
      )].filter((el,i,list)=>list.indexOf(el)===i&&el.getClientRects().length);
      if(!controls.length){event.preventDefault();card.focus();return;}
      const current=controls.indexOf(document.activeElement);
      const next=event.shiftKey
        ? (current<=0?controls.length-1:current-1)
        : (current<0||current>=controls.length-1?0:current+1);
      event.preventDefault();controls[next].focus();
    }
  });
  window.DBLCardLightbox=Object.freeze({
    open,close,isOpen:card=>!!active&&active.card===card,
    get container(){return active?.frame||null;}
  });
})();