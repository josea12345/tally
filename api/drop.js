// Per-drop Open Graph preview page. Shared links use clean /drop/<id>
// URLs (see vercel.json rewrites); this edge function answers them with
// the drop's own title, author line and cover as the preview, then
// bounces the visitor into the app at /#/drop/<id>. Crawlers read the
// meta tags; humans get redirected instantly. Reads go through the anon
// key, so RLS decides what's shareable — invisible drops fall back to
// generic TALLY tags without leaking anything.
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
  const target = `${origin}/#/drop/${id}`

  let title = 'TALLY'
  let desc = 'Good taste deserves a track record.'
  let image = `${origin}/icons/icon-512.png`

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (UUID.test(id) && sbUrl && sbKey) {
    try {
      const res = await fetch(
        `${sbUrl}/rest/v1/drops?select=title,description,score,media_urls,media_types,media_poster_urls,media_url,media_type,media_poster_url,author:profiles(display_name,username)&id=eq.${id}`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      )
      if (res.ok) {
        const rows = await res.json()
        const d = rows && rows[0]
        if (d) {
          const author = (d.author && (d.author.display_name || d.author.username)) || 'Someone'
          title = `${d.title} — TALLY`
          desc =
            `${author} put you on` +
            (d.score != null ? ` · their call: ${d.score}/10` : '') +
            (d.description ? ` — ${d.description}` : '')
          const urls = d.media_urls || []
          const types = d.media_types || []
          const posters = d.media_poster_urls || []
          if (urls[0]) image = types[0] === 'video' ? posters[0] || image : urls[0]
          else if (d.media_url) image = d.media_type === 'video' ? d.media_poster_url || image : d.media_url
        }
      }
    } catch {
      // Generic tags + redirect still work — previews are best-effort.
    }
  }

  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<title>${esc(title)}</title>` +
    `<meta name="description" content="${esc(desc)}">` +
    `<meta property="og:type" content="article">` +
    `<meta property="og:site_name" content="TALLY">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:image" content="${esc(image)}">` +
    `<meta property="og:url" content="${esc(origin)}/drop/${esc(id)}">` +
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
