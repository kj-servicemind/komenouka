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
import { cfg, guard, json, bad, signParams, ctxSafe, isYmd, toItem, MAX_BYTES, OK_TYPES } from './_lib.js';

export async function onRequestPost({ request, env }) {
  const c = cfg(env);
  if (!c) return bad('サーバーの設定(Cloudinaryの環境変数)がまだです', 500);
  const ng = guard(request, c);
  if (ng) return ng;

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return bad('写真を受け取れませんでした');
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return bad('写真がありません');
  if (file.size > MAX_BYTES) return bad('写真が大きすぎます（8MBまで）');
  if (file.type && OK_TYPES.indexOf(file.type) < 0) return bad('画像ファイルだけ送れます');

  const date = isYmd(form.get('date')) ? form.get('date') : new Date().toISOString().slice(0, 10);
  const field = ctxSafe(form.get('field'), 60);
  const who = ctxSafe(form.get('who'), 30);
  const memo = ctxSafe(form.get('memo'), 120);

  const timestamp = Math.floor(Date.now() / 1000);
  const tags = ['komenouka', 'd' + date.replace(/-/g, '')].join(',');
  const context = ['date=' + date, 'field=' + field, 'who=' + who, 'memo=' + memo].join('|');

  const signed = {
    context,
    folder: c.folder,
    tags,
    timestamp: String(timestamp)
  };
  const signature = await signParams(signed, c.secret);

  const out = new FormData();
  out.append('file', file, 'photo.jpg');
  out.append('api_key', c.key);
  out.append('timestamp', String(timestamp));
  out.append('signature', signature);
  out.append('context', context);
  out.append('folder', c.folder);
  out.append('tags', tags);

  let res, data;
  try {
    res = await fetch('https://api.cloudinary.com/v1_1/' + c.cloud + '/image/upload', {
      method: 'POST',
      body: out
    });
    data = await res.json();
  } catch (e) {
    return bad('Cloudinaryに送れませんでした（通信エラー）', 502);
  }
  if (!res.ok || !data || !data.secure_url) {
    const msg = (data && data.error && data.error.message) || 'アップロードに失敗しました';
    return bad(msg, 502);
  }

  return json({ ok: true, item: toItem(data, c.cloud) });
}
