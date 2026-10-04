/* Udan Panam Mobile UI Control */
let socket = null;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const controlScreen = document.getElementById('control-screen');
const questionsScreen = document.getElementById('questions-screen');
const loginBtn = document.getElementById('login-btn');
const loginPwd = document.getElementById('login-pwd');
const loginError = document.getElementById('login-error');
const connStatus = document.getElementById('conn-status');

const qText = document.getElementById('current-q-text');
const qLevel = document.getElementById('q-level');
const qId = document.getElementById('q-id');
const qAnswer = document.getElementById('q-answer');

let allQuestions = [];
let filteredQuestions = [];
const qSearchInput = document.getElementById('q-search');
const qListContainer = document.getElementById('q-list');

// Timer pause/resume state
let timerPaused = false;

function updatePauseBtn() {
  const btn = document.getElementById('btn-pause-timer');
  if (!btn) return;
  if (state.timer_running && !timerPaused) {
    // Show pause icon
    btn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    btn.title = 'Pause Timer';
    btn.classList.remove('btn-success');
    btn.classList.add('btn-warning');
  } else {
    // Show resume/play icon
    btn.innerHTML = '<i class="fa-solid fa-play"></i>';
    btn.title = 'Resume Timer';
    btn.classList.remove('btn-warning');
    btn.classList.add('btn-success');
  }
}

let state = {
  current_question_id: null,
  active_screen: 'quiz',
  show_question: false,
  show_options: false,
  reveal_answer: false,
  timer_running: false
};

function hapticFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(40);
  }
}

// Global button click haptics
document.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('.q-item')) {
    hapticFeedback();
  }
});

// Login
let authToken = localStorage.getItem('admin_token') || '';

if (authToken) {
  initApp();
}

loginBtn.addEventListener('click', async () => {
  const pwd = loginPwd.value.trim();
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    
    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
      localStorage.setItem('admin_token', authToken);
      initApp();
    } else {
      loginError.innerText = "Invalid Password";
    }
  } catch (err) {
    loginError.innerText = "Connection Error";
  }
});

async function fetchInitialState() {
  try {
    const res = await fetch('/api/presentation/state');
    if (res.ok) {
      const pState = await res.json();
      applyStateSync(pState);
    }
  } catch (e) {
    console.error('Failed to fetch initial state:', e);
  }
}

function initApp() {
  loginScreen.classList.remove('active');
  controlScreen.classList.add('active');
  
  socket = io();

  socket.on('connect', () => {
    connStatus.classList.add('connected');
    // Join the admin room so we receive state:sync broadcasts!
    socket.emit('join', 'admin');
  });

  socket.on('disconnect', () => {
    connStatus.classList.remove('connected');
  });

  socket.on('state:sync', (newState) => {
    applyStateSync(newState);
  });

  setupControls();
  setupNavigation();
  loadQuestions();
  fetchInitialState();
}

function applyStateSync(newState) {
  if (!newState) return;
  const prevQId = state.current_question_id;
  state = { ...state, ...newState };
  updateUI();

  // Find active question object
  let activeQ = newState.question || null;
  if (!activeQ && state.current_question_id && allQuestions.length > 0) {
    activeQ = allQuestions.find(q => String(q.id) === String(state.current_question_id)) || null;
  }
  updateQuestionPreview(activeQ);

  // Always re-render list if question ID changes or questions loaded
  if (allQuestions.length > 0 && String(prevQId) !== String(state.current_question_id)) {
    renderQuestions();
  }
}

function updateQuestionPreview(q) {
  if (q && q.question_text) {
    qText.innerText = q.question_text;
    qLevel.innerText = `Level ${q.level || 1}`;
    qId.innerText = `ID: ${q.id}`;
    if (qAnswer) {
      const correctLetter = (q.correct_answer || 'A').toUpperCase();
      const correctVal = q[`option_${correctLetter.toLowerCase()}`] || '';
      qAnswer.innerText = `Ans: ${correctLetter}${correctVal ? ' (' + correctVal + ')' : ''}`;
    }
  } else if (state.current_question_id && allQuestions.length > 0) {
    const found = allQuestions.find(x => String(x.id) === String(state.current_question_id));
    if (found) {
      updateQuestionPreview(found);
      return;
    }
    qText.innerText = 'Question #' + state.current_question_id;
    qLevel.innerText = '--';
    qId.innerText = `ID: ${state.current_question_id}`;
    if (qAnswer) qAnswer.innerText = 'Ans: --';
  } else {
    qText.innerText = 'Waiting for question...';
    qLevel.innerText = '--';
    qId.innerText = '--';
    if (qAnswer) qAnswer.innerText = 'Ans: --';
  }
}

function updateUI() {
  // Update Scene Buttons
  document.querySelectorAll('.scene-btn').forEach(btn => {
    const isActive = btn.dataset.scene === state.active_screen;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('btn-primary', isActive);
  });

  // Update Display Control Buttons
  const btnShowQ = document.getElementById('btn-show-q');
  const btnShowOpt = document.getElementById('btn-show-opt');
  const btnShowTimer = document.getElementById('btn-show-timer');
  const btnReveal = document.getElementById('btn-reveal');

  if (btnShowQ) btnShowQ.classList.toggle('active', !!state.show_question);
  if (btnShowOpt) btnShowOpt.classList.toggle('active', !!state.show_options);
  if (btnShowTimer) btnShowTimer.classList.toggle('active', !!state.timer_running);
  if (btnReveal) btnReveal.classList.toggle('active', !!state.reveal_answer);
}

function setupControls() {
  // Scene Routing
  document.querySelectorAll('.scene-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('state:update', { active_screen: btn.dataset.scene });
    });
  });

  // Sound fx
  document.querySelectorAll('.sfx-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sound = btn.dataset.sound;
      if (sound === 'stop') {
        socket.emit('sound:stop');
      } else {
        socket.emit('sound:play', { category: sound });
      }
    });
  });

  // Display Control
  document.getElementById('btn-show-q').addEventListener('click', () => {
    socket.emit('state:update', { show_question: !state.show_question });
  });
  document.getElementById('btn-show-opt').addEventListener('click', () => {
    socket.emit('state:update', { show_options: !state.show_options });
  });
  document.getElementById('btn-show-timer').addEventListener('click', () => {
    if (state.timer_running) {
       socket.emit('timer:stop');
       socket.emit('state:update', { timer_running: false });
    } else {
       socket.emit('timer:start', { duration: 30 });
    }
  });
  const btnPauseTimer = document.getElementById('btn-pause-timer');
  if (btnPauseTimer) {
    btnPauseTimer.addEventListener('click', () => {
      socket.emit('timer:pause');
    });
  }
  document.getElementById('btn-reveal').addEventListener('click', () => {
    socket.emit('state:update', { reveal_answer: !state.reveal_answer });
  });

  // Navigation Logic
  document.getElementById('btn-next').addEventListener('click', () => {
     if (allQuestions.length === 0) return;
     let currentIndex = allQuestions.findIndex(q => String(q.id) === String(state.current_question_id));
     let nextIndex = currentIndex + 1;
     if (nextIndex >= allQuestions.length) nextIndex = 0;
     
     const nextQ = allQuestions[nextIndex];
     dispatchQuestion(nextQ);
  });
  
  document.getElementById('btn-prev').addEventListener('click', () => {
     if (allQuestions.length === 0) return;
     let currentIndex = allQuestions.findIndex(q => String(q.id) === String(state.current_question_id));
     let prevIndex = currentIndex - 1;
     if (prevIndex < 0) prevIndex = allQuestions.length - 1;
     
     const prevQ = allQuestions[prevIndex];
     dispatchQuestion(prevQ);
  });
}

function dispatchQuestion(q) {
  if (!q) return;
  state.current_question_id = q.id;
  updateQuestionPreview(q);
  renderQuestions();
  
  socket.emit('sound:play', { category: 'transition' });
  socket.emit('state:update', {
    current_question_id: q.id,
    show_question: true,
    show_options: false,
    reveal_answer: false,
    show_explanation: false,
    timer_running: false
  });
}

function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const targetId = btn.dataset.target;
      document.querySelectorAll('.screen').forEach(s => {
         if (s.id !== 'login-screen') {
            s.classList.remove('active');
         }
      });
      const targetScreen = document.getElementById(targetId);
      if (targetScreen) targetScreen.classList.add('active');
      
      if (targetId === 'questions-screen') {
        renderQuestions();
      }
    });
  });

  qSearchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    filteredQuestions = allQuestions.filter(q => 
       (q.question_text && q.question_text.toLowerCase().includes(term)) ||
       (q.option_a && q.option_a.toLowerCase().includes(term)) ||
       (q.option_b && q.option_b.toLowerCase().includes(term)) ||
       (q.option_c && q.option_c.toLowerCase().includes(term)) ||
       (q.option_d && q.option_d.toLowerCase().includes(term)) ||
       String(q.id) === term
    );
    renderQuestions();
  });
}

async function loadQuestions() {
  try {
    const res = await fetch('/api/questions?limit=500');
    if (res.ok) {
      allQuestions = await res.json();
      filteredQuestions = allQuestions;
      if (state.current_question_id) {
        const activeQ = allQuestions.find(q => String(q.id) === String(state.current_question_id));
        if (activeQ) updateQuestionPreview(activeQ);
      }
      renderQuestions();
    } else {
      qListContainer.innerHTML = '<div class="text-center text-muted">Failed to load questions.</div>';
    }
  } catch (err) {
    qListContainer.innerHTML = '<div class="text-center text-muted">Error loading questions.</div>';
  }
}

function renderQuestions() {
  if (!qListContainer) return;
  qListContainer.innerHTML = '';
  if (filteredQuestions.length === 0) {
     qListContainer.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">No questions found.</div>';
     return;
  }
  
  // Sort so active question comes FIRST at the top!
  const sortedQuestions = [...filteredQuestions].sort((a, b) => {
    const aIsActive = String(a.id) === String(state.current_question_id);
    const bIsActive = String(b.id) === String(state.current_question_id);
    if (aIsActive) return -1;
    if (bIsActive) return 1;
    return a.id - b.id;
  });
  
  sortedQuestions.forEach((q, idx) => {
    const isActive = String(state.current_question_id) === String(q.id);
    const div = document.createElement('div');
    div.className = 'q-item' + (isActive ? ' active' : '');
    
    const correctLetter = (q.correct_answer || 'A').toUpperCase();
    const correctText = q[`option_${correctLetter.toLowerCase()}`] || '';

    div.innerHTML = `
      <div class="q-item-header">
        <div style="display: flex; align-items: center; gap: 6px;">
          ${isActive ? '<span class="q-active-indicator"><i class="fa-solid fa-tower-broadcast"></i> LIVE</span>' : `<span class="q-item-badge">#${idx + 1} | Lvl ${q.level || 1}</span>`}
          <span class="q-item-badge">ID: ${q.id}</span>
        </div>
        <div style="margin-left: auto; display: flex; gap: 6px;">
          <button class="btn btn-primary dispatch-q-btn" style="padding: 4px 10px; font-size: 0.75rem;" data-id="${q.id}">
            <i class="fa-solid fa-play"></i> Stage
          </button>
          <button class="btn btn-outline edit-q-btn" style="padding: 4px 10px; font-size: 0.75rem;" data-id="${q.id}">
            <i class="fa-solid fa-pen"></i> Edit
          </button>
        </div>
      </div>
      <div class="q-item-title" style="margin-top: 6px;">${q.question_text || ''}</div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px;">
        <div class="opt-box ${correctLetter === 'A' ? 'is-correct' : ''}"><strong>A:</strong> ${q.option_a || ''}</div>
        <div class="opt-box ${correctLetter === 'B' ? 'is-correct' : ''}"><strong>B:</strong> ${q.option_b || ''}</div>
        <div class="opt-box ${correctLetter === 'C' ? 'is-correct' : ''}"><strong>C:</strong> ${q.option_c || ''}</div>
        <div class="opt-box ${correctLetter === 'D' ? 'is-correct' : ''}"><strong>D:</strong> ${q.option_d || ''}</div>
      </div>
      
      <div class="q-correct-ans-bar">
        <i class="fa-solid fa-circle-check"></i> Correct: <strong>${correctLetter}</strong> ${correctText ? '— ' + correctText : ''}
      </div>
    `;
    
    const dispatchBtn = div.querySelector('.dispatch-q-btn');
    dispatchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchQuestion(q);
      const ctrlNav = document.querySelector('.nav-btn[data-target="control-screen"]');
      if (ctrlNav) ctrlNav.click();
    });

    const editBtn = div.querySelector('.edit-q-btn');
    editBtn.addEventListener('click', (e) => {
       e.stopPropagation();
       openEditModal(q);
    });

    div.addEventListener('click', () => {
      dispatchQuestion(q);
      const ctrlNav = document.querySelector('.nav-btn[data-target="control-screen"]');
      if (ctrlNav) ctrlNav.click();
    });
    
    qListContainer.appendChild(div);
  });
}

// CRUD - Edit Modal Logic
const editModal = document.getElementById('edit-modal');
const editQId = document.getElementById('edit-q-id');
const editQText = document.getElementById('edit-q-text');
const editQOptA = document.getElementById('edit-opt-a');
const editQOptB = document.getElementById('edit-opt-b');
const editQOptC = document.getElementById('edit-opt-c');
const editQOptD = document.getElementById('edit-opt-d');
const editQAns = document.getElementById('edit-q-ans');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveEdit = document.getElementById('btn-save-edit');

function openEditModal(q) {
  if (!q) return;
  editQId.value = q.id;
  editQText.value = q.question_text || '';
  editQOptA.value = q.option_a || '';
  editQOptB.value = q.option_b || '';
  editQOptC.value = q.option_c || '';
  editQOptD.value = q.option_d || '';
  editQAns.value = (q.correct_answer || 'A').toUpperCase();
  editModal.style.display = 'flex';
}

btnCancelEdit.addEventListener('click', () => {
  editModal.style.display = 'none';
});

btnSaveEdit.addEventListener('click', async () => {
  const id = editQId.value;
  const newText = editQText.value.trim();
  const newOptA = editQOptA.value.trim();
  const newOptB = editQOptB.value.trim();
  const newOptC = editQOptC.value.trim();
  const newOptD = editQOptD.value.trim();
  const newAns = editQAns.value;
  
  if (!authToken) {
    alert("You need to login with the password to edit questions.");
    return;
  }
  
  btnSaveEdit.innerText = "Saving...";
  
  try {
    const res = await fetch(`/api/questions/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': authToken
      },
      body: JSON.stringify({
        question_text: newText,
        option_a: newOptA,
        option_b: newOptB,
        option_c: newOptC,
        option_d: newOptD,
        correct_answer: newAns
      })
    });
    
    if (res.ok) {
      // Update local array
      const q = allQuestions.find(q => String(q.id) === String(id));
      if (q) {
        q.question_text = newText;
        q.option_a = newOptA;
        q.option_b = newOptB;
        q.option_c = newOptC;
        q.option_d = newOptD;
        q.correct_answer = newAns;
        
        // Also update socket state so live stage refreshes!
        if (String(state.current_question_id) === String(id)) {
          socket.emit('question:set-correct', { question_id: id, correct_answer: newAns });
          socket.emit('state:update', { current_question_id: id });
          updateQuestionPreview(q);
        }
      }
      renderQuestions();
      editModal.style.display = 'none';
    } else {
      alert('Failed to update question. Please verify your login.');
    }
  } catch (err) {
    alert('Network error while updating question.');
  } finally {
    btnSaveEdit.innerText = "Save Changes";
  }
});
