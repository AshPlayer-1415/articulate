'use strict';
// Presentation-only examples. No product runtime, API requests or user data.
const examples = {
  build: { label: 'WHEN WE’RE BUILDING', rules: ['Start with the intended outcome.', 'Make the next step concrete.', 'Explain the tradeoff that matters.'] },
  debug: { label: 'WHEN WE’RE DEBUGGING', rules: ['Show the cause before the fix.', 'Use one small, concrete example.', 'Tell me how to verify the result.'] },
  review: { label: 'WHEN WE’RE REVIEWING', rules: ['Lead with the most important finding.', 'Explain its impact in plain language.', 'Keep uncertainties visible.'] }
};
document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    const example = examples[button.dataset.example];
    if (!example) return;
    document.querySelectorAll('[data-example]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.getElementById('example-label').textContent = example.label;
    const list = document.getElementById('example-rules');
    list.replaceChildren(...example.rules.map(text => { const item = document.createElement('li'); item.textContent = text; return item; }));
  });
});
const copyButton = document.getElementById('copy-command');
if (copyButton) copyButton.addEventListener('click', async () => {
  const text = document.getElementById('install-command').textContent;
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = 'Copied';
    status.textContent = 'Install command copied. Paste it into your own terminal.';
  } catch {
    const range = document.createRange(); range.selectNodeContents(document.getElementById('install-command'));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    status.textContent = 'Select and copy the highlighted install command.';
  }
});

// Installation guidance only. A browser cannot inspect the user's Node runtime.
const nodeCheck = document.getElementById('check-node-version');
if (nodeCheck) nodeCheck.addEventListener('click', () => {
  const input = document.getElementById('node-version').value.trim();
  const result = document.getElementById('node-version-result');
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(input);
  if (!match) { result.textContent = 'Paste a complete version, such as v24.22.3. If node is not found, install Node.js first using the link above.'; return; }
  const [major, minor, patch] = match.slice(1).map(Number);
  const minimums = {22: [23, 4], 24: [22, 2], 26: [13, 0]};
  const minimum = minimums[major];
  const ready = minimum && (minor > minimum[0] || minor === minimum[0] && patch >= minimum[1]);
  result.textContent = ready
    ? 'This Node version meets the current pilot requirement. Check npm --version next, then install Articulate below.'
    : 'This version does not meet the current pilot requirement. Install the latest Node.js 24 LTS patch, reopen your terminal, then check again. Repeating npm install under the same Node will not fix it.';
});
