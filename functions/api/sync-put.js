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

/* ★★v168 リセットの門番（★親方のご指示・2026/08/15）★★
   ── 何が起きていたか（親方の実機の「データの出来事」で確定した）
     テスト端末が 00:58 に「リセットの合図で364件消しました」と出した**直後**、
     同じ 00:58 に「家族から届きました：作業の記録 184件」と出ていた。
     消えたはずのものが、その場で戻ってきていた。

     原因は3つが噛み合っていた：
       ①ここ(sync-put)の合流は**足し算**。1台が184件送れば、サーバーは184件に戻る
       ②端末の syncFlush は、**サーバーを読まずに送る**（閉じる時は読む時間が無いため）。
         リセットの合図を見る前に、古い184件が飛ぶ
       ③端末側 v95 の直し「サーバーに無い鍵は送り忘れとみなして送り直す」が、
         **リセットで空にしたのか事故で消えたのかを区別できない**

     → 家族の端末は、**開く必要すらない。閉じられただけで全部戻る。**

   ── なぜ端末ではなくここを直すか（§0.5②「書く側を1本にする」）
     送る側は家族5人ぶんある。入口はここ1つ。
     ★さらに大事なこと：**まだ新しい版が届いていない端末にも効く。**
     端末を直す案だと、家族全員に版が行き渡るまで（数日ずれる・§0.5⑪②）穴が空く。

   ── ★★期限は付けない（★親方のご指示・2026/08/15）★★
     はじめ「3日で切れる」形にした。**これは設計の誤りだった。**
     こちらが「家族5人が数日で全員開く」と勝手に前提を置いていたが、
     親方に**「普段は1〜2台しか使わない。3日以内に5台開くのは不可能」**とご指摘いただいた。
     期限で切ると、4日目に久しぶりに開いた端末が古い記録を送り返し、**また全部戻る。**
     リセットも復元もめったにやらない作業なので、**確実に止め続けるほうを採る。**

   ── ★バックアップから復元したくなったら（期限が無いぶん、ここが要る）
     エポックが立っている限り、リセットより前に書かれた記録は入らない。
     復元の前に、**サーバーのエポックを消す**こと：
       Cloudflare の KV(GYOTOKU_KV) から  d:gyotoku.resetEpoch.v1  を削除する
     消せば門番は何もしなくなる（下の「es == null」の道に入る）。
     ★端末側の localStorage にも同じ鍵が残るので、そちらも消さないと合図が立て直る。
   ── ★この門番が守らないもの（できないことを正直に書く・§0.5⑯1）
     ・箱型（オブジェクト）のデータ … 1件ずつの「書かれた時刻」で選り分ける形になっていない。
       稲作先生・肥料の目標・土のメモなどは**素通りする**
     ・時刻を持たない古い記録（id が 'w'+ミリ秒 の形でないもの）… 0 として扱うので落ちる
       （★これはリセットの意図どおり。端末側 _recTime とまったく同じ規則） */
const EPOCH_KEY = "gyotoku.resetEpoch.v1";

/* 記録が「いつ書かれたか」。★端末側 _recTime とまったく同じ規則にそろえる。
   時刻をでっちあげない。読めなければ 0（＝いちばん古い）。 */
function recTime(it) {
  if (!it || typeof it !== "object" || (it instanceof Array)) return 0;
  const m = parseInt(it._m, 10);
  if (m > 0) return m;
  const id = (it.id == null) ? "" : String(it.id);
  const g = id.match(/(\d{12,})/);
  return g ? parseInt(g[1], 10) : 0;
}

/* リセットより前に書かれた記録を、届いた値から落とす。
   ★配列だけを相手にする。それ以外は何もしないで、そのまま返す（素通り）。 */
function gateValue(valueStr, epoch) {
  let N = null;
  try { N = JSON.parse(valueStr); } catch (e) { return valueStr; }
  if (!(N instanceof Array)) return valueStr;      /* 箱型・その他は触らない */
  const out = [];
  for (let i = 0; i < N.length; i++) {
    if (recTime(N[i]) > epoch) out.push(N[i]);
  }
  if (out.length === N.length) return valueStr;    /* 1件も落ちない＝作り直さない */
  try { return JSON.stringify(out); } catch (e) { return valueStr; }
}

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

  /* ★★v168 合流の**前に**門番を通す。
     ここより下（合流の規則）は一行も変えていない。
     ★エポックが無い／読めない／3日を過ぎている／エポック自身の書き込み → 何もしない。
       つまり**ふだんの動きは v167 までとまったく同じ**。 */
  let gated = 0;
  let useValue = value;
  if (key !== EPOCH_KEY) {
    try {
      const es = await env.GYOTOKU_KV.get("d:" + EPOCH_KEY);
      if (es != null) {
        let ep = 0;
        try { const eo = JSON.parse(es); ep = (eo && eo.t) ? eo.t : 0; } catch (e) { ep = 0; }
        const now = Date.now();
        /* ★期限は無い（ずっと効く）。ただし時計が先に進んでいる端末を守るため、
           エポックが未来を指しているときだけは効かせない。 */
        if (ep > 0 && ep <= now) {
          const g = gateValue(value, ep);
          if (g !== value) { gated = 1; useValue = g; }
        }
      }
    } catch (e) { useValue = value; gated = 0; }   /* ★何かあれば素通り＝前と同じ動き */
  }

  /* ★v63 上書きではなく合流。読めない・合わせられない時は、届いた値をそのまま書く */
  let toWrite = useValue;
  let merged = false;
  try {
    const old = await env.GYOTOKU_KV.get("d:" + key);
    if (old != null && old !== useValue) {
      let tomb = null;
      if (key !== TOMB_KEY) {
        try {
          const t = await env.GYOTOKU_KV.get("d:" + TOMB_KEY);
          if (t != null) tomb = JSON.parse(t);
        } catch (e) { tomb = null; }
      }
      const m = mergeValue(old, useValue, key, tomb);
      if (m != null && m.length <= 8000000) { toWrite = m; merged = true; }
    }
  } catch (e) { toWrite = useValue; merged = false; }

  await env.GYOTOKU_KV.put("d:" + key, toWrite);
  return json({ ok: true, merged: merged, gated: gated });
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

  /* ★★v75 箱型（オブジェクト）には、性質のちがう2種類がある ★★
     ── v74まで何がずれていたか ──
       ここは箱型をぜんぶ「鍵ごとに足す／同じ鍵はあとから届いたほうが勝つ」で合わせていた。
       ところが端末側(_mergeVal)は v63・v66 で2種類に分けてある。そろっていないので：
       ①〈設定の箱〉稲作先生（品種・田植え日）・肥料の目標は、中身がひとまとまりで
          初めて意味を持つ。鍵ごとに混ぜると「品種は家族の・田植え日は親方の」という
          あり得ない箱がサーバーにできる（端末側が v63 でわざわざ禁じた形）。
       ②〈場所ごとの表〉土のメモ・反省メモ・生産原価は、1件ずつ更新時刻を持っているのに、
          サーバーはそれを見ずに「あとから届いたほう」を採っていた。
          そのため**サーバーだけ古い値**を持ち、端末とサーバーが同じ値に落ち着かなかった。
     ── 見分けかた（端末側とまったく同じ物差し）──
       箱の**いちばん上に _m（数字）があるか**だけ。田んぼ名や月に _m は無いので取り違えない。
     ── 引き分けのときは「届いたほう」を採る（★ここだけ端末側と向きが逆で、わざと）──
       端末側は引き分けなら手元を残す（自分の画面を守るため）。
       サーバーで手元（＝いま入っているもの）を残すと、時刻を持たない古い形の書き込みが
       **永久にサーバーへ届かなくなる**。止まったままになる側には倒さない。 */
  if (isPlainObj(O) && isPlainObj(N)) {
    /* ①〈設定の箱〉丸ごと勝負。古いと分かっているものだけが負ける */
    const om = (typeof O._m === "number") ? O._m : 0;
    const nm = (typeof N._m === "number") ? N._m : 0;
    if (om || nm) return (nm >= om) ? newStr : oldStr;

    /* ②〈場所ごとの表〉鍵ごとに足したうえで、同じ鍵は1件ずつ更新時刻で勝負する */
    const out = {};
    for (const k in O) if (Object.prototype.hasOwnProperty.call(O, k)) out[k] = O[k];
    for (const k in N) {
      if (!Object.prototype.hasOwnProperty.call(N, k)) continue;
      out[k] = (Object.prototype.hasOwnProperty.call(O, k)) ? mergeEntry(O[k], N[k]) : N[k];
    }
    return JSON.stringify(out);
  }

  /* 形が違う（片方が数値・文字列など）：届いたほうを採る＝v62までと同じ */
  return newStr;
}

function isPlainObj(v) { return v != null && typeof v === "object" && !(v instanceof Array); }

/* ★v75 「場所ごとの表」の1件ぶんの勝負をつける。端末側 _mergeEntry と同じ規則。
   形は3とおり（端末側の注記のまま）：
     ①丸ごと型   {v:値, _m:時刻}                              …反省メモ・生産原価
     ②項目ごと型 {tags:[], memo:'', _m:{tags:時刻, memo:時刻}} …土のメモ
     ③時刻を持たない古いデータ（v65まで）
   o＝いまサーバーに入っているもの／n＝いま届いたもの。
   ★時刻をでっちあげない。「無い＝いちばん古い(0)」として正直に扱うだけ。
   ★引き分けは n（届いたほう）。理由は上の箱型のところに書いたとおり。 */
function mergeEntry(o, n) {
  const oo = isPlainObj(o), no = isPlainObj(n);
  /* ②項目ごと型：どちらか一方でも項目ごとの時刻を持っていれば、項目ごとに勝負する */
  if (oo && no && (isLeafStamped(o) || isLeafStamped(n))) {
    const om = isLeafStamped(o) ? o._m : {}, nm = isLeafStamped(n) ? n._m : {};
    const out = {}, mm = {};
    for (const p in o) if (Object.prototype.hasOwnProperty.call(o, p) && p !== "_m") out[p] = o[p];
    for (const p in n) {
      if (!Object.prototype.hasOwnProperty.call(n, p) || p === "_m") continue;
      const keepOld = ((om[p] || 0) > (nm[p] || 0)) && Object.prototype.hasOwnProperty.call(o, p);
      out[p] = keepOld ? o[p] : n[p];
    }
    for (const p in om) if (Object.prototype.hasOwnProperty.call(om, p)) mm[p] = om[p];
    for (const p in nm) if (Object.prototype.hasOwnProperty.call(nm, p) && (nm[p] || 0) > (mm[p] || 0)) mm[p] = nm[p];
    out._m = mm;
    return out;
  }
  /* ①丸ごと型／③古い形どうし：新しいほうが丸ごと勝つ。引き分けは届いたほう */
  return (entryTime(o) > entryTime(n)) ? o : n;
}

function isLeafStamped(e) {
  return !!(e && typeof e === "object" && !(e instanceof Array)
            && e._m && typeof e._m === "object" && !(e._m instanceof Array));
}

/* 1件ぶんの更新時刻。時刻が無いものは 0（＝いちばん古い）。端末側 _entryTime と同じ */
function entryTime(e) {
  if (!e || typeof e !== "object" || (e instanceof Array)) return 0;
  const m = e._m;
  if (typeof m === "number") return m;
  if (m && typeof m === "object" && !(m instanceof Array)) {
    let mx = 0;
    for (const p in m) if (Object.prototype.hasOwnProperty.call(m, p) && (m[p] || 0) > mx) mx = m[p];
    return mx;
  }
  return 0;
}

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
