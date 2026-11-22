![screenshot](https://github.com/vdsabev/codebedder.com/raw/master/screenshot.gif)

# CodeBedder

The simplest code editor on the web: a `<code-bedder>` web component that layers a transparent `<textarea>` over a syntax-highlighted `<pre><code>`. Bring your own highlighter (e.g. [PrismJS](https://prismjs.com) or [highlight.js](https://highlightjs.org)).

## Usage

```html
<link href="prism.css" rel="stylesheet" />

<code-bedder data-language="html" onhighlight="Prism.highlightElement(this)">
&lt;h1&gt;Hello World&lt;/h1&gt;
</code-bedder>

<script src="prism.js"></script>
<script src="codebedder.js"></script>
```

The initial code is the element's text content, so HTML must be escaped. A single leading newline is ignored, like in `<pre>` and `<textarea>`.

### Attributes

| Attribute       | Description                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| `data-language` | Adds a `language-*` class to the `<code>` element. Defaults to `html`.              |
| `onhighlight`   | Runs after every change with `this` (and `code`) set to the `<code>` element.       |
| `name`          | Submits the value with a parent `<form>` - also supports `disabled` and form reset. |
| `placeholder`   | Placeholder text for the empty editor.                                              |
| `readonly`      | Makes the editor read-only.                                                         |
| `aria-label`    | Accessible label for the editor.                                                    |

### JavaScript

```js
const editor = document.querySelector('code-bedder');

editor.value = 'const a = 1;'; // works before the editor has rendered too
editor.on('input', () => console.log(editor.value));
editor.on('load', () => editor.textarea.focus()); // runs immediately if already loaded

// Use a function instead of the `onhighlight` attribute (no eval, CSP-friendly)
editor.onhighlight = (code) => hljs.highlightElement(code);
```

Add `data-manual` to the script tag to skip auto-registration, then call `CodeBedder.register('my-editor')` with any tag name.

## Styling

Size, spacing, borders etc. can be set directly on the element - the built-in host styles have zero specificity:

```css
code-bedder {
  height: 300px;
  border-radius: 0.5rem;
}
```

Everything that has to match between the text and the caret is set via CSS variables, which can be declared on the element or any ancestor (like `:root`):

| Variable                                          | Default                                  |
| ------------------------------------------------- | ---------------------------------------- |
| `--code-bedder-font-family`                       | `Consolas, Monaco, …, monospace`         |
| `--code-bedder-font-size`                         | `14px`                                   |
| `--code-bedder-line-height`                       | `1.5`                                    |
| `--code-bedder-tab-size`                          | `2`                                      |
| `--code-bedder-padding`                           | `1em`                                    |
| `--code-bedder-background`                        | `hsl(70, 8%, 15%)`                       |
| `--code-bedder-caret-color`                       | `#ffffff`                                |
| `--code-bedder-placeholder-color`                 | `hsla(0, 0%, 100%, 0.4)`                 |
| `--code-bedder-selection-background`              | `hsla(0, 0%, 100%, 0.2)`                 |
| `--code-bedder-scrollbar-size`                    | `0.5rem`                                 |
| `--code-bedder-scrollbar-radius`                  | `0.25rem`                                |
| `--code-bedder-scrollbar-track-background`        | `hsl(215, 19%, 35%)`                     |
| `--code-bedder-scrollbar-thumb-background`        | `hsl(215, 16%, 47%)`                     |
| `--code-bedder-scrollbar-thumb-hover-background`  | `hsl(215, 20%, 65%)`                     |

Note that highlighter themes may also set a background on the `<pre>`.

## Development

```sh
npm install
npx playwright install   # first time only
npm test                 # Chromium, Firefox and WebKit - desktop, phone and tablet
npm run test:chromium    # just Chromium desktop and mobile
npm run serve            # http://localhost:4173
```

Tests use real clicks and taps, with visible scrollbars, to check that the textarea receives input and that the caret stays aligned with the highlighted text. They run on every push and pull request.
