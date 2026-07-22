/* 行徳農園アプリ｜家族共有の診断（秘密の値は出さない）
   単独で完結。/api/sync-ping を開くと、KV(共有の置き場)が設定されているかが分かる。 */
export async function onRequest(context) {
  const { env } = context;
  const passLen = (env.PHOTO_PASSCODE != null) ? String(env.PHOTO_PASSCODE).length : 0;
  const body = {
    ok: true,
    kv: !!env.GYOTOKU_KV,          // 共有の置き場(GYOTOKU_KV)が割り当て済みか
    passcode_set: passLen > 0,     // 合言葉が設定されているか
    passcode_len: passLen,         // 合言葉の文字数（値そのものは出さない）
    time: new Date().toISOString()
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
