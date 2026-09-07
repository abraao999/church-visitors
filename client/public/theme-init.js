(() => {
  try {
    const stored = localStorage.getItem('church-visitors-theme');
    const dark =
      stored === 'dark' ||
      (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.style.colorScheme = 'dark';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#12151c');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  } catch (_) {}
})();
