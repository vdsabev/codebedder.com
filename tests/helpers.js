const { expect } = require('@playwright/test');

/**
 * Opens a page with the given body HTML, loading Prism and CodeBedder after it
 * (like the README suggests). Pass `head` for extra styles, or `scripts: 'head'`
 * to load the scripts before the element is parsed.
 */
async function load(page, body, { head = '', scripts = 'body', prism = true } = {}) {
  const tags = [prism && '<script src="/prism.js"></script>', '<script src="/codebedder.js"></script>']
    .filter(Boolean)
    .join('\n');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${prism ? '<link href="/prism.css" rel="stylesheet" />' : ''}
    ${head}
    ${scripts === 'head' ? tags : ''}
  </head>
  <body style="margin: 0">
    ${body}
    ${scripts === 'body' ? tags : ''}
  </body>
</html>`;

  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  await page.route('**/__test__', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
  await page.goto('/__test__');
  await page.waitForFunction(() => [...document.querySelectorAll('code-bedder')].every((el) => el.textarea));
  return errors;
}

/** Long content that scrolls both ways in a small editor */
function longCode(lines = 40) {
  return Array.from({ length: lines }, (_, i) => `line ${String(i).padStart(2, '0')} ${'x'.repeat(i * 3)}`).join('\n');
}

/** Scrolls the editor's textarea and waits for the scroll event to be handled */
async function scrollEditor(page, selector, { top, left }) {
  await page.evaluate(
    ([selector, top, left]) =>
      new Promise((resolve) => {
        const textarea = document.querySelector(selector).textarea;
        textarea.addEventListener('scroll', () => requestAnimationFrame(() => resolve()), { once: true });
        textarea.scrollTo({ top: top === 'max' ? 1e6 : top, left: left === 'max' ? 1e6 : left });
        // No scroll event if nothing changed
        setTimeout(resolve, 200);
      }),
    [selector, top, left]
  );
}

/**
 * Measures where characters of the highlighted <code> are drawn, versus where the
 * textarea would draw them (computed from the textarea's own metrics and scroll position).
 * Returns the largest offset in pixels - 0 means the caret lines up with the text.
 */
async function misalignment(page, selector) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const { textarea, code } = el;
    const style = getComputedStyle(textarea);

    const canvas = document.createElement('canvas').getContext('2d');
    canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const charWidth = canvas.measureText('x').width;
    const lineHeight = parseFloat(style.lineHeight);

    const box = textarea.getBoundingClientRect();
    const originLeft = box.left + textarea.clientLeft + parseFloat(style.paddingLeft) - textarea.scrollLeft;
    const originTop = box.top + textarea.clientTop + parseFloat(style.paddingTop) - textarea.scrollTop;

    // Map value offsets to text nodes inside the (highlighted) code element
    const nodes = [];
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    for (let node, start = 0; (node = walker.nextNode()); start += node.length) nodes.push({ node, start });

    const lines = textarea.value.split('\n');
    const visibleTop = box.top;
    const visibleBottom = box.bottom;
    let worst = 0;
    let measured = 0;

    lines.forEach((line, row) => {
      for (const column of [0, Math.floor(line.length / 2), line.length - 1]) {
        if (column < 0 || column >= line.length) continue;

        const offset = lines.slice(0, row).join('\n').length + (row > 0 ? 1 : 0) + column;
        const { node, start } = nodes.filter((n) => n.start <= offset).pop();
        const range = document.createRange();
        range.setStart(node, offset - start);
        range.setEnd(node, offset - start + 1);
        const rect = range.getBoundingClientRect();

        const expectedLeft = originLeft + column * charWidth;
        const expectedTop = originTop + row * lineHeight + (lineHeight - rect.height) / 2;
        if (expectedTop < visibleTop || expectedTop > visibleBottom) continue;

        measured++;
        worst = Math.max(worst, Math.abs(rect.left - expectedLeft), Math.abs(rect.top - expectedTop));
      }
    });

    // Line numbers must sit on the same rows, left of the text
    const gutter = el.gutter && el.gutter.firstChild;
    if (gutter && gutter.getClientRects().length) {
      const numbers = gutter.textContent.split('\n');
      if (numbers.length !== lines.length) throw new Error(`${numbers.length} line numbers for ${lines.length} lines`);
      const node = gutter.firstChild;
      numbers.forEach((number, row) => {
        if (number !== String(row + 1)) throw new Error(`Line ${row + 1} is numbered ${number}`);
        const offset = numbers.slice(0, row).join('\n').length + (row > 0 ? 1 : 0);
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + number.length);
        const rect = range.getBoundingClientRect();
        const expectedTop = originTop + row * lineHeight + (lineHeight - rect.height) / 2;
        if (expectedTop < visibleTop || expectedTop > visibleBottom) return;
        measured++;
        worst = Math.max(worst, Math.abs(rect.top - expectedTop), Math.max(0, rect.right - box.left));
      });
    }

    if (measured === 0) throw new Error('No visible characters were measured');
    return Math.round(worst * 10) / 10;
  }, selector);
}

/** Expects text metrics of the code and textarea layers to be identical */
async function expectSameMetrics(page, selector) {
  const [code, textarea] = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize', 'whiteSpace', 'paddingTop', 'paddingLeft', 'textIndent'];
    const pick = (node) => {
      const style = getComputedStyle(node);
      return Object.fromEntries(props.map((prop) => [prop, style[prop]]));
    };
    return [pick(el.code), pick(el.textarea)];
  }, selector);
  expect(code).toEqual(textarea);
}

/** Taps on touch devices, clicks otherwise - Playwright fails if anything else is on top */
async function press(locator, testInfo, options) {
  if (testInfo.project.use.hasTouch) {
    await locator.tap(options);
  } else {
    await locator.click(options);
  }
}

module.exports = { load, longCode, scrollEditor, misalignment, expectSameMetrics, press };
