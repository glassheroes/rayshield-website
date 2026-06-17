/**
 * GET    /api/r2/images/:filename  — serve object from R2 (public)
 * DELETE /api/r2/images/:filename  — delete object (admin only)
 *
 * Bindings required:
 *   R2 Bucket binding: RS_R2
 *   Environment variable: ADMIN_TOKEN
 */

export async function onRequest(context) {
  const { request, env, params } = context;

  // params.key is an array of path segments (catch-all [[key]])
  const key = params.key ? params.key.join('/') : null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (!env.RS_R2) return new Response('R2 binding not configured', { status: 503, headers: corsHeaders() });
  if (!key) return new Response('Not Found', { status: 404, headers: corsHeaders() });

  // ── GET ───────────────────────────────────────────────────────────────────
  if (request.method === 'GET') {
    const obj = await env.RS_R2.get(key);
    if (!obj) return new Response('Not Found', { status: 404, headers: corsHeaders() });

    const headers = new Headers(corsHeaders());
    obj.writeHttpMetadata(headers);
    headers.set('ETag', obj.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(obj.body, { headers });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (request.method === 'DELETE') {
    const authErr = checkAuth(request, env);
    if (authErr) return authErr;
    await env.RS_R2.delete(key);
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
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}
