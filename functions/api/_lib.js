export const MAX_BYTES = 8 * 1024 * 1024;
export const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export function bad(msg, status) {
  return json({ ok: false, error: msg }, status || 400);
}

export function cfg(env) {
  const cloud = env.CLOUDINARY_CLOUD_NAME;
  const key = env.CLOUDINARY_API_KEY;
  const secret = env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) return null;
  return {
    cloud,
    key,
    secret,
    folder: env.PHOTO_FOLDER || 'komenouka',
    
