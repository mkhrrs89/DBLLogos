(() => {
  if (document.getElementById('draftProspectsTabBtn')) return;

  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = './draft-prospects.css?v=20260903-draft-prospects-persistent';
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

  header.append(heading, description);

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
  script.src = './draft-prospects.js?v=20260903-draft-prospects-persistent';
  script.dataset.dblDraftProspects = 'true';
  document.body.append(script);
})();
