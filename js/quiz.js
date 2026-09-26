/*
 * クイズページの動き。
 * 1. URLの ?level=n5 を読み取る
 * 2. data/questions_n5.json を読み込む
 * 3. 1問ずつ表示 → 選んだら正解/不正解と解説を表示 → 次の問題へ
 * 4. 最後にスコアと「本を見る」ボタンを表示
 */

const LEVEL_LABELS = { n5: "N5", n4: "N4", n3: "N3", n2: "N2" };
// レベルアップの順番（N5が一番やさしく、N2が一番むずかしい）
const NEXT_LEVEL = { n5: "n4", n4: "n3", n3: "n2", n2: null };

function getLevelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const level = (params.get("level") || "n5").toLowerCase();
  return LEVEL_LABELS[level] ? level : "n5";
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

class Quiz {
  constructor(questions, level) {
    this.level = level;
    this.questions = shuffle(questions);
    this.index = 0;
    this.score = 0;
    this.answered = false;

    this.els = {
      progressText: document.getElementById("progress-text"),
      progressBar: document.getElementById("progress-bar"),
      progressBarWrap: document.getElementById("progress-bar-wrap"),
      card: document.getElementById("question-card"),
      grammarTag: document.getElementById("grammar-tag"),
      questionText: document.getElementById("question-text"),
      choices: document.getElementById("choices"),
      explanation: document.getElementById("explanation-box"),
      answerSentenceJa: document.getElementById("answer-sentence-ja"),
      answerSentenceEs: document.getElementById("answer-sentence-es"),
      explanationEs: document.getElementById("explanation-es"),
      nextBtn: document.getElementById("next-btn"),
      quizShell: document.getElementById("quiz-shell"),
      resultShell: document.getElementById("result-shell"),
    };

    this.els.nextBtn.addEventListener("click", () => this.goNext());
    this.render();
  }

  currentQuestion() {
    return this.questions[this.index];
  }

  render() {
    const total = this.questions.length;
    const q = this.currentQuestion();

    const progressPercent = Math.round((this.index / total) * 100);
    this.els.progressText.textContent = `Pregunta ${this.index + 1} / ${total}`;
    this.els.progressBar.style.width = `${progressPercent}%`;
    this.els.progressBarWrap.setAttribute("aria-valuenow", String(progressPercent));

    this.els.grammarTag.textContent = q.grammar_point;
    this.els.questionText.textContent = q.question_ja;
    this.els.explanation.classList.remove("is-visible");
    this.els.nextBtn.disabled = true;
    this.answered = false;

    this.els.choices.innerHTML = "";
    q.choices.forEach((choiceText, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.lang = "ja";
      btn.textContent = `${i + 1}. ${choiceText}`;
      btn.addEventListener("click", () => this.selectChoice(i, btn));
      this.els.choices.appendChild(btn);
    });
  }

  selectChoice(chosenIndex, chosenBtn) {
    if (this.answered) return;
    this.answered = true;

    const q = this.currentQuestion();
    const buttons = Array.from(this.els.choices.children);
    buttons.forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct_index) {
        btn.classList.add("is-correct");
      } else if (i === chosenIndex) {
        btn.classList.add("is-wrong");
      }
    });

    if (chosenIndex === q.correct_index) {
      this.score += 1;
    }

    this.els.answerSentenceJa.textContent = q.answer_sentence_ja || q.question_ja;
    this.els.answerSentenceEs.textContent = q.answer_sentence_es || "";
    this.els.explanationEs.textContent = q.explanation_es || "";
    this.els.explanation.classList.add("is-visible");
    this.els.nextBtn.disabled = false;
    this.els.nextBtn.textContent =
      this.index === this.questions.length - 1 ? "Ver resultado" : "Siguiente pregunta →";
  }

  goNext() {
    if (!this.answered) return;
    this.index += 1;
    if (this.index >= this.questions.length) {
      this.showResult();
    } else {
      this.render();
    }
  }

  showResult() {
    this.els.quizShell.hidden = true;
    this.els.resultShell.hidden = false;

    const total = this.questions.length;
    document.getElementById("result-score").textContent = `${this.score} / ${total}`;

    const ratio = this.score / total;
    let rank, message;
    if (ratio >= 0.8) {
      rank = "🐦‍⬛ Cuervo veterano";
      message = "Vuelas alto: dominas la mayoría de este tramo del camino. Sigue así y el siguiente nivel será aún más tuyo.";
    } else if (ratio >= 0.5) {
      rank = "Cuervo en vuelo";
      message = "Buen ritmo de vuelo. Con un poco más de práctica, este nivel dejará de ponerte a prueba.";
    } else {
      rank = "Cuervo en el nido";
      message = "Todavía hay terreno nuevo por delante. Como todo buen vuelo, se empieza paso a paso — vamos a reforzar las bases juntos.";
    }
    document.getElementById("result-rank").textContent = rank;
    document.getElementById("result-message").textContent = message;

    const buyBtn = document.getElementById("result-buy-btn");
    buyBtn.setAttribute("data-book", this.level);
    wireUpBookLinks(this.els.resultShell);

    this.setUpNextLevel();
    this.setUpShareButton(total);
  }

  setUpNextLevel() {
    const nextLevelBox = document.getElementById("next-level-box");
    const nextLevelBtn = document.getElementById("next-level-btn");
    const nextLevel = NEXT_LEVEL[this.level];
    if (nextLevel) {
      nextLevelBtn.href = `/quiz?level=${nextLevel}`;
      nextLevelBtn.textContent = `Probar el nivel ${LEVEL_LABELS[nextLevel]} →`;
      nextLevelBox.hidden = false;
    } else {
      nextLevelBox.hidden = true;
    }
  }

  setUpShareButton(total) {
    const shareBtn = document.getElementById("share-btn");
    const shareText = `Hice ${this.score}/${total} en la práctica de JLPT ${LEVEL_LABELS[this.level]} de Karasu. ¡Pruébalo tú también!`;
    const shareUrl = window.location.href;

    shareBtn.onclick = async () => {
      if (navigator.share) {
        try {
          await navigator.share({ text: shareText, url: shareUrl });
          return;
        } catch (err) {
          // el usuario canceló, o el navegador no pudo compartir; seguimos con el respaldo
        }
      }
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        shareBtn.textContent = "¡Copiado! Pégalo donde quieras compartirlo";
        setTimeout(() => {
          shareBtn.textContent = "Compartir mi resultado";
        }, 2500);
      } catch (err) {
        shareBtn.textContent = "No se pudo copiar, cópialo manualmente";
      }
    };
  }
}

async function initQuiz() {
  const level = getLevelFromUrl();
  document.querySelectorAll("[data-level-label]").forEach((el) => {
    el.textContent = LEVEL_LABELS[level];
  });
  document.title = `Práctica JLPT ${LEVEL_LABELS[level]} — Karasu`;

  try {
    const response = await fetch(`data/questions_${level}.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const questions = await response.json();
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error("Datos de preguntas vacíos");
    }
    new Quiz(questions, level);
  } catch (err) {
    document.getElementById("quiz-shell").hidden = true;
    document.getElementById("error-shell").hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", initQuiz);
