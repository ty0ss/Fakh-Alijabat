
'use strict';

const $ = id => document.getElementById(id);
const KEY = 'fakh-alijabat-v3';

let questions = [];
let players = [];
let impostorCount = 2;
let round = 1;
let deck = [];
let cursor = 0;
let current = null;
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

function shuffle(items) {
  const arr = [...items];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
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
      selected,
      timedOut,
      seconds,
      screen,
      scoresApplied,
      gameActive,
      chosenImpostors: [...chosenImpostors]
    }));
  } catch (error) {
    console.warn('Could not save game', error);
  }
}

function show(id) {
  screen = id;

  document.querySelectorAll('.screen').forEach(el => {
    el.classList.toggle('active', el.id === id);
  });

  window.scrollTo(0, 0);
  save();
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
  running = false;
  deadline = 0;
  renderTimer();
}

function renderTimer() {
  setText(
    'timer',
    String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0')
  );

  const progress = $('timer-progress');

  if (progress) {
    progress.style.width = (seconds / 60 * 100) + '%';
  }

  $('timer').classList.toggle('urgent', seconds <= 10);

  setText(
    'pause-btn',
    running ? 'إيقاف مؤقت' : 'متابعة الوقت'
  );
}

function startTimer() {
  if (running || timedOut || screen !== 'question-screen') {
    return;
  }

  running = true;
  deadline = Date.now() + seconds * 1000;

  renderTimer();

  timer = setInterval(() => {
    seconds = Math.max(
      0,
      Math.ceil((deadline - Date.now()) / 1000)
    );

    renderTimer();
    save();

    if (seconds === 0) {
      timedOut = true;
      selected = null;
      stopTimer();
      reveal();
    }
  }, 200);
}

function toggleTimer() {
  if (running) {
    seconds = Math.max(
      0,
      Math.ceil((deadline - Date.now()) / 1000)
    );
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

function addPlayer() {
  const input = $('player-name');
  const name = input.value.trim();

  if (!name) return;

  if (players.some(p => p.name === name)) {
    setText('setup-message', 'هذا الاسم موجود بالفعل');
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
      players = players.filter(p => p.id !== player.id);
      renderPlayers();
      save();
    };

    chip.append(name, remove);
    box.append(chip);
  });
}

function createDeck() {
  deck = shuffle(questions.map(q => q.id));
  cursor = 0;
}

function getNextQuestion() {
  if (!questions.length) return null;

  if (!deck.length || cursor >= deck.length) {
    createDeck();
  }

  let nextId = deck[cursor++];

  // Avoid repeating the last question when a deck restarts.
  if (
    current &&
    questions.length > 1 &&
    nextId === current.id
  ) {
    if (cursor < deck.length) {
      [deck[cursor - 1], deck[cursor]] =
        [deck[cursor], deck[cursor - 1]];

      nextId = deck[cursor - 1];
    } else {
      createDeck();

      if (deck[0] === current.id) {
        const swap = deck.findIndex(
          id => id !== current.id
        );

        [deck[0], deck[swap]] =
          [deck[swap], deck[0]];
      }

      nextId = deck[cursor++];
    }
  }

  return questions.find(q => q.id === nextId) || null;
}

function prepareRound() {
  stopTimer();

  current = null;
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
  if (!gameActive) return;

  stopTimer();

  const next = getNextQuestion();

  if (!next) {
    alert('تعذر تحميل السؤال التالي');
    return;
  }

  current = next;
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

  setText('round-number', 'الجولة ' + round);
  setText('question-category', current.category);
  setText('difficulty-label', current.difficulty);
  setText('question-text', current.question);

  $('question-media').replaceChildren();

  const box = $('answers-container');
  box.replaceChildren();

  const letters = ['أ', 'ب', 'ج', 'د'];

  current.options.forEach((answer, index) => {
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
      if (timedOut || screen !== 'question-screen') {
        return;
      }

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

  const correct = selected === current.correct;

  setText(
    'correct-answer',
    current.options[current.correct]
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
    timedOut ? '⏰' : correct ? '🎉' : '🎯'
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

function renderImpostors() {
  const box = $('impostor-selection');
  box.replaceChildren();

  players.forEach(player => {
    const button = document.createElement('button');

    button.className =
      'impostor-option' +
      (chosenImpostors.has(player.id) ? ' selected' : '');

    button.textContent = player.name;

    button.onclick = () => {
      if (chosenImpostors.has(player.id)) {
        chosenImpostors.delete(player.id);
      } else if (chosenImpostors.size < impostorCount) {
        chosenImpostors.add(player.id);
      }

      renderImpostors();
      save();
    };

    box.append(button);
  });

  setText(
    'scoring-message',
    'اختاروا ' + impostorCount + ' من المخادعين'
  );
}

function calculateScores() {
  if (scoresApplied) {
    renderLeaderboard('leaderboard-list');
    show('leaderboard-screen');
    return;
  }

  if (chosenImpostors.size !== impostorCount) {
    setText(
      'scoring-message',
      'اختاروا ' + impostorCount + ' مخادعين بالضبط'
    );
    return;
  }

  if (!timedOut && current) {
    const correct = selected === current.correct;

    players.forEach(player => {
      const isImpostor = chosenImpostors.has(player.id);

      if (correct && !isImpostor) {
        player.score += 1;
      }

      if (!correct && isImpostor) {
        player.score += 2;
      }
    });
  }

  scoresApplied = true;

  setText('leaderboard-round', 'بعد الجولة ' + round);
  renderLeaderboard('leaderboard-list');
  show('leaderboard-screen');
}

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
      (index + 1) + '. ' + player.name;

    const points = document.createElement('span');
    points.className = 'leaderboard-points';
    points.textContent = player.score + ' نقطة';

    row.append(name, points);
    box.append(row);
  });
}

function advanceRound() {
  if (!scoresApplied) return;

  round += 1;
  prepareRound();
}

function startGame() {
  if (players.length < 4) {
    setText(
      'setup-message',
      'أضيفوا أربعة لاعبين على الأقل'
    );
    return;
  }

  if (impostorCount >= players.length) {
    setText(
      'setup-message',
      'عدد المخادعين لازم يكون أقل من اللاعبين'
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

  players.forEach(p => p.score = 0);

  round = 1;
  current = null;
  selected = null;
  timedOut = false;
  scoresApplied = false;
  gameActive = true;
  chosenImpostors.clear();

  createDeck();
  prepareRound();
}

function resetGame() {
  stopTimer();

  players = [];
  impostorCount = 2;
  round = 1;
  deck = [];
  cursor = 0;
  current = null;
  selected = null;
  timedOut = false;
  seconds = 60;
  scoresApplied = false;
  gameActive = false;
  chosenImpostors.clear();

  $('impostor-count').value = '2';
  $('player-name').value = '';

  setText('setup-message', '');
  renderPlayers();

  localStorage.removeItem(KEY);
  localStorage.removeItem('fakh-alijabat-v1');
  localStorage.removeItem('fakh-alijabat-v2');

  show('home-screen');
}

function endGame() {
  if (!gameActive) {
    show('home-screen');
    return;
  }

  stopTimer();
  gameActive = false;

  renderLeaderboard('final-leaderboard');
  show('end-screen');
}

function confirmNewGame() {
  if (!confirm(
    'تبدؤون لعبة جديدة؟ راح تنمسح النقاط والجولات السابقة.'
  )) return;

  closeMenu();
  resetGame();
  show('setup-screen');
}

function confirmEndGame() {
  if (!confirm(
    'متأكدين تبغون تنهُون اللعبة الحالية؟'
  )) return;

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
  `;

  document.head.append(style);

  const toggle = document.createElement('button');
  toggle.id = 'menu-toggle';
  toggle.textContent = '☰';
  toggle.setAttribute('aria-label', 'القائمة');

  const panel = document.createElement('div');
  panel.id = 'menu-panel';
  panel.hidden = true;

  const items = [
    ['متابعة اللعب', () => closeMenu()],
    ['ترتيب اللاعبين', () => {
      if (!gameActive || !scoresApplied) {
        alert('يظهر الترتيب بعد حساب نقاط الجولة');
        return;
      }

      closeMenu();
      renderLeaderboard('leaderboard-list');
      show('leaderboard-screen');
    }],
    ['لعبة جديدة', confirmNewGame],
    ['إنهاء اللعبة', confirmEndGame],
    ['الصفحة الرئيسية', () => {
      closeMenu();
      if (screen === 'question-screen') stopTimer();
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
    panel.hidden = !panel.hidden;
  };

  document.body.append(toggle, panel);
}

function closeMenu() {
  const panel = $('menu-panel');
  if (panel) panel.hidden = true;
}

// BUTTONS

$('play-btn').onclick = () => {
  if (gameActive) {
    const resume = confirm(
      'عندكم لعبة جارية. تبغون تكملونها؟'
    );

    if (resume) {
      if (current && !scoresApplied) {
        if (screen === 'home-screen') {
          renderQuestion();
          show('question-screen');
          // Timer stays paused until resumed.
        }
      } else {
        show('roles-screen');
      }

      return;
    }

    confirmNewGame();
    return;
  }

  show('setup-screen');
};

$('rules-btn').onclick = () => show('rules-screen');

$('rules-back-btn').onclick = () => show('home-screen');

$('setup-back-btn').onclick = () => show('home-screen');

$('add-player-btn').onclick = addPlayer;

$('player-name').addEventListener('keydown', event => {
  if (event.key === 'Enter') addPlayer();
});

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

$('calculate-scores-btn').onclick = calculateScores;

$('next-round-btn').onclick = advanceRound;

$('end-game-btn').onclick = confirmEndGame;

$('new-game-btn').onclick = confirmNewGame;

// INITIALIZATION

async function init() {
  createMenu();

  try {
    const response = await fetch('questions.json', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Questions not found');
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid question file');
    }

    questions = data.filter(q =>
      q &&
      Number.isInteger(q.id) &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      Number.isInteger(q.correct) &&
      q.correct >= 0 &&
      q.correct <= 3
    );

  } catch (error) {
    console.error(error);
    alert('تعذر تحميل الأسئلة من questions.json');
  }

  // Remove previous buggy saves.
  localStorage.removeItem('fakh-alijabat-v1');
  localStorage.removeItem('fakh-alijabat-v2');

  try {
    const old = JSON.parse(
      localStorage.getItem(KEY) || 'null'
    );

    if (!old || !Array.isArray(old.players)) return;

    players = old.players;
    impostorCount = old.impostorCount || 2;
    round = old.round || 1;
    deck = Array.isArray(old.deck) ? old.deck : [];
    cursor = old.cursor || 0;
    current = questions.find(
      q => q.id === old.currentId
    ) || null;

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

    $('impostor-count').value = String(impostorCount);

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

    const target = validScreens.includes(old.screen)
      ? old.screen
      : 'home-screen';

    if (current) {
      renderQuestion();
    }

    if (target === 'reveal-screen' && current) {
      reveal();
    } else if (target === 'scoring-screen' && current) {
      renderImpostors();
      show(target);
    } else if (target === 'leaderboard-screen') {
      renderLeaderboard('leaderboard-list');
      setText(
        'leaderboard-round',
        'بعد الجولة ' + round
      );
      show(target);
    } else if (target === 'end-screen') {
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

    // Never automatically restart a timer after refresh.
    stopTimer();

  } catch (error) {
    console.error('Restore error', error);
    resetGame();
  }
}

init();
