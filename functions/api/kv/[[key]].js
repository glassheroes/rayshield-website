/**
 * GET  /api/kv          — returns all RS keys as JSON object (public read)
 * GET  /api/kv/:key     — returns single value (public read)
 * PUT  /api/kv/:key     — upsert value (admin only)
 * DELETE /api/kv/:key   — delete key (admin only)
 *
 * Bindings required (Cloudflare Pages → Settings → Functions):
 *   KV Namespace binding: RS_KV
 *   Environment variable: ADMIN_TOKEN
 */

const RS_KEYS = [
  'rs_film_plus', 'rs_film_std', 'rs_promotions', 'rs_branches', 'rs_reviews',
  'rs_homepage', 'rs_faqs', 'rs_articles', 'rs_seo', 'rs_banner', 'rs_popup',
  'rs_site_tags', 'rs_site_favicon'
];

export async function onRequest(context) {
  const { request, env, params } = context;
  const key = params.key ? params.key[0] : null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Guard: KV binding not configured — return empty data instead of crashing
  if (!env.RS_KV) {
    if (request.method === 'GET') return jsonResponse(key ? null : {});
    return new Response('KV binding not configured', { status: 503, headers: corsHeaders() });
  }

  // ── GET ──────────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    if (!key) {
      // Bulk-fetch all RS keys in parallel
      const values = await Promise.all(RS_KEYS.map(k => env.RS_KV.get(k)));
      const result = {};
      RS_KEYS.forEach((k, i) => { if (values[i] !== null) result[k] = values[i]; });
      return jsonResponse(result);
    }
    const value = await env.RS_KV.get(key);
    if (value === null) return new Response('Not Found', { status: 404, headers: corsHeaders() });
    return new Response(value, {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  // Writes require auth
  const authErr = checkAuth(request, env);
  if (authErr) return authErr;

  // ── PUT ──────────────────────────────────────────────────────────────────
  if (request.method === 'PUT') {
    if (!key) return new Response('Bad Request: missing key', { status: 400, headers: corsHeaders() });
    const body = await request.text();
    await env.RS_KV.put(key, body);
    return jsonResponse({ ok: true });
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    if (!key) return new Response('Bad Request: missing key', { status: 400, headers: corsHeaders() });
    await env.RS_KV.delete(key);
    return jsonResponse({ ok: true });
  }

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
}

function checkAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expected = (env && env.ADMIN_TOKEN) ? env.ADMIN_TOKEN : 'rayshield@2026';
  if (!token || token !== expected) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  }
  return null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}
