/* 行徳農園アプリ｜今年の実際の気温をもらってくる（第1段・確かめ用）
   GET /api/jma-temp                    … 今年の5月〜今月ぶん（何も付けずに開いた時）
   GET /api/jma-temp?y=2026&m=7         … その月だけ
   GET /api/jma-temp?from=2026-05&to=2026-08 … その範囲

   ★この部品は index.html を1文字も触らない。家族の端末には何の影響も無い。
     まず「今年のぶんが本当に取れるか」を、親方が Safari で1回開いて確かめるためのもの。

   ── なぜ気象庁の「過去の気象データ検索」なのか ──
     アメダスのJSON（bosai）は **過去10日ぶんしか無い**（実際に4年前を叩いて404を確認）。
     田植え（5月）まで遡れないので、稲作先生の積算にはまるで足りない。
     日ごとの平均気温が遡って載っているのは、いまのところ この表だけ。

   ── 気象庁に迷惑をかけない作り ──
     気象庁は「自動化ツール等による過度のアクセスはお控えください」と書いておられる。
     ・**過ぎた月は、一度もらったら二度と取りに行かない**（KVに永久に控える）
     ・**今月ぶんも、1日1回だけ**（控えが今日のものなら、そのまま返す）
     ・1回のお願いで新しくもらうのは **最大4か月まで**
     → 家族が何回アプリを開いても、気象庁へ行くのは **1日1回以下**。
       人が手でページを開くより、ずっと少ない。

   ── 嘘の数字を出さないための検算（★ここがいちばん大事） ──
     表の列の場所で気温を読むので、**気象庁が表の作りを変えたら、別の列を読む恐れがある**。
     そこで1行ごとに **最高気温 ≧ 平均気温 ≧ 最低気温** を確かめ、
     合わない行は捨てる。列がずれれば、この検算はまず通らない。
     取れた日が少なすぎる月は「取れなかった」として返す。
     ★黙って それらしい数字を返すことは しない（CLAUDE.md §3.5）。
*/

const PREC  = "82";     /* 福岡県 */
const BLOCK = "0790";   /* 久留米（大刀洗町の最寄り観測点） */
const PLACE = "久留米";

/* 稲作先生が今つかっている月別の平年値（index.html の INA_NORMAL_TEMP の写し）。
   ★ここでは「実測が平年とどれだけ違うか」を親方にお見せするためだけに使う。 */
const NORMAL = [6.4,7.3,10.6,15.4,19.9,23.4,27.3,28.0,24.4,18.6,12.9,8.0];

const MAX_FETCH_PER_REQ = 4;   /* 1回のお願いで、新しく気象庁へ行くのは最大4か月まで */

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") return json({ ok: false, error: "GET only" }, 405);

  const authErr = checkPass(request, env);
  if (authErr) return authErr;

  const url = new URL(request.url);
  let list;
  try { list = monthList(url); }
  catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 400); }
  if (!list.length) return json({ ok: false, error: "月が決まらない" }, 400);

  const today = jstDate();                    /* 例 "2026-08-10" */
  const thisYm = today.slice(0, 7);           /* 例 "2026-08" */
  const months = {};
  let fetched = 0;

  for (const ym of list) {
    /* ① まず控え（KV）を見る */
    let cached = null;
    if (env.GYOTOKU_KV) {
      try {
        const s = await env.GYOTOKU_KV.get(kvKey(ym));
        if (s != null) cached = JSON.parse(s);
      } catch (e) { cached = null; }
    }

    /* ② 控えをそのまま使ってよいか決める
         ・過ぎた月 … 中身があれば、もう二度と取りに行かない
         ・今月     … 控えが「今日もらったもの」なら、そのまま使う */
    const past = (ym < thisYm);
    if (cached && cached.rows && cached.rows.length) {
      if (past || cached.got === today) { months[ym] = out(cached, "控え"); continue; }
    }

    /* ③ 先の月（まだ来ていない月）は、そもそも行かない */
    if (ym > thisYm) { months[ym] = { src: "なし", why: "まだ来ていない月", rows: null }; continue; }

    /* ④ 気象庁へ行く回数の上限。超えたら、控えがあればそれを返す */
    if (fetched >= MAX_FETCH_PER_REQ) {
      months[ym] = cached && cached.rows
        ? out(cached, "控え（今回は取り直していない）")
        : { src: "なし", why: "1回の上限（" + MAX_FETCH_PER_REQ + "か月）に達した。もう一度開いてください", rows: null };
      continue;
    }

    /* ⑤ もらいに行く */
    fetched++;
    const got = await grab(ym);
    if (!got.ok) { months[ym] = { src: "なし", why: got.why, rows: cached && cached.rows ? null : null }; continue; }

    const rec = { ym: ym, got: today, rows: got.rows, place: PLACE, way: got.way };
    months[ym] = out(rec, "気象庁");

    /* ⑥ 控えに残す。★書くのは、過ぎた月なら一生に1回・今月なら1日1回だけ */
    if (env.GYOTOKU_KV) {
      try { await env.GYOTOKU_KV.put(kvKey(ym), JSON.stringify(rec)); } catch (e) {}
    }
  }

  return json({
    ok: true,
    place: PLACE + "（" + PREC + "/" + BLOCK + "）",
    today: today,
    summary: summarize(months),
    months: months
  });
}

/* ===== どの月をお返しするか決める ===== */
function monthList(url) {
  const y = url.searchParams.get("y"), m = url.searchParams.get("m");
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");

  if (y && m) {
    const yy = parseInt(y, 10), mm = parseInt(m, 10);
    if (!(yy >= 2000 && yy <= 2100)) throw new Error("年がおかしい");
    if (!(mm >= 1 && mm <= 12)) throw new Error("月がおかしい");
    return [ymOf(yy, mm)];
  }
  if (from && to) return spanOf(from, to);

  /* 何も付けずに開かれた時 … 今年の5月から今月まで（稲作の期間） */
  const t = jstDate(), yy = parseInt(t.slice(0, 4), 10), mm = parseInt(t.slice(5, 7), 10);
  return spanOf(ymOf(yy, 5), ymOf(yy, Math.max(5, mm)));
}
function spanOf(a, b) {
  if (!/^\d{4}-\d{2}$/.test(a) || !/^\d{4}-\d{2}$/.test(b)) throw new Error("from/to は 2026-05 の形で");
  let y = parseInt(a.slice(0, 4), 10), m = parseInt(a.slice(5, 7), 10);
  const ey = parseInt(b.slice(0, 4), 10), em = parseInt(b.slice(5, 7), 10);
  const out = [];
  for (let g = 0; g < 24; g++) {
    if (y > ey || (y === ey && m > em)) break;
    out.push(ymOf(y, m));
    m++; if (m > 12) { m = 1; y++; }
  }
  if (!out.length) throw new Error("from が to より後になっている");
  return out;
}
function ymOf(y, m) { return y + "-" + (m < 10 ? "0" : "") + m; }
function kvKey(ym) { return "t:jma:" + BLOCK + ":" + ym; }
function out(rec, src) {
  return { src: src, got: rec.got, way: rec.way || "", days: rec.rows.length, rows: rec.rows };
}

/* ===== 気象庁の表から、日ごとの平均気温を読む ===== */
async function grab(ym) {
  const y = ym.slice(0, 4), m = String(parseInt(ym.slice(5, 7), 10));
  const u = "https://www.data.jma.go.jp/stats/etrn/view/daily_a1.php"
          + "?prec_no=" + PREC + "&block_no=" + BLOCK
          + "&year=" + y + "&month=" + m + "&day=&view=a1";
  let html;
  try {
    const r = await fetch(u, { headers: { "accept": "text/html" } });
    if (!r.ok) return { ok: false, why: "気象庁が " + r.status + " を返した" };
    html = await r.text();
  } catch (e) { return { ok: false, why: "つながらなかった" }; }

  const read = parseDaily(html);
  const rows = read.rows;
  if (!rows.length) return { ok: false, why: "表から気温を1日も読めなかった（表の作りが変わった恐れ）" };

  /* 過ぎた月なのに日数が足りない＝読み落としている恐れがあるので、そう書いて返す */
  const need = daysIn(parseInt(y, 10), parseInt(m, 10));
  const thisYm = jstDate().slice(0, 7);
  if (ym < thisYm && rows.length < need - 2) {
    return { ok: false, why: "その月は" + need + "日あるのに" + rows.length + "日ぶんしか読めなかった" };
  }
  return { ok: true, rows: rows, way: read.name };
}

/* ★★表の読み方（ここがこの部品の心臓） ★★
   ── なぜ「何列目」で決め打ちしないか ──
     気象庁の表は、見かた（view）や地点の種類で列の数が変わる。
     解説記事を何本か見ても、「平均気温は6列目」「4列目」と食い違っていた。
     決め打ちにすると、**ずれたまま黙って別の数字を返す**恐れがある。いちばん危ない型。
   ── かわりにやること ──
     読み方の候補を3つ用意して、**月ぶん丸ごと**それぞれで読み、
     「最高≧平均≧最低」を通った日がいちばん多い読み方を採る。
     どの読み方も1日も通らなければ「読めなかった」として返す（＝平年値のままにする）。
     ★候補③は列を数えない：時分（例 15:18）の並びから気温の場所を割り出す。
       降水量の列が増え減りしても、これは付いてくる。 */
function parseDaily(html) {
  const lines = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(strip(td[1]));
    if (cells.length < 8 || cells.length > 24) continue;
    lines.push(cells);
  }

  const ways = [
    { name: "6/7/9", pick: function (c) { return [c[6], c[7], c[9]]; } },
    { name: "4/5/6", pick: function (c) { return [c[4], c[5], c[6]]; } },
    { name: "時分から", pick: function (c) {
        const t = timeIdx(c);
        if (t.length < 4) return null;
        return [c[t[2] - 2], c[t[2] - 1], c[t[3] - 1]];
      } }
  ];

  let best = { rows: [], name: "" };
  for (let w = 0; w < ways.length; w++) {
    const rows = [], seen = {};
    for (let i = 0; i < lines.length; i++) {
      const c = lines[i];
      const day = num(c[0]);
      if (day === null || day < 1 || day > 31 || day !== Math.floor(day)) continue;
      let three = null;
      try { three = ways[w].pick(c); } catch (e) { three = null; }
      if (!three) continue;
      const avg = numT(three[0]), max = numT(three[1]), min = numT(three[2]);
      if (avg === null || max === null || min === null) continue;
      if (avg < -50 || avg > 60) continue;
      if (!(max >= avg && avg >= min)) continue;   /* ★検算。ずれた読み方はここで落ちる */
      if (seen[day]) continue;
      seen[day] = 1;
      rows.push([day, avg]);
    }
    if (rows.length > best.rows.length) best = { rows: rows, name: ways[w].name };
  }
  best.rows.sort(function (a, b) { return a[0] - b[0]; });
  return best;
}

/* 「15:18」「24:00」のような時分のセルが、何番目にあるか */
function timeIdx(cells) {
  const out = [];
  for (let i = 0; i < cells.length; i++) if (/^\d{1,2}:\d{2}/.test(cells[i])) out.push(i);
  return out;
}

function strip(s) {
  return String(s).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}
/* 数値だけ取り出す。"///" "--" "×" や、記号つき "36.3 )" にも耐える。読めなければ null */
function num(s) {
  const m = String(s).match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const v = parseFloat(m[0]);
  return isFinite(v) ? v : null;
}
/* ★★気温として読んでよい値だけを取る（★ここは検証で1回しくじって足した所）★★
   ── 何が起きたか ──
     列が1つずれた表を試したところ、「24:00」という**時分のセルから 24 を拾い**、
     しかも 最高31.0 ≧ 平均24 ≧ 最低15 と、**検算まで通ってしまった**。
     ＝ 気温ではないものを、気温として返すところだった。いちばん危ない型。
   ── 直しかた ──
     時分の形（15:18・24:00）をしているセルは、**気温としては読まない**。 */
function numT(s) {
  const t = String(s).trim();
  if (/^\d{1,2}:\d{2}/.test(t)) return null;
  return num(t);
}
function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/* ===== 親方にお見せする要約（実測は平年とどれだけ違うか） ===== */
function summarize(months) {
  let got = 0, real = 0, norm = 0;
  for (const ym in months) {
    const o = months[ym];
    if (!o || !o.rows || !o.rows.length) continue;
    const mi = parseInt(ym.slice(5, 7), 10) - 1;
    for (let i = 0; i < o.rows.length; i++) { got++; real += o.rows[i][1]; norm += NORMAL[mi]; }
  }
  if (!got) return "実測は1日も取れていません（＝いまは平年値のままです）";
  const diff = real - norm, per = real / got;
  const days = per > 0 ? (diff / per) : 0;
  return "実測が取れた日 " + got + "日／積算 " + real.toFixed(1) + "℃"
       + "（平年なら " + norm.toFixed(1) + "℃）"
       + "／差 " + (diff >= 0 ? "+" : "") + diff.toFixed(1) + "℃"
       + " ＝ およそ " + (days >= 0 ? "+" : "") + days.toFixed(1) + "日ぶん"
       + (diff >= 0 ? "（平年より早く進んでいる）" : "（平年より遅れている）");
}

/* ★検証から中身を直接たしかめられるように出しておく。
   sync-put.js が mergeValue を出しているのと同じ流儀（CLAUDE.md §10-18「本物の関数を呼ぶのが最短の裏取り」）。
   Cloudflare は onRequest だけを見るので、これがあっても動きに影響しない。 */
export const _test = { parseDaily, monthList, summarize, spanOf, num, strip, timeIdx };

/* ===== 道具 ===== */
function jstDate() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}
function json(obj, status) {
  return new Response(JSON.stringify(obj, null, 1), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" }
  });
}
/* 合言葉(任意)。sync-put.js・sync-list.js とまったく同じ作法 */
function checkPass(request, env) {
  const need = env.PHOTO_PASSCODE != null && String(env.PHOTO_PASSCODE).length > 0;
  if (!need) return null;
  const got = request.headers.get("x-photo-pass") || "";
  if (got !== String(env.PHOTO_PASSCODE)) return json({ ok: false, error: "passcode" }, 401);
  return null;
}
