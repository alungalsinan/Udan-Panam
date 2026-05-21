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
const qOptA = document.getElementById('q-opt-a');
const qOptB = document.getElementById('q-opt-b');
const qOptC = document.getElementById('q-opt-c');
const qOptD = document.getElementById('q-opt-d');
const qAns = document.getElementById('q-ans');

// Fetch and display questions
async function loadQuestions() {
    try {
        const res = await fetch('/api/questions');
        const questions = await res.json();
        
        tbody.innerHTML = '';
        questions.forEach(q => {
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
    } catch (err) {
        console.error('Failed to load questions', err);
    }
}

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

// Initial load
loadQuestions();
