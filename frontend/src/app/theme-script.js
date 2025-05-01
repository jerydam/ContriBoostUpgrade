// This script prevents flash of wrong theme on load
export function ThemeScript() {
    const codeToRunOnClient = `
  (function() {
    try {
      const savedTheme = localStorage.getItem('theme') || 'system';
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const theme = savedTheme === 'system' ? systemTheme : savedTheme;
      document.documentElement.classList.add(theme);
    } catch (e) {
      console.error('Failed to set initial theme', e);
    }
  })()
  `
  
    return <script dangerouslySetInnerHTML={{ __html: codeToRunOnClient }} />
  }
  