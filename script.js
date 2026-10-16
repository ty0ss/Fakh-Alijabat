
'use strict';

const $ = id => document.getElementById(id);

const KEY = 'fakh-alijabat-v5';
const HISTORY_KEY = 'fakh-alijabat-question-history-v1';

let questions = [];
let players = [];
let impostorCount = 2;
let round = 1;

let deck = [];
let cursor = 0;

let current = null;
let displayedOptions = [];
let displayedCorrect = null;
let selected = null;

let timedOut = false;
let seconds = 60;
let running = false;
let timer = null;
let deadline = 0;

let chosenImpostors = new Set();
let screen = 'home-screen';
let scoresApplied = false;
let gameActive = false;

let questionHistory = {
  usedIds: [],
  lastQuestionId: null,
  lastGameFirstId: null,
  lastGameLastId: null
};

let firstQuestionOfGame = null;
let lastQuestionOfGame = null;
let menuReturnScreen = 'home-screen';

function shuffle(items) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function loadHistory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(HISTORY_KEY) || 'null'
    );

    if (saved && Array.isArray(saved.usedIds)) {
      questionHistory = {
        usedIds: saved.usedIds,
        lastQuestionId: saved.lastQuestionId ?? null,
        lastGameFirstId: saved.lastGameFirstId ?? null,
        lastGameLastId: saved.lastGameLastId ?? null
      };
    }
  } catch (error) {
    console.warn('Question history could not be loaded', error);
  }
}

function saveHistory() {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(questionHistory)
    );
  } catch (error) {
    console.warn('Question history could not be saved', error);
  }
}

function remainingQuestions() {
  const used = new Set(questionHistory.usedIds);

  return questions.filter(q => !used.has(q.id)).length;
}

function updateRemainingCounter() {
  const counter = $('questions-remaining');

  if (!counter) return;

  counter.textContent =
    'الأسئلة المتبقية: ' +
    remainingQuestions() +
    ' / ' +
    questions.length;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      players,
      impostorCount,
      round,
      deck,
      cursor,
      currentId: current ? current.id : null,
      displayedOptions,
      displayedCorrect,
      selected,
      timedOut,
      seconds,
      screen,
      scoresApplied,
      gameActive,
      chosenImpostors: [...chosenImpostors],
      firstQuestionOfGame,
      lastQuestionOfGame
    }));
  } catch (error) {
    console.warn('Game could not be saved', error);
  }

  updateRemainingCounter();
}

function show(id) {
  screen = id;

  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('active', el.id === id);
  });

  window.scrollTo(0, 0);
  save();
}

// TIMER

function stopTimer() {
  if (running && deadline) {
    seconds = Math.max(
      0,
      Math.ceil((deadline - Date.now()) / 1000)
    );
  }

  clearInterval(timer);
  timer = null;
  running = false;
  deadline = 0;

  renderTimer();
}

function renderTimer() {
  const minutes = String(
    Math.floor(seconds / 60)
  ).padStart(2, '0');

  const remainingSeconds = String(
    seconds % 60
  ).padStart(2, '0');

  setText('timer', minutes + ':' + remainingSeconds);

  const progress = $('timer-progress');

  if (progress) {
    progress.style.width =
      (seconds / 60 * 100) + '%';
  }

  const display = $('timer');

  if (display) {
    display.classList.toggle(
      'urgent',
      seconds <= 10
    );
  }

  setText(
    'pause-btn',
    running ? 'إيقاف مؤقت' : 'متابعة الوقت'
  );
}

function startTimer() {
  if (
    running ||
    timedOut ||
    seconds <= 0 ||
    screen !== 'question-screen'
  ) return;

  running = true;
  deadline = Date.now() + seconds * 1000;

  renderTimer();

  timer = setInterval(() => {
    seconds = Math.max(
      0,
      Math.ceil((deadline - Date.now()) / 1000)
    );

    renderTimer();

    if (seconds === 0) {
      timedOut = true;
      selected = null;
      stopTimer();
      reveal();
    } else {
      save();
    }
  }, 200);
}

function toggleTimer() {
  if (running) {
    stopTimer();

    if (seconds === 0) {
      timedOut = true;
      selected = null;
      reveal();
    }
  } else {
    startTimer();
  }

  save();
}

// PLAYERS

function addPlayer() {
  const input = $('player-name');
  const name = input.value.trim();

  if (!name) return;

  if (
    players.some(
      p => p.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    setText(
      'setup-message',
      'هذا الاسم موجود بالفعل'
    );
    return;
  }

  players.push({
    id: String(Date.now()) + '-' + Math.random(),
    name,
    score: 0
  });

  input.value = '';
  setText('setup-message', '');

  renderPlayers();
  save();
}

function renderPlayers() {
  const box = $('players-list');
  box.replaceChildren();

  players.forEach(player => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';

    const name = document.createElement('span');
    name.textContent = player.name;

    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.setAttribute(
      'aria-label',
      'حذف ' + player.name
    );

    remove.onclick = () => {
      players = players.filter(
        p => p.id !== player.id
      );

      renderPlayers();
      save();
    };

    chip.append(name, remove);
    box.append(chip);
  });
}

// QUESTIONS AND HISTORY

function createDeck() {
  const validIds = new Set(
    questions.map(q => q.id)
  );

  questionHistory.usedIds =
    questionHistory.usedIds.filter(
      id => validIds.has(id)
    );

  const used = new Set(questionHistory.usedIds);

  let available = questions
    .filter(q => !used.has(q.id))
    .map(q => q.id);

  // All questions have been used:
  // begin a new cycle automatically.
  if (available.length === 0) {
    questionHistory.usedIds = [];

    available = questions.map(q => q.id);
  }

  deck = shuffle(available);
  cursor = 0;

  // Prevent an immediate repeat across cycles.
  if (
    deck.length > 1 &&
    deck[0] === questionHistory.lastQuestionId
  ) {
    const alternative = deck.findIndex(
      id => id !== questionHistory.lastQuestionId
    );

    if (alternative !== -1) {
      [deck[0], deck[alternative]] =
        [deck[alternative], deck[0]];
    }
  }

  saveHistory();
  updateRemainingCounter();
}

function getNextQuestion() {
  if (!questions.length) return null;

  if (!deck.length || cursor >= deck.length) {
    createDeck();
  }

  const id = deck[cursor++];
  const question = questions.find(q => q.id === id);

  if (!question) return null;

  // Mark a question used when it actually appears,
  // not merely when it is placed in the deck.
  if (!questionHistory.usedIds.includes(id)) {
    questionHistory.usedIds.push(id);
  }

  questionHistory.lastQuestionId = id;

  if (firstQuestionOfGame === null) {
    firstQuestionOfGame = id;
  }

  lastQuestionOfGame = id;

  saveHistory();
  updateRemainingCounter();

  return question;
}

function shuffleAnswers(question) {
  const choices = question.options.map(
    (answer, index) => ({
      answer,
      originalIndex: index
    })
  );

  const shuffled = shuffle(choices);

  displayedOptions = shuffled.map(
    item => item.answer
  );

  displayedCorrect = shuffled.findIndex(
    item => item.originalIndex === question.correct
  );
}

// ROUNDS

function prepareRound() {
  stopTimer();

  current = null;
  displayedOptions = [];
  displayedCorrect = null;
  selected = null;

  timedOut = false;
  seconds = 60;
  scoresApplied = false;

  chosenImpostors.clear();

  setText(
    'roles-count',
    'عدد المخادعين: ' + impostorCount
  );

  show('roles-screen');
}

function nextQuestion() {
  if (
    !gameActive ||
    screen !== 'roles-screen'
  ) return;

  stopTimer();

  const next = getNextQuestion();

  if (!next) {
    alert('تعذر تحميل السؤال التالي');
    return;
  }

  current = next;
  shuffleAnswers(current);

  selected = null;
  timedOut = false;
  seconds = 60;
  scoresApplied = false;

  chosenImpostors.clear();

  renderQuestion();
  show('question-screen');
  startTimer();
}

function renderQuestion() {
  if (!current) return;

  setText(
    'round-number',
    'الجولة ' + round
  );

  setText(
    'question-category',
    current.category
  );

  setText(
    'difficulty-label',
    current.difficulty
  );

  setText(
    'question-text',
    current.question
  );

  $('question-media').replaceChildren();

  const box = $('answers-container');
  box.replaceChildren();

  const letters = ['أ', 'ب', 'ج', 'د'];

  displayedOptions.forEach((answer, index) => {
    const button = document.createElement('button');

    button.className =
      'answer-option' +
      (selected === index ? ' selected' : '');

    const letter = document.createElement('span');
    letter.className = 'answer-letter';
    letter.textContent = letters[index];

    const value = document.createElement('span');
    value.textContent = answer;

    button.append(letter, value);

    button.onclick = () => {
      if (
        timedOut ||
        screen !== 'question-screen'
      ) return;

      selected = index;
      renderQuestion();
      save();
    };

    box.append(button);
  });

  $('lock-answer-btn').disabled =
    selected === null || timedOut;

  renderTimer();
}

function reveal() {
  if (!current) return;

  stopTimer();

  const correct =
    selected === displayedCorrect;

  setText(
    'correct-answer',
    displayedOptions[displayedCorrect]
  );

  setText(
    'answer-explanation',
    current.explanation || ''
  );

  setText(
    'result-title',
    timedOut
      ? 'انتهى الوقت!'
      : correct
        ? 'إجابة صحيحة!'
        : 'إجابة خاطئة!'
  );

  setText(
    'result-icon',
    timedOut
      ? '⏰'
      : correct
        ? '🎉'
        : '🎯'
  );

  setText(
    'result-message',
    timedOut
      ? 'لا نقاط لهذه الجولة'
      : correct
        ? 'نقطة لكل لاعب عادي'
        : 'نقطتان لكل مخادع'
  );

  show('reveal-screen');
}

// IMPOSTORS AND SCORING

function renderImpostors() {
  const box = $('impostor-selection');
  box.replaceChildren();

  players.forEach(player => {
    const button = document.createElement('button');

    button.className =
      'impostor-option' +
      (
        chosenImpostors.has(player.id)
          ? ' selected'
          : ''
      );

    button.textContent = player.name;

    button.onclick = () => {
      if (chosenImpostors.has(player.id)) {
        chosenImpostors.delete(player.id);
      } else if (
        chosenImpostors.size < impostorCount
      ) {
        chosenImpostors.add(player.id);
      }

      renderImpostors();
      save();
    };

    box.append(button);
  });

  setText(
    'scoring-message',
    'اختاروا ' +
    impostorCount +
    ' من المخادعين'
  );
}

function calculateScores() {
  if (scoresApplied) {
    showLeaderboard();
    return;
  }

  if (
    chosenImpostors.size !== impostorCount
  ) {
    setText(
      'scoring-message',
      'اختاروا ' +
      impostorCount +
      ' مخادعين بالضبط'
    );

    return;
  }

  if (!timedOut && current) {
    const correct =
      selected === displayedCorrect;

    players.forEach(player => {
      const isImpostor =
        chosenImpostors.has(player.id);

      if (correct && !isImpostor) {
        player.score += 1;
      }

      if (!correct && isImpostor) {
        player.score += 2;
      }
    });
  }

  scoresApplied = true;
  showLeaderboard();
}

// LEADERBOARD

function renderLeaderboard(id) {
  const box = $(id);
  box.replaceChildren();

  const sorted = [...players].sort(
    (a, b) =>
      b.score - a.score ||
      a.name.localeCompare(b.name, 'ar')
  );

  sorted.forEach((player, index) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';

    const name = document.createElement('span');

    name.textContent =
      (index + 1) +
      '. ' +
      player.name;

    const points = document.createElement('span');
    points.className = 'leaderboard-points';

    points.textContent =
      player.score + ' نقطة';

    row.append(name, points);
    box.append(row);
  });
}

function showLeaderboard() {
  setText(
    'leaderboard-round',
    'بعد الجولة ' + round
  );

  renderLeaderboard('leaderboard-list');

  $('next-round-btn').hidden = false;
  $('end-game-btn').hidden = false;

  const back = $('back-from-scores');

  if (back) back.hidden = true;

  show('leaderboard-screen');
}

function advanceRound() {
  if (
    !scoresApplied ||
    screen !== 'leaderboard-screen'
  ) return;

  round += 1;
  prepareRound();
}

// GAME MANAGEMENT

function startGame() {
  if (players.length < 4) {
    setText(
      'setup-message',
      'أضيفوا أربعة لاعبين على الأقل'
    );
    return;
  }

  if (
    impostorCount < 1 ||
    impostorCount >= players.length
  ) {
    setText(
      'setup-message',
      'عدد المخادعين لازم يكون أقل من عدد اللاعبين'
    );
    return;
  }

  if (!questions.length) {
    setText(
      'setup-message',
      'تعذر تحميل الأسئلة'
    );
    return;
  }

  stopTimer();

  players.forEach(player => {
    player.score = 0;
  });

  round = 1;
  current = null;
  displayedOptions = [];
  displayedCorrect = null;
  selected = null;

  timedOut = false;
  scoresApplied = false;
  gameActive = true;

  firstQuestionOfGame = null;
  lastQuestionOfGame = null;

  chosenImpostors.clear();

  createDeck();
  prepareRound();
}

function resetGame(keepPlayers = false) {
  stopTimer();

  // Remember the first and last questions
  // of the game that just ended.
  if (firstQuestionOfGame !== null) {
    questionHistory.lastGameFirstId =
      firstQuestionOfGame;
  }

  if (lastQuestionOfGame !== null) {
    questionHistory.lastGameLastId =
      lastQuestionOfGame;
  }

  saveHistory();

  if (keepPlayers) {
    players.forEach(player => {
      player.score = 0;
    });
  } else {
    players = [];
    impostorCount = 2;
  }

  round = 1;
  deck = [];
  cursor = 0;

  current = null;
  displayedOptions = [];
  displayedCorrect = null;
  selected = null;

  timedOut = false;
  seconds = 60;
  scoresApplied = false;
  gameActive = false;

  firstQuestionOfGame = null;
  lastQuestionOfGame = null;

  chosenImpostors.clear();

  $('impostor-count').value =
    String(impostorCount);

  $('player-name').value = '';

  setText('setup-message', '');

  renderPlayers();

  // Delete the game session only.
  // NEVER delete HISTORY_KEY here.
  localStorage.removeItem(KEY);

  show('setup-screen');
}

function endGame() {
  stopTimer();

  gameActive = false;

  if (firstQuestionOfGame !== null) {
    questionHistory.lastGameFirstId =
      firstQuestionOfGame;
  }

  if (lastQuestionOfGame !== null) {
    questionHistory.lastGameLastId =
      lastQuestionOfGame;
  }

  saveHistory();

  renderLeaderboard('final-leaderboard');
  show('end-screen');
}

function confirmNewGame(keepPlayers = false) {
  const message = keepPlayers
    ? 'تبدؤون لعبة جديدة بنفس اللاعبين؟ راح تتصفر النقاط، لكن الأسئلة السابقة ما راح تتكرر.'
    : 'تبدؤون لعبة جديدة؟ راح تنمسح أسماء اللاعبين والنقاط، لكن الأسئلة السابقة ما راح تتكرر.';

  if (!confirm(message)) return;

  closeMenu();
  resetGame(keepPlayers);
}

function confirmEndGame() {
  if (!gameActive) {
    closeMenu();
    show('end-screen');
    return;
  }

  if (
    !confirm('متأكدين تبغون تنهُون اللعبة؟')
  ) return;

  closeMenu();
  endGame();
}

// MENU

function createMenu() {
  const style = document.createElement('style');

  style.textContent = `
    #menu-toggle {
      position: fixed;
      top: 15px;
      left: 15px;
      z-index: 1000;
      background: #243957;
      color: white;
      border: 1px solid #53617d;
      border-radius: 10px;
      padding: 9px 15px;
      font-size: 23px;
      cursor: pointer;
    }

    #menu-panel {
      position: fixed;
      top: 65px;
      left: 15px;
      z-index: 1001;
      width: min(290px, calc(100vw - 30px));
      background: #17263f;
      border: 1px solid #53617d;
      border-radius: 15px;
      padding: 15px;
      box-shadow: 0 12px 35px #0005;
    }

    #menu-panel[hidden] {
      display: none;
    }

    #menu-panel button {
      display: block;
      width: 100%;
      margin: 5px 0;
      padding: 12px;
      border: none;
      border-radius: 9px;
      background: #243957;
      color: white;
      font-size: 16px;
      text-align: right;
      cursor: pointer;
    }

    #menu-panel button:hover {
      background: #405477;
    }

    #questions-remaining {
      padding: 10px 8px;
      text-align: center;
      color: #b7d9f5;
      font-size: 14px;
      border-bottom: 1px solid #53617d;
      margin-bottom: 8px;
    }
  `;

  document.head.append(style);

  const toggle = document.createElement('button');
  toggle.id = 'menu-toggle';
  toggle.textContent = '☰';
  toggle.setAttribute('aria-label', 'القائمة');

  const panel = document.createElement('div');
  panel.id = 'menu-panel';
  panel.hidden = true;

  const counter = document.createElement('div');
  counter.id = 'questions-remaining';
  panel.append(counter);

  const items = [
    ['متابعة اللعب', resumeGame],
    ['ترتيب اللاعبين', openScoresFromMenu],
    ['لعبة جديدة', () => confirmNewGame(false)],
    ['إعادة بنفس اللاعبين', () => confirmNewGame(true)],
    ['إنهاء اللعبة', confirmEndGame],
    ['الصفحة الرئيسية', () => {
      closeMenu();

      if (screen === 'question-screen') {
        stopTimer();
      }

      show('home-screen');
    }]
  ];

  items.forEach(([label, action]) => {
    const button = document.createElement('button');

    button.textContent = label;
    button.onclick = action;

    panel.append(button);
  });

  toggle.onclick = () => {
    updateRemainingCounter();
    panel.hidden = !panel.hidden;
  };

  document.body.append(toggle, panel);
}

function closeMenu() {
  const panel = $('menu-panel');

  if (panel) panel.hidden = true;
}

function openScoresFromMenu() {
  if (!gameActive) {
    alert('ما فيه لعبة جارية حالياً');
    return;
  }

  closeMenu();

  if (scoresApplied) {
    showLeaderboard();
    return;
  }

  menuReturnScreen = screen;

  if (screen === 'question-screen') {
    stopTimer();
  }

  renderLeaderboard('leaderboard-list');

  setText(
    'leaderboard-round',
    'الجولة ' + round
  );

  $('next-round-btn').hidden = true;
  $('end-game-btn').hidden = true;

  let back = $('back-from-scores');

  if (!back) {
    back = document.createElement('button');
    back.id = 'back-from-scores';
    back.className = 'btn secondary';
    back.textContent = 'رجوع للعبة';

    $('leaderboard-screen').append(back);
  }

  back.hidden = false;

  back.onclick = () => {
    back.hidden = true;

    $('next-round-btn').hidden = false;
    $('end-game-btn').hidden = false;

    show(menuReturnScreen);
  };

  show('leaderboard-screen');
}

function resumeGame() {
  closeMenu();

  if (!gameActive) {
    show('home-screen');
    return;
  }

  if (scoresApplied) {
    showLeaderboard();
    return;
  }

  if (current) {
    renderQuestion();
    show('question-screen');
    return;
  }

  show('roles-screen');
}

// BUTTONS

$('play-btn').onclick = () => {
  if (gameActive) {
    if (
      confirm('عندكم لعبة جارية. تبغون تكملونها؟')
    ) {
      resumeGame();
    } else {
      confirmNewGame(false);
    }

    return;
  }

  show('setup-screen');
};

$('rules-btn').onclick = () => {
  show('rules-screen');
};

$('rules-back-btn').onclick = () => {
  show('home-screen');
};

$('setup-back-btn').onclick = () => {
  show('home-screen');
};

$('add-player-btn').onclick = addPlayer;

$('player-name').addEventListener(
  'keydown',
  event => {
    if (event.key === 'Enter') {
      addPlayer();
    }
  }
);

$('impostor-count').onchange = event => {
  impostorCount = Number(event.target.value);
  save();
};

$('start-game-btn').onclick = startGame;
$('show-question-btn').onclick = nextQuestion;
$('pause-btn').onclick = toggleTimer;

$('lock-answer-btn').onclick = () => {
  if (
    selected === null ||
    timedOut ||
    screen !== 'question-screen'
  ) return;

  reveal();
};

$('go-to-scoring-btn').onclick = () => {
  renderImpostors();
  show('scoring-screen');
};

$('calculate-scores-btn').onclick =
  calculateScores;

$('next-round-btn').onclick = advanceRound;
$('end-game-btn').onclick = confirmEndGame;

$('new-game-btn').onclick = () => {
  confirmNewGame(false);
};

// INITIALIZATION

async function init() {
  createMenu();
  loadHistory();

  try {
    const response = await fetch(
      'questions.json',
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error('Questions file not found');
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid questions format');
    }

    const seenIds = new Set();

    questions = data.filter(q => {
      const valid =
        q &&
        Number.isInteger(q.id) &&
        typeof q.question === 'string' &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        q.options.every(
          option => typeof option === 'string'
        ) &&
        Number.isInteger(q.correct) &&
        q.correct >= 0 &&
        q.correct <= 3 &&
        !seenIds.has(q.id);

      if (valid) seenIds.add(q.id);

      return valid;
    });

    console.log(
      'Loaded questions:',
      questions.length
    );

  } catch (error) {
    console.error(error);

    alert(
      'تعذر تحميل الأسئلة من questions.json'
    );
  }

  // Import the old game session once,
  // if it exists, without deleting history.
  let saved = localStorage.getItem(KEY);

  if (!saved) {
    const previous = localStorage.getItem(
      'fakh-alijabat-v4'
    );

    if (previous) {
      saved = previous;
    }
  }

  try {
    const old = JSON.parse(saved || 'null');

    if (!old || !Array.isArray(old.players)) {
      updateRemainingCounter();
      return;
    }

    players = old.players;
    impostorCount = old.impostorCount || 2;
    round = old.round || 1;

    deck = Array.isArray(old.deck)
      ? old.deck.filter(
          id => questions.some(q => q.id === id)
        )
      : [];

    cursor = Math.min(
      old.cursor || 0,
      deck.length
    );

    current = questions.find(
      q => q.id === old.currentId
    ) || null;

    displayedOptions =
      Array.isArray(old.displayedOptions) &&
      old.displayedOptions.length === 4
        ? old.displayedOptions
        : current
          ? [...current.options]
          : [];

    displayedCorrect =
      Number.isInteger(old.displayedCorrect)
        ? old.displayedCorrect
        : current
          ? current.correct
          : null;

    selected = old.selected ?? null;
    timedOut = !!old.timedOut;

    seconds = Math.max(
      0,
      Math.min(60, old.seconds ?? 60)
    );

    scoresApplied = !!old.scoresApplied;
    gameActive = !!old.gameActive;

    chosenImpostors = new Set(
      old.chosenImpostors || []
    );

    firstQuestionOfGame =
      old.firstQuestionOfGame ?? null;

    lastQuestionOfGame =
      old.lastQuestionOfGame ?? null;

    // If upgrading during a game, record
    // questions that have already appeared.
    const previouslyPlayed = deck.slice(
      0,
      cursor
    );

    previouslyPlayed.forEach(id => {
      if (!questionHistory.usedIds.includes(id)) {
        questionHistory.usedIds.push(id);
      }
    });

    if (
      current &&
      !questionHistory.usedIds.includes(current.id)
    ) {
      questionHistory.usedIds.push(current.id);
    }

    if (current) {
      questionHistory.lastQuestionId =
        current.id;
    }

    saveHistory();

    $('impostor-count').value =
      String(impostorCount);

    renderPlayers();

    const validScreens = [
      'home-screen',
      'rules-screen',
      'setup-screen',
      'roles-screen',
      'question-screen',
      'reveal-screen',
      'scoring-screen',
      'leaderboard-screen',
      'end-screen'
    ];

    const target =
      validScreens.includes(old.screen)
        ? old.screen
        : 'home-screen';

    if (current) {
      renderQuestion();
    }

    if (
      target === 'reveal-screen' &&
      current
    ) {
      reveal();
    } else if (
      target === 'scoring-screen' &&
      current
    ) {
      renderImpostors();
      show(target);
    } else if (
      target === 'leaderboard-screen'
    ) {
      renderLeaderboard('leaderboard-list');

      setText(
        'leaderboard-round',
        'بعد الجولة ' + round
      );

      show(target);
    } else if (
      target === 'end-screen'
    ) {
      renderLeaderboard('final-leaderboard');
      show(target);
    } else if (
      target === 'question-screen' &&
      !current
    ) {
      show('roles-screen');
    } else {
      show(target);
    }

    // Timer stays paused after refreshing.
    stopTimer();

    updateRemainingCounter();

  } catch (error) {
    console.error('Restore error', error);
    resetGame(false);
  }
}

init();
