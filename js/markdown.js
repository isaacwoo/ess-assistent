/* ========================================
   ESS ASSISTENT — Markdown Rendering
   ======================================== */

const Markdown = (() => {
  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang }).value; } catch {}
        }
        try { return hljs.highlightAuto(code).value; } catch {}
        return code;
      }
    });
  }

  function render(text) {
    init();
    let html = marked.parse(text);
    html = enhanceCodeBlocks(html);
    return html;
  }

  function enhanceCodeBlocks(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    temp.querySelectorAll('pre').forEach(pre => {
      const codeEl = pre.querySelector('code');
      if (!codeEl) return;

      // Detect language from class
      const classes = codeEl.className || '';
      const langMatch = classes.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : '';
      const codeText = codeEl.textContent;

      // Check if previewable
      const previewable = ['html', 'htm', 'css', 'javascript', 'js'].includes(lang.toLowerCase());

      // Build header
      const header = document.createElement('div');
      header.className = 'code-header';
      header.innerHTML = `
        <span class="code-lang">${lang || 'code'}</span>
        <span class="code-actions">
          ${previewable ? `<button class="code-action-btn preview-code-btn" title="プレビュー">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            プレビュー
          </button>` : ''}
          <button class="code-action-btn copy-code-btn" title="コピー">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            コピー
          </button>
        </span>`;

      pre.insertBefore(header, pre.firstChild);

      // Store code text for copy/preview
      pre.dataset.code = codeText;
      pre.dataset.lang = lang;
    });

    return temp.innerHTML;
  }

  // Delegate click handlers for code block buttons
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-code-btn');
    if (copyBtn) {
      const pre = copyBtn.closest('pre');
      if (pre) copyCodeToClipboard(pre.dataset.code, copyBtn);
      return;
    }

    const previewBtn = e.target.closest('.preview-code-btn');
    if (previewBtn) {
      const pre = previewBtn.closest('pre');
      if (pre) Preview.show(pre.dataset.code, pre.dataset.lang);
      return;
    }
  });

  function copyCodeToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      btn.classList.add('copied');
      const origHTML = btn.innerHTML;
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> コピー済み`;
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = origHTML;
      }, 2000);
    });
  }

  return { render };
})();
