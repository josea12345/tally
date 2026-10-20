// Per-list Open Graph preview page. Shared list links use clean
// /list/<id> URLs; this answers with the list's name, owner and first
// cover, then bounces into the app at /#/list/<id>. Anon reads, so a
// private list yields generic tags and leaks nothing.
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
  const target = `${origin}/#/list/${id}`

  let title = 'TALLY'
  let desc = 'Good taste deserves a track record.'
  let image = `${origin}/icons/icon-512.png`

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const sbKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (UUID.test(id) && sbUrl && sbKey) {
    try {
      const headers = { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
      const res = await fetch(
        `${sbUrl}/rest/v1/collections?select=name,owner:profiles(display_name,username)&id=eq.${id}`,
        { headers }
      )
      if (res.ok) {
        const rows = await res.json()
        const c = rows && rows[0]
        if (c) {
          const owner = (c.owner && (c.owner.display_name || c.owner.username)) || 'Someone'
          title = `${c.name} — a TALLY list`
          desc = `A list by ${owner} on TALLY — drops with a track record.`
          const itemsRes = await fetch(
            `${sbUrl}/rest/v1/collection_items?select=drop:drops(media_urls,media_types,media_poster_urls,media_url,media_type,media_poster_url)&collection_id=eq.${id}&order=added_at.desc&limit=1`,
            { headers }
          )
          if (itemsRes.ok) {
            const items = await itemsRes.json()
            const d = items && items[0] && items[0].drop
            if (d) {
              const urls = d.media_urls || []
              const types = d.media_types || []
              const posters = d.media_poster_urls || []
              if (urls[0]) image = types[0] === 'video' ? posters[0] || image : urls[0]
              else if (d.media_url) image = d.media_type === 'video' ? d.media_poster_url || image : d.media_url
              if (image.includes('image.tmdb.org/t/p/')) image = image.replace(/\/t\/p\/[^/]+\//, '/t/p/original/')
            }
          }
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
    `<meta property="og:type" content="article">` +
    `<meta property="og:site_name" content="TALLY">` +
    `<meta property="og:title" content="${esc(title)}">` +
    `<meta property="og:description" content="${esc(desc)}">` +
    `<meta property="og:image" content="${esc(image)}">` +
    `<meta property="og:url" content="${esc(origin)}/list/${esc(id)}">` +
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
