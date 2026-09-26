# Karasu — サイトの使い方

このフォルダだけで動く、普通のHTML/CSS/JavaScriptサイトです。ビルド作業（npm等）は一切不要です。

## ファイルの説明

```
website/
├── index.html          トップページ（本の紹介・レベル選択）
├── quiz.html            クイズページ（?level=n5 のように使う）
├── css/style.css         見た目（色・フォント・レイアウト）
├── js/quiz.js            クイズの動き（問題を出す・採点する）
├── js/amazon-links.js    国ごとにAmazonのリンクを自動で切り替える仕組み
└── data/questions_*.json 各レベルのクイズ問題（N5/N4/N3/N2）
```

## ローカルで確認する方法

ブラウザで`index.html`を直接ダブルクリックで開くと、クイズの問題データ
（JSONファイル）が読み込めずエラーになります。**簡易サーバーを立てて**
確認してください。

ターミナルでこのフォルダに移動して：

```bash
cd website
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開くと、実際のサイトと同じ状態で
確認できます。終わったらターミナルで `Ctrl + C` を押せば止まります。

## 内容を変えたいとき

- **クイズの問題を変える** → `data/questions_n2.json`（他のレベルも同様）
  を開いて、`question_ja`（問題文）や `choices`（選択肢）を直接編集
- **文章・説明を変える** → `index.html` / `quiz.html` を開いて、日本語や
  スペイン語の文章部分を直接書き換える（HTMLのタグ `<p>...</p>` の中身だけ
  変えれば安全）
- **色を変える** → `css/style.css` の一番上、`:root { ... }` の中の色
  （例：`--color-primary`）を変える
- **Amazonのリンク先を変える/本を増やす** → `js/amazon-links.js` の
  `BOOKS` の中にASIN（商品番号）とタイトルを追加し、`index.html`に
  `data-book="キー名"` を付けたボタンを追加する

## 公開する（Cloudflare Pagesの例）

1. このプロジェクト全体、または`website`フォルダだけをGitHubリポジトリに
   アップロード
2. [Cloudflare Pages](https://pages.cloudflare.com/) に無料登録し、その
   リポジトリを接続
3. 公開フォルダ（Build output directory）を `website` に設定
4. 数分でURL（例：`your-site.pages.dev`）が発行され、世界中から
   アクセス可能になる
5. 気に入ったタイミングで、独自ドメインをCloudflareの設定画面から追加

ビルドコマンドは不要（"None" のままでOK）です。静的なファイルをそのまま
公開するだけなので、これが一番トラブルの少ない方法です。
