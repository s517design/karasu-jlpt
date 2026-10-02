/*
 * クイズページの動き。
 * 1. URLの ?level=n5 を読み取る（?placement=1 なら診断モード）
 * 2. data/questions_n5.json を読み込む
 * 3. 1問ずつ表示 → 選んだら正解/不正解と解説を表示 → 次の問題へ
 * 4. 最後にスコアと「本を見る」ボタンを表示（自己ベストも保存）
 *    間違えた問題があれば「repasar mis errores」で再挑戦できる
 */

const LEVEL_LABELS = { n5: "N5", n4: "N4", n3: "N3", n2: "N2", n5en: "N5" };
// "n5en" is the English-language N5 bonus set (data/bonus_n5en.json,
// answer_sentence_en/explanation_en fields) - every other level/type is
// Spanish-only. Kept as its own small set rather than a per-question
// language field, since today only this one bonus set is English.
const ENGLISH_LEVELS = new Set(["n5en"]);
// レベルアップの順番（N5が一番やさしく、N2が一番むずかしい）
const NEXT_LEVEL = { n5: "n4", n4: "n3", n3: "n2", n2: null };
const PLACEMENT_LEVELS = ["n5", "n4", "n3", "n2"];
const PLACEMENT_QUESTIONS_PER_LEVEL = 2;
// 各レベルの問題プールは30問。毎回ランダムに12問だけ出題することで、
// 同じ問題を覚えてしまっても再挑戦する価値があるようにする。
const QUESTIONS_PER_QUIZ = 12;

function getLevelFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const level = (params.get("level") || "n5").toLowerCase();
  return LEVEL_LABELS[level] ? level : "n5";
}

// ?type=vocab なら語彙・漢字クイズ、?type=bonus なら本の読者限定ボーナス
// 問題（data/bonus_n5.jsonはコード入力後だけWorkerが配信する）、
// それ以外（省略時含む）は文法クイズ。
function getTypeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  if (type === "vocab") return "vocab";
  if (type === "bonus") return "bonus";
  return "grammar";
}

function isPlacementMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("placement") === "1";
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
  constructor(questions, level, options = {}) {
    this.level = level;
    this.type = options.type || "grammar";
    this.isEnglish = ENGLISH_LEVELS.has(level);
    this.isReview = Boolean(options.isReview);
    this.isPlacement = Boolean(options.isPlacement);
    this.questions = options.skipShuffle ? questions : shuffle(questions);
    this.index = 0;
    this.score = 0;
    this.answered = false;
    this.wrongQuestions = [];

    if (this.isPlacement) {
      this.placementTally = {};
      PLACEMENT_LEVELS.forEach((lvl) => {
        this.placementTally[lvl] = { correct: 0, total: 0 };
      });
    }

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
    this.els.progressText.textContent = this.isEnglish
      ? `Question ${this.index + 1} / ${total}`
      : `Pregunta ${this.index + 1} / ${total}`;
    this.els.progressBar.style.width = `${progressPercent}%`;
    this.els.progressBarWrap.setAttribute("aria-valuenow", String(progressPercent));

    this.els.grammarTag.textContent = q.grammar_point;
    this.els.questionText.textContent = q.question_ja;
    this.els.explanation.classList.remove("is-visible");
    this.els.nextBtn.disabled = true;
    this.answered = false;

    // 選択肢の表示順をシャッフルする（元のJSONで正解が常に1番目に
    // 書かれていても、見た目の順番はランダムになるようにするため）。
    this.currentChoiceOrder = shuffle(q.choices.map((_, i) => i));

    this.els.choices.innerHTML = "";
    this.currentChoiceOrder.forEach((originalIndex, displayIndex) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.lang = "ja";
      btn.textContent = `${displayIndex + 1}. ${q.choices[originalIndex]}`;
      btn.addEventListener("click", () => this.selectChoice(originalIndex, btn));
      this.els.choices.appendChild(btn);
    });
  }

  selectChoice(chosenIndex, chosenBtn) {
    if (this.answered) return;
    this.answered = true;

    const q = this.currentQuestion();
    const isCorrect = chosenIndex === q.correct_index;
    const buttons = Array.from(this.els.choices.children);
    buttons.forEach((btn, displayIndex) => {
      btn.disabled = true;
      const originalIndex = this.currentChoiceOrder[displayIndex];
      if (originalIndex === q.correct_index) {
        btn.classList.add("is-correct");
      } else if (originalIndex === chosenIndex) {
        btn.classList.add("is-wrong");
      }
    });

    if (isCorrect) {
      this.score += 1;
    } else {
      this.wrongQuestions.push(q);
    }

    if (this.isPlacement && q._sourceLevel) {
      const tally = this.placementTally[q._sourceLevel];
      tally.total += 1;
      if (isCorrect) tally.correct += 1;
    }

    this.els.answerSentenceJa.textContent = q.answer_sentence_ja || q.question_ja;
    this.els.answerSentenceEs.textContent =
      (this.isEnglish ? q.answer_sentence_en : q.answer_sentence_es) || "";
    this.els.explanationEs.textContent = (this.isEnglish ? q.explanation_en : q.explanation_es) || "";
    this.els.explanation.classList.add("is-visible");
    this.els.nextBtn.disabled = false;
    const isLastQuestion = this.index === this.questions.length - 1;
    this.els.nextBtn.textContent = this.isEnglish
      ? isLastQuestion
        ? "See result"
        : "Next question →"
      : isLastQuestion
        ? "Ver resultado"
        : "Siguiente pregunta →";
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

  // "Repasar mis errores": reinicia la prueba usando solo las preguntas falladas.
  startReview() {
    const reviewQuestions = this.wrongQuestions;
    if (reviewQuestions.length === 0) return;
    this.questions = reviewQuestions;
    this.wrongQuestions = [];
    this.index = 0;
    this.score = 0;
    this.isReview = true;
    this.els.quizShell.hidden = false;
    this.els.resultShell.hidden = true;
    this.render();
  }

  showResult() {
    this.els.quizShell.hidden = true;
    this.els.resultShell.hidden = false;

    if (this.isPlacement) {
      this.showPlacementResult();
      return;
    }

    const total = this.questions.length;
    const rankEl = document.getElementById("result-rank");
    const titleEl = document.getElementById("result-title");
    document.getElementById("result-score").textContent = `${this.score} / ${total}`;

    if (this.isReview) {
      titleEl.textContent = this.isEnglish ? "Review complete!" : "¡Repaso terminado!";
      rankEl.style.display = "none";
      document.getElementById("result-message").textContent = this.isEnglish
        ? `You reviewed ${total} question${total === 1 ? "" : "s"} you missed before. Keep it up!`
        : `Repasaste ${total} pregunta${total === 1 ? "" : "s"} que habías fallado antes. ¡Sigue así!`;
      document.getElementById("next-level-box").hidden = true;
      document.getElementById("share-cta").hidden = true;
    } else {
      if (this.isEnglish) {
        titleEl.innerHTML = 'You completed the <span data-level-label></span> bonus mock exam!';
      } else {
        titleEl.innerHTML =
          this.type === "vocab"
            ? '¡Terminaste el vocabulario de <span data-level-label></span>!'
            : this.type === "bonus"
              ? '¡Completaste el simulacro extra de <span data-level-label></span>!'
              : '¡Terminaste el nivel <span data-level-label></span>!';
      }
      document.querySelectorAll("[data-level-label]").forEach((el) => {
        el.textContent = LEVEL_LABELS[this.level];
      });
      rankEl.style.display = "";

      const ratio = this.score / total;
      let rank, message;
      if (this.isEnglish) {
        if (ratio >= 0.8) {
          rank = "🐦‍⬛ Veteran crow";
          message = "You're flying high: you've mastered most of this stretch of the path. Keep it up.";
        } else if (ratio >= 0.5) {
          rank = "Crow in flight";
          message = "Good pace. With a bit more practice, this level won't test you anymore.";
        } else {
          rank = "Crow in the nest";
          message = "There's still new ground ahead. Every good flight starts step by step - let's strengthen the basics together.";
        }
      } else if (ratio >= 0.8) {
        rank = "🐦‍⬛ Cuervo veterano";
        message = "Vuelas alto: dominas la mayoría de este tramo del camino. Sigue así y el siguiente nivel será aún más tuyo.";
      } else if (ratio >= 0.5) {
        rank = "Cuervo en vuelo";
        message = "Buen ritmo de vuelo. Con un poco más de práctica, este nivel dejará de ponerte a prueba.";
      } else {
        rank = "Cuervo en el nido";
        message = "Todavía hay terreno nuevo por delante. Como todo buen vuelo, se empieza paso a paso — vamos a reforzar las bases juntos.";
      }
      rankEl.textContent = rank;
      document.getElementById("result-message").textContent = message;

      if (this.type === "bonus") {
        // Quien llega aquí ya compró el libro (desbloqueó este simulacro
        // extra con el código impreso en él) - mostrarle el mismo CTA de
        // compra y el aviso de "siguiente nivel" no tiene sentido.
        document.getElementById("buy-cta").hidden = true;
        document.getElementById("next-level-box").hidden = true;
      } else {
        document.getElementById("buy-cta-text").innerHTML =
          this.type === "vocab"
            ? 'Esto fue solo una muestra. El libro cubre el nivel <strong data-level-label></strong> completo: vocabulario, kanji y gramática explicados a fondo, con 3 simulacros de examen incluidos.'
            : 'Esto fue solo una muestra. El libro cubre el nivel <strong data-level-label></strong> completo: cada punto de gramática explicado a fondo, en formal e informal, con 3 simulacros de examen incluidos.';
        document.querySelectorAll("[data-level-label]").forEach((el) => {
          el.textContent = LEVEL_LABELS[this.level];
        });

        const buyBtn = document.getElementById("result-buy-btn");
        buyBtn.setAttribute("data-book", this.level);
        wireUpBookLinks(this.els.resultShell);
        this.setUpNextLevel();
      }

      document.getElementById("share-cta").hidden = false;
      this.setUpShareButton(total);
      saveBestScore(this.progressKey(), this.score, total);
    }

    this.setUpReviewBox();
  }

  setUpReviewBox() {
    const reviewBox = document.getElementById("review-box");
    const reviewBtn = document.getElementById("review-btn");
    const count = this.wrongQuestions.length;
    if (count > 0) {
      document.getElementById("review-message").textContent = this.isEnglish
        ? `You missed ${count} question${count === 1 ? "" : "s"}. Reviewing them helps them stick.`
        : `Fallaste ${count} pregunta${count === 1 ? "" : "s"}. Repasarlas ayuda a que se te queden mejor.`;
      reviewBtn.textContent = this.isEnglish
        ? `Review my ${count} mistake${count === 1 ? "" : "s"}`
        : `Repasar mis ${count} error${count === 1 ? "" : "es"}`;
      reviewBtn.onclick = () => this.startReview();
      reviewBox.hidden = false;
    } else {
      reviewBox.hidden = true;
    }
  }

  showPlacementResult() {
    document.getElementById("result-title").textContent = "Resultado de tu diagnóstico";
    document.getElementById("result-score").hidden = true;
    document.getElementById("result-rank").style.display = "none";
    document.getElementById("result-message").hidden = true;
    document.getElementById("buy-cta").hidden = true;
    document.getElementById("next-level-box").hidden = true;
    document.getElementById("share-cta").hidden = true;
    document.getElementById("review-box").hidden = true;

    // Busca el primer nivel (de N5 a N2) donde no acertaste todo:
    // ese es el punto donde probablemente tengas más que aprender.
    let recommended = PLACEMENT_LEVELS[PLACEMENT_LEVELS.length - 1];
    let allPerfect = true;
    for (const lvl of PLACEMENT_LEVELS) {
      const tally = this.placementTally[lvl];
      if (tally.total > 0 && tally.correct < tally.total) {
        recommended = lvl;
        allPerfect = false;
        break;
      }
    }

    const placementResult = document.getElementById("placement-result");
    const placementMessage = document.getElementById("placement-message");
    const placementBtn = document.getElementById("placement-btn");

    if (allPerfect) {
      placementMessage.textContent =
        "¡Respondiste todo correctamente! Prueba el nivel N2 para ponerte a prueba de verdad.";
    } else {
      placementMessage.textContent =
        `Te recomendamos empezar por el nivel ${LEVEL_LABELS[recommended]}.`;
    }
    placementBtn.href = `/quiz?level=${recommended}`;
    placementBtn.textContent = `Empezar en el nivel ${LEVEL_LABELS[recommended]} →`;
    placementResult.hidden = false;
  }

  progressKey() {
    if (this.type === "vocab") return `${this.level}-vocab`;
    if (this.type === "bonus") return `${this.level}-bonus`;
    return this.level;
  }

  setUpNextLevel() {
    const nextLevelBox = document.getElementById("next-level-box");
    const nextLevelBtn = document.getElementById("next-level-btn");
    const nextLevel = NEXT_LEVEL[this.level];
    const typeParam = this.type === "vocab" ? "&type=vocab" : "";
    if (nextLevel) {
      nextLevelBtn.href = `/quiz?level=${nextLevel}${typeParam}`;
      nextLevelBtn.textContent = `Probar el nivel ${LEVEL_LABELS[nextLevel]} →`;
      nextLevelBox.hidden = false;
    } else {
      nextLevelBox.hidden = true;
    }
  }

  setUpShareButton(total) {
    const shareBtn = document.getElementById("share-btn");
    // El simulacro extra está bloqueado detrás de un código del libro, así
    // que no tiene sentido invitar a quien lo vea a "probarlo también" -
    // no podría sin haber comprado el libro.
    let shareText;
    if (this.isEnglish) {
      shareText = `I scored ${this.score}/${total} on the JLPT ${LEVEL_LABELS[this.level]} bonus mock exam from Karasu.`;
    } else if (this.type === "bonus") {
      shareText = `Hice ${this.score}/${total} en el simulacro extra de JLPT ${LEVEL_LABELS[this.level]} de Karasu.`;
    } else {
      const topic = this.type === "vocab" ? "vocabulario" : "gramática";
      shareText = `Hice ${this.score}/${total} en la práctica de ${topic} JLPT ${LEVEL_LABELS[this.level]} de Karasu. ¡Pruébalo tú también!`;
    }
    const shareUrl = window.location.href;
    const copiedText = this.isEnglish
      ? "Copied! Paste it anywhere you want to share it"
      : "¡Copiado! Pégalo donde quieras compartirlo";
    const shareBtnDefaultText = this.isEnglish ? "Share my result" : "Compartir mi resultado";
    const copyFailedText = this.isEnglish
      ? "Couldn't copy it, copy it manually"
      : "No se pudo copiar, cópialo manualmente";
    // The button's static HTML text is Spanish by default - reset it here
    // so an English session doesn't flash Spanish text before the first
    // click (and so re-entering results after a review isn't left stale).
    shareBtn.textContent = shareBtnDefaultText;
    const tryAnotherLevelLink = document.getElementById("try-another-level-link");
    if (tryAnotherLevelLink) {
      tryAnotherLevelLink.textContent = this.isEnglish ? "← Try another level" : "← Probar otro nivel";
    }

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
        shareBtn.textContent = copiedText;
        setTimeout(() => {
          shareBtn.textContent = shareBtnDefaultText;
        }, 2500);
      } catch (err) {
        shareBtn.textContent = copyFailedText;
      }
    };
  }
}

async function fetchLevelQuestions(level, type = "grammar") {
  const fileName =
    type === "vocab" ? `vocab_${level}` : type === "bonus" ? `bonus_${level}` : `questions_${level}`;
  const response = await fetch(`data/${fileName}.json`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const questions = await response.json();
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Datos de preguntas vacíos");
  }
  return questions;
}

async function initPlacementQuiz() {
  document.title = "Diagnóstico de nivel — Karasu";
  const perLevel = await Promise.all(
    PLACEMENT_LEVELS.map(async (level) => {
      const questions = await fetchLevelQuestions(level);
      return shuffle(questions)
        .slice(0, PLACEMENT_QUESTIONS_PER_LEVEL)
        .map((q) => ({ ...q, _sourceLevel: level }));
    })
  );
  const combined = shuffle(perLevel.flat());
  new Quiz(combined, "placement", { isPlacement: true, skipShuffle: true });
}

// このクイズページを「Course（講座）」として構造化データで伝える。
// 表示しているレベル・種類（文法／語彙）と完全に同じ情報を使うので、
// 別の場所で手書きしてズレる心配がない。
function injectCourseStructuredData(level, type) {
  const topic = type === "vocab" ? "Vocabulario y Kanji" : "Práctica de gramática";
  const url = `https://karasu.page/quiz?level=${level}${type === "vocab" ? "&type=vocab" : ""}`;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${topic} JLPT ${LEVEL_LABELS[level]}`,
    description: `Cuestionario gratuito de ${topic.toLowerCase()} para el nivel ${LEVEL_LABELS[level]} del JLPT, con explicaciones bilingües en japonés y español.`,
    provider: {
      "@type": "Organization",
      name: "Karasu",
      sameAs: "https://karasu.page/",
    },
    url,
    inLanguage: "es",
    isAccessibleForFree: true,
  });
  document.head.appendChild(script);
}

async function initLevelQuiz() {
  const level = getLevelFromUrl();
  const type = getTypeFromUrl();
  document.querySelectorAll("[data-level-label]").forEach((el) => {
    el.textContent = LEVEL_LABELS[level];
  });
  document.title = ENGLISH_LEVELS.has(level)
    ? `${LEVEL_LABELS[level]} Bonus Mock Exam — Karasu`
    : type === "vocab"
      ? `Vocabulario y Kanji ${LEVEL_LABELS[level]} — Karasu`
      : type === "bonus"
        ? `Simulacro extra ${LEVEL_LABELS[level]} — Karasu`
        : `Práctica JLPT ${LEVEL_LABELS[level]} — Karasu`;
  document.documentElement.lang = ENGLISH_LEVELS.has(level) ? "en" : "es";
  // El simulacro extra no es contenido público/indexable (está bloqueado
  // detrás de un código), así que no debe anunciarse como un Course
  // gratuito en los datos estructurados.
  if (type !== "bonus") {
    injectCourseStructuredData(level, type);
  }

  const pool = await fetchLevelQuestions(level, type);
  // El simulacro extra se presenta completo y en su orden original (como
  // un simulacro real), no como una muestra aleatoria de 12 preguntas.
  const questions = type === "bonus" ? pool : shuffle(pool).slice(0, QUESTIONS_PER_QUIZ);
  new Quiz(questions, level, { skipShuffle: true, type });
}

async function initQuiz() {
  try {
    if (isPlacementMode()) {
      await initPlacementQuiz();
    } else {
      await initLevelQuiz();
    }
  } catch (err) {
    document.getElementById("quiz-shell").hidden = true;
    document.getElementById("error-shell").hidden = false;
  }
}

document.addEventListener("DOMContentLoaded", initQuiz);
