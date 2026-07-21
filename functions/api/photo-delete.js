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
