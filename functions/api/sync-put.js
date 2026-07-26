/* 行徳農園アプリ｜家族共有：保存（単独で完結）
   POST /api/sync-put   body: {"key":"gyotoku.worklog.v1","value":"<文字列>"}
   ・鍵は gyotoku で始まるものだけ許可。値は文字列（アプリが作ったJSON文字列）。

   ★★v63 ここが「家族の書き込みが消える」の本体だった ★★
   ── 何が起きていたか（偽サーバーで再現して確定） ──
     v62まで、この関数は届いた値を **そのまま上書き** していた。
     端末側は「読む→合流→送る」の順にしてあるが、
     **閉じる／裏に回るときの送信(syncFlush)だけは、読む時間が無いので読まずに送る。**
     そのため「最後に読んでから閉じるまでの間に家族が書いたぶん」が、まるごと消えていた。

       サーバー ["草刈り(親方)"] → 家族の端末が閉じる → サーバー ["水見(家族)"]
       → 3台目はもう親方の予定を受け取れない

     相手の端末が開いていれば次の同期で直るので、**時々しか起きず、後から見ると直っている**。
     いちばん見つけにくい型だった。

   ── 直しかた（読む側の回避ではなく、書く側を直す） ──
     **足し算にする。** いま入っている中身を読んで、届いたぶんを合わせてから書く。
     合わせかたは端末側(_mergeVal)と同じ規則にそろえる：
       ・並び型（配列）… 印(id か JSON全文)で重ね合わせ。同じ id は _m が新しいほうが勝つ
       ・箱型（オブジェクト）… 鍵ごとに足す。同じ鍵は「あとから届いたほう」が勝つ
       ・削除印(tomb)… 2段の入れ子で足し、同じ印は新しい時刻を採用
       ・消された記録は、削除印に載っているものを外す（端末側と同じ扱い）
     ★合わせる途中で何か起きたら、**届いた値をそのまま書く**（＝v62までと同じ動き）。
       直したせいで前より悪くなることは無いようにしてある。
*/
const TOMB_KEY = "gyotoku.tomb.v1";

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

  /* ★v63 上書きではなく合流。読めない・合わせられない時は、届いた値をそのまま書く */
  let toWrite = value;
  let merged = false;
  try {
    const old = await env.GYOTOKU_KV.get("d:" + key);
    if (old != null && old !== value) {
      let tomb = null;
      if (key !== TOMB_KEY) {
        try {
          const t = await env.GYOTOKU_KV.get("d:" + TOMB_KEY);
          if (t != null) tomb = JSON.parse(t);
        } catch (e) { tomb = null; }
      }
      const m = mergeValue(old, value, key, tomb);
      if (m != null && m.length <= 8000000) { toWrite = m; merged = true; }
    }
  } catch (e) { toWrite = value; merged = false; }

  await env.GYOTOKU_KV.put("d:" + key, toWrite);
  return json({ ok: true, merged: merged });
}

/* ===== 合流（端末側 _mergeVal と同じ規則。ここだけで完結させる） ===== */
export function mergeValue(oldStr, newStr, key, tombObj) {
  let O = null, N = null;
  try { O = JSON.parse(oldStr); } catch (e) { O = null; }
  try { N = JSON.parse(newStr); } catch (e) { N = null; }
  if (N === null || N === undefined) return oldStr;   /* 届いたほうが読めない＝今のを守る */
  if (O === null || O === undefined) return newStr;

  /* 削除印そのもの：2段の入れ子。同じ印は新しい時刻を採用 */
  if (key === TOMB_KEY) {
    if (!isPlainObj(O) || !isPlainObj(N)) return newStr;
    const out = {};
    for (const k in O) if (Object.prototype.hasOwnProperty.call(O, k) && isPlainObj(O[k])) out[k] = Object.assign({}, O[k]);
    for (const k in N) {
      if (!Object.prototype.hasOwnProperty.call(N, k) || !isPlainObj(N[k])) continue;
      const m = out[k] || (out[k] = {});
      for (const s in N[k]) {
        if (!Object.prototype.hasOwnProperty.call(N[k], s)) continue;
        if (!(s in m) || N[k][s] > m[s]) m[s] = N[k][s];
      }
    }
    return JSON.stringify(out);
  }

  /* 並び型（配列） */
  if (O instanceof Array && N instanceof Array) {
    const TOMB = (tombObj && isPlainObj(tombObj) && isPlainObj(tombObj[key])) ? tombObj[key] : {};
    const srcs = [O, N];
    const winner = {};
    for (let si = 0; si < 2; si++) {
      for (let a = 0; a < srcs[si].length; a++) {
        const it = srcs[si][a], s = sigOf(it);
        if (s.indexOf("id:") !== 0) continue;
        const p = winner[s];
        if (!p || (((it && it._m) || 0) > ((p._m) || 0))) winner[s] = it;
      }
    }
    const seen = {}, out = [];
    for (let si = 0; si < 2; si++) {
      for (let a = 0; a < srcs[si].length; a++) {
        const it = srcs[si][a], s = sigOf(it);
        if (TOMB[s]) continue;          /* 消された記録は入れない */
        if (seen[s]) continue;
        seen[s] = 1;
        out.push(s.indexOf("id:") === 0 ? winner[s] : it);
      }
    }
    return JSON.stringify(out);
  }

  /* 箱型（オブジェクト）：鍵ごとに足す。同じ鍵はあとから届いたほうが勝つ */
  if (isPlainObj(O) && isPlainObj(N)) {
    const out = {};
    for (const k in O) if (Object.prototype.hasOwnProperty.call(O, k)) out[k] = O[k];
    for (const k in N) if (Object.prototype.hasOwnProperty.call(N, k)) out[k] = N[k];
    return JSON.stringify(out);
  }

  /* 形が違う（片方が数値・文字列など）：届いたほうを採る＝v62までと同じ */
  return newStr;
}

function isPlainObj(v) { return v != null && typeof v === "object" && !(v instanceof Array); }

/* 端末側 _sig と同じ規則：id があれば id、無ければ JSON 全文 */
function sigOf(it) {
  if (it && typeof it === "object" && (typeof it.id === "string" || typeof it.id === "number")) return "id:" + it.id;
  try { return "j:" + JSON.stringify(it); } catch (e) { return "x:" + Math.random(); }
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
