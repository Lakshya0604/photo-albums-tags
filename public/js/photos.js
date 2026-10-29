import { api } from './api.js';
import { h, toast, formatDate } from './ui.js';
import { openViewer } from './viewer.js';

const state = { tags: '', match: 'all', order: 'desc' };

export function photoTile(p, { selected, onSelect, onOpen, isCover }) {
  return h('div', { class: `tile${selected ? ' selected' : ''}`, onclick: onOpen, role: 'button', tabindex: 0,
    onkeydown: (e) => { if (e.key === 'Enter') onOpen(); } },
  h('img', { src: `/api/photos/${p.id}/thumb`, alt: p.name, loading: 'lazy' }),
  onSelect ? h('input', { type: 'checkbox', class: 'check', checked: selected, 'aria-label': `Select ${p.name}`,
    onclick: (e) => e.stopPropagation(), onchange: (e) => onSelect(e.target.checked) }) : null,
  isCover ? h('span', { class: 'cover-flag' }, 'Cover') : null,
  h('span', { class: 'badge' }, `${formatDate(p.takenAt || p.uploadedAt)}${p.tags.length ? ' · ' + p.tags.join(', ') : ''}`));
}

export async function saveTags(p, text) {
  try {
    const { photo } = await api(`/api/photos/${p.id}/tags`, { method: 'PUT', body: { tags: text.split(',') } });
    toast('Tags saved');
    return photo;
  } catch (e) { toast(e.message, true); return null; }
}

export function viewerOptions() {
  return { file: (p) => `/api/photos/${p.id}/file`, onTags: saveTags };
}

export async function photosView(root) {
  const selected = new Set();
  const grid = h('div', { class: 'grid' });
  const countLabel = h('span', { class: 'muted' });
  const albumSelect = h('select', { 'aria-label': 'Album' });
  const addBtn = h('button', { disabled: true }, 'Add selected to album');
  let photos = [];

  const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true });
  const uploadTags = h('input', { type: 'text', placeholder: 'Tags for these photos (optional)' });
  const uploadErr = h('div', { class: 'error', role: 'alert' });
  const uploadBtn = h('button', { class: 'primary' }, 'Upload');
  uploadBtn.onclick = async () => {
    uploadErr.textContent = '';
    if (!fileInput.files.length) { uploadErr.textContent = 'Choose at least one photo.'; return; }
    const form = new FormData();
    for (const f of fileInput.files) form.append('photos', f);
    form.append('tags', uploadTags.value);
    uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading…';
    try {
      const res = await api('/api/photos', { method: 'POST', form });
      toast(`Uploaded ${res.photos.length} photo(s)`);
      if (res.errors.length) uploadErr.textContent = res.errors.join(' ');
      fileInput.value = ''; uploadTags.value = '';
      await load();
    } catch (e) { uploadErr.textContent = e.message; }
    uploadBtn.disabled = false; uploadBtn.textContent = 'Upload';
  };

  const tagInput = h('input', { type: 'text', placeholder: 'Search by tags, e.g. beach, summer', value: state.tags, 'aria-label': 'Search tags' });
  const matchSel = h('select', { 'aria-label': 'Match mode' },
    h('option', { value: 'all' }, 'Match all tags'), h('option', { value: 'any' }, 'Match any tag'));
  matchSel.value = state.match;
  const orderSel = h('select', { 'aria-label': 'Sort' },
    h('option', { value: 'desc' }, 'Date taken: newest first'), h('option', { value: 'asc' }, 'Date taken: oldest first'));
  orderSel.value = state.order;
  const onFilter = () => { state.tags = tagInput.value; state.match = matchSel.value; state.order = orderSel.value; load(); };
  let timer;
  tagInput.oninput = () => { clearTimeout(timer); timer = setTimeout(onFilter, 300); };
  matchSel.onchange = onFilter; orderSel.onchange = onFilter;

  addBtn.onclick = async () => {
    if (!albumSelect.value) return toast('Create an album first.', true);
    try {
      await api(`/api/albums/${albumSelect.value}/photos`, { method: 'POST', body: { photoIds: [...selected] } });
      toast(`Added ${selected.size} photo(s) to the album`);
      selected.clear(); draw();
    } catch (e) { toast(e.message, true); }
  };

  function draw() {
    addBtn.disabled = selected.size === 0;
    countLabel.textContent = `${photos.length} photo(s)${selected.size ? `, ${selected.size} selected` : ''}`;
    grid.replaceChildren(...photos.map((p, i) => photoTile(p, {
      selected: selected.has(p.id),
      onSelect: (on) => { on ? selected.add(p.id) : selected.delete(p.id); draw(); },
      onOpen: () => openViewer(photos, i, viewerOptions()),
    })));
    if (!photos.length) grid.replaceChildren(h('div', { class: 'empty' }, state.tags ? 'No photos match these tags.' : 'No photos yet. Upload some above.'));
  }

  async function load() {
    try {
      const q = new URLSearchParams({ order: state.order, match: state.match });
      if (state.tags.trim()) q.set('tags', state.tags);
      photos = (await api(`/api/photos?${q}`)).photos;
      for (const id of [...selected]) if (!photos.some((p) => p.id === id)) selected.delete(id);
      draw();
    } catch (e) { toast(e.message, true); }
  }

  const { albums } = await api('/api/albums');
  albumSelect.replaceChildren(...albums.map((a) => h('option', { value: a.id }, a.name)));
  root.replaceChildren(
    h('div', { class: 'card' }, h('h3', {}, 'Upload photos'), h('div', { class: 'row' }, fileInput, uploadTags, uploadBtn), uploadErr,
      h('p', { class: 'muted' }, `JPEG, PNG or WebP. Thumbnails are made on the server.`)),
    h('div', { class: 'toolbar' }, tagInput, matchSel, orderSel),
    h('div', { class: 'toolbar' }, countLabel, h('span', { class: 'spacer' }), albumSelect, addBtn),
    grid);
  await load();
}
