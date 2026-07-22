/* 行徳農園アプリ｜家族共有：サーバー上の記録を消す（単独で完結）
   POST /api/sync-clear   body: {"keys":["gyotoku.worklog.v1", ...]}
   ・渡された鍵ぶんだけ delete する（KVの list は使わない）。
   ・本番前の「入力内容 全リセット」で、家族みんなの共有分も一緒に消したい時に使う。 */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  const authErr = checkPass(request, env);
  if (authErr) return authErr;

  if (!env.GYOTOKU_KV) {
    return json({ ok: false, error: "KV binding GYOTOKU_KV is not set up" }, 500);
  }

  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  let keys = (body && body.keys instanceof Array) ? body.keys : [];
  keys = keys
    .filter(function (k) { return typeof k === "string" && k.indexOf("gyotoku") === 0; })
    .slice(0, 50);

  let n = 0;
  for (const k of keys) { await env.GYOTOKU_KV.delete("d:" + k); n++; }
  return json({ ok: true, deleted: n });
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
