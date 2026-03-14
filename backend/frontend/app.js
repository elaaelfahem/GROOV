/**
 * AI Study Group — Frontend Logic
 * Handles Chat, Voice (STT/TTS), and UI Orchestration.
 */

// ── State Management ────────────────────────────────────────────────
const state = {
    sessionId: `session_${Math.random().toString(36).substr(2, 9)}`,
    isListening: false,
    isVoiceEnabled: true,
    isThinking: false,
    history: [],
    pomodoro: {
        timeLeft: 25 * 60,
        isActive: false,
        timer: null
    },
    personas: {
        genius: { name: "The Genius", avatar: "🧠", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400" },
        confused: { name: "The Confused", avatar: "🤔", image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400" },
        skeptic: { name: "The Skeptic", avatar: "🔍", image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400" },
        summarizer: { name: "The Summarizer", avatar: "📝", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400" },
        quiz_master: { name: "Quiz Master", avatar: "🎯", image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400" },
        organizer: { name: "The Organizer", avatar: "📋", image: "https://images.unsplash.com/photo-1554151228-14d9def656e4?w=400" }
    },
    did: {
        peerConnection: null,
        streamId: null,
        sessionId: null,
        statsInterval: null,
        lastVideoState: 'inactive'
    }
};

// ── DOM Elements ────────────────────────────────────────────────────
const elements = {
    messages: document.getElementById('messages'),
    userInput: document.getElementById('userInput'),
    sendBtn: document.getElementById('sendBtn'),
    micBtn: document.getElementById('micBtn'),
    topicInput: document.getElementById('topicInput'),
    modeSelect: document.getElementById('modeSelect'),
    voiceToggle: document.getElementById('voiceToggle'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingText: document.getElementById('loadingText'),
    pomodoroTime: document.getElementById('pomodoroTime'),
    pomodoroBtn: document.getElementById('pomodoroBtn'),
    pomodoroFill: document.getElementById('pomodoroFill'),
    videoGrid: document.getElementById('videoGrid'),
    chatPanel: document.getElementById('chatPanel'),
    toggleChatBtn: document.getElementById('toggleChatBtn'),
    userVideo: document.getElementById('userVideo'),
    tips: document.querySelectorAll('.tip')
};

// ── Initialization ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initEvents();
    initSpeechRecognition();
});

function initEvents() {
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    elements.voiceToggle.addEventListener('click', () => {
        state.isVoiceEnabled = !state.isVoiceEnabled;
        elements.voiceToggle.classList.toggle('active', state.isVoiceEnabled);
    });

    elements.toggleChatBtn.addEventListener('click', () => {
        elements.chatPanel.classList.toggle('hidden');
    });

    elements.pomodoroBtn.addEventListener('click', togglePomodoro);
    
    // Start Camera Mirror
    startUserCamera();

    // Mic Button
    elements.micBtn.addEventListener('mousedown', startListening);
    elements.micBtn.addEventListener('mouseup', stopListening);
    elements.micBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startListening();
    });
    elements.micBtn.addEventListener('touchend', stopListening);
}

// ── Chat Logic ──────────────────────────────────────────────────────
async function sendMessage() {
    const text = elements.userInput.value.trim();
    if (!text || state.isThinking) return;

    elements.userInput.value = '';
    addMessage('you', text);

    state.isThinking = true;
    showLoading(true);

    try {
        const response = await fetch('/session/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: state.sessionId,
                topic: elements.topicInput.value,
                mode: elements.modeSelect.value,
                user_message: text,
                history: formatHistory(),
                course_context: ""
            })
        });

        if (!response.ok) throw new Error('Backend error');

        const data = await response.json();
        showLoading(false);

        // Process persona responses sequentially
        await processResponses(data.responses);

        // Handle mode suggestion
        if (data.suggested_mode) {
            console.log("System suggests changing mode to:", data.suggested_mode);
        }

    } catch (error) {
        console.error("Chat Error:", error);
        addMessage('organizer', "Sorry, I had trouble connecting to the study brain. Is Ollama running?");
        showLoading(false);
    } finally {
        state.isThinking = false;
    }
}

async function processResponses(responses) {
    for (const resp of responses) {
        const personaId = resp.speaker;
        
        // UI: Highlight the specific video cell
        setPersonaState(personaId, 'typing');
        highlightSpeaker(personaId);

        // Add message to chat
        await new Promise(r => setTimeout(r, 600));
        addMessage(personaId, resp.text);

        // D-ID Animation
        if (state.isVoiceEnabled) {
            try {
                await animateAvatar(resp.text, personaId);
            } catch (e) {
                console.warn("D-ID Animation failed", e);
                await playVoice(resp.text, personaId);
            }
        } else {
            await new Promise(r => setTimeout(r, 2000));
        }

        setPersonaState(personaId, 'online');
    }
}

function highlightSpeaker(personaId) {
    // Spotlight the current speaker by making their cell larger (FaceTime style)
    document.querySelectorAll('.video-cell').forEach(cell => {
        cell.classList.remove('spotlight');
    });
    const speakerCell = document.getElementById(`cell-${personaId}`);
    if (speakerCell) speakerCell.classList.add('spotlight');
}

async function startUserCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (elements.userVideo) elements.userVideo.srcObject = stream;
    } catch (e) {
        console.warn("Camera access denied", e);
    }
}

// ── D-ID Streaming Logic ─────────────────────────────────────────────

async function animateAvatar(text, personaId) {
    const persona = state.personas[personaId];
    
    // 1. Connect or re-use stream
    if (!state.did.peerConnection || state.did.peerConnection.connectionState === 'closed') {
        await connectDID(persona.image, personaId);
    }

    // 2. Request Talk (Lip-sync trigger) via backend proxy to avoid CORS
    const talkResponse = await fetch(`/avatar/talk?stream_id=${state.did.streamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            script: {
                type: 'text',
                subtitles: 'false',
                provider: { type: 'microsoft', voice_id: getVoiceId(personaId) },
                input: text
            },
            config: { fluent: true, pad_audio: '0.0' },
            session_id: state.did.sessionId
        })
    });

    if (!talkResponse.ok) {
        const err = await talkResponse.text();
        console.error("D-ID Talk Error:", err);
        throw new Error("D-ID Talk Request Failed");
    }

    // Wait for the video to start playing before proceeding to next persona
    return new Promise((resolve) => {
        const video = document.getElementById(`video-${personaId}`);
        const onEnded = () => {
            video.removeEventListener('ended', onEnded);
            resolve();
        };
        video.addEventListener('ended', onEnded);
        
        // Safety timeout if video doesn't end properly
        setTimeout(resolve, 10000);
    });
}

async function connectDID(imageUrl, personaId) {
    console.log(`Connecting D-ID for ${personaId}...`);
    
    const sessionResponse = await fetch('/avatar/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_url: imageUrl })
    });
    const session = await sessionResponse.json();
    
    const { id: streamId, offer, ice_servers: iceServers, session_id: sessionId } = session;
    state.did.streamId = streamId;
    state.did.sessionId = sessionId;

    // WebRTC Setup
    const peerConnection = new RTCPeerConnection({ iceServers });
    state.did.peerConnection = peerConnection;

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            fetch(`/avatar/ice?stream_id=${streamId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event.candidate.toJSON())
            });
        }
    };

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById(`video-${personaId}`);
        if (event.track.kind === 'video' && remoteVideo) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.classList.remove('hidden');
            state.did.lastVideoState = 'active';
            
            // Hide the static placeholder image
            const cell = document.getElementById(`cell-${personaId}`);
            if (cell) cell.querySelector('.video-placeholder').style.opacity = '0';
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("D-ID Connection State:", peerConnection.connectionState);
    };

    // Set Remote Offer and Create Answer
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send Answer back to D-ID
    await fetch(`/avatar/offer?stream_id=${streamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer })
    });
}

function getVoiceId(personaId) {
    const voices = {
        genius: "en-US-GuyNeural",
        confused: "en-US-JennyNeural",
        skeptic: "en-US-DavisNeural",
        summarizer: "en-US-AriaNeural",
        quiz_master: "en-US-ChristopherNeural",
        organizer: "en-US-SaraNeural"
    };
    return voices[personaId] || "en-US-GuyNeural";
}

function addMessage(speaker, text) {
    const isYou = speaker === 'you';
    const persona = state.personas[speaker] || { name: "Student", avatar: "👤" };

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isYou ? 'you' : ''}`;

    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-avatar">${persona.avatar}</span>
            <span class="message-name">${persona.name}</span>
        </div>
        <div class="message-content">${text}</div>
    `;

    elements.messages.appendChild(messageDiv);
    elements.messages.scrollTop = elements.messages.scrollHeight;

    // Remove welcome message on first activity
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // Track in state-level history for prompt building
    state.history.push(`${persona.name}: ${text}`);
}

function formatHistory() {
    return state.history.join("\n");
}

// ── Voice Logic (STT & TTS) ──────────────────────────────────────────

let recognition;
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn("Speech recognition not supported in this browser.");
        elements.micBtn.style.display = 'none';
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        state.isListening = true;
        elements.micBtn.classList.add('listening');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        elements.userInput.value = transcript;
        sendMessage();
    };

    recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        stopListening();
    };

    recognition.onend = () => {
        state.isListening = false;
        elements.micBtn.classList.remove('listening');
    };
}

function startListening() {
    if (state.isThinking || !recognition) return;
    try {
        recognition.start();
    } catch (e) {
        console.error("Recognition start error:", e);
    }
}

function stopListening() {
    if (recognition) recognition.stop();
}

async function playVoice(text, persona) {
    try {
        const response = await fetch('/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, persona })
        });

        if (!response.ok) return;

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        return new Promise((resolve) => {
            audio.onended = resolve;
            audio.onerror = resolve;
            audio.play().catch(e => {
                console.warn("Audio playback blocked by browser/error:", e);
                resolve();
            });
        });
    } catch (error) {
        console.error("TTS Error:", error);
    }
}

// ── UI Helpers ──────────────────────────────────────────────────────
function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        const phrases = ["Gathers the group...", "Genius is preparing...", "Skeptic is analyzing...", "Checking the facts..."];
        elements.loadingText.innerText = phrases[Math.floor(Math.random() * phrases.length)];
    }
}

function setPersonaState(personaId, status) {
    const cell = document.getElementById(`cell-${personaId}`);
    if (!cell) return;

    if (status === 'typing') cell.classList.add('typing');
    else cell.classList.remove('typing');
}

// ── Pomodoro Logic ──────────────────────────────────────────────────
function togglePomodoro() {
    if (state.pomodoro.isActive) {
        clearInterval(state.pomodoro.timer);
        state.pomodoro.isActive = false;
        elements.pomodoroBtn.innerText = '▶';
    } else {
        state.pomodoro.isActive = true;
        elements.pomodoroBtn.innerText = '⏸';
        state.pomodoro.timer = setInterval(updatePomodoro, 1000);
    }
}

function updatePomodoro() {
    state.pomodoro.timeLeft--;

    if (state.pomodoro.timeLeft <= 0) {
        clearInterval(state.pomodoro.timer);
        state.pomodoro.isActive = false;
        state.pomodoro.timeLeft = 25 * 60;
        elements.pomodoroBtn.innerText = '▶';
        notifyPomodoroEnd();
    }

    const minutes = Math.floor(state.pomodoro.timeLeft / 60);
    const seconds = state.pomodoro.timeLeft % 60;
    elements.pomodoroTime.innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const progress = (state.pomodoro.timeLeft / (25 * 60)) * 100;
    elements.pomodoroFill.style.strokeDasharray = `${progress}, 100`;
}

function notifyPomodoroEnd() {
    addMessage('organizer', "Time's up! Great focus. Let's take a 5-minute break. Stand up, stretch, and get some water. 🥤");

    if (state.isVoiceEnabled) {
        playVoice("Time's up! Great focus. Let's take a five minute break.", "organizer");
    }
}
