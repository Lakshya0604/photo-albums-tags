import { api } from './api.js';
import { h, toast } from './ui.js';
import { openViewer } from './viewer.js';
import { photoTile, viewerOptions } from './photos.js';

export async function albumsView(root, openAlbum) {
  const nameInput = h('input', { type: 'text', placeholder: 'New album name', maxlength: 80, 'aria-label': 'Album name' });
  const err = h('div', { class: 'error', role: 'alert' });
  const list = h('div', { class: 'albums' });
  async function load() {
    const { albums } = await api('/api/albums');
    list.replaceChildren(...albums.map((a) => h('button', { class: 'album-card', onclick: () => openAlbum(a.id) },
      h('div', { class: 'cover' }, a.coverPhotoId ? h('img', { src: `/api/photos/${a.coverPhotoId}/thumb`, alt: '' }) : 'No cover'),
      h('div', { class: 'meta' }, h('strong', {}, a.name), h('div', { class: 'muted' }, `${a.photoCount} photo(s)${a.shared ? ' · shared' : ''}`)))));
    if (!albums.length) list.replaceChildren(h('div', { class: 'empty' }, 'No albums yet.'));
  }
  root.replaceChildren(
    h('div', { class: 'card' }, h('h3', {}, 'Create an album'),
      h('div', { class: 'row' }, nameInput, h('button', { class: 'primary', onclick: async () => {
        err.textContent = '';
        try { await api('/api/albums', { method: 'POST', body: { name: nameInput.value } }); nameInput.value = ''; await load(); }
        catch (e) { err.textContent = e.message; }
      } }, 'Create')), err),
    list);
  await load();
}

export async function albumDetailView(root, id, back) {
  async function draw() {
    const { album, photos } = await api(`/api/albums/${id}`);
    const nameInput = h('input', { type: 'text', value: album.name, maxlength: 80, 'aria-label': 'Album name' });
    const url = album.shared ? `${location.origin}/s/${album.shareToken}` : '';
    const act = (fn, msg) => async () => { try { await fn(); if (msg) toast(msg); await draw(); } catch (e) { toast(e.message, true); } };

    const shareBox = album.shared
      ? h('div', { class: 'share-box' },
        h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Public link', onfocus: (e) => e.target.select() }),
        h('button', { onclick: async () => { await navigator.clipboard?.writeText(url).catch(() => {}); toast('Link copied'); } }, 'Copy'),
        h('button', { class: 'danger', onclick: act(() => api(`/api/albums/${id}/share`, { method: 'DELETE' }), 'Sharing turned off') }, 'Turn off sharing'))
      : h('button', { onclick: act(() => api(`/api/albums/${id}/share`, { method: 'POST' }), 'Public link created') }, 'Create public link');

    root.replaceChildren(
      h('div', { class: 'toolbar' }, h('button', { onclick: back }, '← Albums'), h('span', { class: 'spacer' }),
        h('a', { href: `/api/albums/${id}/zip`, download: '' }, h('button', {}, 'Download ZIP')),
        h('button', { class: 'danger', onclick: async () => {
          if (!confirm('Delete this album? Photos stay in your library.')) return;
          try { await api(`/api/albums/${id}`, { method: 'DELETE' }); back(); } catch (e) { toast(e.message, true); }
        } }, 'Delete album')),
      h('div', { class: 'card' }, h('h3', {}, 'Album'),
        h('div', { class: 'row' }, nameInput, h('button', { onclick: act(() => api(`/api/albums/${id}`, { method: 'PATCH', body: { name: nameInput.value } }), 'Renamed') }, 'Rename'))),
      h('div', { class: 'card' }, h('h3', {}, 'Public link'),
        h('p', { class: 'muted' }, 'Anyone with the link can view this album (read only). Turning it off blocks access immediately.'), shareBox),
      photos.length
        ? h('div', { class: 'grid' }, photos.map((p, i) => h('div', {},
          photoTile(p, { onOpen: () => openViewer(photos, i, viewerOptions()), isCover: p.id === album.coverPhotoId }),
          h('div', { class: 'tile-actions' },
            h('button', { onclick: act(() => api(`/api/albums/${id}`, { method: 'PATCH', body: { coverPhotoId: p.id } }), 'Cover set') }, 'Make cover'),
            h('button', { class: 'danger', onclick: act(() => api(`/api/albums/${id}/photos/${p.id}`, { method: 'DELETE' }), 'Removed from album') }, 'Remove')))))
        : h('div', { class: 'empty' }, 'No photos here yet. Select photos on the Photos tab and add them to this album.'));
  }
  try { await draw(); } catch (e) { toast(e.message, true); back(); }
}
