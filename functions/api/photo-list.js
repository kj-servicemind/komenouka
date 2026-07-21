import { cfg, guard, json, bad, adminAuth, toItem } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const/* photo-list.js  v25.2
   みんなの写真の一覧を返す（新しい順）
   ★このファイルは _lib.js を読みません（単独で完結）★ */

const J = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export async function onRequestGet({ request, env }) {
  try {
    const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
    if (!cloud || !key || !secret) return J({ ok: false, error: 'Cloudflareの環境変数（CLOUDINARY_*）が足りません' }, 500);

    const pass = env.PHOTO_PASSCODE || '';
    if (pass && request.headers.get('x-photo-pass') !== pass) return J({ ok: false, error: '合言葉が違います' }, 401);

    const folder = env.PHOTO_FOLDER || 'komenouka';
    const url = new URL(request.url);
    let max = parseInt(url.searchParams.get('max') || '200', 10);
    if (!(max > 0)) max = 200;
    if (max > 500) max = 500;

    const api = `https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload`
      + `?prefix=${encodeURIComponent(folder + '/')}&max_results=500&context=true`;

    const r = await fetch(api, { headers: { authorization: 'Basic ' + btoa(`${key}:${secret}`) } });
    const t = await r.text();
    let d = null; try { d = JSON.parse(t); } catch (e) {}
    if (!r.ok || !d || !d.resources) {
      return J({ ok: false, error: 'Cloudinaryから一覧を取れませんでした：' + ((d && d.error && d.error.message) || t.slice(0, 200)) }, 502);
    }

    const base = `https://res.cloudinary.com/${cloud}/image/upload`;
    const items = d.resources
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, max)
      .map(x => {
        const c = (x.context && (x.context.custom || x.context)) || {};
        return {
          id: x.public_id,
          thumb: `${base}/c_fill,w_300,h_300,q_auto/${x.public_id}.jpg`,
          big: `${base}/w_1600,q_auto/${x.public_id}.jpg`,
          date: c.date || String(x.created_at || '').slice(0, 10),
          field: c.field || '',
          who: c.who || '',
          memo: c.memo || '',
          at: x.created_at || ''
        };
      });

    return J({ ok: true, count: items.length, items });
  } catch (e) {
    return J({ ok: false, error: 'サーバー側でエラー：' + (e && e.message ? e.message : String(e)) }, 500);
  }
}
 c = cfg(env);
  if (!c) return bad('サーバーの設定(Cloudinaryの環境変数)がまだです', 500);
  const ng = guard(request, c);
  if (ng) return ng;

  const u = new URL(request.url);
  let max = parseInt(u.searchParams.get('max') || '100', 10);
  if (!(max > 0)) max = 100;
  if (max > 500) max = 500;

  const api =
    'https://api.cloudinary.com/v1_1/' + c.cloud +
    '/resources/image/upload?prefix=' + encodeURIComponent(c.folder + '/') +
    '&max_results=' + max + '&context=true&tags=true&dire
