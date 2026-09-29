/*
 * Amazon Kindleは国ごとにストア（ドメイン）が分かれていますが、同じ本なら
 * ASIN（商品番号）はどのストアでも共通です。訪問者に一番合いそうな
 * Amazonストアのリンクを自動的に作ります。
 *
 * 判定は2段階：
 * 1. まずCloudflare（worker.js）が判定した「実際にいる国」を見る
 *    （window.CF_COUNTRY。ローカルでの確認時など、この値が無い場合もある）
 * 2. それが無い/使えない場合は、ブラウザの言語設定で判定する
 *    （こちらは「言語設定と実際の国が違う」というズレが起こり得る簡易的な仕組み）
 */

// このサイトで紹介する全ての本。ASINはAmazonの商品ページURLの
// "/dp/XXXXXXXXXX" の部分から取れる10文字のコードです。
const BOOKS = {
  n5: {
    asin: "B0H98N6GNX",
    title: "Gramática y Práctica JLPT N5",
  },
  n4: {
    asin: "B0HHGLWMFC",
    title: "Gramática y Práctica JLPT N4",
  },
  n3: {
    asin: "B0HHTX1WWH",
    title: "Gramática y Práctica JLPT N3",
  },
  n2: {
    asin: "B0HKML3NMJ",
    title: "Gramática y Práctica JLPT N2",
  },
  ejercicios_n3: {
    asin: "B0BSDW9CMS",
    title: "Ejercicios de Examen Japonés JLPT N3",
  },
  curso1: {
    asin: "B08YYD2ZL2",
    title: "Primer Curso de Japonés Real (N5, N4)",
  },
  curso2: {
    asin: "B0B4X36M7F",
    title: "Segundo Curso de Japonés Real (N5, N4)",
  },
  curso3: {
    asin: "B0BJRWZ3TT",
    title: "Tercer Curso de Japonés Real - Keigo (N4, N3)",
  },
  cuentos: {
    asin: "B0BRDBRQXF",
    title: "Cuentos Japoneses Tradicionales (N4, N3)",
  },
  culinaria: {
    asin: "B0B7KRNQ5Y",
    title: "Tesoros Culinarios de las 47 Prefecturas de Japón",
  },
  viaja1: {
    asin: "B09HVFCRR3",
    title: "Viaja Fácil a Japón I",
  },
  viaja2: {
    asin: "B09Q336MCC",
    title: "Viaja Fácil a Japón II",
  },
};

// 言語コード（navigator.languageの値）→ Amazonの国別ドメイン
// 該当する専用ストアがない国のスペイン語話者は、スペインのストアに送る
// （少なくとも言語は一致するため）。
const LOCALE_TO_DOMAIN = {
  "es-mx": "amazon.com.mx",
  "es-es": "amazon.es",
  "pt-br": "amazon.com.br",
  "pt-pt": "amazon.com.br",
  "fr-fr": "amazon.fr",
  "fr-ca": "amazon.fr",
  "en-gb": "amazon.co.uk",
  "en-ca": "amazon.ca",
  "en-au": "amazon.com.au",
  "en-us": "amazon.com",
  "de-de": "amazon.de",
  "it-it": "amazon.it",
  "ja-jp": "amazon.co.jp",
};

// 言語の最初の2文字（"es", "pt", "fr"...）だけで判定するときの既定ストア
const LANGUAGE_FALLBACK_DOMAIN = {
  es: "amazon.es",
  pt: "amazon.com.br",
  fr: "amazon.fr",
  en: "amazon.com",
  de: "amazon.de",
  it: "amazon.it",
  ja: "amazon.co.jp",
};

const DEFAULT_DOMAIN = "amazon.com";

// 訪問者がいる国（ISO国コード）→ 一番合いそうなAmazonストア。
// スペイン語圏のほとんどの国には専用のAmazonストアが無いため、
// メキシコ以外は基本的にamazon.esに案内する。
// プエルトリコはアメリカの通貨・配送網を使うため例外的にamazon.com。
const COUNTRY_TO_DOMAIN = {
  ES: "amazon.es",
  MX: "amazon.com.mx",
  AR: "amazon.es",
  BO: "amazon.es",
  CL: "amazon.es",
  CO: "amazon.es",
  CR: "amazon.es",
  CU: "amazon.es",
  DO: "amazon.es",
  EC: "amazon.es",
  SV: "amazon.es",
  GT: "amazon.es",
  HN: "amazon.es",
  NI: "amazon.es",
  PA: "amazon.es",
  PY: "amazon.es",
  PE: "amazon.es",
  UY: "amazon.es",
  VE: "amazon.es",
  PR: "amazon.com",
  US: "amazon.com",
  GB: "amazon.co.uk",
  CA: "amazon.ca",
  AU: "amazon.com.au",
  DE: "amazon.de",
  FR: "amazon.fr",
  IT: "amazon.it",
  BR: "amazon.com.br",
  PT: "amazon.com.br",
  JP: "amazon.co.jp",
};

function detectAmazonDomain() {
  try {
    const country = typeof window !== "undefined" ? window.CF_COUNTRY : null;
    if (country && COUNTRY_TO_DOMAIN[country]) {
      return COUNTRY_TO_DOMAIN[country];
    }
  } catch (err) {
    // window.CF_COUNTRYが無い/使えない環境でも壊れないようにする
  }

  try {
    const languages = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || "en-US"];

    for (const lang of languages) {
      const lower = lang.toLowerCase();
      if (LOCALE_TO_DOMAIN[lower]) {
        return LOCALE_TO_DOMAIN[lower];
      }
      const short = lower.split("-")[0];
      if (LANGUAGE_FALLBACK_DOMAIN[short]) {
        return LANGUAGE_FALLBACK_DOMAIN[short];
      }
    }
  } catch (err) {
    // navigator.languageが使えない環境でも壊れないようにする
  }
  return DEFAULT_DOMAIN;
}

// Amazonアソシエイトのトラッキングタグ。マーケットプレイス（ドメイン）ごとに
// 別々のプログラム・別々のIDなので、登録済みのドメインにだけ付与する。
// 未登録のドメインにはタグを付けない（付けても無効、または規約違反になるため）。
const DOMAIN_TO_ASSOCIATE_TAG = {
  "amazon.es": "karasu06a-21",
};

function amazonLinkFor(bookKey) {
  const book = BOOKS[bookKey];
  if (!book) {
    return null;
  }
  const domain = detectAmazonDomain();
  const url = `https://www.${domain}/dp/${book.asin}`;
  const tag = DOMAIN_TO_ASSOCIATE_TAG[domain];
  return tag ? `${url}?tag=${tag}` : url;
}

// ページ内の <a data-book="n2"> のようなリンクに、自動的に
// 一番合いそうなAmazonストアのURLをセットする。
function wireUpBookLinks(root) {
  const scope = root || document;
  const links = scope.querySelectorAll("[data-book]");
  links.forEach((link) => {
    const key = link.getAttribute("data-book");
    const url = amazonLinkFor(key);
    if (url) {
      link.setAttribute("href", url);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  });
}

// ページ内の <h3 data-book-title="n2"></h3> のような要素に、
// 上のBOOKSに書かれているタイトルを自動的に流し込む。
// タイトルの正解はBOOKSオブジェクトの1箇所だけ、というルールを守るための仕組み。
// Kindleでタイトルを変更したら、このファイルの上のBOOKSだけ直せば、
// サイト中の全ての表示が揃って更新される。
function wireUpBookTitles(root) {
  const scope = root || document;
  const titleEls = scope.querySelectorAll("[data-book-title]");
  titleEls.forEach((el) => {
    const key = el.getAttribute("data-book-title");
    const book = BOOKS[key];
    if (book) {
      el.textContent = book.title;
      const card = el.closest(".book-card");
      const cover = card && card.querySelector(".book-cover");
      if (cover) {
        cover.setAttribute("alt", `Portada del libro: ${book.title}`);
      }
    }
  });
}

// 表示している本の一覧をGoogleにも分かりやすくするための構造化データ（JSON-LD）。
// タイトルの出どころは上のBOOKSオブジェクトだけ（画面表示と完全に同じ
// データソース）なので、ここだけ書き換えて情報がずれる心配がない。
function injectBookStructuredData() {
  const titleEls = document.querySelectorAll("[data-book-title]");
  if (titleEls.length === 0) return;

  const seen = new Set();
  const books = [];
  titleEls.forEach((el) => {
    const key = el.getAttribute("data-book-title");
    const book = BOOKS[key];
    if (book && !seen.has(key)) {
      seen.add(key);
      books.push({
        "@type": "Book",
        "name": book.title,
        "author": { "@type": "Person", "name": "BABEROU" },
        "publisher": { "@type": "Organization", "name": "BABEROU" },
        "bookFormat": "https://schema.org/EBook",
        "inLanguage": "es",
      });
    }
  });
  if (books.length === 0) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": books,
  });
  document.head.appendChild(script);
}

document.addEventListener("DOMContentLoaded", () => {
  wireUpBookLinks();
  wireUpBookTitles();
  injectBookStructuredData();
});
