/* photo-upload.js  v25.2
   写真をCloudinaryへ保存する（署名はここで作る）
   ★このファイルは _lib.js を読みません（単独で完結）★ */

const J = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

async function sha1hex(str) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* Cloudinaryのcontextで意味を持つ記号を消す */
const clean = v => String(v == null ? '' : v).replace(/[=|\r\n]/g, ' ').trim().slice(0, 120);

export async function onRequestPost({ request, env }) {
  try {
    const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
    if (!cloud || !key || !secret) return J({ ok: false, error: 'Cloudflareの環境変数（CLOUDINARY_*）が足りません' }, 500);

    const pass = env.PHOTO_PASSCODE || '';
    if (pass && request.headers.get('x-photo-pass') !== pass) return J({ ok: false, error: '合言葉が違います' }, 401);

    const folder = env.PHOTO_FOLDER || 'komenouka';
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return J({ ok: false, error: '写真がありません' }, 400);
    if (file.size > 8 * 1024 * 1024) return J({ ok: false, error: '写真が大きすぎます（8MBまで）' }, 400);
    if (file.type && !/^image\//.test(file.type)) return J({ ok: false, error: '画像ファイルではありません' }, 400);

    const date = clean(form.get('date')), field = clean(form.get('field'));
    const who = clean(form.get('who')), memo = clean(form.get('memo'));
    const context = `date=${date}|field=${field}|who=${who}|memo=${memo}`;
    const ts = Math.floor(Date.now() / 1000);

    /* 署名：パラメータをアルファベット順に並べて末尾にAPI Secret */
    const sig = await sha1hex(`context=${context}&folder=${folder}&timestamp=${ts}${secret}`);

    const fd = new FormData();
    fd.append('file', file, 'photo.jpg');
    fd.append('api_key', key);
    fd.append('timestamp', String(ts));
    fd.append('folder', folder);
    fd.append('context', context);
    fd.append('signature', sig);

    const r = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: fd });
    const t = await r.text();
    let d = null; try { d = JSON.parse(t); } catch (e) {}
    if (!r.ok || !d || !d.public_id) {
      return J({ ok: false, error: 'Cloudinaryが受け取れませんでした：' + ((d && d.error && d.error.message) || t.slice(0, 200)) }, 502);
    }

    const base = `https://res.cloudinary.com/${cloud}/image/upload`;
    return J({
      ok: true,
      item: {
        id: d.public_id,
        thumb: `${base}/c_fill,w_300,h_300,q_auto/${d.public_id}.jpg`,
        big: `${base}/w_1600,q_auto/${d.public_id}.jpg`,
        date, field, who, memo,
        at: d.created_at || new Date().toISOString()
      }
    });
  } catch (e) {
    return J({ ok: false, error: 'サーバー側でエラー：' + (e && e.message ? e.message : String(e)) }, 500);
  }
}

export const onRequestGet = () => J({ ok: false, error: 'このURLはPOST専用です' }, 405);
