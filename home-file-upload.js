(() => {
  const input = document.getElementById('homeLeagueFile');
  const clear = document.getElementById('homeClearLeagueFileBtn');
  const status = document.getElementById('homeLeagueFileStatus');
  const hub = window.DBLLeagueFileHub;
  if (!input || !clear || !status || !hub?.subscribe) return;

  // The shared hub already recognizes data-league-file-input and routes
  // Home uploads to every existing view, including persistent league storage.
  // Reset only on picker activation to allow selecting the same file again.
  input.addEventListener('click', () => { input.value = ''; });

  clear.addEventListener('click', () => {
    // Use the original Clear button: its existing app.js handler clears all
    // generated views, while the file hub also deletes the persisted file.
    const original = document.getElementById('clearLeagueFileBtn');
    if (original) original.click();
    input.value = '';
  });

  hub.subscribe(({ file, source }) => {
    if (!file) {
      status.textContent = 'No league file loaded.';
      input.value = '';
      return;
    }
    const name = typeof file.name === 'string' && file.name
      ? file.name : 'league file';
    status.textContent = (source === 'restore' || source === 'current'
      ? 'Saved league file: ' : 'Selected league file: ') + name;
  });

  // The hub's restore is asynchronous; subscription receives the restored
  // file when it is available. This also handles an existing file at startup.
  const existing = hub.getCurrentFile?.();
  if (existing) {
    status.textContent = 'Saved league file: ' + (existing.name || 'league file');
  }
})();