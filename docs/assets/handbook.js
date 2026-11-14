// Navigation remains usable without JS, including when the handbook is opened offline.
const filter = document.querySelector('#docs-filter');
const navigation = document.querySelector('.sidebar-inner nav');
const status = document.querySelector('#filter-status');
const mobileNavigation = document.querySelector('.mobile-navigation');
const pageContents = document.querySelector('.page-contents details');
const mobile = matchMedia('(max-width: 1050px)');
function setNavigationMode() {
  if (mobileNavigation) mobileNavigation.open = !mobile.matches;
  if (pageContents) pageContents.open = !mobile.matches;
}
setNavigationMode();
mobile.addEventListener('change', setNavigationMode);
if (filter && navigation && status) {
  const details = [...navigation.querySelectorAll('details')];
  const items = [...navigation.querySelectorAll('li')];
  let previousOpen;
  filter.closest('.page-filter').hidden = false;
  filter.addEventListener('input', () => {
    const query = filter.value.trim().toLocaleLowerCase('en-AU');
    if (query && !previousOpen) previousOpen = new Map(details.map(section => [section, section.open]));
    let count = 0;
    for (const item of items) {
      item.hidden = !item.textContent.toLocaleLowerCase('en-AU').includes(query);
      if (!item.hidden) count++;
    }
    for (const section of details) {
      const visible = [...section.querySelectorAll('li')].some(item => !item.hidden);
      section.hidden = !visible;
      if (query) section.open = visible;
      else if (previousOpen) section.open = previousOpen.get(section);
    }
    if (!query) previousOpen = undefined;
    status.textContent = query ? `${count} ${count === 1 ? 'page' : 'pages'} found` : '';
  });
  filter.addEventListener('keydown', event => {
    if (event.key === 'Escape' && filter.value) {
      event.preventDefault();
      filter.value = '';
      filter.dispatchEvent(new Event('input'));
    }
  });
}
