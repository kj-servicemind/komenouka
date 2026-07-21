/* photo-ping.js  v25.2
   設定の確認用。★秘密の値そのものは絶対に返さない★
   文字数と「余計な空白があるか」だけを返して、原因を切り分ける */

export async function onRequestGet({ env }) {
  const info = (v) => {
    const s = v == null ? '' : String(v);
    return {
      ある: s.length > 0,
      文字数: s.length,
      前後に空白や改行: s !== s.trim()
    };
  };

  const body = {
    ok: true,
    cloud_name: info(env.CLOUDINARY_CLOUD_NAME),
    api_key: info(env.CLOUDINARY_API_KEY),
    api_secret: info(env.CLOUDINARY_API_SECRET),
    folder: env.PHOTO_FOLDER || 'komenouka（既定）',
    passcode設定あり: !!env.PHOTO_PASSCODE,
    ready: !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
    めやす: 'api_key は 15桁前後、api_secret は 27文字前後。前後に空白があると必ず失敗します'
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
