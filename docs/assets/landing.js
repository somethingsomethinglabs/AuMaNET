const screenshotDialog = document.querySelector('#screenshot-dialog');
const screenshotImage = screenshotDialog.querySelector('.screenshot-full');
const screenshotTitle = screenshotDialog.querySelector('#screenshot-dialog-title');
let screenshotTrigger;

document.querySelectorAll('.screen-frame').forEach(button => {
  button.addEventListener('click', () => {
    const thumbnail = button.querySelector('img');
    screenshotTrigger = button;
    screenshotImage.src = thumbnail.src;
    screenshotImage.alt = thumbnail.alt;
    screenshotTitle.textContent = `${button.dataset.screenTitle} · App prototype`;
    screenshotDialog.showModal();
    document.documentElement.classList.add('screenshot-open');
  });
});

screenshotDialog.querySelector('.screenshot-close').addEventListener('click', () => screenshotDialog.close());

// Backdrop clicks target the dialog; keep clicks within its bounds open.
screenshotDialog.addEventListener('click', event => {
  if (event.target !== screenshotDialog) return;
  const bounds = screenshotDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) screenshotDialog.close();
});

// The native dialog handles Escape, focus trapping and an inert background.
screenshotDialog.addEventListener('close', () => {
  document.documentElement.classList.remove('screenshot-open');
  screenshotTrigger?.focus({ preventScroll: true });
});
