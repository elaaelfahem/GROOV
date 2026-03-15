// ── Groov — Lobby / Upload Logic ──

// Auth guard: must be logged in to access lobby
const token = localStorage.getItem('sg_token');
if (!token) {
    window.location.href = '/auth.html';
}

// Show username
const user = JSON.parse(localStorage.getItem('sg_user') || '{}');
const nameEl = document.getElementById('userName');
if (nameEl && user.username) {
    nameEl.textContent = user.username;
}

// ── State ──
let sessionId = `session_${Math.random().toString(36).substr(2, 9)}`;
let uploadComplete = false;
let detectedTopic = '';

// ── Elements ──
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const indexingPanel = document.getElementById('indexingPanel');
const indexFilename = document.getElementById('indexFilename');
const progressFill = document.getElementById('progressFill');
const indexStatus = document.getElementById('indexStatus');
const uploadedBadge = document.getElementById('uploadedBadge');
const uploadedName = document.getElementById('uploadedName');
const enterBtn = document.getElementById('enterBtn');
const lobbyTopic = document.getElementById('lobbyTopic');
const lobbyMode = document.getElementById('lobbyMode');

// Step dots
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

// ── Drag & Drop ──
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});
uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
});

// Click-to-upload
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleUpload(file);
});

// ── Upload Handler ──
async function handleUpload(file) {
    // Show indexing panel, hide upload zone
    uploadZone.style.display = 'none';
    indexingPanel.classList.add('active');
    indexFilename.textContent = `📄 ${file.name}`;
    indexStatus.textContent = 'Uploading...';
    progressFill.style.width = '10%';

    // Update steps
    step1.classList.remove('active');
    step1.classList.add('done');
    step2.classList.add('active');

    try {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('file', file);

        const res = await fetch('/session/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        const data = await res.json();
        progressFill.style.width = '30%';

        if (data.success) {
            indexStatus.textContent = 'Building AI embeddings — this may take a moment...';
            pollIndexing(file.name);
        } else {
            indexStatus.textContent = `❌ ${data.error || 'Upload failed'}`;
            progressFill.style.width = '0%';
        }
    } catch (e) {
        indexStatus.textContent = '❌ Upload failed — check your connection';
        progressFill.style.width = '0%';
        console.error('Upload error:', e);
    }
}

// ── Poll for indexing completion ──
function pollIndexing(filename) {
    let progress = 30;

    const poll = setInterval(async () => {
        try {
            const res = await fetch(`/session/upload-status?session_id=${sessionId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const info = await res.json();

            if (info.status === 'ready') {
                clearInterval(poll);
                progressFill.style.width = '100%';
                indexStatus.textContent = '✅ Indexing complete!';

                // Auto-fill topic if detected
                if (info.detected_topic) {
                    detectedTopic = info.detected_topic;
                    lobbyTopic.value = detectedTopic;
                }

                setTimeout(() => {
                    indexingPanel.classList.remove('active');
                    uploadedBadge.classList.add('active');
                    uploadedName.textContent = `${filename} — indexed and ready!`;
                    uploadComplete = true;

                    // Update steps
                    step2.classList.remove('active');
                    step2.classList.add('done');
                    step3.classList.add('active');
                }, 800);

            } else if (info.status === 'error') {
                clearInterval(poll);
                progressFill.style.width = '100%';
                progressFill.style.background = '#ef4444';
                indexStatus.textContent = `❌ Indexing failed: ${info.error || 'Unknown error'}`;

            } else {
                // Still processing — animate progress
                progress = Math.min(progress + 3, 90);
                progressFill.style.width = `${progress}%`;

                const messages = [
                    'Extracting text from pages...',
                    'Breaking into study chunks...',
                    'Building AI embeddings...',
                    'Almost there — crunching vectors...',
                ];
                indexStatus.textContent = messages[Math.floor((progress - 30) / 15)] || messages[3];
            }
        } catch (e) {
            // Network error, keep trying
        }
    }, 2000);
}

// ── Enter Study Room ──
function enterStudyRoom() {
    const topic = lobbyTopic.value.trim();
    const mode = lobbyMode.value;

    // Save to localStorage so study room can read it
    localStorage.setItem('sg_session_id', sessionId);
    if (topic) localStorage.setItem('sg_topic', topic);
    if (mode) localStorage.setItem('sg_mode', mode);
    localStorage.setItem('sg_has_pdf', uploadComplete ? 'true' : 'false');

    // Navigate to study room
    window.location.href = '/';
}
