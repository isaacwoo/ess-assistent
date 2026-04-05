/* ========================================
   ESS ASSISTENT — Code Preview Panel
   ======================================== */

const Preview = (() => {
  function show(code, lang) {
    const panel = document.getElementById('preview-panel');
    const iframe = document.getElementById('preview-iframe');

    let htmlContent = '';
    const langLower = (lang || '').toLowerCase();

    if (langLower === 'html' || langLower === 'htm') {
      htmlContent = code;
    } else if (langLower === 'css') {
      htmlContent = `<!DOCTYPE html><html><head><style>${code}</style></head><body><p>CSSプレビュー — HTMLを追加してスタイルを確認できます。</p></body></html>`;
    } else if (langLower === 'javascript' || langLower === 'js') {
      htmlContent = `<!DOCTYPE html><html><head></head><body><pre id="output"></pre><script>
try {
  // Capture console.log
  const _log = [];
  const origLog = console.log;
  console.log = (...args) => { _log.push(args.map(String).join(' ')); origLog.apply(console, args); };
  ${code}
  if (_log.length) document.getElementById('output').textContent = _log.join('\\n');
} catch(e) {
  document.getElementById('output').textContent = 'エラー: ' + e.message;
}
<\/script></body></html>`;
    }

    // If no valid content, wrap as generic HTML
    if (!htmlContent) {
      htmlContent = `<pre>${code}</pre>`;
    }

    iframe.srcdoc = htmlContent;
    panel.style.display = 'flex';
  }

  function hide() {
    const panel = document.getElementById('preview-panel');
    panel.style.display = 'none';
  }

  // Close button
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('preview-close-btn').addEventListener('click', hide);
  });

  return { show, hide };
})();
