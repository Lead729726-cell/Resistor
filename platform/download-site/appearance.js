(() => {
  const key = 'resistor.download.theme';
  try {
    const saved = localStorage.getItem(key);
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  } catch { /* The system theme remains available without browser storage. */ }

  const ready = () => {
    const button = document.querySelector('button[data-theme]');
    const dark = () => document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const label = () => {
      if (!button) return;
      button.textContent = dark() ? '라이트 모드' : '다크 모드';
      button.setAttribute('aria-label', dark() ? '라이트 모드로 변경' : '다크 모드로 변경');
    };
    button?.addEventListener('click', () => {
      const theme = dark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem(key, theme); } catch { /* Current selection still works. */ }
      label();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
    label();

    const menu = document.querySelector('[data-wb-menu]');
    const navigation = document.getElementById('wb-navigation');
    const closeMenu = () => { menu?.setAttribute('aria-expanded', 'false'); navigation?.removeAttribute('data-open'); };
    menu?.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      navigation?.toggleAttribute('data-open', open);
    });
    navigation?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
    });

    const pdkSearch = document.querySelector('[data-pdk-search]');
    if (pdkSearch) {
      const input = pdkSearch.querySelector('input');
      const select = pdkSearch.querySelector('select');
      const filter = () => {
        const terms = input.value.trim().normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
        let count = 0;
        for (const card of document.querySelectorAll('[data-pdk-entry]')) {
          const shown = (!select.value || card.dataset.category === select.value)
            && terms.every(term => card.dataset.search.includes(term));
          card.hidden = !shown;
          if (shown) count++;
        }
        for (const section of document.querySelectorAll('[data-pdk-category]')) section.hidden = !section.querySelector('[data-pdk-entry]:not([hidden])');
        document.querySelector('[data-pdk-count]').textContent = count + '개 자료';
        document.querySelector('[data-pdk-empty]').hidden = count !== 0;
      };
      pdkSearch.addEventListener('submit', event => { event.preventDefault(); filter(); });
      pdkSearch.addEventListener('input', filter);
      pdkSearch.addEventListener('change', filter);
      pdkSearch.addEventListener('reset', () => requestAnimationFrame(filter));
      filter();
    }

    const lesson = document.querySelector('main[data-lesson]');
    if (lesson && !lesson.querySelector('.wb-lesson-outline')) {
      const outline = document.createElement('details');
      outline.className = 'wb-lesson-outline';
      const summary = document.createElement('summary'); summary.textContent = '이 실습의 내용'; outline.append(summary);
      const nav = document.createElement('nav'); nav.setAttribute('aria-label', '실습 목차');
      lesson.querySelectorAll(':scope > section > h2').forEach((heading, index) => {
        if (!heading.id) heading.id = 'lesson-section-' + (index + 1);
        const link = document.createElement('a'); link.href = '#' + heading.id; link.textContent = heading.textContent; nav.append(link);
      });
      if (nav.childElementCount) { outline.append(nav); lesson.querySelector('.lesson-tools')?.before(outline); }
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, {once: true});
  else ready();
})();
