// Netlify Function (v2) - receives the BEAM contact form and sends it via Outpost.
// Secrets are read from the environment, never exposed to the browser:
//   OUTPOST_URL      e.g. https://outpost.bayton.org   (your Outpost base URL)
//   OUTPOST_API_KEY  the secret Outpost API key (authorised to send-as no-reply@api.bayton.org)

const FROM = 'BEAM website <no-reply@api.bayton.org>';
const TO = ['jason@bayton.org'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let data;
  try {
    data = await req.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }

  // Honeypot: bots fill hidden fields. Pretend success and drop it.
  if (data.website) return json({ ok: true });

  const name = (data.name || '').trim();
  const email = (data.email || '').trim();
  const message = (data.message || '').trim();
  const organisation = (data.organisation || '').trim();
  const estate = (data.estate || '').trim();

  if (!name || !email || !message)
    return json({ error: 'Please complete the required fields.' }, 422);
  if (!EMAIL_RE.test(email))
    return json({ error: 'Please enter a valid email address.' }, 422);
  if (message.length > 5000)
    return json({ error: 'That message is a little long - please trim it down.' }, 422);

  const OUTPOST_URL = process.env.OUTPOST_URL;
  const OUTPOST_API_KEY = process.env.OUTPOST_API_KEY;
  if (!OUTPOST_URL || !OUTPOST_API_KEY)
    return json({ error: 'The form is not configured yet. Please email jason@bayton.org.' }, 500);

  const rows = [
    `<p><strong>Name:</strong> ${esc(name)}</p>`,
    `<p><strong>Email:</strong> ${esc(email)}</p>`,
    organisation ? `<p><strong>Organisation:</strong> ${esc(organisation)}</p>` : '',
    estate ? `<p><strong>Estate size:</strong> ${esc(estate)}</p>` : '',
    `<p><strong>Message:</strong></p><p>${esc(message).replace(/\n/g, '<br>')}</p>`,
  ].join('');
  const html = `<h2>New BEAM enquiry</h2>${rows}`;
  const text =
    `New BEAM enquiry\n\nName: ${name}\nEmail: ${email}\n` +
    (organisation ? `Organisation: ${organisation}\n` : '') +
    (estate ? `Estate size: ${estate}\n` : '') +
    `\n${message}\n`;

  let res;
  try {
    res = await fetch(`${OUTPOST_URL.replace(/\/$/, '')}/mail/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OUTPOST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        replyTo: [email],
        subject: `New BEAM enquiry from ${name}`,
        html,
        text,
        headers: { 'X-Form-Source': 'beam-landing' },
      }),
    });
  } catch {
    return json({ error: 'Could not reach the mail service. Please try again shortly.' }, 502);
  }

  if (!res.ok) {
    return json({ error: 'The mail service rejected the message. Please try again or email jason@bayton.org.' }, 502);
  }

  return json({ ok: true });
};
