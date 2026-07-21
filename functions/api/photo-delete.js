/* photo-delete.js  v25.2
   写真を1枚消す（自分のフォルダ配下のみ）
   ★このファイルは _lib.js を読みません（単独で完結）★ */

const J = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export async function onRequestPost({ request, env }) {
  try {
    const cloud = env.CLOUDINARY_CLOUD_NAME, key = env.CLOUDINARY_API_KEY, secret = env.CLOUDINARY_API_SECRET;
    if (!cloud || !key || !secret) return J({ ok: false, error: 'Cloudflareの環境変数（CLOUDINARY_*）が足りません' }, 500);

    const pass = env.PHOTO_PASSCODE || '';
    if (pass && request.headers.get('x-photo-pass') !== pass) return J({ ok: false, error: '合言葉が違います' }, 401);

    const folder = env.PHOTO_FOLDER || 'komenouka';
    let body = {}; try { body = await request.json(); } catch (e) {}
    const id = String((body && body.id) || '');
    if (!id) return J({ ok: false, error: '写真の番号がありません' }, 400);
    if (id.indexOf(folder + '/') !== 0 || id.indexOf('..') >= 0) {
      return J({ ok: false, error: 'この写真は消せません' }, 403);
    }

    const api = `https://api.cloudinary.com/v1_1/${cloud}/resources/image/upload`
      + `?public_ids[]=${encodeURIComponent(id)}`;
    const r = await fetch(api, {
      method: 'DELETE',
      headers: { authorization: 'Basic ' + btoa(`${key}:${secret}`) }
    });
    const t = await r.text();
    let d = null; try { d = JSON.parse(t); } catch (e) {}
    if (!r.ok || !d) {
      return J({ ok: false, error: '消せませんでした：' + t.slice(0, 200) }, 502);
    }
    return J({ ok: true, id });
  } catch (e) {
    return J({ ok: false, error: 'サーバー側でエラー：' + (e && e.message ? e.message : String(e)) }, 500);
  }
}

export const onRequestGet = () => J({ ok: false, error: 'このURLはPOST専用です' }, 405);
import { cfg, guard, json, bad, adminAuth } from './_lib.js';

export async function onRequestPost({ request, env }) {
  const c = cfg(env);
  if (!c) return bad('サーバーの設定(Cloudinaryの環境変数)がまだです', 500);
  const ng = guard(request, c);
  if (ng) return ng;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return bad('リクエストが読めませんでした');
  }
  const id = String((body && body.id) || '');
  if (!id) return bad('消す写真が指定されていません');
  if (id.indexOf(c.folder + '/') !== 0 || id.indexOf('..') >= 0) {
    return bad('このアプリの写真ではありません', 403);
  }

  const api =
    'https://api.cloudinary.com/v1_1/' + c.cloud +
    '/resources/image/upload?public_ids[]=' + encodeURIComponent(id);

  let res, data;
  try {
    res = await fetch(api, { method: 'DELETE', headers: { authorization: adminAuth(c) } });
    data = await res.json();
  } catch (e) {
    return bad('Cloudinaryに届きませんでした（通信エラー）', 502);
  }
  if
