document.addEventListener('DOMContentLoaded', () => {
  const editor = document.querySelector('#editor');
  const iframe = document.querySelector('#preview');

  // Preview
  function setPreviewContent() {
    iframe.contentWindow.document.open();
    iframe.contentWindow.document.write(editor.value);
    iframe.contentWindow.document.close();
  }

  editor.on('input', setPreviewContent);
  editor.on('load', setPreviewContent);

  // Typing interaction
  let typingInteractionIsRunning = true;

  async function startTypingInteraction(cycleThroughText) {
    await wait(1000);

    const textToReplace = cycleThroughText[0];
    const start = editor.textarea.value.indexOf(textToReplace);
    const end = start + textToReplace.length;
    editor.textarea.setSelectionRange(start, end);
    await wait(500);

    const replacement = cycleThroughText[1];
    editor.textarea.setRangeText('', start, end);
    for (let index = 0; index < replacement.length; index++) {
      editor.textarea.setRangeText(
        replacement.slice(0, index + 1),
        start,
        start + index,
        'select'
      );
      editor.textarea.dispatchEvent(new Event('input'));
      editor.dispatchEvent(new Event('input'));
      await wait(50);
    }

    await wait(1000);

    window.requestAnimationFrame(() =>
      startTypingInteraction([
        replacement,
        ...cycleThroughText.slice(2),
        textToReplace,
      ]).catch(console.error)
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

  editor.on('load', function () {
    const initialText = 'World 🤗';
    const start = editor.textarea.value.indexOf(initialText);

    if (start < 0) return;

    editor.textarea.focus({ preventScroll: true });
    editor.textarea.setSelectionRange(start, start);

    editor.textarea.addEventListener('click', stopTypingInteraction);
    editor.textarea.addEventListener('keypress', stopTypingInteraction);

    window.addEventListener('scroll', () => {
      if (document.body.scrollTop > document.body.clientHeight) {
        editor.textarea.blur();
      }
    });

    startTypingInteraction([
      initialText,
      'Beautiful 😍',
      'Gorgeous 😘',
      'CodeBedder 💻',
    ]).catch(console.error);
  });
});
