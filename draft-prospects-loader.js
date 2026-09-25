(() => {
  if (document.getElementById('draftProspectsTabBtn')) return;

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = './draft-prospects.css?v=20260924-pot65-filter';
  document.head.append(styleLink);

  const fullscreenStyle = document.createElement('style');
  fullscreenStyle.textContent = `
    @media (max-width: 820px) {
      .timeline-fullscreen-header {
        justify-content: flex-start;
      }

      .timeline-fullscreen-controls {
        flex: 1 1 auto;
        justify-content: flex-start;
      }

      #closeFullscreenBtn {
        margin-left: auto;
      }
    }
  `;
  document.head.append(fullscreenStyle);

  const tabBar = document.querySelector('.tab-bar');
  const rivalsTab = document.getElementById('rivalsTabBtn');
  const tabBtn = document.createElement('button');
  tabBtn.id = 'draftProspectsTabBtn';
  tabBtn.className = 'tab-btn';
  tabBtn.type = 'button';
  tabBtn.setAttribute('aria-selected', 'false');
  tabBtn.textContent = 'Draft Prospects';

  if (rivalsTab) rivalsTab.after(tabBtn);
  else tabBar?.append(tabBtn);

  const panel = document.createElement('section');
  panel.id = 'draftProspectsPanel';
  panel.className = 'panel draft-prospects-panel';
  panel.hidden = true;

  const header = document.createElement('div');
  header.className = 'draft-prospects-header';

  const heading = document.createElement('h2');
  heading.textContent = 'Draft Prospects';

  const description = document.createElement('p');
  description.className = 'subtle';
  description.textContent = 'Every undrafted prospect in every draft class stored in the loaded league file.';

  const searchLabel = document.createElement('label');
  searchLabel.className = 'draft-prospects-search';
  searchLabel.setAttribute('for', 'draftProspectsSearch');

  const searchText = document.createElement('span');
  searchText.textContent = 'Player search';

  const searchInput = document.createElement('input');
  searchInput.id = 'draftProspectsSearch';
  searchInput.className = 'draft-prospects-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search player names…';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.setAttribute('aria-label', 'Search draft prospects by player name');

  searchLabel.append(searchText, searchInput);

  const filterActions = document.createElement('div');
  filterActions.className = 'draft-prospects-filter-actions';

  const duplicateNamesBtn = document.createElement('button');
  duplicateNamesBtn.id = 'draftProspectsDuplicateNamesBtn';
  duplicateNamesBtn.className = 'action-btn draft-prospects-duplicate-names';
  duplicateNamesBtn.type = 'button';
  duplicateNamesBtn.setAttribute('aria-pressed', 'false');
  duplicateNamesBtn.textContent = 'Duplicate names';

  const hideLowPotentialBtn = document.createElement('button');
  hideLowPotentialBtn.id = 'draftProspectsHideLowPotentialBtn';
  hideLowPotentialBtn.className = 'action-btn draft-prospects-potential-filter';
  hideLowPotentialBtn.type = 'button';
  hideLowPotentialBtn.setAttribute('aria-pressed', 'false');
  hideLowPotentialBtn.textContent = 'Hide Pot <65';

  filterActions.append(duplicateNamesBtn, hideLowPotentialBtn);
  header.append(heading, description, searchLabel, filterActions);

  const wrap = document.createElement('div');
  wrap.id = 'draftProspectsWrap';
  wrap.className = 'draft-prospects-wrap empty-state';

  const empty = document.createElement('div');
  empty.className = 'empty-copy';
  const emptyText = document.createElement('p');
  emptyText.textContent = 'Load or re-upload a league file to show draft prospects.';
  empty.append(emptyText);
  wrap.append(empty);

  panel.append(header, wrap);

  const rivalsPanel = document.getElementById('rivalsPanel');
  const page = document.querySelector('main.page');
  if (rivalsPanel) rivalsPanel.after(panel);
  else page?.append(panel);

  const script = document.createElement('script');
  script.src = './draft-prospects.js?v=20260924-pot65-filter';
  script.dataset.dblDraftProspects = 'true';
  document.body.append(script);
})();
