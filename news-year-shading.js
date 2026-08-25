(() => {
  const newsWrap = document.getElementById('newsWrap');
  if (!newsWrap) return;

  function applyYearShading() {
    newsWrap.querySelectorAll('.news-item').forEach((item) => {
      const yearText = item.querySelector('.news-season')?.textContent || '';
      const year = Number(yearText.trim());
      item.classList.toggle('news-alt-year', Number.isFinite(year) && Math.abs(year) % 2 === 1);
    });
  }

  const observer = new MutationObserver(() => applyYearShading());
  observer.observe(newsWrap, { childList: true, subtree: true });

  applyYearShading();
})();
