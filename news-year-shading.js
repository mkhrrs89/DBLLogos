(() => {
  const newsWrap = document.getElementById('newsWrap');
  if (!newsWrap) return;

  // Keep the chronological feed flat so existing HTML saves and restores stay
  // compatible. Insert visible year boundaries as siblings of news articles.
  function getStoryYear(item) {
    const season = item.querySelector('.news-season');
    const stored = season?.dataset?.season;
    const yearText = stored !== undefined && stored !== ''
      ? stored
      : season?.querySelector('.news-season-year')?.textContent
        || season?.textContent?.match(/\d{4}/)?.[0]
        || '';
    const year = Number(yearText);
    return Number.isInteger(year) && year > 0 ? String(year) : '';
  }

  function createYearDivider(year) {
    const divider = document.createElement('div');
    divider.className = 'news-year-divider';
    divider.dataset.newsYear = year;
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-label', 'News from ' + year);
    const label = document.createElement('span');
    label.className = 'news-year-label';
    label.textContent = year;
    divider.appendChild(label);
    return divider;
  }

  function decorateFeed() {
    const stories = newsWrap.querySelectorAll('.news-item');
    let previousYear = null;

    for (const story of stories) {
      // Remove any old alternating-year classes left in saved HTML.
      story.classList.remove('news-alt-year');
      // The persisted feed contains the exact news type label, so old saved
      // memorials get the same treatment as newly generated death stories.
      const type = story.querySelector('.news-type')?.textContent?.trim()?.toLowerCase();
      story.classList.toggle('news-memorial', type === 'in memoriam');
      // Include previously cached News items, while retaining their stored
      // year for the year dividers and chronological grouping.
      story.classList.toggle('news-single-game',
        type === 'single-game record' || type === 'single-game record chase');

      const year = getStoryYear(story);
      const existingDivider = story.previousElementSibling?.classList?.contains('news-year-divider')
        ? story.previousElementSibling : null;
      if (year && year !== previousYear) {
        if (!existingDivider || existingDivider.dataset.newsYear !== year) {
          if (existingDivider) existingDivider.remove();
          story.parentNode.insertBefore(createYearDivider(year), story);
        }
      } else if (existingDivider) {
        // Avoid stale/duplicate dividers when upgrading saved News markup.
        existingDivider.remove();
      }
      if (year) previousYear = year;
    }
  }

  // A feed render or an IndexedDB restore replaces the wrap's direct
  // children. Observe those changes only, not mutations inside each story.
  // Our own inserted dividers trigger one extra idempotent check at most.
  const observer = new MutationObserver(decorateFeed);
  observer.observe(newsWrap, { childList: true });
  decorateFeed();
})();