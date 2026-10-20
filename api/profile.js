// Per-profile Open Graph preview page for /u/<id> links; bounces into
// the app at /#/profile/<id>. Anon reads — an unreadable profile falls
// back to generic TALLY tags.
export const config = { runtime: 'edge' }

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(request) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  const origin = url.origin
  const target = `${origin}/#/profile/${id}`

  let title = 'TALLY'
  let desc = 'Good taste deserves a track record.'
  let image = `${origin}/icons/icon-512.png`

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (UUID.test(id) && sbUrl && sbKey) {
    try {
      const res = await fetch(
        `${sbUrl}/rest/v1/profiles?select=display_name,username,bio,avatar_url&id=eq.${id}`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      )
      if (res.ok) {
        const rows = await res.json()
        const p = rows && rows[0]
        if (p) {
          title = `${p.display_name || p.username} (@${p.username}) — TALLY`
          desc = p.bio || `${p.display_name || p.username}'s put-ons, verdicts and track record on TALLY.`
          if (p.avatar_url) image = p.avatar_url
        }
      }
    } catch {
      // Generic tags + redirect still work.
    }
  }

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}">` +
    `<meta property="og:type" content="profile">` +
    `<meta property="og:site_name" content="TALLY">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:image" content="${esc(image)}">` +
    `<meta property="og:url" content="${esc(origin)}/u/${esc(id)}">` +
    `<meta name="twitter:card" content="summary_large_image">` +
    `<meta http-equiv="refresh" content="0; url=${esc(target)}">` +
    `</head><body style="background:#191725;color:#fffcf7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
    `<p>Opening TALLY… <a href="${esc(target)}" style="color:#45c8ff">tap here if it doesn't open</a></p>` +
    `<script>location.replace(${JSON.stringify(target)})</script>` +
    `</body></html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
