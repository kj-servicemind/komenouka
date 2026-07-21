export async function onRequestGet({ env }) {
  const body = {
    ok: true,
    cloud_name: !!env.CLOUDINARY_CLOUD_NAME,
    api_key: !!env.CLOUDINARY_API_KEY,
    api_secret: !!env.CLOUDINARY_API_SECRET,
    passcode: !!env.PHOTO_PASSCODE,
    folder: env.PHOTO_FOLDER || 'komenouka'
  };
  body.ready = body.cloud_name && body.api_key && body.api_secret;
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
