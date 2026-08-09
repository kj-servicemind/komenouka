/* 行徳農園アプリ｜版の見張りに「先頭だけ」を返す（★v128 新規）
   ─────────────────────────────────────────────────────────────
   ★★ なぜこれが要るのか ★★

   端末は版を確かめるとき「index.html の先頭1KBだけください」(Range)と頼む（v54から）。
   ところが **Cloudflare Pages は 206（先頭だけ返す）に対応していない**（公式に未対応）。
   そのため毎回 index.html を丸ごと（圧縮後 約667KB）送りつけてくる。

   端末側の自動の見張りは 45秒で札を捨てて諦める（v58）。
   回線が細い端末では**毎回ぎりぎり間に合わず、一度も成功しない**。
   実際、親方の端末もご家族の端末も「最後に確かめた」が
   **手で押した時刻のまま／一度も無し** だった（2026/08/09 実機・写真で確定）。

   v127 で端末側を直した（届いた先頭だけ読んで打ち切る）が、
   **その直しを受け取るには、一度は受け取れないといけない**。
   遠方のご家族の端末は手で押せない。＝ここを直さないと永久に届かない。

   ── そこで、応える側を作る ──
   「先頭だけください」と頼まれたら、**こちらで先頭だけ返す**。
   ★これは端末のアプリを書き換えないので、**v122・v126 などの古い端末にもそのまま効く**。
     頼む作りは v54 から入っているので、遠方の端末も、もう頼んでいる。

   ─────────────────────────────────────────────────────────────
   ★★ 安全のためにしていること（§0.5②・§10-12「消さない側を先に決めて狭くする」）★★

   ここは **サイトに来るすべての求め** が通る場所である。壊すと家族全員がアプリを開けない。
   そこで「引き受ける条件」を、これ以上ないほど狭くしてある：

     ① GET のときだけ（POST＝同期の書き込みは、指1本触れない）
     ② 行き先が「/」か「/index.html」のときだけ（/api/… は素通し）
     ③ Range が ちょうど「bytes=0-数字」の形のときだけ
     ④ その数字が 64KB 以内のときだけ（動画のような大きな求めは引き受けない）

   この4つを全部満たさなければ、**何もせず next() でいつもどおりに流す**。
   さらに全体を try/catch で包み、**途中で何が起きても必ず next() に落ちる**。
   ＝ 直したせいで前より悪くなることは無い（v63 の sync-put.js と同じ考え方）。

   🚩 それでも心配なときは、**このファイルを GitHub から消せば元どおり**になる。
      消すだけで復旧できる形にしてあるのが、この作りのいちばんの利点。
   ───────────────────────────────────────────────────────────── */

export async function onRequest(context) {
  const { request, next, env } = context;
  try {
    const end = wantHead(request);          /* 引き受けてよい求めか。違えば null */
    if (end !== null && env && env.ASSETS) {
      const res = await headOnly(request, env, end);
      if (res) return res;                  /* 先頭だけ返せた */
    }
  } catch (e) {
    /* 何が起きても、いつもどおりに流す（★ここが安全弁） */
  }
  return next();
}

/* 「先頭だけ」の求めかどうかを見る。引き受けるなら最後のバイト位置、違えば null。
   ★ここを狭くしておくことが、そのまま安全につながる（§10-12） */
function wantHead(request) {
  try {
    if (!request || request.method !== "GET") return null;

    const p = new URL(request.url).pathname;
    if (p !== "/" && p !== "/index.html") return null;   /* ★/api/… は通さない */

    const raw = request.headers.get("Range");
    if (!raw) return null;

    /* ちょうど「bytes=0-数字」だけを引き受ける。
       「bytes=500-1000」「bytes=0-」「bytes=-500」は引き受けない＝素通し */
    const m = /^\s*bytes\s*=\s*0\s*-\s*(\d+)\s*$/.exec(raw);
    if (!m) return null;

    const end = parseInt(m[1], 10);
    if (!(end >= 0) || end > 65535) return null;         /* 64KBまで。それ以上は素通し */
    return end;
  } catch (e) { return null; }
}

/* 先頭だけ読んで 206 で返す。
   ★こちら側も、要る所まで読んだら受け取りをやめる（端末側 verReadHead と同じ考え方）。
     全部読むと 1.3MB ぶんの手間がかかり、Cloudflare の持ち時間を無駄に使う。 */
async function headOnly(request, env, end) {
  const origin = new URL(request.url).origin;

  /* ★Range を付けずに頼む。付けると、また丸ごと返ってくるだけで意味がない。
     ★identity＝圧縮しないで、と頼む。圧縮されていると何バイト目かが数えられない */
  const asset = await env.ASSETS.fetch(new Request(origin + "/", {
    method: "GET",
    headers: { "accept-encoding": "identity" }
  }));
  if (!asset || !asset.ok) return null;

  /* 全体が何バイトかは、分かれば書く。分からなければ「*」（決まりで許されている） */
  let total = null;
  try {
    const cl = asset.headers.get("content-length");
    if (cl && /^\d+$/.test(cl)) total = parseInt(cl, 10);
  } catch (e) { total = null; }

  const want = end + 1;
  let buf = null;

  const body = asset.body;
  if (body && body.getReader) {
    const rd = body.getReader();
    const parts = [];
    let got = 0;
    while (got < want) {
      const o = await rd.read();
      if (o.done) break;
      if (o.value && o.value.length) { parts.push(o.value); got += o.value.length; }
    }
    try { await rd.cancel(); } catch (e) { }        /* ★用は済んだ。受け取りをやめる */
    buf = joinBytes(parts, Math.min(got, want));
    if (total === null && got < want) total = got;  /* 最後まで読み切った＝これが全体 */
  } else {
    const all = new Uint8Array(await asset.arrayBuffer());
    if (total === null) total = all.length;
    buf = all.slice(0, Math.min(all.length, want));
  }

  if (!buf || buf.length === 0) return null;

  const last = buf.length - 1;
  return new Response(buf, {
    status: 206,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-range": "bytes 0-" + last + "/" + (total === null ? "*" : total),
      "content-length": String(buf.length),
      "accept-ranges": "bytes",
      "cache-control": "no-store"          /* 版の確かめなので、控えさせない */
    }
  });
}

/* ばらばらに届いた かたまり を1本につなぎ、要るぶんだけ切り出す */
function joinBytes(parts, want) {
  let n = 0;
  for (let i = 0; i < parts.length; i++) n += parts[i].length;
  const out = new Uint8Array(Math.min(n, want));
  let at = 0;
  for (let i = 0; i < parts.length && at < out.length; i++) {
    const p = parts[i];
    const take = Math.min(p.length, out.length - at);
    out.set(p.subarray(0, take), at);
    at += take;
  }
  return out;
}
