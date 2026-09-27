/*
 * 各レベルの自己ベストスコアを、ブラウザだけに保存する仕組み。
 * サーバーには何も送信されない（localStorageのみ）ので、
 * 別の端末やブラウザからは見えない。
 */

const PROGRESS_KEY = "karasu_progress";

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function saveBestScore(level, score, total) {
  try {
    const progress = loadProgress();
    const current = progress[level];
    if (!current || score > current.score) {
      progress[level] = { score, total };
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    }
  } catch (err) {
    // localStorageが使えない環境（プライベートモード等）では何もしない
  }
}

function renderBestScores(root) {
  const scope = root || document;
  const progress = loadProgress();
  scope.querySelectorAll("[data-level-best]").forEach((el) => {
    const level = el.getAttribute("data-level-best");
    const best = progress[level];
    if (best) {
      el.textContent = `Tu mejor puntaje: ${best.score} / ${best.total}`;
      el.hidden = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderBestScores();
});
