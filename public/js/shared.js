import { api } from './api.js';
import { h, formatDate } from './ui.js';
import { openViewer } from './viewer.js';

const main = document.getElementById('main');
const token = location.pathname.split('/').pop();

async function load() {
  try {
    const { album, photos } = await api(`/api/public/${encodeURIComponent(token)}`);
    document.title = album.name;
    const thumb = (p) => `/api/public/${encodeURIComponent(token)}/photos/${p.id}/thumb`;
    const file = (p) => `/api/public/${encodeURIComponent(token)}/photos/${p.id}/file`;
    main.replaceChildren(
      h('h2', {}, album.name),
      photos.length
        ? h('div', { class: 'grid' }, photos.map((p, i) =>
            h('button', { class: 'tile', 'aria-label': `Open ${p.name}`, onclick: () => openViewer(photos, i, { file }) },
              h('img', { src: thumb(p), alt: p.name, loading: 'lazy' }),
              h('span', { class: 'badge' }, formatDate(p.takenAt || p.uploadedAt)))))
        : h('div', { class: 'empty' }, 'This album has no photos yet.')
    );
  } catch (e) {
    main.replaceChildren(h('div', { class: 'card empty' }, h('h2', {}, 'Link not available'),
      h('p', {}, 'This album link is wrong or the owner turned sharing off.')));
  }
}
load();
