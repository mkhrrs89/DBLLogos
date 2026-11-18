/* League-independent personal notes. No league upload/clear handler touches this key. */
(() => {
  const KEY = 'dbl-home-notes:v1';
  const FORMAT = 'dbl-home-notes';
  const MAX_LENGTH = 120000;
  const editor = document.getElementById('homeNotesText');
  const save = document.getElementById('homeNotesSave');
  const exportButton = document.getElementById('homeNotesExport');
  const importButton = document.getElementById('homeNotesImport');
  const input = document.getElementById('homeNotesImportFile');
  const status = document.getElementById('homeNotesStatus');
  if (!editor || !save || !exportButton || !importButton || !input) return;

  let timer = null;
  let dirty = false;
  const report = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  function readNotes() {
    try { return localStorage.getItem(KEY) || ''; }
    catch (error) { report('Could not access saved notes on this browser.', true); return ''; }
  }
  function writeNotes() {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (editor.value.length > MAX_LENGTH) {
      report('Notes exceed the 120,000-character storage limit.', true);
      return false;
    }
    try {
      localStorage.setItem(KEY, editor.value);
      dirty = false;
      report('Saved on this device · independent of league files');
      return true;
    } catch (error) {
      report('Could not save notes. Export a copy before leaving this page.', true);
      return false;
    }
  }
  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function loadImportedNotes(text, source) {
    if (typeof text !== 'string' || text.length > MAX_LENGTH)
      throw new Error('The imported notes are missing or too large.');
    if (dirty && !writeNotes()) throw new Error('Save or export your current notes before importing.');
    if (editor.value && editor.value !== text
      && !window.confirm('Replace your current notes with the imported notes?'))
      return false;
    // One atomic storage write before updating the visible editor.
    localStorage.setItem(KEY, text);
    editor.value = text;
    dirty = false;
    report('Imported notes from ' + source + ' · saved on this device');
    return true;
  }

  editor.value = readNotes();
  report('Saved locally · included in Saved Links backups');
  editor.addEventListener('input', () => {
    dirty = true;
    report('Saving…');
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(writeNotes, 500);
  });
  save.addEventListener('click', writeNotes);
  exportButton.addEventListener('click', () => {
    if (!writeNotes()) return;
    download(JSON.stringify({format: FORMAT, version: 1, exportedAt: new Date().toISOString(),
      notes: editor.value}, null, 2),
      'dbl-home-notes-' + new Date().toISOString().slice(0, 10) + '.json',
      'application/json');
    report('Notes exported and saved.');
  });
  importButton.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_LENGTH * 4) throw new Error('This notes file is too large.');
      const raw = await file.text();
      let notes = raw;
      if (/\.json$/i.test(file.name) || raw.trimStart().startsWith('{')) {
        const parsed = JSON.parse(raw);
        if (parsed?.format === FORMAT) notes = parsed.notes;
        else if (parsed?.format === 'dbl-saved-links' && typeof parsed.notes === 'string')
          notes = parsed.notes;
        else throw new Error('Choose a DBL Notes or Saved Links backup.');
      }
      loadImportedNotes(notes, file.name);
    } catch (error) { report('Import failed: ' + (error?.message || 'Invalid notes file'), true); }
  });
  window.addEventListener('dbl:saved-links-imported', event => {
    if (!event.detail?.notes) return;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    editor.value = readNotes();
    dirty = false;
    report('Notes restored from your Saved Links backup.');
  });
  // The backup exporter reads this same durable key, not a potentially stale
  // copy tied to the active league or a cached Home component.
  window.DBLHomeNotes = Object.freeze({storageKey: KEY, save: writeNotes, read: readNotes});
})();
