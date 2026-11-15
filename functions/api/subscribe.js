// SoLyrae Beacon: email sign-up (Cloudflare Pages Function, served at /api/subscribe).
// Receives {email, components, website} from the Beacon page and asks Brevo to send the confirmation email (double opt-in).
// The Brevo key lives in the Cloudflare setting BREVO_API_KEY, never in the page.
const COMPONENTS = {
  agave: 'Agave', jito: 'Jito', firedancer: 'Firedancer', rust: 'Rust crates', kernel: 'Linux kernel', ubuntu: 'Ubuntu',
  debian: 'Debian', openssl: 'OpenSSL', openssh: 'OpenSSH', systemd: 'systemd', docker: 'Docker',
};
const LIST_PREFIX = 'Beacon · ';
const CONFIRM_TEMPLATE = 'Beacon · Confirm subscription';
const DONE_URL = 'https://www.solyrae.com/beacon-confirmed.html';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return reply({ ok: false, error: 'Something went wrong. Please try again.' }, 400); }
  if (b.website) return reply({ ok: true }); // hidden field: only bots fill it in

  const email = String(b.email || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply({ ok: false, error: 'Please enter a valid email address.' }, 400);
  const comps = [...new Set(Array.isArray(b.components) ? b.components : [])].filter(c => COMPONENTS[c]);
  if (!comps.length) return reply({ ok: false, error: 'Pick at least one component first.' }, 400);
  if (!env.BREVO_API_KEY) return reply({ ok: false, error: 'Email alerts are not open yet.' }, 503);

  const api = (path, init = {}) => fetch('https://api.brevo.com/v3' + path, {
    ...init, headers: { 'api-key': env.BREVO_API_KEY, accept: 'application/json', 'content-type': 'application/json' },
  });
  try {
    const [lr, tr] = await Promise.all([api('/contacts/lists?limit=50'), api('/smtp/templates?limit=1000')]);
    if (!lr.ok || !tr.ok) throw new Error(`lookup ${lr.status}/${tr.status}`);
    const lists = (await lr.json()).lists || [], templates = (await tr.json()).templates || [];
    const ids = comps.map(c => (lists.find(l => l.name === LIST_PREFIX + COMPONENTS[c]) || {}).id).filter(Boolean);
    const tpl = templates.find(t => t.name === CONFIRM_TEMPLATE);
    if (!ids.length || !tpl) throw new Error('lists or template missing');
    const r = await api('/contacts/doubleOptinConfirmation', {
      method: 'POST', body: JSON.stringify({ email, includeListIds: ids, templateId: tpl.id, redirectionUrl: DONE_URL }),
    });
    if (!r.ok) throw new Error(`doi ${r.status} ${(await r.text()).slice(0, 200)}`);
    return reply({ ok: true });
  } catch (e) {
    console.log('subscribe error', String(e));
    return reply({ ok: false, error: 'Something went wrong. Please try again later.' }, 502);
  }
}
