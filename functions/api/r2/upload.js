/**
 * POST /api/r2/upload
 * Body (JSON): { data: "<base64 or data-URL>", name: "optional-filename.jpg" }
 * Returns: { url: "/api/r2/images/xxx.jpg" }
 *
 * Bindings required:
 *   R2 Bucket binding: RS_R2
 *   Environment variable: ADMIN_TOKEN
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RS_R2) {
    return new Response('R2 binding not configured', { status: 503, headers: corsHeaders() });
  }

  const authErr = checkAuth(request, env);
  if (authErr) return authErr;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400, headers: corsHeaders() });
  }

  const raw = body.data;
  if (!raw) return new Response('Bad Request: missing data field', { status: 400, headers: corsHeaders() });

  // Strip optional data-URL prefix: "data:image/jpeg;base64,..."
  const base64Data = raw.replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
  } catch {
    return new Response('Bad Request: invalid base64', { status: 400, headers: corsHeaders() });
  }

  const name = body.name || ('img_' + Date.now() + '.jpg');
  const ext = name.split('.').pop().toLowerCase();
  const contentTypeMap = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
  const contentType = contentTypeMap[ext] || 'image/jpeg';

  // Store under images/ prefix for R2 organisation
  const key = 'images/' + name;
  await env.RS_R2.put(key, buffer, { httpMetadata: { contentType } });

  return jsonResponse({ url: '/api/r2/' + key, key });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
  });
}
