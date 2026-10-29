import { api } from './api.js';
import { h } from './ui.js';
import { authView } from './auth.js';
import { photosView } from './photos.js';
import { albumsView, albumDetailView } from './albums.js';

const main = document.getElementById('main');
const nav = document.getElementById('nav');
let view = 'photos';

function setTab() {
  nav.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
}

async function show() {
  setTab();
  if (view === 'albums') await albumsView(main, (id) => albumDetailView(main, id, () => { view = 'albums'; show(); }));
  else await photosView(main);
}

nav.querySelectorAll('.tab').forEach((b) => { b.onclick = () => { view = b.dataset.view; show(); }; });
document.getElementById('logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); start(); };

async function start() {
  try {
    await api('/api/me');
    nav.hidden = false;
    await show();
  } catch {
    nav.hidden = true;
    main.replaceChildren(authView(start));
  }
}
start();
