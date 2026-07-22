/* 行徳農園アプリ｜家族共有：読み込み（単独で完結）
   GET /api/sync-list?keys=gyotoku.worklog.v1,gyotoku.plans.v1,...
   ・渡された鍵ぶんだけを1件ずつ get する（KVの list は使わない＝無料枠にやさしい）。
   ・返すのは {ok:true, data:{ "gyotoku.xxx.v1": "<保存された文字列>", ... }} */
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") return json({ ok: false, error: "GET only" }, 405);

  const authErr = checkPass(request, env);
  if (authErr) return authErr;

  if (!env.GYOTOKU_KV) {
    return json({ ok: false, error: "KV binding GYOTOKU_KV is not set up" }, 500);
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("keys") || "";
  const keys = raw.split(",")
    .map(function (s) { return s.trim(); })
    .filter(function (k) { return k && k.indexOf("gyotoku") === 0; })
    .slice(0, 50);

  const out = {};
  for (const k of keys) {
    const v = await env.GYOTOKU_KV.get("d:" + k);
    if (v != null) out[k] = v;
  }
  return json({ ok: true, data: out });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

/* 合言葉(任意)。PHOTO_PASSCODE が設定されていれば x-photo-pass ヘッダーと照合する。 */
function checkPass(request, env) {
  const need = env.PHOTO_PASSCODE != null && String(env.PHOTO_PASSCODE).length > 0;
  if (!need) return null;
  const got = request.headers.get("x-photo-pass") || "";
  if (got !== String(env.PHOTO_PASSCODE)) return json({ ok: false, error: "passcode" }, 401);
  return null;
}
