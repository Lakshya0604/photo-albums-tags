import { h, formatDate } from './ui.js';

// Full-screen viewer with keyboard navigation (left/right arrows, Escape).
// urls: { file(photo) } builds the full-size URL. onTags is optional (owner view only).
export function openViewer(photos, startIndex, { file, onTags }) {
  const root = document.getElementById('viewer');
  let index = startIndex;

  function render() {
    const p = photos[index];
    const img = h('img', { src: file(p), alt: p.name });
    const tagInput = onTags
      ? h('input', { type: 'text', value: p.tags.join(', '), placeholder: 'tags, comma separated', 'aria-label': 'Tags' })
      : null;
    const save = onTags
      ? h('button', { onclick: async () => { const updated = await onTags(p, tagInput.value); if (updated) photos[index] = updated; } }, 'Save tags')
      : null;
    const info = h('div', { class: 'info' },
      `${p.name} · ${formatDate(p.takenAt || p.uploadedAt)} (${p.dateSource === 'exif' ? 'date taken' : 'upload date'}) · ${index + 1}/${photos.length}`,
      onTags ? null : h('div', {}, p.tags.join(', ')));
    root.replaceChildren(
      h('div', { class: 'stage' },
        h('button', { class: 'nav prev', 'aria-label': 'Previous', onclick: () => go(-1) }, '‹'),
        img,
        h('button', { class: 'nav next', 'aria-label': 'Next', onclick: () => go(1) }, '›')),
      h('div', { class: 'bar' }, info, tagInput, save, h('button', { onclick: close }, 'Close'))
    );
  }
  function go(step) {
    index = (index + step + photos.length) % photos.length;
    render();
  }
  function close() {
    root.hidden = true;
    root.replaceChildren();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  root.hidden = false;
  render();
}
