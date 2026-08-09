/* 行徳農園アプリ｜版の見張りに「先頭だけ」を返す（v128 新規 ／ ★v130 で1か所直した）
   ─────────────────────────────────────────────────────────────
   ★★ なぜこれが要るのか ★★

   端末は版を確かめるとき「index.html の先頭1KBだけください」(Range)と頼む（v54から）。
   ところが **Cloudflare Pages は 206（先頭だけ返す）に対応していない**（公式に未対応）。
   そのため毎回 index.html を丸ごと（圧縮後 約667KB）送りつけてくる。

   端末側の自動の見張りは 45秒で札を捨てて諦める（v58）。
   回線が細い端末では**毎回ぎりぎり間に合わず、一度も成功しない**。

   v127 で端末側を直した（届いた先頭だけ読んで打ち切る）が、
   **その直しを受け取るには、一度は受け取れないといけない**。
   遠方のご家族の端末は手で押せない。＝ここを直さないと永久に届かない。

   ── そこで、応える側を作る ──
   「先頭だけください」と頼まれたら、**こちらで先頭だけ返す**。
   ★これは端末のアプリを書き換えないので、**v122・v126 などの古い端末にもそのまま効く**。

   ─────────────────────────────────────────────────────────────
   ★★★ v130 で直したこと（★実機で切り分けた） ★★★

   ── 何が起きていたか（2026/08/09・親方のテスト用端末）
     同じ端末なのに、開き方で答えが違った。

       13:22  ホーム画面のアプリ（版の確認）… ここを通る  → **v128**（「最新です」と嘘）
       13:26  Safari でふつうに開く          … ここを通らない → v129（正しい）
       13:31  入れ直したアプリ（版の確認）  … ここを通る  → v129（正しい）

     **食い違いの境目が、このファイルの担当範囲とぴったり一致していた。**

   ── 疑った所
     下の headOnly は、先頭を取りに行くとき **毎回まったく同じ場所** を頼んでいた。

       env.ASSETS.fetch(new Request(origin + "/", ...))

     端末は `?vn=13時26分` と毎回違う印を付けて「古いものを出さないで」と伝えているのに、
     **その印がここで落ちていた。** ここに古い写しが残ると、
     版の確認だけが古い答えを返し、端末には「サーバーは v128 です」と伝わる。

   ── 直しかた（★前より悪くならない形にする）
     ①端末が付けてきた印を、そのまま持って取りに行く（＝毎回ちがう頼み方になる）
     ②あわせて「控えを使わないで」と頼む
     ③★もし印つきで取れなかったら、**今までどおり "/" で取り直す**
       ＝ 直したせいで前より悪くなることは無い（v63 の sync-put.js と同じ考え方）

   🚩 ★これで直るかどうかは、**まだ確定していません**。
      13:22→13:31 の変化は「アプリを入れ直した」と「9分たった」が同時に起きており、
      どちらが効いたのか分けられていない。**疑わしいので直しておく**という段階。

   ─────────────────────────────────────────────────────────────
   ★★★ v134 で足したこと（★「見張りに賭けない」ための直し） ★★★

   ── なぜこれを足すのか（★親方のお言葉）
     「遠方の端末では確認出来ない、自動更新されるのを祈るしか無い状況。
       だから、何度も自動更新何とか出来るようにお願いしている」

     v127〜v133 の直しは、どれも **「端末の見張りがちゃんと動くか」** に賭けていた。
     賭けである以上、外れれば また祈ることになる。**直す場所を変える。**

   ── ★①「開けば最新」（賭けない道）
     ご家族がホーム画面のアプリを叩くと、iPhone は index.html を取りに行く。
     このとき **端末に残った古い写しが使われる**なら、見張りが動く前から負けている。

     そこで、こちらから **「使う前に必ず確かめて」** と付けて返す。
       ・見張りが動くかどうかに **関係なく** 効く
       ・ご家族がすることは「いつもどおり開く」だけ
       ・★no-store（＝毎回まるごと落とす）ではなく **no-cache**。
         中身が変わっていなければ、端末とサーバーの間で軽くやりとりが済む

     🚩 **安全に劣化する形にしてある**：
        いまサーバーが既に「毎回確かめて」と返しているなら、**何も変わらない**（損はゼロ）。
        max-age が付いていたなら、**そこが効く**。どちらでも、いまより悪くはならない。

   ── ★②「祈らずに確かめる」ための、ちいさな確認ページ  /__gy
     こちらは **いまサーバーが何と返しているかを、まだ一度も測っていない**。
     測らずに「これで直ります」と言わないために、測る口を付ける（§0.5⑨）。

       ・親方が Safari で komenouka.pages.dev/__gy を **1回開くだけ**
       ・★遠方のご家族には何もお願いしない
       ・出るのは「サーバーが index.html に何と返しているか」だけ。
         端末の中の控えは見ない（iOS ではアプリと Safari で保存場所が別・§1③）
       ・★役目を終えたら、このファイルから消せばよい

   ─────────────────────────────────────────────────────────────
   ★★★ v133 で足したこと（★これが「遠方のご家族の端末」を救う本命） ★★★

   ── 誰を救うのか
     端末の版の見張りには、v131まで **道が2つ**あった。

       ①版の名前を直に読む（先頭1KBだけくださいと頼む＝GET + Range）
       ②指紋くらべ（軽い問い合わせ＝HEAD で ETag を見る）

     ②へ入るのは「一度でも先頭だけをもらえなかった端末」。
     ★その判断は端末に控えられ、**二度と①へ戻らない**（v132で廃止した仕掛け）。
     そして Cloudflare は **HEAD に ETag も Last-Modified も返さない**。
     ②の入口は「指紋が無ければ黙って終わる」形だったので、
     **その端末は永久に新しい版に気づかない。**

   ── なぜ v128〜v132 の直しでは救えなかったか（★ここが4版ぶんの見落とし）
     下の GET の受け口は **GET の Range だけ**を引き受けている。
     ところが **②に閉じこもった端末は Range を打たない。HEAD しか打たない。**
     ＝ **助ける仕掛けを、助ける相手が一度も通らない道に置いていた。**

     v132 で端末側の②を廃止したが、その直しは **v132 が届いた端末にしか効かない**。
     届かない端末を救うための直しが、届かないと効かない（＝鶏と卵）。

   ── そこで、応える側だけで手を伸ばす
     **HEAD で頼まれたら、ETag（指紋）を返す。**
     ★端末のアプリには指1本触れない。遠方のご家族に何もお願いしない。
     ★ETag は index.html の**先頭1KBの中身**から作る。
       版が変われば <meta app-ver> が変わる → 先頭1KBが変わる → ETag が必ず変わる。
       同じ版のあいだは同じ ETag（＝むだに丸ごと落としに行かせない）。

   ── ★ここで絶対にしないこと（するといま より悪くなる）
     ①**304 は絶対に返さない。** If-None-Match / If-Modified-Since は**見もしない**。
       304 を返すと、そのあと端末が版名を読みに行っても中身が空になり、
       「黙って終わる出口」が1つ増える＝いまより悪化する
     ②**下の GET の経路（wantHead / headOnly）には手を入れない。**
       いま正しく動いている端末（v132・親方の端末）は GET+Range で動いている。
       ここを触ると、直っている端末まで壊す
     ③**ETag を毎回変わるもの（時刻・乱数）にしない。**
       毎回変われば、②の端末が毎回まるごと落としに行くことになり通信量が跳ねる

   ─────────────────────────────────────────────────────────────
   ★★ 安全のためにしていること（§0.5②・§10-12「消さない側を先に決めて狭くする」）★★

   ここは **サイトに来るすべての求め** が通る場所である。壊すと家族全員がアプリを開けない。
   そこで「引き受ける条件」を、これ以上ないほど狭くしてある：

     ① GET のときだけ（POST＝同期の書き込みは、指1本触れない）
     ② 行き先が「/」か「/index.html」のときだけ（/api/… は素通し）
     ③ Range が ちょうど「bytes=0-数字」の形のときだけ
     ④ その数字が 64KB 以内のときだけ（動画のような大きな求めは引き受けない）

   ★v133 で足した HEAD の受け口も、同じ狭さにしてある：
     ⑤ HEAD のときだけ（GET・POST には一切さわらない）
     ⑥ 行き先が「/」か「/index.html」のときだけ（/api/… は素通し）
     ⑦ 先頭1KBが読めたときだけ（読めなければ引き受けない＝素通し）

   この条件を満たさなければ、**何もせず next() でいつもどおりに流す**。
   さらに全体を try/catch で包み、**途中で何が起きても必ず next() に落ちる**。

   🚩 それでも心配なときは、**このファイルを GitHub から消せば元どおり**になる。
   ───────────────────────────────────────────────────────────── */

export async function onRequest(context) {
  const { request, next, env } = context;
  try {
    /* ★★v134② ちいさな確認ページ。いま何が返っているかを測るためだけの口。
       ★いちばん先に見る。ここは「/」でも「/index.html」でもないので、他に一切ぶつからない */
    if (wantChk(request) && env && env.ASSETS) {
      const res = await chkPage(request, env);
      if (res) return res;
    }

    /* ★★v133 HEAD には ETag（指紋）を返す。
       ②に閉じこもった端末は HEAD しか打たないので、ここが唯一の通り道になる。
       ★下の GET の経路には**指1本触れていない**（§4-2②） */
    if (wantTag(request) && env && env.ASSETS) {
      const res = await tagOnly(request, env);
      if (res) return res;                  /* 指紋を返せた */
    }

    const end = wantHead(request);          /* 引き受けてよい求めか。違えば null */
    if (end !== null && env && env.ASSETS) {
      const res = await headOnly(request, env, end);
      if (res) return res;                  /* 先頭だけ返せた */
    }
  } catch (e) {
    /* 何が起きても、いつもどおりに流す（★ここが安全弁） */
  }

  /* ★★v134① 「開けば最新」。
     ふつうにアプリを開いた時（GET・Rangeなし）だけ、
     いつもどおり作った返事に **「使う前に必ず確かめて」** を付け直して返す。
     ★中身には指1本触れない。付け替えるのは札(ヘッダー)だけ。
     ★うまくいかなければ、作った返事をそのまま返す＝いまより悪くならない */
  const res = await next();
  try {
    if (wantFresh(request)) return freshen(res);
  } catch (e) { }
  return res;
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

/* ★v130 中身を取りに行く。ここだけを1本にまとめてある。
   ★Range を付けずに頼む。付けると、また丸ごと返ってくるだけで意味がない。
   ★identity＝圧縮しないで、と頼む。圧縮されていると何バイト目かが数えられない。
   ★no-cache＝控えを使わないで、と頼む（v130で追加）。 */
async function fetchAsset(env, url) {
  try {
    return await env.ASSETS.fetch(new Request(url, {
      method: "GET",
      headers: {
        "accept-encoding": "identity",
        "cache-control": "no-cache",
        "pragma": "no-cache"
      }
    }));
  } catch (e) { return null; }
}

/* 先頭だけ読んで 206 で返す。
   ★こちら側も、要る所まで読んだら受け取りをやめる（端末側 verReadHead と同じ考え方）。 */
async function headOnly(request, env, end) {
  const origin = new URL(request.url).origin;

  /* ★★v130 ①まず、端末が付けてきた印をそのまま持って取りに行く。
       端末は ?vg=… ?vn=… と毎回ちがう印を付けている（古いものを出さないための印）。
       v129まではこれを捨てて origin+"/" だけで頼んでいたので、
       **毎回まったく同じ頼み方**になり、古い写しを掴む余地があった。 */
  let asset = await fetchAsset(env, request.url);

  /* ★★v130 ③印つきで取れなかったら、今までどおり "/" で取り直す。
       ＝ 直したせいで前より悪くなることは無い（安全に劣化する） */
  if (!asset || !asset.ok) asset = await fetchAsset(env, origin + "/");
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

/* ═══════════════════════════════════════════════════════════════
   ★★ ここから下が v134 で足したぶん。
      ①開けば最新（wantFresh / freshen）
      ②ちいさな確認ページ（wantChk / chkPage）
   ═══════════════════════════════════════════════════════════════ */

/* 「ふつうにアプリを開いた」求めかどうか。
   ★版の見張り（Range つき）や HEAD は、上ですでに引き受けているのでここには来ない。
   ★ここに来るのは、ホーム画面のアプリを叩いた時・Safariで開いた時だけ */
function wantFresh(request) {
  try {
    if (!request || request.method !== "GET") return false;

    const p = new URL(request.url).pathname;
    if (p !== "/" && p !== "/index.html") return false;   /* ★/api/… は通さない */

    if (request.headers.get("Range")) return false;       /* 版の見張りの道は触らない */

    return true;
  } catch (e) { return false; }
}

/* 「使う前に必ず確かめて」を付け直す。
   ★中身（body）はそのまま。付け替えるのは札だけ。
   ★no-store にはしない。no-store は「保存すらするな」で、毎回まるごと落とすことになる。
     no-cache は「持っていてよいが、使う前に確かめて」。中身が同じなら軽く済む。
   ★元が何だったかを x-gy-was に残す（あとで /__gy で読むため。無害な覚え書き）

   ★★★ ここで一度しくじった（v134の検証で捕まえた）★★★
     覚え書きに **日本語「(なし)」** を入れていた。
     HTTP の札は ASCII しか許されないので **例外**になり、
     上の catch が黙って握りつぶし、**「開けば最新」が丸ごと効かなくなっていた**。
     しかも効かなくなるのは「元に控えの決まりが無いとき」＝**いちばん効かせたい場面**。
     🚩 **札の中身は必ず ASCII だけにする。** 画面に出す言葉と、機械に渡す札は別物。 */
function freshen(res) {
  try {
    if (!res || !res.headers) return res;
    const h = new Headers(res.headers);
    const was = h.get("cache-control");
    h.set("cache-control", "no-cache, must-revalidate");
    h.set("x-gy-was", ascii(was) || "none");   /* ★ASCII だけ。日本語は入れない */
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (e) { return res; }               /* ★しくじったら元のまま返す＝悪くならない */
}

/* 札に入れてよい文字だけ残す。空になったら空文字を返す。
   ★念のため長さも切る（長すぎる札は捨てられることがある） */
function ascii(s) {
  try {
    if (s == null) return "";
    return String(s).replace(/[^\x20-\x7E]/g, "").replace(/[\r\n]/g, "").slice(0, 120);
  } catch (e) { return ""; }
}

/* ── ②ちいさな確認ページ ────────────────────────────────
   ★「/__gy」ちょうどの時だけ。他のどの道にもぶつからない名前にしてある */
function wantChk(request) {
  try {
    if (!request || request.method !== "GET") return false;
    return new URL(request.url).pathname === "/__gy";
  } catch (e) { return false; }
}

/* いまサーバーが index.html に何と返しているかを、そのまま画面に出す。
   ★端末の中の控えは見ない（iOS ではアプリと Safari で保存場所が別なので、見えない）。
   ★役目を終えたら、この関数と wantChk を消せばよい */
async function chkPage(request, env) {
  try {
    const origin = new URL(request.url).origin;
    const asset = await fetchAsset(env, origin + "/?chk=" + Date.now());
    if (!asset) return null;

    const g = function (k) { try { const v = asset.headers.get(k); return v ? v : "（返ってきていません）"; } catch (e) { return "（読めません）"; } };

    /* 版の名前も読んでおく（サーバーがいま何版を配っているか） */
    let ver = "（読めません）";
    try {
      const buf = await readHeadBytes(asset, 2048);
      if (buf && buf.length) {
        const m = /name="app-ver"[^>]*content="([^"]+)"/.exec(new TextDecoder("utf-8").decode(buf));
        if (m) ver = m[1];
      }
    } catch (e) { }

    const rows = [
      ["サーバーが配っている版", ver],
      ["控えの決まり (cache-control)", g("cache-control")],
      ["指紋 (etag)", g("etag")],
      ["日付 (last-modified)", g("last-modified")],
      ["中身の大きさ (content-length)", g("content-length")],
      ["先頭だけ渡せるか (accept-ranges)", g("accept-ranges")]
    ];

    let html = '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<title>サーバーの返事</title><style>'
      + 'body{font-family:-apple-system,sans-serif;background:#FBFAF6;color:#1a1a1a;'
      + 'margin:0;padding:18px;font-size:19px;line-height:1.7}'
      + 'h1{font-size:22px;margin:0 0 6px}p{color:#555;font-size:16px;margin:0 0 18px}'
      + '.r{background:#fff;border:2px solid #cfc9b8;border-radius:12px;padding:14px 16px;margin:0 0 12px}'
      + '.k{font-size:15px;color:#555;margin:0 0 4px}.v{font-weight:700;word-break:break-all}'
      + '</style></head><body><h1>サーバーの返事</h1>'
      + '<p>いま komenouka.pages.dev が index.html に付けて返しているものです。'
      + 'この画面は、この端末の中の控えは見ていません。</p>';
    for (let i = 0; i < rows.length; i++) {
      html += '<div class="r"><div class="k">' + rows[i][0] + '</div>'
        + '<div class="v">' + String(rows[i][1]).replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</div></div>';
    }
    html += '</body></html>';

    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (e) { return null; }
}

/* ═══════════════════════════════════════════════════════════════
   ★★ v134 で足したぶんは、ここまで。
   ═══════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════
   ★★ ここから下が v133 で足したぶん。上の GET の経路とは完全に分けてある。
      （上を1文字も触らないために、あえて末尾へまとめた）
   ═══════════════════════════════════════════════════════════════ */

/* 「指紋だけください」の求めかどうかを見る。引き受けるなら true。
   ★GET・POST は絶対に引き受けない。HEAD だけ（§10-12「狭くする」） */
function wantTag(request) {
  try {
    if (!request || request.method !== "HEAD") return false;

    const p = new URL(request.url).pathname;
    if (p !== "/" && p !== "/index.html") return false;   /* ★/api/… は通さない */

    return true;
  } catch (e) { return false; }
}

/* 中身は返さず、ヘッダーだけ返す（HEAD なので中身が無いのが正しい）。
   ★If-None-Match / If-Modified-Since は **一度も見ていない**。
     見ないので、まちがっても 304 を返すことがない（§4-2①）。 */
async function tagOnly(request, env) {
  try {
    const origin = new URL(request.url).origin;

    /* 取りに行き方は GET の経路とまったく同じ（fetchAsset をそのまま使い回す）。
       ①端末が付けてきた印つきで頼む → ②だめなら "/" で取り直す＝安全に劣化する */
    let asset = await fetchAsset(env, request.url);
    if (!asset || !asset.ok) asset = await fetchAsset(env, origin + "/");
    if (!asset || !asset.ok) return null;

    /* ★先頭1KBだけ読む。ここに <meta app-ver> が入っている。
       版が変われば、この1KBが変わる → 指紋が必ず変わる */
    const buf = await readHeadBytes(asset, 1024);
    if (!buf || buf.length === 0) return null;   /* 読めなければ引き受けない＝素通し */

    const h = {
      "content-type": "text/html; charset=utf-8",
      "etag": etagOf(buf),                 /* ★必ず二重引用符つき（決まりで required） */
      "accept-ranges": "bytes",            /* 先頭だけの求めにも応じられる、と伝える */
      "cache-control": "no-store"          /* 版の確かめなので、控えさせない */
    };

    /* 元から日付が付いていれば、そのまま渡す。
       ★無いときに今の時刻を書いたりはしない。毎回変わる指紋になってしまう（§4-2③）。
         「分からないものを既定値でごまかさない」（CLAUDE.md §3.5） */
    try {
      const lm = asset.headers.get("last-modified");
      if (lm) h["last-modified"] = lm;
    } catch (e) { }

    return new Response(null, { status: 200, headers: h });
  } catch (e) { return null; }             /* 何が起きても素通しに落ちる */
}

/* 先頭の want バイトだけ読む。要る所まで読んだら受け取りをやめる。
   ★headOnly の中にある同じ処理には手を入れず、こちらに書き写してある。
     （直っている端末が通る道を、1文字も触らないため・§4-2②） */
async function readHeadBytes(asset, want) {
  try {
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
      try { await rd.cancel(); } catch (e) { }   /* ★用は済んだ。受け取りをやめる */
      return joinBytes(parts, Math.min(got, want));
    }
    const all = new Uint8Array(await asset.arrayBuffer());
    return all.slice(0, Math.min(all.length, want));
  } catch (e) { return null; }
}

/* 中身から指紋を作る。
   ★同じ中身なら必ず同じ指紋／中身が1文字でも違えば必ず違う指紋。
   ★時刻も乱数も使っていない（使うと毎回まるごと落としに行かせることになる・§4-2③）。
   ★二重引用符で囲むのは決まり（§4-2⑤）。 */
function etagOf(bytes) {
  let h1 = 0x811c9dc5 >>> 0;               /* FNV-1a の種 */
  let h2 = 0x9dc5811c >>> 0;               /* 別の種でもう1本まわす（取り違え防止） */
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ b, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  const hex = function (n) { return ("0000000" + (n >>> 0).toString(16)).slice(-8); };
  return '"' + hex(bytes.length) + hex(h1) + hex(h2) + '"';
}

/* ═══════════════════════════════════════════════════════════════
   ★★ v133 で足したぶんは、ここまで。
   ═══════════════════════════════════════════════════════════════ */

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
