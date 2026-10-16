
'use strict';

const $ = id => document.getElementById(id);
const KEY = 'fakh-alijabat-v1';

let players = [];
let impostorCount = 2;
let round = 1;
let deck = [];
let cursor = 0;
let current = null;
let selected = null;
let locked = false;
let timedOut = false;
let seconds = 60;
let running = false;
let interval = null;
let selectedImpostors = new Set();
let questions = [];

function show(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.id === id);
  });
  window.scrollTo(0, 0);
  save(id);
}

function save(screen) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      players, impostorCount, round, deck, cursor,
      currentId: current?.id,
      selected, locked, timedOut, seconds, screen
    }));
  } catch (e) {
    console.warn('تعذر حفظ التقدم', e);
  }
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function text(id, value) {
  $(id).textContent = value;
}

function renderPlayers() {
  $('players-list').replaceChildren();

  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.textContent = p.name + ' ';

    const b = document.createElement('button');
    b.textContent = '×';
    b.setAttribute('aria-label', 'حذف ' + p.name);

    b.onclick = () => {
      players = players.filter(x => x.id !== p.id);
      renderPlayers();
      save('setup-screen');
    };

    chip.append(b);
    $('players-list').append(chip);
  });
}

function addPlayer() {
  const name = $('player-name').value.trim();
  if (!name) return;

  if (players.some(p => p.name === name)) {
    text('setup-message', 'هذا الاسم موجود بالفعل');
    return;
  }

  players.push({
    id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
    name,
    score: 0
  });

  $('player-name').value = '';
  text('setup-message', '');
  renderPlayers();
  save('setup-screen');
}

function loadDeck() {
  if (!deck.length || cursor >= deck.length) {
    deck = shuffle(questions.map(q => q.id));
    cursor = 0;
  }
}

function renderQuestion() {
  if (!current) return;

  text('round-number', 'الجولة ' + round);
  text('question-category', current.category);
  text('difficulty-label', current.difficulty);
  text('question-text', current.question);

  $('question-media').replaceChildren();

  const box = $('answers-container');
  box.replaceChildren();

  current.options.forEach((answer, i) => {
    const b = document.createElement('button');

    b.className =
      'answer-option' + (selected === i ? ' selected' : '');

    const letter = document.createElement('span');
    letter.className = 'answer-letter';
    letter.textContent = ['أ', 'ب', 'ج', 'د'][i];

    const value = document.createElement('span');
    value.textContent = answer;

    b.append(letter, value);

    b.onclick = () => {
      if (locked || timedOut) return;
      selected = i;
      renderQuestion();
      save('question-screen');
    };

    box.append(b);
  });

  $('lock-answer-btn').disabled =
    selected === null || locked || timedOut;

  renderTimer();
}

function renderTimer() {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  text('timer', minutes + ':' + secs);

  $('timer-progress').style.width =
    (seconds / 60 * 100) + '%';

  $('timer').classList.toggle('urgent', seconds <= 10);

  text(
    'pause-btn',
    running ? 'إيقاف مؤقت' : 'متابعة الوقت'
  );
}

function stopTimer() {
  clearInterval(interval);
  interval = null;
  running = false;
  renderTimer();
}

function startTimer() {
  if (running || locked || timedOut) return;

  running = true;
  renderTimer();

  interval = setInterval(() => {
    seconds = Math.max(0, seconds - 1);
    renderTimer();
    save('question-screen');

    if (seconds === 0) {
      timedOut = true;
      selected = null;
      locked = true;
      stopTimer();
      reveal();
    }
  }, 1000);
}

function nextQuestion() {
  if (!questions.length) {
    alert('لم يتم تحميل الأسئلة. تأكدوا من ملف questions.json');
    return;
  }

  loadDeck();

  current = questions.find(q => q.id === deck[cursor++]);

  selected = null;
  locked = false;
  timedOut = false;
  seconds = 60;
  selectedImpostors.clear();

  renderQuestion();
  show('question-screen');
  startTimer();
}

function reveal() {
  stopTimer();
  if (!current) return;

  text('correct-answer', current.options[current.correct]);
  text('answer-explanation', current.explanation || '');

  text(
    'result-title',
    timedOut
      ? 'انتهى الوقت!'
      : selected === current.correct
        ? 'إجابة صحيحة!'
        : 'إجابة خاطئة!'
  );

  text(
    'result-icon',
    timedOut
      ? '⏰'
      : selected === current.correct
        ? '🎉'
        : '🎭'
  );

  text(
    'result-message',
    timedOut
      ? 'لا نقاط لهذه الجولة'
      : selected === current.correct
        ? 'نقطة لكل لاعب عادي'
        : 'نقطتان لكل مخادع'
  );

  show('reveal-screen');
}

function renderImpostors() {
  const box = $('impostor-selection');
  box.replaceChildren();

  players.forEach(p => {
    const b = document.createElement('button');

    b.className =
      'impostor-option' +
      (selectedImpostors.has(p.id) ? ' selected' : '');

    b.textContent = p.name;

    b.onclick = () => {
      if (selectedImpostors.has(p.id)) {
        selectedImpostors.delete(p.id);
      } else if (selectedImpostors.size < impostorCount) {
        selectedImpostors.add(p.id);
      }
      renderImpostors();
    };

    box.append(b);
  });

  text(
    'scoring-message',
    'اختاروا ' + impostorCount + ' من المخادعين'
  );
}

function renderLeaderboard(id) {
  const box = $(id);
  box.replaceChildren();

  [...players]
    .sort((a, b) =>
      b.score - a.score || a.name.localeCompare(b.name, 'ar')
    )
    .forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'leaderboard-row';

      const name = document.createElement('span');
      name.textContent = (i + 1) + '. ' + p.name;

      const points = document.createElement('span');
      points.className = 'leaderboard-points';
      points.textContent = p.score + ' نقطة';

      row.append(name, points);
      box.append(row);
    });
}

async function init() {
  try {
    const response = await fetch('questions.json', {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw Error('HTTP ' + response.status);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw Error('Expected array');
    }

    questions = data.filter(q =>
      q &&
      typeof q.id === 'number' &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      Number.isInteger(q.correct) &&
      q.correct >= 0 &&
      q.correct < 4
    );

    if (!questions.length) {
      throw Error('No valid questions');
    }
  } catch (e) {
    console.error(e);
    alert(
      'تعذر تحميل الأسئلة. أضيفوا ملف questions.json أولاً، ' +
      'وافتحوا اللعبة عبر GitHub Pages.'
    );
  }

  try {
    const old = JSON.parse(localStorage.getItem(KEY) || 'null');

    if (old && Array.isArray(old.players)) {
      players = old.players;
      impostorCount = old.impostorCount || 2;
      round = old.round || 1;
      deck = old.deck || [];
      cursor = old.cursor || 0;

      current =
        questions.find(q => q.id === old.currentId) || null;

      selected = old.selected ?? null;
      locked = !!old.locked;
      timedOut = !!old.timedOut;
      seconds = Math.max(
        0,
        Math.min(60, old.seconds ?? 60)
      );

      const safe = [
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

      let screen = safe.includes(old.screen)
        ? old.screen
        : 'home-screen';

      if (
        ['question-screen', 'reveal-screen', 'scoring-screen']
          .includes(screen) && !current
      ) {
        screen = 'roles-screen';
      }

      renderPlayers();
      $('impostor-count').value = String(impostorCount);

      if (current) renderQuestion();

      if (screen === 'question-screen') {
        stopTimer();
        text('pause-btn', 'متابعة الوقت');
      }

      if (screen === 'reveal-screen') {
        reveal();
      } else if (screen === 'scoring-screen') {
        renderImpostors();
      } else if (screen === 'leaderboard-screen') {
        renderLeaderboard('leaderboard-list');
      } else if (screen === 'end-screen') {
        renderLeaderboard('final-leaderboard');
      }

      show(screen);
    }
  } catch (e) {
    console.error(e);
  }
}

$('play-btn').onclick = () => show('setup-screen');

$('rules-btn').onclick = () => show('rules-screen');

$('rules-back-btn').onclick = () => show('home-screen');

$('setup-back-btn').onclick = () => show('home-screen');

$('add-player-btn').onclick = addPlayer;

$('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer();
});

$('impostor-count').onchange = e => {
  impostorCount = Number(e.target.value);
  save('setup-screen');
};

$('start-game-btn').onclick = () => {
  if (players.length < 4) {
    text('setup-message', 'أضيفوا أربعة لاعبين على الأقل');
    return;
  }

  if (impostorCount >= players.length) {
    text(
      'setup-message',
      'عدد المخادعين لازم يكون أقل من عدد اللاعبين'
    );
    return;
  }

  if (!questions.length) {
    text('setup-message', 'أضيفوا ملف الأسئلة أولاً');
    return;
  }

  text('roles-count', 'عدد المخادعين: ' + impostorCount);
  show('roles-screen');
};

$('show-question-btn').onclick = nextQuestion;

$('pause-btn').onclick = () => {
  if (running) stopTimer();
  else startTimer();
};

$('lock-answer-btn').onclick = () => {
  if (selected === null || locked || timedOut) return;

  locked = true;
  reveal();
};

$('go-to-scoring-btn').onclick = () => {
  selectedImpostors.clear();
  renderImpostors();
  show('scoring-screen');
};

$('calculate-scores-btn').onclick = () => {
  if (selectedImpostors.size !== impostorCount) {
    text(
      'scoring-message',
      'لازم تختاروا ' + impostorCount + ' مخادعين بالضبط'
    );
    return;
  }

  if (!timedOut) {
    players.forEach(p => {
      const imp = selectedImpostors.has(p.id);

      if (selected === current.correct && !imp) {
        p.score += 1;
      }

      if (selected !== current.correct && imp) {
        p.score += 2;
      }
    });
  }

  renderLeaderboard('leaderboard-list');
  text('leaderboard-round', 'بعد الجولة ' + round);
  show('leaderboard-screen');
};

$('next-round-btn').onclick = () => {
  round++;
  text('roles-count', 'عدد المخادعين: ' + impostorCount);
  show('roles-screen');
};

$('end-game-btn').onclick = () => {
  renderLeaderboard('final-leaderboard');
  show('end-screen');
};

$('new-game-btn').onclick = () => {
  if (!confirm('تبدؤون لعبة جديدة وتصفّرون النقاط؟')) {
    return;
  }

  stopTimer();
  players = [];
  round = 1;
  deck = [];
  cursor = 0;
  current = null;
  selected = null;
  locked = false;
  timedOut = false;

  localStorage.removeItem(KEY);
  renderPlayers();
  show('home-screen');
};

init();
