(() => {
  if (window.DBLShortcuts) return;
  const router = window.DBLTabRouter;
  const nav = document.querySelector('.tab-bar');
  const folder = document.getElementById('shortcutsTabGroup');
  const menu = document.getElementById('shortcutsMenu');
  const count = document.getElementById('shortcutsCount');
  const button = document.getElementById('addShortcutBtn');
  const status = document.getElementById('shortcutStatus');
  if (!router || !nav || !folder || !menu || !count || !button) return;

  const KEY = 'dbl-shortcuts:v1';
  const LIMIT = 100;
  const pages = new Map([...nav.querySelectorAll('button.tab-btn[id]')]
    .filter(tab => document.getElementById(router.getPanelId(tab)))
    .map(tab => [tab.id, tab]));
  const cardTabs = new Map([...document.querySelectorAll('#cardsPanel .dbl-cards-subtab[id]')]
    .map(tab => [tab.id, tab]));
  const itemKey = item => item.tabId + '|' + (item.subtabId || '');
  const itemName = item => {
    const page = pages.get(item.tabId)?.textContent?.trim() || 'Page';
    return item.subtabId
      ? page + ' · ' + (cardTabs.get(item.subtabId)?.textContent?.trim() || 'Cards')
      : page;
  };

  // Accept only actual app pages, never arbitrary selectors, URLs or commands.
  function validateSnapshot(value) {
    if (!Array.isArray(value) || value.length > LIMIT)
      throw Error('Invalid Shortcuts backup.');
    const clean = [], seen = new Set();
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          typeof item.tabId !== 'string' || !pages.has(item.tabId))
        throw Error('Shortcuts backup contains an unknown page.');
      if (Object.hasOwn(item, 'subtabId') &&
          item.subtabId !== null && typeof item.subtabId !== 'string')
        throw Error('Shortcuts backup contains an invalid subpage.');
      const subtabId = item.subtabId || '';
      if (subtabId && (item.tabId !== 'cardsTabBtn' || !cardTabs.has(subtabId)))
        throw Error('Shortcuts backup contains an unknown subpage.');
      const entry = subtabId ? {tabId:item.tabId, subtabId} : {tabId:item.tabId};
      if (seen.has(itemKey(entry))) continue;
      seen.add(itemKey(entry));
      clean.push(entry);
    }
    return clean;
  }
  const load = () => validateSnapshot(JSON.parse(localStorage.getItem(KEY) || '[]'));
  function safeLoad() {
    try { return load(); }
    catch (error) {
      console.warn('Could not read Shortcuts.', error);
      if (status) status.textContent = 'Saved Shortcuts could not be loaded.';
      return [];
    }
  }
  let pinned = safeLoad();

  function current() {
    const tabId = router.getActiveTabId() || nav.querySelector('.tab-btn.active')?.id;
    if (!pages.has(tabId)) return null;
    if (tabId === 'cardsTabBtn') {
      const selected = [...cardTabs.values()].find(tab =>
        tab.getAttribute('aria-selected') === 'true');
      if (selected) return {tabId, subtabId:selected.id};
    }
    return {tabId};
  }
  function reflect() {
    const page = current();
    const saved = page && pinned.some(entry => itemKey(entry) === itemKey(page));
    button.disabled = !page;
    button.setAttribute('aria-pressed', String(Boolean(saved)));
    button.textContent = saved ? '★ Remove shortcut' : '☆ Add as shortcut';
    button.title = !page ? 'Open a page to pin it' :
      (saved ? 'Remove ' : 'Add ') + itemName(page) + (saved ? ' from' : ' to') + ' Shortcuts';
    folder.classList.toggle('has-pinned-current', Boolean(saved));
  }
  function goTo(entry) {
    const target = pages.get(entry.tabId);
    if (!target) return;
    folder.open = false;
    target.click(); // Run all of the page's original click handlers.
    if (entry.subtabId) {
      // The main router navigates in a microtask before the Cards subtab click.
      window.queueMicrotask(() => cardTabs.get(entry.subtabId)?.click());
    }
    window.scrollTo(0, 0);
  }
  function render() {
    menu.replaceChildren();
    if (!pinned.length) {
      const empty = document.createElement('p');
      empty.className = 'dbl-shortcuts-empty';
      empty.textContent = 'No shortcuts yet. Open a page and tap Add as shortcut.';
      menu.appendChild(empty);
    }
    for (const entry of pinned) {
      const row = document.createElement('div');
      row.className = 'dbl-shortcut-row';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'dbl-shortcut-open';
      open.textContent = itemName(entry);
      open.title = 'Open ' + itemName(entry);
      open.addEventListener('click', () => goTo(entry));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'dbl-shortcut-remove';
      remove.textContent = '×';
      remove.title = 'Remove shortcut';
      remove.setAttribute('aria-label', 'Remove ' + itemName(entry) + ' shortcut');
      remove.addEventListener('click', () => {
        if (save(pinned.filter(item => itemKey(item) !== itemKey(entry))) && status)
          status.textContent = '';
      });
      row.append(open, remove);
      menu.appendChild(row);
    }
    count.textContent = String(pinned.length);
    count.hidden = !pinned.length;
    reflect();
  }
  function save(value) {
    try {
      const clean = validateSnapshot(value);
      localStorage.setItem(KEY, JSON.stringify(clean));
      pinned = clean;
      render();
      return true;
    } catch (error) {
      console.warn('Could not save Shortcuts.', error);
      if (status) status.textContent = 'Could not save Shortcuts on this device.';
      return false;
    }
  }
  button.addEventListener('click', () => {
    const page = current();
    if (!page) return;
    const exists = pinned.some(item => itemKey(item) === itemKey(page));
    const next = exists ? pinned.filter(item => itemKey(item) !== itemKey(page)) :
      [...pinned, page];
    if (save(next) && status) status.textContent = '';
  });
  window.addEventListener('dbl:tab-change', reflect);
  // Also track programmatic Cards subtab changes, not just mouse clicks.
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(reflect);
    for (const tab of cardTabs.values())
      observer.observe(tab, {attributes:true,attributeFilter:['aria-selected']});
  }
  window.addEventListener('storage', event => {
    if (event.key === KEY) { pinned = safeLoad(); render(); }
  });
  window.addEventListener('dbl:saved-links-imported', event => {
    if (event.detail?.shortcuts) { pinned = safeLoad(); render(); }
  });
  window.DBLShortcuts = Object.freeze({
    validateSnapshot,
    exportSnapshot: () => load(),
    getPinned: () => pinned.map(item => ({...item}))
  });
  render();
})();