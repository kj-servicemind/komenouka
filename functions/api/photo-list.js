import { cfg, guard, json, bad, adminAuth, toItem } from './_lib.js';

export async function onRequestGet({ request, env }) {
  const c = cfg(env);
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
