import { api } from './api.js';
import { h } from './ui.js';

export function authView(onDone) {
  let mode = 'login';
  const card = h('div', { class: 'card auth' });
  function draw() {
    const email = h('input', { type: 'email', placeholder: 'Email', autocomplete: 'email', required: true });
    const pass = h('input', { type: 'password', placeholder: 'Password (min 8 characters)', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
    const err = h('div', { class: 'error', role: 'alert' });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        try {
          await api(`/api/auth/${mode}`, { method: 'POST', body: { email: email.value, password: pass.value } });
          onDone();
        } catch (ex) { err.textContent = ex.message; }
      },
    }, email, pass, err,
    h('button', { class: 'primary', type: 'submit' }, mode === 'login' ? 'Log in' : 'Create account'),
    h('button', { type: 'button', class: 'link', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; draw(); } },
      mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'));
    card.replaceChildren(h('h2', {}, mode === 'login' ? 'Log in' : 'Create account'), form,
      h('p', { class: 'muted' }, 'Demo: demo@example.com / demo12345 (after running the seed script).'));
  }
  draw();
  return card;
}
