/* 行徳農園アプリ｜家族共有：保存（単独で完結）
   POST /api/sync-put   body: {"key":"gyotoku.worklog.v1","value":"<文字列>"}
   ・鍵は gyotoku で始まるものだけ許可。値は文字列（アプリが作ったJSON文字列）。 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const authErr = checkPass(request, env);
  if (authErr) return authErr;

  if (!env.GYOTOKU_KV) {
    return json({ ok: false, error: "KV binding GYOTOKU_KV is not set up" }, 500);
  }

  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: "bad json" }, 400); }

  const key = body && body.key;
  const value = body && body.value;
  if (typeof key !== "string" || key.indexOf("gyotoku") !== 0) return json({ ok: false, error: "bad key" }, 400);
  if (typeof value !== "string") return json({ ok: false, error: "value must be string" }, 400);
  if (value.length > 2000000) return json({ ok: false, error: "too big" }, 413);

  await env.GYOTOKU_KV.put("d:" + key, value);
  return json({ ok: true });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function checkPass(request, env) {
  const need = env.PHOTO_PASSCODE != null && String(env.PHOTO_PASSCODE).length > 0;
  if (!need) return null;
  const got = request.headers.get("x-photo-pass") || "";
  if (got !== String(env.PHOTO_PASSCODE)) return json({ ok: false, error: "passcode" }, 401);
  return null;
}
