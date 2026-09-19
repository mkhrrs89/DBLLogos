(() => {
  const newsWrap = document.getElementById('newsWrap');
  if (!newsWrap) return;

  function applyYearShading() {
    newsWrap.querySelectorAll('.news-item').forEach((item) => {
      const seasonNode = item.querySelector('.news-season');
      const dataYear = Number(seasonNode?.dataset?.season);
      const yearText = seasonNode?.textContent || '';
      const fallbackMatch = yearText.match(/-?\d+/);
      const fallbackYear = fallbackMatch ? Number(fallbackMatch[0]) : NaN;
      const year = Number.isFinite(dataYear) ? dataYear : fallbackYear;
      item.classList.toggle('news-alt-year', Number.isFinite(year) && Math.abs(year) % 2 === 1);
    });
  }

  const observer = new MutationObserver(() => applyYearShading());
  observer.observe(newsWrap, { childList: true, subtree: true });

  applyYearShading();
})();
