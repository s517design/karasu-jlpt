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
 * 2. 各レベル（N5/N4/N3/N2）のスペイン語版Kindle本の読者限定ボーナス問題
 *    （data/bonus_n{level}.json）を、本に印刷されたコードを知っている人
 *    にだけ配信すること。コードはこのファイルの中（サーバー側）にだけ
 *    置かれ、ブラウザ側のコードからは一切見えない。検証に成功したら、
 *    そのレベル専用の、改ざんできない署名付きCookieを発行し、以後その
 *    Cookieを持つ人だけが対応する data/bonus_n{level}.json を取得できる
 *    ようにする。完全な不正コピー防止ではなく、「本を買った人への特典」
 *    という位置づけなので、これで十分と判断している。
 */

// 各レベルの本の最後のページ（奥付）にのみ印刷される、ボーナス用の合言葉。
// 大文字小文字やコード前後の空白は区別しない。
const BONUS_CODES = {
  n5: "CUERVO-N5",
  n4: "CUERVO-N4",
  n3: "CUERVO-N3",
  n2: "CUERVO-N2",
  // 英語版の本専用のコード。スペイン語版の同じレベルとは別の問題セット
  // （data/bonus_{level}en.json）を解放するので、別のレベルキー・
  // 別のコードにしている。
  n5en: "CUERVO-N5-EN",
  n4en: "CUERVO-N4-EN",
};

// Cookieの署名に使うだけの秘密鍵（ブラウザには送らない）。
// この値自体は人には見せない運用で問題ない - 変更したい場合は
// この値を書き換えてデプロイすれば、既に発行済みのCookieは
// 一斉に無効になる。
const COOKIE_SECRET = "96b901f122c20870ae1113170abde351fd5aebc2b1e9e8358af2d173f53dbea2";

// Cookie名はレベルごとに分けている（n5_bonus, n4_bonus, ...）ので、
// 例えばN5の本の特典だけ解放している状態でも、N4のボーナスまで
// 一緒に見えてしまうことはない。
function bonusCookieName(level) {
  return `${level}_bonus`;
}

const BONUS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1年
const BONUS_DATA_PATH_PATTERN = /^\/data\/bonus_(n5en|n4en|n5|n4|n3|n2)\.json$/;

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

async function isValidBonusCookie(value, level) {
  if (!value) return false;
  const separatorIndex = value.indexOf(".");
  if (separatorIndex === -1) return false;
  const payload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  if (payload !== level) return false;
  const expected = await hmacHex(payload, COOKIE_SECRET);
  return signature === expected;
}

async function handleRedeem(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const level = String(body && body.level ? body.level : "").toLowerCase();
  const validCode = BONUS_CODES[level];
  if (!validCode) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const submitted = String(body && body.code ? body.code : "")
    .trim()
    .toUpperCase();
  if (submitted !== validCode) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const signature = await hmacHex(level, COOKIE_SECRET);
  const cookieValue = `${level}.${signature}`;

  const headers = new Headers({ "content-type": "application/json" });
  headers.append(
    "Set-Cookie",
    `${bonusCookieName(level)}=${encodeURIComponent(cookieValue)}; Path=/; Max-Age=${BONUS_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/redeem") {
      return handleRedeem(request);
    }

    // ボーナス問題データそのものは、対応するレベルの有効なCookieを持つ
    // リクエストにしか返さない。見せかけだけの制限（ページを隠すだけ）
    // ではなく、データ自体を渡さないようにすることで、コードを知らない
    // 人がネットワークタブ等からURLを直接叩いても中身を見られないように
    // する。
    const bonusMatch = url.pathname.match(BONUS_DATA_PATH_PATTERN);
    if (bonusMatch) {
      const level = bonusMatch[1];
      const cookieValue = readCookie(request, bonusCookieName(level));
      const valid = await isValidBonusCookie(cookieValue, level);
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
