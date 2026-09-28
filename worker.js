/*
 * 静的ファイルを配信する前段に立つ、ごく小さなサーバー側の処理。
 * 唯一の役割は「訪問者がどの国からアクセスしているか」（Cloudflareが
 * IPアドレスから無料で判定してくれる）を、HTMLページの中に
 * window.CF_COUNTRY として書き込むこと。
 *
 * js/amazon-links.js がこの値を読み取り、Amazonのリンク先を
 * その国のマーケットプレイスに合わせて自動で切り替える。
 * 国が分からない場合（ローカルでのテスト時など）は何もせず、
 * amazon-links.js側の言語ベースの判定にそのまま任せる。
 */
export default {
  async fetch(request, env) {
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
