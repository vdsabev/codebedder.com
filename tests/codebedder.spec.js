const { test, expect } = require('@playwright/test');
const { load, longCode, scrollEditor, misalignment, expectSameMetrics, press } = require('./helpers');

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const code = longCode();
const editor = (attributes = '', content = code) =>
  `<code-bedder id="editor" ${attributes} data-language="javascript" onhighlight="Prism.highlightElement(this)">${escape(content)}</code-bedder>`;

test.describe('interaction', () => {
  test('pointer input anywhere inside the border and padding reaches the textarea or line numbers', async ({ page }, testInfo) => {
    await load(page, editor('style="height: 200px; width: 300px; padding: 12px; border: 3px solid"'));

    const misses = await page.evaluate(() => {
      const el = document.querySelector('#editor');
      const box = el.getBoundingClientRect();
      const inset = 3 + 12;
      const misses = [];
      for (let x = box.left + inset; x < box.right - inset; x += 20) {
        for (let y = box.top + inset; y < box.bottom - inset; y += 20) {
          const hit = document.elementFromPoint(x, y);
          const inGutter = el.gutter.firstChild.getBoundingClientRect().right > x && el.gutter.firstChild.getBoundingClientRect().bottom > y;
          if (inGutter ? !el.gutter.contains(hit) : hit !== el.textarea) misses.push([x, y]);
        }
      }
      return misses;
    });
    expect(misses).toEqual([]);

    const textarea = page.locator('#editor textarea');
    for (const position of [{ x: 60, y: 2 }, { x: 150, y: 100 }, { x: 220, y: 170 }]) {
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      // Playwright refuses to click if another element (e.g. the code layer) would receive it
      await press(textarea, testInfo, { position });
      await expect(textarea).toBeFocused();
    }
  });

  test('typing updates the value, the highlighted code and fires input', async ({ page }, testInfo) => {
    await load(page, editor('style="height: 200px; width: 300px"', 'const a = 1;'));
    await page.evaluate(() => {
      window.inputs = 0;
      document.querySelector('#editor').on('input', () => window.inputs++);
    });

    await press(page.locator('#editor textarea'), testInfo);
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\nlet b = 2;');

    const result = await page.evaluate(() => {
      const el = document.querySelector('#editor');
      return { value: el.value, code: el.code.textContent, tokens: el.code.querySelectorAll('.token').length, inputs: window.inputs };
    });
    expect(result.value).toBe('const a = 1;\nlet b = 2;');
    expect(result.code).toBe(result.value);
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.inputs).toBeGreaterThan(0);
  });

  test('clicking a line number puts the caret at the start of that line', async ({ page }, testInfo) => {
    await load(page, editor('style="height: 200px; width: 300px"'));
    await scrollEditor(page, '#editor', { top: 100, left: 'max' });
    // The middle of line 8 (row 7), accounting for padding and scroll
    const point = await page.evaluate(() => {
      const { gutter, textarea } = document.querySelector('#editor');
      const style = getComputedStyle(textarea);
      return { x: gutter.clientWidth / 2, y: parseFloat(style.paddingTop) + 7.5 * parseFloat(style.lineHeight), row: 7 };
    });
    await press(page.locator('#editor > div > div > div'), testInfo, { position: { x: point.x, y: point.y } });
    await expect(page.locator('#editor textarea')).toBeFocused();
    const caret = await page.evaluate(() => {
      const { textarea } = document.querySelector('#editor');
      return { start: textarea.selectionStart, end: textarea.selectionEnd, row: textarea.value.slice(0, textarea.selectionStart).split('\n').length - 1, column: textarea.value.slice(0, textarea.selectionStart).split('\n').pop().length };
    });
    expect(caret).toEqual({ start: caret.end, end: caret.end, row: point.row, column: 0 });
  });

  test('Enter keeps the indentation of the current line and can be undone', async ({ page }, testInfo) => {
    await load(page, editor('style="height: 200px; width: 300px"', 'if (a) {\n  \tb();\n}'));
    const textarea = page.locator('#editor textarea');
    const value = () => page.evaluate(() => document.querySelector('#editor').value);

    await press(textarea, testInfo);
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('c();');
    expect(await value()).toBe('if (a) {\n  \tb();\n  \tc();\n}');
    expect(await page.evaluate(() => document.querySelector('#editor').code.textContent)).toBe(await value());

    // Splitting inside the indentation keeps only what's before the caret
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect(await value()).toBe('if (a) {\n  \tb();\n \n  \tc();\n}');

    // Unindented lines get a plain newline
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    expect(await value()).toBe('if (a) {\n  \tb();\n \n  \tc();\n}\n');

    for (let i = 0; i < 2; i++) await page.keyboard.press('ControlOrMeta+z');
    expect(await value()).toBe('if (a) {\n  \tb();\n  \tc();\n}');

    // Read-only editors aren't changed
    await page.evaluate(() => document.querySelector('#editor').setAttribute('readonly', ''));
    await page.keyboard.press('Enter');
    expect(await value()).toBe('if (a) {\n  \tb();\n  \tc();\n}');
  });

  test('scrolling with the mouse wheel keeps the text aligned', async ({ page }, testInfo) => {
    test.skip(!!testInfo.project.use.isMobile, 'No mouse wheel on mobile');
    await load(page, editor('style="height: 200px; width: 300px"'));
    await page.locator('#editor textarea').hover();
    await page.mouse.wheel(40, 120);
    await expect.poll(() => page.evaluate(() => document.querySelector('#editor').textarea.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => misalignment(page, '#editor')).toBeLessThanOrEqual(1);
  });
});

test.describe('alignment', () => {
  const scenarios = {
    'Prism highlighting': { attributes: 'style="height: 200px; width: 300px"' },
    'without line numbers': { attributes: 'style="height: 200px; width: 300px" line-numbers="off"' },
    'no highlighter': { body: `<code-bedder id="editor" style="height: 200px; width: 300px">${escape(code)}</code-bedder>` },
    'padding and border on the host': { attributes: 'style="height: 200px; width: 300px; padding: 17px 9px; border: 3px solid red"' },
    'display: block on the host': { attributes: 'style="height: 200px; width: 300px; display: block"' },
    'display: inline-block on the host': { attributes: 'style="height: 200px; width: 300px; display: inline-block"' },
    'display: grid on the host': { attributes: 'style="height: 200px; width: 300px; display: grid"' },
    'custom variables': {
      attributes:
        'style="height: 200px; width: 300px; --code-bedder-font-size: 19px; --code-bedder-padding: 3px 7px; --code-bedder-line-height: 2; --code-bedder-font-family: monospace"',
    },
    'hostile page styles': {
      attributes: 'style="height: 200px; width: 300px"',
      head: `<style>
        pre, code, textarea { font: 30px/3 serif !important; padding: 9px; margin: 5px; letter-spacing: 2px; border: 4px solid; }
        pre[class*='language-'] { padding: 3em; overflow: auto; }
        code[class*='language-'] { line-height: 2.5; font-family: cursive; tab-size: 8; }
      </style>`,
    },
    'inside a shadow root': {
      body: '<div id="host"></div>',
      setup: (page) =>
        page.evaluate((code) => {
          const root = document.querySelector('#host').attachShadow({ mode: 'open' });
          const el = document.createElement('code-bedder');
          el.id = 'editor';
          el.style.cssText = 'height: 200px; width: 300px';
          el.textContent = code;
          root.append(el);
          window.__shadowEditor = el;
        }, code),
      selector: '#host',
    },
  };

  for (const [name, { attributes, body, head, setup, selector }] of Object.entries(scenarios)) {
    test(name, async ({ page }) => {
      await load(page, body || editor(attributes), { head });
      if (setup) {
        await setup(page);
        // Point the helpers at the editor inside the shadow root
        await page.evaluate(() => {
          const original = document.querySelector.bind(document);
          document.querySelector = (s) => (s === '#host' ? window.__shadowEditor : original(s));
        });
      }
      const target = selector || '#editor';

      await expectSameMetrics(page, target);
      expect(await misalignment(page, target)).toBeLessThanOrEqual(1);

      await scrollEditor(page, target, { top: 150, left: 40 });
      expect(await misalignment(page, target)).toBeLessThanOrEqual(1);

      await scrollEditor(page, target, { top: 'max', left: 'max' });
      expect(await misalignment(page, target)).toBeLessThanOrEqual(1);
    });
  }

  test('a trailing newline can be scrolled to', async ({ page }) => {
    await load(page, editor('style="height: 100px; width: 300px"', longCode(10) + '\n'));
    await scrollEditor(page, '#editor', { top: 'max', left: 0 });
    expect(await misalignment(page, '#editor')).toBeLessThanOrEqual(1);
  });
});

test.describe('layout', () => {
  const autoHeightLayouts = {
    'on its own': editor('style="width: 300px"', longCode(12)),
    'in a grid with a min-height (like the homepage)': `<section style="display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); min-height: 100px; width: 600px">
      ${editor('', longCode(12))}
      <iframe style="width: 100%; height: 100%; border: 0"></iframe>
    </section>`,
  };

  for (const [name, body] of Object.entries(autoHeightLayouts)) {
    test(`auto height fits the content without scrolling - ${name}`, async ({ page }) => {
      await load(page, body);
      const sizes = await page.evaluate(() => {
        const { textarea } = document.querySelector('#editor');
        const lines = textarea.value.split('\n').length;
        return { client: textarea.clientHeight, scroll: textarea.scrollHeight, content: lines * parseFloat(getComputedStyle(textarea).lineHeight) };
      });
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
      expect(sizes.client).toBeGreaterThanOrEqual(sizes.content);
    });
  }

  test('external CSS overrides the default host styles', async ({ page }) => {
    await load(page, editor(), { head: '<style>code-bedder { height: 123px; background-color: rgb(1, 2, 3); }</style>' });
    const style = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('#editor'));
      return { height: s.height, background: s.backgroundColor };
    });
    expect(style).toEqual({ height: '123px', background: 'rgb(1, 2, 3)' });
  });

  test('CSS variables can be set on an ancestor', async ({ page }) => {
    await load(page, editor(), { head: '<style>:root { --code-bedder-font-size: 21px; --code-bedder-padding: 5px; }</style>' });
    const style = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('#editor').textarea);
      return { fontSize: s.fontSize, padding: s.paddingTop };
    });
    expect(style).toEqual({ fontSize: '21px', padding: '5px' });
  });

  test('styles are injected once per document', async ({ page }) => {
    await load(page, editor() + editor().replace('id="editor"', 'id="other"'));
    expect(await page.locator('style[data-code-bedder]').count()).toBe(1);
  });
});

test.describe('API', () => {
  test('renders without errors when the script is in the head', async ({ page }) => {
    const errors = await load(page, editor('', 'const a = 1;'), { scripts: 'head' });
    expect(errors).toEqual([]);
    await expect.poll(() => page.evaluate(() => document.querySelector('#editor').value)).toBe('const a = 1;');
  });

  test('ignores a single leading newline', async ({ page }) => {
    await load(page, '<code-bedder id="editor">\nfirst\nsecond</code-bedder>');
    expect(await page.evaluate(() => document.querySelector('#editor').value)).toBe('first\nsecond');
  });

  test('moving the element in the DOM keeps its value', async ({ page }) => {
    await load(page, editor('', 'const a = 1;') + '<div id="target"></div>');
    const result = await page.evaluate(() => {
      const el = document.querySelector('#editor');
      el.value = 'changed';
      document.querySelector('#target').append(el);
      return { value: el.value, textareas: el.querySelectorAll('textarea').length };
    });
    expect(result).toEqual({ value: 'changed', textareas: 1 });
  });

  test('value set before rendering and before upgrade is kept', async ({ page }) => {
    await page.route('**/__early__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<body><script>
          const el = document.createElement('code-bedder');
          el.value = 'early';
          el.onhighlight = (code) => code.setAttribute('data-custom', 'yes');
          document.body.append(el);
        </script><script src="/codebedder.js"></script></body>`,
      })
    );
    await page.goto('/__early__');
    const result = await page.evaluate(() => {
      const el = document.querySelector('code-bedder');
      return { value: el.value, highlighted: el.code.getAttribute('data-custom') };
    });
    expect(result).toEqual({ value: 'early', highlighted: 'yes' });
  });

  test('load callbacks run whether registered before or after loading', async ({ page }) => {
    await load(page, editor());
    expect(await page.evaluate(() => new Promise((resolve) => document.querySelector('#editor').on('load', resolve)).then(() => true))).toBe(true);
  });

  test('setting value updates the highlighted code', async ({ page }) => {
    await load(page, editor());
    const code = await page.evaluate(() => {
      const el = document.querySelector('#editor');
      el.value = 'let x = 1;';
      return el.code.textContent;
    });
    expect(code).toBe('let x = 1;');
  });

  test('onhighlight function property and re-highlighting (highlight.js style)', async ({ page }) => {
    await load(page, editor());
    const calls = await page.evaluate(() => {
      const el = document.querySelector('#editor');
      let calls = 0;
      el.onhighlight = (code) => {
        // highlight.js skips elements that are already marked as highlighted
        if (code.hasAttribute('data-highlighted')) return;
        code.setAttribute('data-highlighted', 'yes');
        calls++;
      };
      el.value = 'a';
      el.value = 'b';
      return calls;
    });
    expect(calls).toBe(3);
  });

  test('attributes are forwarded and kept in sync', async ({ page }) => {
    await load(page, editor('placeholder="Type here" readonly aria-label="Code"'));
    const textarea = page.locator('#editor textarea');
    await expect(textarea).toHaveAttribute('placeholder', 'Type here');
    await expect(textarea).toHaveAttribute('readonly', '');
    await expect(textarea).toHaveAttribute('aria-label', 'Code');

    await page.evaluate(() => {
      const el = document.querySelector('#editor');
      el.setAttribute('placeholder', 'Changed');
      el.removeAttribute('readonly');
      el.setAttribute('data-language', 'css');
    });
    await expect(textarea).toHaveAttribute('placeholder', 'Changed');
    await expect(textarea).not.toHaveAttribute('readonly');
    await expect(page.locator('#editor code')).toHaveClass(/language-css/);
  });

  test('line numbers can be turned off and on', async ({ page }) => {
    await load(page, editor('style="height: 200px; width: 300px" line-numbers="off"'));
    const gutter = page.locator('#editor > div > div');
    const layout = () =>
      page.evaluate(() => {
        const { gutter, pre, textarea } = document.querySelector('#editor');
        return { textarea: textarea.getBoundingClientRect().left, code: pre.getBoundingClientRect().left, gutterHeight: gutter.clientHeight, textareaHeight: textarea.clientHeight };
      });
    await expect(gutter).toBeHidden();
    expect(await layout()).toMatchObject({ textarea: 0, code: 0 });
    expect(await misalignment(page, '#editor')).toBeLessThanOrEqual(1);

    await page.evaluate(() => document.querySelector('#editor').removeAttribute('line-numbers'));
    await expect(gutter).toBeVisible();
    const on = await layout();
    // The scrollbar spans the line numbers too, which stop above it
    expect(on.textarea).toBe(0);
    expect(on.code).toBeGreaterThan(0);
    expect(on.gutterHeight).toBeLessThanOrEqual(on.textareaHeight);
    // The scrollbar is painted below the line numbers, not their background
    const [scrollbar, numbers] = await page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const { gutter, textarea } = document.querySelector('#editor');
      const scale = image.width / document.querySelector('#editor').offsetWidth;
      const pixel = (x, y) => [...context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data].join();
      return [pixel(4, textarea.offsetHeight - 2), pixel(4, gutter.clientHeight / 2)];
    }, (await page.locator('#editor').screenshot()).toString('base64'));
    expect(scrollbar).not.toBe(numbers);
    expect(await misalignment(page, '#editor')).toBeLessThanOrEqual(1);
  });

  test('the highlighted copy is hidden from assistive technology', async ({ page }) => {
    await load(page, editor());
    await expect(page.locator('#editor pre')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('#editor > div > div')).toHaveAttribute('aria-hidden', 'true');
  });

  test('custom tag names get styles too', async ({ page }) => {
    await page.route('**/__custom__', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `<body><my-editor style="height: 100px">a</my-editor>
          <script src="/codebedder.js" data-manual></script>
          <script>CodeBedder.register('my-editor')</script></body>`,
      })
    );
    await page.goto('/__custom__');
    await page.waitForFunction(() => document.querySelector('my-editor').textarea);
    expect(await page.evaluate(() => customElements.get('code-bedder'))).toBeUndefined();
    await expect(page.locator('style[data-code-bedder="my-editor"]')).toHaveCount(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('my-editor textarea')).color)).toBe('rgba(0, 0, 0, 0)');
  });
});

test.describe('forms', () => {
  const form = (attributes = '') => `<form id="form">${editor(`name="source" ${attributes}`, 'initial')}</form>`;
  const entries = (page) => page.evaluate(() => [...new FormData(document.querySelector('#form')).entries()]);

  test('submits its value under its name', async ({ page }) => {
    await load(page, form());
    expect(await entries(page)).toEqual([['source', 'initial']]);
    await page.evaluate(() => (document.querySelector('#editor').value = 'changed'));
    expect(await entries(page)).toEqual([['source', 'changed']]);
  });

  test('resets to its initial value', async ({ page }) => {
    await load(page, form());
    const value = await page.evaluate(() => {
      document.querySelector('#editor').value = 'changed';
      document.querySelector('#form').reset();
      return document.querySelector('#editor').value;
    });
    expect(value).toBe('initial');
  });

  test('can be disabled', async ({ page }) => {
    await load(page, form('disabled'));
    await expect(page.locator('#editor textarea')).toBeDisabled();
    expect(await entries(page)).toEqual([]);
  });
});
