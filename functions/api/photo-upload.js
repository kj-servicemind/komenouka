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
