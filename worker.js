/*
 * 静的ファイルを配信する前段に立つ、ごく小さなサーバー側の処理。
 * 役割は2つ:
 *
 * 1. 「訪問者がどの国からアクセスしているか」（Cloudflareが
 *    IPアドレスから無料で判定してくれる）を、HTMLページの中に
 *    window.CF_COUNTRY として書き込むこと。
 *    js/amazon-links.js がこの値を読み取り、Amazonのリンク先を
 *    その国のマーケットプレイスに合わせて自動で切り替える。
 *    国が分からない場合（ローカルでのテスト時など）は何もせず、
 *    amazon-links.js側の言語ベースの判定にそのまま任せる。
 *
 * 2. N5スペイン語版Kindle本の読者限定ボーナス問題（data/bonus_n5.json）
 *    を、本に印刷されたコードを知っている人にだけ配信すること。
 *    コードはこのファイルの中（サーバー側）にだけ置かれ、ブラウザ側の
 *    コードからは一切見えない。検証に成功したら、改ざんできない
 *    署名付きCookieを発行し、以後そのCookieを持つ人だけが
 *    data/bonus_n5.json を取得できるようにする。
 *    完全な不正コピー防止ではなく、「本を買った人への特典」という
 *    位置づけなので、これで十分と判断している。
 */

// 本の最後のページ（奥付）にのみ印刷される、N5ボーナス用の合言葉。
// 大文字小文字やコード前後の空白は区別しない。
const BONUS_CODE_N5 = "CUERVO-N5";

// Cookieの署名に使うだけの秘密鍵（ブラウザには送らない）。
// この値自体は人には見せない運用で問題ない - 変更したい場合は
// この値を書き換えてデプロイすれば、既に発行済みのCookieは
// 一斉に無効になる。
const COOKIE_SECRET = "96b901f122c20870ae1113170abde351fd5aebc2b1e9e8358af2d173f53dbea2";

const BONUS_COOKIE_NAME = "n5_bonus";
const BONUS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1年

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function isValidBonusCookie(value) {
  if (!value) return false;
  const separatorIndex = value.indexOf(".");
  if (separatorIndex === -1) return false;
  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expected = await hmacHex(payload, COOKIE_SECRET);
  return signature === expected;
}

async function handleRedeemN5(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const submitted = String(body && body.code ? body.code : "")
    .trim()
    .toUpperCase();
  if (submitted !== BONUS_CODE_N5) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const payload = "n5";
  const signature = await hmacHex(payload, COOKIE_SECRET);
  const cookieValue = `${payload}.${signature}`;

  const headers = new Headers({ "content-type": "application/json" });
  headers.append(
    "Set-Cookie",
    `${BONUS_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; Path=/; Max-Age=${BONUS_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/redeem-n5") {
      return handleRedeemN5(request);
    }

    // ボーナス問題データそのものは、有効なCookieを持つリクエストにしか
    // 返さない。見せかけだけの制限（ページを隠すだけ）ではなく、
    // データ自体を渡さないようにすることで、コードを知らない人が
    // ネットワークタブ等からURLを直接叩いても中身を見られないようにする。
    if (url.pathname === "/data/bonus_n5.json") {
      const cookieValue = readCookie(request, BONUS_COOKIE_NAME);
      const valid = await isValidBonusCookie(cookieValue);
      if (!valid) {
        return new Response("Not found", { status: 404 });
      }
    }

    const response = await env.ASSETS.fetch(request);

    const country = request.cf ? request.cf.country : null;
    const contentType = response.headers.get("content-type") || "";
    if (!country || !contentType.includes("text/html")) {
      return response;
    }

    const html = await response.text();
    const injected = html.replace(
      "<head>",
      `<head><script>window.CF_COUNTRY=${JSON.stringify(country)};</script>`
    );

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    // 訪問者の国によって内容が変わるページなので、Cloudflareや
    // ブラウザのキャッシュに保存されて他の訪問者に使い回されないようにする。
    headers.set("cache-control", "private, no-store");

    return new Response(injected, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
