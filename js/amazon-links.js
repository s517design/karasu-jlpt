/*
 * Amazon Kindleは国ごとにストア（ドメイン）が分かれていますが、同じ本なら
 * ASIN（商品番号）はどのストアでも共通です。訪問者のブラウザの言語設定を見て、
 * 一番合いそうなAmazonストアのリンクを自動的に作ります。
 *
 * 100%正確ではありません（ブラウザの言語設定と実際にいる国は必ずしも一致
 * しないため）。あくまで「一番当てはまりそうな場所に案内する」という目的の
 * 簡易的な仕組みです。
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

function detectAmazonDomain() {
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

function amazonLinkFor(bookKey) {
  const book = BOOKS[bookKey];
  if (!book) {
    return null;
  }
  const domain = detectAmazonDomain();
  return `https://www.${domain}/dp/${book.asin}`;
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

document.addEventListener("DOMContentLoaded", () => {
  wireUpBookLinks();
  wireUpBookTitles();
});
