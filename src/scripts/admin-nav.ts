const toggle = document.querySelector<HTMLButtonElement>('[data-admin-nav-toggle]');
const sidebar = document.querySelector<HTMLElement>('#admin-sidebar');
const backdrop = document.querySelector<HTMLButtonElement>('[data-admin-nav-close]');
const workspace = document.querySelector<HTMLElement>('.admin-workspace');
const mobile = window.matchMedia('(max-width: 900px)');

function syncNavAccess() {
  const open = document.body.classList.contains('admin-nav-open');
  if (sidebar) sidebar.inert = mobile.matches && !open;
  if (workspace) workspace.inert = mobile.matches && open;
}

function closeNav() {
  document.body.classList.remove('admin-nav-open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (backdrop) backdrop.hidden = true;
  syncNavAccess();
  toggle?.focus();
}

toggle?.addEventListener('click', () => {
  const opening = !document.body.classList.contains('admin-nav-open');
  document.body.classList.toggle('admin-nav-open', opening);
  toggle.setAttribute('aria-expanded', String(opening));
  if (backdrop) backdrop.hidden = !opening;
  syncNavAccess();
  if (opening) sidebar?.querySelector<HTMLAnchorElement>('a')?.focus();
});
backdrop?.addEventListener('click', closeNav);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.body.classList.contains('admin-nav-open')) closeNav();
});
sidebar?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  document.body.classList.remove('admin-nav-open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (backdrop) backdrop.hidden = true;
  syncNavAccess();
}));
mobile.addEventListener('change', () => {
  document.body.classList.remove('admin-nav-open');
  toggle?.setAttribute('aria-expanded', 'false');
  if (backdrop) backdrop.hidden = true;
  syncNavAccess();
});
syncNavAccess();
