const tbody = document.querySelector('#questions-table tbody');
const modal = document.getElementById('modal');
const form = document.getElementById('question-form');
const addBtn = document.getElementById('add-btn');
const cancelBtn = document.getElementById('cancel-btn');
const modalTitle = document.getElementById('modal-title');

const qId = document.getElementById('q-id');
const qLevel = document.getElementById('q-level');
const qText = document.getElementById('q-text');
const qAudioUrl = document.getElementById('q-audio-url');
const qImageUrl = document.getElementById('q-image-url');
const qOptA = document.getElementById('q-opt-a');
const qOptB = document.getElementById('q-opt-b');
const qOptC = document.getElementById('q-opt-c');
const qOptD = document.getElementById('q-opt-d');
const qAns = document.getElementById('q-ans');

const searchInput = document.getElementById('search-input');
const levelFilter = document.getElementById('level-filter');

let allQuestions = [];

// Fetch and display questions
async function loadQuestions() {
    try {
        const res = await fetch('/api/questions');
        allQuestions = await res.json();
        renderTable();
        // Sync live controls dropdown
        await pollLiveState();
    } catch (err) {
        console.error('Failed to load questions', err);
    }
}

function renderTable() {
    tbody.innerHTML = '';
    
    const searchTerm = searchInput.value.toLowerCase();
    const filterLevel = levelFilter.value;

    const filtered = allQuestions.filter(q => {
        const matchesSearch = (q.question_text || '').toLowerCase().includes(searchTerm);
        const matchesLevel = filterLevel === 'all' || q.level == filterLevel;
        return matchesSearch && matchesLevel;
    });

    filtered.forEach(q => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${q.id}</td>
                <td>${q.level || 1}</td>
                <td>${q.question_text || '<em>Audio Question</em>'}</td>
                <td>${q.option_a}</td>
                <td>${q.option_b}</td>
                <td>${q.option_c}</td>
                <td>${q.option_d}</td>
                <td><strong>${q.correct_answer}</strong></td>
                <td class="td-actions">
                    <button class="btn secondary edit-btn" data-id="${q.id}">Edit</button>
                    <button class="btn danger del-btn" data-id="${q.id}">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Attach listeners to dynamically created buttons
        document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', handleEdit));
        document.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', handleDelete));
}

searchInput.addEventListener('input', renderTable);
levelFilter.addEventListener('change', renderTable);

// Open Modal for Add
addBtn.addEventListener('click', () => {
    form.reset();
    qId.value = '';
    modalTitle.textContent = 'Add Question';
    modal.classList.add('active');
});

// Close Modal
cancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
});

// Handle Form Submit (Add / Edit)
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = qId.value !== '';
    const url = isEdit ? `/api/questions/${qId.value}` : '/api/questions';
    const method = isEdit ? 'PUT' : 'POST';

    const payload = {
        level: parseInt(qLevel.value),
        question_text: qText.value,
        audio_url: qAudioUrl.value,
        image_url: qImageUrl.value,
        option_a: qOptA.value,
        option_b: qOptB.value,
        option_c: qOptC.value,
        option_d: qOptD.value,
        correct_answer: qAns.value
    };

    try {
        await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        modal.classList.remove('active');
        loadQuestions();
    } catch (err) {
        console.error('Failed to save question', err);
    }
});

// Handle Edit
async function handleEdit(e) {
    const id = e.target.dataset.id;
    // We could fetch by ID, but since we have all data, fetching all again is fine for a small admin panel
    const res = await fetch('/api/questions');
    const questions = await res.json();
    const q = questions.find(question => question.id == id);
    
    if (q) {
        qId.value = q.id;
        qLevel.value = q.level || 1;
        qText.value = q.question_text || '';
        qAudioUrl.value = q.audio_url || '';
        qImageUrl.value = q.image_url || '';
        qOptA.value = q.option_a;
        qOptB.value = q.option_b;
        qOptC.value = q.option_c;
        qOptD.value = q.option_d;
        qAns.value = q.correct_answer;
        
        modalTitle.textContent = 'Edit Question';
        modal.classList.add('active');
    }
}

// Handle Delete
async function handleDelete(e) {
    if (!confirm('Are you sure you want to delete this question?')) return;
    const id = e.target.dataset.id;
    try {
        await fetch(`/api/questions/${id}`, { method: 'DELETE' });
        loadQuestions();
    } catch (err) {
        console.error('Failed to delete question', err);
    }
}

// Handle JSON Export
document.getElementById('export-json-btn').addEventListener('click', async () => {
    try {
        const res = await fetch('/api/questions');
        const questions = await res.json();
        // Remove IDs for clean export
        const exportData = questions.map(({id, ...rest}) => rest);
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", "quiz_questions.json");
        anchor.click();
    } catch (err) {
        console.error('Failed to export data', err);
    }
});

// Handle JSON Template Download
document.getElementById('download-template-btn').addEventListener('click', () => {
    const template = [
        {
            "level": 1,
            "question_text": "Sample Text Question?",
            "audio_url": "",
            "image_url": "",
            "option_a": "Option 1",
            "option_b": "Option 2",
            "option_c": "Option 3",
            "option_d": "Option 4",
            "correct_answer": "A"
        },
        {
            "level": 3,
            "question_text": "Identify this sound (Text is optional)",
            "audio_url": "https://example.com/audio.mp3",
            "image_url": "https://example.com/image.jpg",
            "option_a": "Sound A",
            "option_b": "Sound B",
            "option_c": "Sound C",
            "option_d": "Sound D",
            "correct_answer": "B"
        }
    ];
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 4));
    const anchor = document.createElement('a');
    anchor.setAttribute("href", dataStr);
    anchor.setAttribute("download", "quiz_template.json");
    anchor.click();
});

// Handle JSON Import
document.getElementById('import-json').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const json = JSON.parse(event.target.result);
            if (!confirm(`Are you sure you want to import ${json.length} questions?`)) return;

            await fetch('/api/questions/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(json)
            });
            alert('Import successful!');
            loadQuestions();
        } catch (err) {
            console.error('Failed to import JSON', err);
            alert('Invalid JSON file format.');
        }
        e.target.value = ''; // Reset file input
    };
    reader.readAsText(file);
});

// Live controls DOM elements
const welcomeScreenBtn = document.getElementById('live-screen-welcome-btn');
const quizScreenBtn = document.getElementById('live-screen-quiz-btn');
const level1Btn = document.getElementById('live-level-1-btn');
const level2Btn = document.getElementById('live-level-2-btn');
const level3Btn = document.getElementById('live-level-3-btn');
const liveQuestionSelect = document.getElementById('live-question-select');
const punchBtn = document.getElementById('punch-btn');
const punchPrevBtn = document.getElementById('punch-prev-btn');
const punchNextBtn = document.getElementById('punch-next-btn');
const toggleQuestionView = document.getElementById('toggle-question-view');
const toggleOptionsView = document.getElementById('toggle-options-view');
const liveRevealBtn = document.getElementById('live-reveal-btn');
const liveAudioControls = document.getElementById('live-audio-controls');
const liveAudioPlay = document.getElementById('live-audio-play');
const liveAudioPause = document.getElementById('live-audio-pause');
const liveAudioStop = document.getElementById('live-audio-stop');

// Simulator DOM elements
const simScreen = document.getElementById('sim-screen');
const simWelcomeView = document.getElementById('sim-welcome-view');
const simQuizView = document.getElementById('sim-quiz-view');
const simQLevelBadge = document.getElementById('sim-q-level-badge');
const simVisibilityBadge = document.getElementById('sim-visibility-badge');
const simQText = document.getElementById('sim-q-text');
const simImageContainer = document.getElementById('sim-image-container');
const simQAudio = document.getElementById('sim-q-audio');
const simQAudioState = document.getElementById('sim-q-audio-state');
const simOptionsBox = document.getElementById('sim-options-box');

let currentLiveState = {};

// Update live presentation state on server
async function updateLiveState(payload) {
    try {
        const res = await fetch('/api/presentation/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        currentLiveState = await res.json();
        syncLiveControlsUI();
    } catch (err) {
        console.error('Error updating live state', err);
    }
}

// Poll presentation state
async function pollLiveState() {
    try {
        const res = await fetch('/api/presentation/state');
        const newState = await res.json();
        
        const lvlChanged = newState.active_level !== currentLiveState.active_level;
        const qIdChanged = newState.current_question_id !== currentLiveState.current_question_id;
        
        currentLiveState = newState;
        syncLiveControlsUI();
        
        if (lvlChanged || qIdChanged || liveQuestionSelect.children.length <= 1) {
            updateLiveQuestionDropdown();
        }
    } catch (err) {
        console.error('Error polling live state', err);
    }
}

function syncLiveControlsUI() {
    if (!currentLiveState) return;

    // 1. Screen Selection buttons
    if (currentLiveState.active_screen === 'welcome') {
        welcomeScreenBtn.classList.add('active');
        quizScreenBtn.classList.remove('active');
    } else {
        welcomeScreenBtn.classList.remove('active');
        quizScreenBtn.classList.add('active');
    }

    // 2. Active Level Filter buttons
    const activeLvl = currentLiveState.active_level || 1;
    [level1Btn, level2Btn, level3Btn].forEach((btn, index) => {
        if (index + 1 === activeLvl) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 3. Display Toggles
    toggleQuestionView.checked = currentLiveState.show_question;
    toggleOptionsView.checked = currentLiveState.show_options;

    // 4. Reveal Answer button
    if (currentLiveState.reveal_answer) {
        liveRevealBtn.classList.add('active');
        liveRevealBtn.textContent = 'Answer Revealed';
    } else {
        liveRevealBtn.classList.remove('active');
        liveRevealBtn.textContent = 'Reveal Answer';
    }

    // 5. Audio Playback indicator active button
    const q = currentLiveState.question;
    if (q && (q.level == 3 || q.audio_url)) {
        liveAudioControls.style.display = 'flex';
        const audStat = currentLiveState.audio_status || 'stopped';
        
        liveAudioPlay.classList.toggle('active', audStat === 'playing');
        liveAudioPause.classList.toggle('active', audStat === 'paused');
        liveAudioStop.classList.toggle('active', audStat === 'stopped');
    } else {
        liveAudioControls.style.display = 'none';
    }

    // 6. SIMULATOR PREVIEW SYNC
    if (currentLiveState.active_screen === 'welcome') {
        simScreen.className = 'sim-screen welcome';
        simWelcomeView.classList.add('active');
        simQuizView.classList.remove('active');
    } else {
        simScreen.className = 'sim-screen quiz';
        simWelcomeView.classList.remove('active');
        simQuizView.classList.add('active');
    }

    const simQuestionBox = document.querySelector('.sim-question-box');
    if (q) {
        simQLevelBadge.textContent = `Level ${q.level || 1}`;
        simQText.textContent = q.question_text || '(Audio Question)';
        
        if (q.image_url) {
            simImageContainer.style.display = 'block';
        } else {
            simImageContainer.style.display = 'none';
        }

        if (q.level == 3 || q.audio_url) {
            simQAudio.style.display = 'block';
            simQAudioState.textContent = currentLiveState.audio_status || 'stopped';
        } else {
            simQAudio.style.display = 'none';
        }

        if (currentLiveState.show_question) {
            simQuestionBox.classList.remove('blurred');
            simVisibilityBadge.textContent = 'Visible';
            simVisibilityBadge.className = 'badge';
        } else {
            simQuestionBox.classList.add('blurred');
            simVisibilityBadge.textContent = 'Hidden';
            simVisibilityBadge.className = 'badge secondary';
        }

        simOptionsBox.innerHTML = `
            <div class="sim-option" data-option="A">A: ${q.option_a}</div>
            <div class="sim-option" data-option="B">B: ${q.option_b}</div>
            <div class="sim-option" data-option="C">C: ${q.option_c}</div>
            <div class="sim-option" data-option="D">D: ${q.option_d}</div>
        `;

        if (currentLiveState.show_options) {
            simOptionsBox.classList.remove('blurred');
        } else {
            simOptionsBox.classList.add('blurred');
        }

        if (currentLiveState.reveal_answer) {
            document.querySelectorAll('.sim-option').forEach(opt => {
                if (opt.dataset.option === q.correct_answer) {
                    opt.classList.add('correct');
                } else {
                    opt.classList.add('wrong');
                }
            });
        }
    } else {
        simQText.textContent = 'No active question punched.';
        simImageContainer.style.display = 'none';
        simQAudio.style.display = 'none';
        simOptionsBox.innerHTML = '';
    }
}

function updateLiveQuestionDropdown() {
    const currentActiveLevel = currentLiveState.active_level || 1;
    const filtered = allQuestions.filter(q => q.level == currentActiveLevel);
    
    liveQuestionSelect.innerHTML = '';
    
    if (filtered.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- No questions in this level --';
        liveQuestionSelect.appendChild(opt);
    } else {
        filtered.forEach(q => {
            const opt = document.createElement('option');
            opt.value = q.id;
            opt.textContent = `ID ${q.id}: ${q.question_text ? q.question_text.substring(0, 45) : 'Audio question'}...`;
            if (currentLiveState.current_question_id === q.id) {
                opt.selected = true;
            }
            liveQuestionSelect.appendChild(opt);
        });
    }
}

// Attach Event Listeners
welcomeScreenBtn.addEventListener('click', () => {
    updateLiveState({ active_screen: 'welcome' });
});
quizScreenBtn.addEventListener('click', () => {
    updateLiveState({ active_screen: 'quiz' });
});

[level1Btn, level2Btn, level3Btn].forEach((btn, index) => {
    btn.addEventListener('click', () => {
        const lvl = index + 1;
        updateLiveState({ active_level: lvl }).then(() => {
            updateLiveQuestionDropdown();
        });
    });
});

punchBtn.addEventListener('click', () => {
    const qId = parseInt(liveQuestionSelect.value);
    if (isNaN(qId)) return;
    
    updateLiveState({
        current_question_id: qId,
        active_screen: 'quiz',
        show_question: true,
        show_options: false,
        reveal_answer: false,
        audio_status: 'stopped'
    });
});

punchPrevBtn.addEventListener('click', () => {
    const selectedIdx = liveQuestionSelect.selectedIndex;
    if (selectedIdx > 0) {
        liveQuestionSelect.selectedIndex = selectedIdx - 1;
        punchBtn.click();
    }
});

punchNextBtn.addEventListener('click', () => {
    const selectedIdx = liveQuestionSelect.selectedIndex;
    if (selectedIdx < liveQuestionSelect.options.length - 1) {
        liveQuestionSelect.selectedIndex = selectedIdx + 1;
        punchBtn.click();
    }
});

toggleQuestionView.addEventListener('change', () => {
    updateLiveState({ show_question: toggleQuestionView.checked });
});
toggleOptionsView.addEventListener('change', () => {
    updateLiveState({ show_options: toggleOptionsView.checked });
});

liveRevealBtn.addEventListener('click', () => {
    updateLiveState({ reveal_answer: true });
});

liveAudioPlay.addEventListener('click', () => {
    updateLiveState({ audio_status: 'playing' });
});
liveAudioPause.addEventListener('click', () => {
    updateLiveState({ audio_status: 'paused' });
});
liveAudioStop.addEventListener('click', () => {
    updateLiveState({ audio_status: 'stopped' });
});

// Start the 1-second state synchronization polling
setInterval(pollLiveState, 1000);

// Initial load
loadQuestions();
