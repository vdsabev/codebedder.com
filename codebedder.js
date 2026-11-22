(() => {
  if (window.CodeBedder) return;

  class CodeBedder extends HTMLElement {
    static register(tagName = 'code-bedder') {
      if (!window.customElements.get(tagName)) {
        window.customElements.define(tagName, CodeBedder);
      }
    }

    static formAssociated = true;

    static observedAttributes = ['data-language', 'onhighlight', 'placeholder', 'readonly', 'aria-label'];

    // Host styles have zero specificity so any external CSS overrides them. Code and textarea
    // metrics must match exactly, so they're `!important` and customizable via `--code-bedder-*`
    static getStyle(tag = 'code-bedder') {
      return `
:where(${tag}) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  font-size: var(--code-bedder-font-size, 14px);
  background-color: var(--code-bedder-background, hsl(70, 8%, 15%));
}

${tag} > div {
  display: grid !important;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr) !important;
  flex: 1 1 auto;
  min-height: 0;
}

${tag} > div > pre,
${tag} > div > textarea {
  grid-area: 1 / 1 !important;
  box-sizing: border-box;
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  min-height: 0 !important;
  margin: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  padding: 0 !important;
  outline: 0;
}

/* Reserve the same space as the textarea's horizontal scrollbar, so auto height fits */
${tag} > div > pre {
  overflow: scroll hidden !important;
  pointer-events: none;
}

${tag} > div > pre::-webkit-scrollbar {
  height: var(--code-bedder-scrollbar-size, 0.5rem);
  background: transparent;
}

${tag} > div > pre > code,
${tag} > div > textarea {
  box-sizing: border-box;
  margin: 0 !important;
  border: 0 !important;
  padding: var(--code-bedder-padding, 1em) !important;
  font-family: var(--code-bedder-font-family, Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace) !important;
  font-size: 1em !important;
  font-weight: normal !important;
  line-height: var(--code-bedder-line-height, 1.5) !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
  text-align: left !important;
  text-indent: 0 !important;
  text-transform: none !important;
  white-space: pre !important;
  word-break: normal !important;
  overflow-wrap: normal !important;
  tab-size: var(--code-bedder-tab-size, 2) !important;
}

${tag} > div > pre > code {
  display: block;
  will-change: transform;
}

${tag} > div > textarea {
  position: relative;
  z-index: 1;
  resize: none;
  background: transparent !important;
  color: transparent !important;
  caret-color: var(--code-bedder-caret-color, #ffffff);
}

${tag} > div > textarea::placeholder {
  color: var(--code-bedder-placeholder-color, hsla(0, 0%, 100%, 0.4));
}

${tag} > div > textarea::selection {
  background-color: var(--code-bedder-selection-background, hsla(0, 0%, 100%, 0.2));
}

/* Scrollbars */
${tag} > div > textarea::-webkit-scrollbar {
  width: var(--code-bedder-scrollbar-size, 0.5rem);
  height: var(--code-bedder-scrollbar-size, 0.5rem);
}

${tag} > div > textarea::-webkit-scrollbar-track,
${tag} > div > textarea::-webkit-scrollbar-corner {
  background-color: var(--code-bedder-scrollbar-track-background, hsl(215, 19%, 35%));
}

${tag} > div > textarea::-webkit-scrollbar-thumb {
  border-radius: var(--code-bedder-scrollbar-radius, 0.25rem);
  background-color: var(--code-bedder-scrollbar-thumb-background, hsl(215, 16%, 47%));
}

${tag} > div > textarea::-webkit-scrollbar-thumb:hover {
  background-color: var(--code-bedder-scrollbar-thumb-hover-background, hsl(215, 20%, 65%));
}

@supports not selector(::-webkit-scrollbar) {
  ${tag} > div > pre {
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  ${tag} > div > textarea {
    scrollbar-width: thin;
    scrollbar-color: var(--code-bedder-scrollbar-thumb-background, hsl(215, 16%, 47%))
      var(--code-bedder-scrollbar-track-background, hsl(215, 19%, 35%));
  }
}
`;
    }

    static get style() {
      return CodeBedder.getStyle();
    }

    events = {};

    constructor() {
      super();
      // Missing in Safari < 16.4
      this.internals = this.attachInternals ? this.attachInternals() : null;
    }

    connectedCallback() {
      // Properties set before the element was upgraded would shadow our setters
      for (const name of ['value', 'onhighlight']) {
        if (Object.prototype.hasOwnProperty.call(this, name)) {
          const value = this[name];
          delete this[name];
          this[name] = value;
        }
      }

      this.injectStyle();

      // Already rendered - the element was just moved in the DOM
      if (this.textarea) return;

      // Children aren't parsed yet
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.render(), { once: true });
      } else {
        this.render();
      }
    }

    attributeChangedCallback(name) {
      if (!this.textarea) return;

      if (name === 'data-language' || name === 'onhighlight') {
        this.update();
      } else {
        this.syncAttribute(name);
      }
    }

    injectStyle() {
      const root = this.getRootNode();
      const target = root instanceof ShadowRoot ? root : document.head;
      const tag = this.localName;
      if (target.querySelector(`style[data-code-bedder="${tag}"]`)) return;

      const style = document.createElement('style');
      style.setAttribute('data-code-bedder', tag);
      style.textContent = CodeBedder.getStyle(tag);
      // Prepend, so that any later stylesheet can override the defaults
      target.prepend(style);
    }

    render() {
      if (this.textarea) return;

      // Like <pre> and <textarea>, ignore a single leading newline in the markup
      this.defaultValue = this.textContent.replace(/^\r?\n/, '');
      const initialValue = this._pendingValue !== undefined ? this._pendingValue : this.defaultValue;
      delete this._pendingValue;
      this.textContent = '';

      this.pre = document.createElement('pre');
      this.pre.tabIndex = -1;
      this.pre.setAttribute('aria-hidden', 'true');
      this.code = document.createElement('code');
      this.pre.appendChild(this.code);

      const wrapper = document.createElement('div');
      wrapper.appendChild(this.pre);
      this.appendChild(wrapper);

      this.textarea = document.createElement('textarea');
      for (const [name, value] of Object.entries({
        spellcheck: 'false',
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        wrap: 'off',
      })) {
        this.textarea.setAttribute(name, value);
      }

      if (this.internals) {
        this.textarea.disabled = this.matches(':disabled');
      } else if (this.hasAttribute('name')) {
        this.textarea.name = this.getAttribute('name');
      }

      for (const name of ['placeholder', 'readonly', 'aria-label']) {
        this.syncAttribute(name);
      }

      this.textarea.value = initialValue;
      wrapper.appendChild(this.textarea);

      this.textarea.addEventListener('input', () => this.update());
      this.textarea.addEventListener('scroll', () => this.syncScroll());

      this.update();

      this.events.load = true;
      this.dispatchEvent(new Event('load'));
    }

    syncAttribute(name) {
      if (this.hasAttribute(name)) {
        this.textarea.setAttribute(name, this.getAttribute(name));
      } else {
        this.textarea.removeAttribute(name);
      }
    }

    update() {
      const { code, textarea } = this;
      const value = textarea.value;

      if (this.internals) {
        this.internals.setFormValue(value);
      }

      // Reset leftover highlighter state (e.g. highlight.js skips elements with `data-highlighted`)
      code.className = `language-${this.getAttribute('data-language') || 'html'}`;
      code.removeAttribute('data-highlighted');

      // pre ignores an empty new line at the end which breaks scrolling - an extra character fixes it
      code.textContent = value + (value.endsWith('\n') ? ' ' : '');

      const highlight = this.getHighlighter();
      if (highlight) {
        highlight.call(code, code, this);
      }

      this.syncScroll();
    }

    // A transform keeps the layers aligned regardless of scrollbar sizes or the pre's overflow
    syncScroll() {
      const { code, textarea } = this;
      code.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
    }

    getHighlighter() {
      if (typeof this._onhighlight === 'function') return this._onhighlight;

      const source = this.getAttribute('onhighlight');
      if (!source) return null;

      if (this._highlighterSource !== source) {
        this._highlighterSource = source;
        this._highlighter = new Function('code', 'container', source);
      }
      return this._highlighter;
    }

    // e.g. `editor.onhighlight = (code) => Prism.highlightElement(code)` - no eval needed
    get onhighlight() {
      return this._onhighlight || null;
    }

    set onhighlight(fn) {
      this._onhighlight = fn;
      if (this.textarea) this.update();
    }

    // Event handling
    on(...args) {
      const [eventName, callback] = args;
      if (this.events[eventName]) {
        callback.call(this);
      } else {
        this.addEventListener(...args);
      }
    }

    off(...args) {
      this.removeEventListener(...args);
    }

    // Form integration
    formResetCallback() {
      this.value = this.defaultValue || '';
    }

    formStateRestoreCallback(state) {
      if (typeof state === 'string') this.value = state;
    }

    formDisabledCallback(disabled) {
      if (this.textarea) this.textarea.disabled = disabled;
    }

    // Properties
    get value() {
      if (this.textarea) return this.textarea.value;
      if (this._pendingValue !== undefined) return this._pendingValue;
      return this.textContent.replace(/^\r?\n/, '');
    }

    set value(value) {
      value = value == null ? '' : String(value);

      if (!this.textarea) {
        this._pendingValue = value;
      } else if (this.textarea.value !== value) {
        this.textarea.value = value;
        this.update();
      }
    }
  }

  if (!(document.currentScript && document.currentScript.hasAttribute('data-manual'))) {
    CodeBedder.register();
  }

  window.CodeBedder = CodeBedder;
})();
