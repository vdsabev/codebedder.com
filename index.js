(() => {
  const editor = document.querySelector('#editor');
  const textarea = editor.querySelector('textarea');

  // Preview
  editor.addEventListener('input', function () {
    const iframe = document.querySelector('#preview');
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(this.value);
    iframe.contentWindow.document.close();
  });

  // Typing interaction
  let typingInteractionIsRunning = true;

  async function startTypingInteraction(cycleThroughText) {
    await wait(1000);

    const textToReplace = cycleThroughText[0];
    const start = textarea.value.indexOf(textToReplace);
    const end = start + textToReplace.length;
    textarea.setSelectionRange(start, end);
    await wait(500);

    const replacement = cycleThroughText[1];
    textarea.setRangeText('', start, end);
    for (let index = 0; index < replacement.length; index++) {
      textarea.setRangeText(
        replacement.slice(0, index + 1),
        start,
        start + index,
        'select'
      );
      textarea.dispatchEvent(new Event('input'));
      editor.dispatchEvent(new Event('input'));
      await wait(50);
    }

    await wait(1000);

    window.requestAnimationFrame(() =>
      startTypingInteraction([
        replacement,
        ...cycleThroughText.slice(2),
        textToReplace,
      ]).catch()
    );
  }

  function stopTypingInteraction() {
    typingInteractionIsRunning = false;
  }

  function wait(time) {
    return new Promise((resolve, reject) => {
      setTimeout(
        () => (typingInteractionIsRunning ? resolve() : reject()),
        time
      );
    });
  }

  const initialText = 'World 🤗';
  const start = textarea.value.indexOf(initialText);

  textarea.focus();
  textarea.setSelectionRange(start, start);

  textarea.addEventListener('click', stopTypingInteraction);
  textarea.addEventListener('keypress', stopTypingInteraction);

  window.addEventListener('scroll', () => {
    if (document.body.scrollTop > document.body.clientHeight) {
      textarea.blur();
    }
  });

  startTypingInteraction([
    initialText,
    'Beautiful 😍',
    'Gorgeous 😘',
    'CodeBedder 💻',
  ]).catch();
})();
