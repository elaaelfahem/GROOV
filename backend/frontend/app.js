/**
 * AI Study Group — Virtual Room Engine
 * Realistic animated avatars with movement, speech, reactions & emotions.
 */

// ── Auth Guard — redirect to login if no token ──
(function authGuard() {
    const token = localStorage.getItem('sg_token');
    if (!token) {
        window.location.href = '/auth.html';
        return;
    }
    // Verify token is still valid
    fetch('/auth/me', { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => { if (!r.ok) throw new Error(); })
        .catch(() => {
            localStorage.removeItem('sg_token');
            localStorage.removeItem('sg_user');
            window.location.href = '/auth.html';
        });
})();

function logout() {
    localStorage.removeItem('sg_token');
    localStorage.removeItem('sg_user');
    localStorage.removeItem('sg_session_id');
    localStorage.removeItem('sg_topic');
    localStorage.removeItem('sg_mode');
    localStorage.removeItem('sg_has_pdf');
    window.location.href = '/auth.html';
}

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const SEAT_POSITIONS = {
    you:         { x: 50, y: 82 },
    summarizer:  { x: 20, y: 72 },
    quiz_master: { x: 80, y: 72 },
    genius:      { x: 10, y: 44 },
    organizer:   { x: 90, y: 44 },
    confused:    { x: 25, y: 16 },
    skeptic:     { x: 75, y: 16 },
};

const PRESENTING_POS = { x: 45, y: 16 };
const CENTER_POS     = { x: 45, y: 48 };

const PERSONA_CONFIG = {
    genius:      { name: "Julian",    emoji: "🧠", color: "#4a9eff", voice: "calm",     idleSpeed: 3.2 },
    confused:    { name: "Chloe",   emoji: "🤔", color: "#ff9f43", voice: "nervous",  idleSpeed: 2.4 },
    skeptic:     { name: "Marcus",   emoji: "🔍", color: "#ff4757", voice: "sharp",    idleSpeed: 3.8 },
    summarizer:  { name: "Sarah", emoji: "📝", color: "#2ed573", voice: "steady",   idleSpeed: 3.5 },
    quiz_master: { name: "Leo",  emoji: "🎯", color: "#a855f7", voice: "energetic",idleSpeed: 2.6 },
    organizer:   { name: "Maya",   emoji: "📋", color: "#06b6d4", voice: "composed", idleSpeed: 3.0 },
};

const REACTIONS = [
    { type: 'nod',      emoji: '👍', css: 'react-nod',      dur: 800  },
    { type: 'think',    emoji: '🤔', css: 'react-think',    dur: 1400 },
    { type: 'surprise', emoji: '😮', css: 'react-surprise', dur: 900  },
    { type: 'agree',    emoji: '✅', css: 'react-nod',      dur: 800  },
    { type: 'question', emoji: '❓', css: 'react-think',    dur: 1200 },
    { type: 'shake',    emoji: '🤨', css: 'react-shake',    dur: 700  },
];

// Persona-specific reaction weights (which reactions each persona tends to do)
const REACTION_WEIGHTS = {
    genius:      ['nod', 'agree', 'think'],
    confused:    ['question', 'surprise', 'think'],
    skeptic:     ['shake', 'think', 'question'],
    summarizer:  ['nod', 'agree', 'nod'],
    quiz_master: ['surprise', 'nod', 'agree'],
    organizer:   ['nod', 'agree', 'nod'],
};

// ═══════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════

const state = {
    sessionId: localStorage.getItem('sg_session_id') || `session_${Math.random().toString(36).substr(2, 9)}`,
    isVoiceEnabled: true,
    isThinking: false,
    isListening: false,
    history: [],
    characters: {},
    audioCtx: null,
    pomodoro: { timeLeft: 25 * 60, isActive: false, timer: null },
    // ── Advanced Features ──
    userEmotion: 'neutral',
    waitingForFeynman: false,
    mastery: 0,
    questionsAnswered: 0,
    pdfContext: localStorage.getItem('sg_has_pdf') === 'true',
    streak: 0,
};

// ═══════════════════════════════════════════════════════════════
//  DOM REFERENCES
// ═══════════════════════════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const el = {
    messages:       $('#messages'),
    userInput:      $('#userInput'),
    sendBtn:        $('#sendBtn'),
    micBtn:         $('#micBtn'),
    topicInput:     $('#topicInput'),
    modeSelect:     $('#modeSelect'),
    voiceToggle:    $('#voiceToggle'),
    loadingOverlay: $('#loadingOverlay'),
    loadingText:    $('#loadingText'),
    pomodoroTime:   $('#pomodoroTime'),
    pomodoroBtn:    $('#pomodoroBtn'),
    pomodoroFill:   $('#pomodoroFill'),
    chatPanel:      $('#chatPanel'),
    toggleChatBtn:  $('#toggleChatBtn'),
    userVideo:      $('#userVideo'),
    themeToggle:    $('#themeToggle'),
    tableTopic:     $('#tableTopic'),
    ambientLayer:   $('#ambientLayer'),
    virtualRoom:    $('#virtualRoom'),
    // ── Advanced Feature Elements ──
    fileInput:      $('#fileInput'),
    fileStatus:     $('#fileStatus'),
    feynmanCard:    $('#feynmanCard'),
    feynmanBody:    $('#feynmanBody'),
    endModal:       $('#endModal'),
    modalScore:     $('#modalScore'),
    modalFeedback:  $('#modalFeedback'),
    modalStats:     $('#modalStats'),
    hintFeynman:    $('#hintFeynman'),
    hintQuiz:       $('#hintQuiz'),
    hintSummary:    $('#hintSummary'),
};

// ═══════════════════════════════════════════════════════════════
//  CHARACTER CLASS — core of the realistic animation system
// ═══════════════════════════════════════════════════════════════

class Character {
    constructor(id) {
        this.id = id;
        this.config = PERSONA_CONFIG[id];
        this.seat = { ...SEAT_POSITIONS[id] };
        this.pos = { ...this.seat };
        this.state = 'idle'; // idle | speaking | listening | moving | reacting
        this.emotion = 'neutral';

        // DOM
        this.el = $(`#char-${id}`);
        this.bodyEl = this.el.querySelector('.char-body');
        this.imgEl = this.el.querySelector('.char-img');
        this.glowEl = this.el.querySelector('.char-glow');
        this.speechEl = $(`#speech-${id}`);
        this.speechText = this.speechEl.querySelector('.speech-text');
        this.reactionEl = $(`#reaction-${id}`);
        this.plateEl = this.el.querySelector('.char-plate');

        // Timers
        this._reactionTimer = null;
        this._speechTimer = null;
        this._idleVariationTimer = null;
        this._breathPhase = Math.random() * Math.PI * 2; // offset breathing

        // Audio-reactive state
        this._analyser = null;
        this._audioData = null;
        this._animFrame = null;
    }

    // ── Movement ─────────────────────────────────────────────
    async moveTo(target, opts = {}) {
        const speed = opts.speed || 1.4;
        const dx = Math.abs(target.x - this.pos.x);
        const dy = Math.abs(target.y - this.pos.y);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dur = Math.max(0.5, (dist / 40) * speed);

        // Look in movement direction
        const direction = target.x > this.pos.x ? 1 : -1;
        this.bodyEl.style.transform = `scaleX(${direction})`;

        this.setState('moving');
        this.el.style.transition = `left ${dur}s cubic-bezier(0.34, 1.56, 0.64, 1), top ${dur}s cubic-bezier(0.34, 1.56, 0.64, 1)`;
        this.el.style.left = target.x + '%';
        this.el.style.top = target.y + '%';
        this.pos = { ...target };

        await sleep(dur * 1000);
        // Reset facing after arrival
        this.bodyEl.style.transform = '';
        if (this.state === 'moving') this.setState('idle');
    }

    returnToSeat() {
        return this.moveTo(this.seat, { speed: 1.2 });
    }

    // ── State Management ─────────────────────────────────────
    setState(newState) {
        // Remove old state classes
        this.el.classList.remove('speaking', 'listening', 'moving',
            'react-nod', 'react-think', 'react-surprise', 'react-shake');
        this.state = newState;

        if (newState === 'speaking') {
            this.el.classList.add('speaking');
        } else if (newState === 'listening') {
            this.el.classList.add('listening');
            // Vary lean direction based on speaker position
            this.el.style.setProperty('--lean-dir', Math.random() > 0.5 ? '4deg' : '-4deg');
        } else if (newState === 'moving') {
            this.el.classList.add('moving');
        }
    }

    // ── Speaking with audio-reactive animation ───────────────
    async speak(text, audioUrl) {
        this.setState('speaking');
        this.showSpeech(text);

        if (audioUrl) {
            await this._playWithLipSync(audioUrl);
        } else {
            // Simulate speaking duration based on text length
            const wordsPerSec = 2.5;
            const words = text.split(/\s+/).length;
            const dur = Math.max(2000, (words / wordsPerSec) * 1000);
            await sleep(dur);
        }

        this.hideSpeech();
        this.setState('idle');
    }

    // Audio-reactive "lip sync" — analyzes audio frequencies in real time
    // and pulses the avatar border/scale to match mouth movement
    async _playWithLipSync(audioUrl) {
        return new Promise(async (resolve) => {
            try {
                if (!state.audioCtx) {
                    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
                const ctx = state.audioCtx;

                const resp = await fetch(audioUrl);
                const arrayBuf = await resp.arrayBuffer();
                const audioBuf = await ctx.decodeAudioData(arrayBuf);

                const source = ctx.createBufferSource();
                source.buffer = audioBuf;

                // Create analyser for real-time frequency data
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.7;
                const dataArr = new Uint8Array(analyser.frequencyBinCount);

                source.connect(analyser);
                analyser.connect(ctx.destination);

                this._analyser = analyser;
                this._audioData = dataArr;

                // Start real-time animation loop
                const animate = () => {
                    if (!this._analyser) return;
                    analyser.getByteFrequencyData(dataArr);

                    // Focus on voice frequencies (300-3000 Hz range ~ bins 2-24 for 256 FFT at 44.1kHz)
                    let sum = 0;
                    const voiceBins = Math.min(24, dataArr.length);
                    for (let i = 2; i < voiceBins; i++) sum += dataArr[i];
                    const avg = sum / (voiceBins - 2);
                    const intensity = Math.min(1, avg / 140); // 0..1

                    // Apply to avatar — scale pulse + border glow + breathing offset
                    const scale = 1 + intensity * 0.08;
                    const brightness = 1 + intensity * 0.25;
                    const glowOpacity = 0.3 + intensity * 0.5;
                    const borderWidth = 3 + intensity * 3;

                    this.imgEl.style.transform = `scale(${scale})`;
                    this.imgEl.style.filter = `brightness(${brightness})`;
                    this.glowEl.style.opacity = glowOpacity;
                    this.imgEl.style.borderWidth = `${borderWidth}px`;

                    // Subtle body sway synced to audio energy
                    const sway = Math.sin(Date.now() * 0.003) * intensity * 3;
                    this.bodyEl.style.transform = `rotate(${sway}deg) translateY(${-intensity * 4}px)`;

                    this._animFrame = requestAnimationFrame(animate);
                };
                this._animFrame = requestAnimationFrame(animate);

                source.onended = () => {
                    cancelAnimationFrame(this._animFrame);
                    this._analyser = null;
                    this._audioData = null;
                    // Reset visuals smoothly
                    this.imgEl.style.transition = 'all 0.4s ease';
                    this.imgEl.style.transform = '';
                    this.imgEl.style.filter = '';
                    this.imgEl.style.borderWidth = '';
                    this.glowEl.style.opacity = '';
                    this.bodyEl.style.transform = '';
                    setTimeout(() => { this.imgEl.style.transition = ''; }, 500);
                    resolve();
                };

                source.start(0);
            } catch (e) {
                console.warn('LipSync playback failed, using fallback:', e);
                // Fallback: play normally
                const audio = new Audio(audioUrl);
                audio.onended = resolve;
                audio.onerror = resolve;
                audio.play().catch(() => resolve());
            }
        });
    }

    // ── Reactions ─────────────────────────────────────────────
    react(reactionType) {
        const r = REACTIONS.find(rx => rx.type === reactionType) || REACTIONS[0];

        // Show emoji bubble
        this.reactionEl.textContent = r.emoji;
        this.reactionEl.classList.remove('show', 'hide');
        void this.reactionEl.offsetWidth; // force reflow
        this.reactionEl.classList.add('show');

        // CSS animation class
        this.el.classList.add(r.css);

        clearTimeout(this._reactionTimer);
        this._reactionTimer = setTimeout(() => {
            this.reactionEl.classList.remove('show');
            this.reactionEl.classList.add('hide');
            this.el.classList.remove(r.css);
            setTimeout(() => this.reactionEl.classList.remove('hide'), 400);
        }, r.dur + 300);
    }

    // Personality-based random reaction
    reactRandom() {
        const pool = REACTION_WEIGHTS[this.id] || ['nod'];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        this.react(pick);
    }

    // ── Look At (subtle lean toward a target) ────────────────
    lookAt(targetId) {
        const target = state.characters[targetId];
        if (!target) return;
        const dx = target.pos.x - this.pos.x;
        const lean = Math.max(-6, Math.min(6, dx * 0.15));
        this.bodyEl.style.transition = 'transform 0.8s ease';
        this.bodyEl.style.transform = `rotate(${lean}deg)`;
    }

    resetLook() {
        this.bodyEl.style.transition = 'transform 0.6s ease';
        this.bodyEl.style.transform = '';
    }

    // ── Speech Bubbles ───────────────────────────────────────
    showSpeech(text) {
        const maxLen = 120;
        const display = text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
        this.speechText.textContent = display;
        this.speechEl.classList.remove('hide');
        this.speechEl.classList.add('show');
    }

    hideSpeech() {
        this.speechEl.classList.remove('show');
        this.speechEl.classList.add('hide');
        clearTimeout(this._speechTimer);
        this._speechTimer = setTimeout(() => {
            this.speechEl.classList.remove('hide');
        }, 400);
    }

    // ── Idle Micro-animations (natural breathing variation) ──
    startIdleVariation() {
        const vary = () => {
            if (this.state !== 'idle' && this.state !== 'listening') return;
            // Random micro-movement: tiny position jitter
            const jx = (Math.random() - 0.5) * 0.3;
            const jy = (Math.random() - 0.5) * 0.2;
            this.bodyEl.style.transition = 'transform 2s ease-in-out';
            this.bodyEl.style.transform = `translate(${jx}px, ${jy}px) rotate(${(Math.random()-0.5)*1.5}deg)`;

            // Occasional "blink" via brightness flicker
            if (Math.random() < 0.15) {
                this.imgEl.style.transition = 'filter 0.12s ease';
                this.imgEl.style.filter = 'brightness(0.85)';
                setTimeout(() => {
                    this.imgEl.style.filter = '';
                    setTimeout(() => { this.imgEl.style.transition = ''; }, 200);
                }, 120);
            }

            const next = 2000 + Math.random() * 4000;
            this._idleVariationTimer = setTimeout(vary, next);
        };
        vary();
    }

    stopIdleVariation() {
        clearTimeout(this._idleVariationTimer);
    }

    // ── Entrance Animation ───────────────────────────────────
    async enter(delay) {
        this.el.classList.add('joining');
        await sleep(delay);
        this.el.classList.remove('joining');
        this.el.classList.add('joined');
        await sleep(600);
    }
}

// ═══════════════════════════════════════════════════════════════
//  INTERACTION MANAGER — orchestrates multi-character reactions
// ═══════════════════════════════════════════════════════════════

const Interactions = {
    // When a persona starts speaking
    async onSpeakStart(speakerId) {
        const speaker = state.characters[speakerId];
        if (!speaker) return;

        // Move speaker toward presenting area (between seat and whiteboard)
        const presentX = (speaker.seat.x + PRESENTING_POS.x) / 2;
        const presentY = (speaker.seat.y + PRESENTING_POS.y) / 2;
        speaker.moveTo({ x: presentX, y: presentY }, { speed: 1.0 });

        // All others: enter listening mode, look at speaker, react organically
        for (const [id, char] of Object.entries(state.characters)) {
            if (id === speakerId) continue;
            char.setState('listening');
            char.lookAt(speakerId);

            // Staggered reactions — personality-based delay
            const baseDelay = 800 + Math.random() * 2500;
            setTimeout(() => {
                if (char.state === 'listening') {
                    char.reactRandom();
                }
            }, baseDelay);

            // Second wave reaction for some characters
            if (Math.random() < 0.35) {
                setTimeout(() => {
                    if (char.state === 'listening') {
                        char.reactRandom();
                    }
                }, baseDelay + 2000 + Math.random() * 2000);
            }
        }
    },

    // When a persona finishes speaking
    async onSpeakEnd(speakerId) {
        const speaker = state.characters[speakerId];
        if (!speaker) return;

        // Return speaker to seat
        speaker.returnToSeat();

        // Others return to idle with staggered timing
        for (const [id, char] of Object.entries(state.characters)) {
            if (id === speakerId) continue;
            const delay = 200 + Math.random() * 600;
            setTimeout(() => {
                char.resetLook();
                char.setState('idle');
            }, delay);
        }
    },

    // Map evaluation results to emotional reactions
    applyEvaluation(evaluation) {
        const { message_type, quality } = evaluation;

        for (const [id, char] of Object.entries(state.characters)) {
            let reaction = null;

            if (message_type === 'confusion') {
                if (id === 'genius') reaction = 'think';
                else if (id === 'confused') reaction = 'agree';
                else if (id === 'skeptic') reaction = 'question';
                else reaction = 'nod';
            } else if (message_type === 'explanation' && quality === 'strong') {
                reaction = Math.random() < 0.5 ? 'nod' : 'agree';
            } else if (message_type === 'quiz_answer' && quality === 'weak') {
                if (id === 'skeptic') reaction = 'shake';
                else reaction = 'think';
            }

            if (reaction) {
                const delay = 300 + Math.random() * 800;
                setTimeout(() => char.react(reaction), delay);
            }
        }
    },
};

// ═══════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    initCharacters();
    initAmbientParticles();
    initEvents();
    initSpeechRecognition();
    startUserCamera();
    animateRoomEntrance();
    syncTableTopic();
});

function initCharacters() {
    for (const id of Object.keys(PERSONA_CONFIG)) {
        state.characters[id] = new Character(id);
    }
}

async function animateRoomEntrance() {
    const order = ['genius', 'confused', 'skeptic', 'summarizer', 'quiz_master', 'organizer'];
    for (let i = 0; i < order.length; i++) {
        const char = state.characters[order[i]];
        await char.enter(i === 0 ? 400 : 300);
        addSystemMessage(`${char.config.emoji} ${char.config.name} joined the room`);
        char.startIdleVariation();
    }
}

function syncTableTopic() {
    el.topicInput.addEventListener('input', () => {
        el.tableTopic.textContent = el.topicInput.value || 'Study Topic';
    });
}

function initAmbientParticles() {
    const colors = ['rgba(74,158,255,0.4)', 'rgba(168,85,247,0.3)', 'rgba(0,210,211,0.3)',
                    'rgba(46,213,115,0.25)', 'rgba(255,159,67,0.2)'];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.setProperty('--size', `${2 + Math.random() * 5}px`);
        p.style.setProperty('--color', colors[Math.floor(Math.random() * colors.length)]);
        p.style.setProperty('--dur', `${8 + Math.random() * 15}s`);
        p.style.setProperty('--delay', `${Math.random() * 10}s`);
        p.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
        p.style.left = Math.random() * 100 + '%';
        p.style.bottom = '-10px';
        el.ambientLayer.appendChild(p);
    }
}

function initEvents() {


    el.sendBtn.addEventListener('click', sendMessage);
    el.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    el.voiceToggle.addEventListener('click', () => {
        state.isVoiceEnabled = !state.isVoiceEnabled;
        el.voiceToggle.classList.toggle('active', state.isVoiceEnabled);
    });
    
    // Theme Toggle
    if (el.themeToggle) {
        el.themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            el.themeToggle.querySelector('.theme-icon').textContent = isLight ? '☀️' : '🌙';
        });
    }

    el.toggleChatBtn.addEventListener('click', () => {
        el.chatPanel.classList.toggle('hidden');
    });
    el.pomodoroBtn.addEventListener('click', togglePomodoro);

    // Mic button — hold to speak
    el.micBtn.addEventListener('mousedown', startListening);
    el.micBtn.addEventListener('mouseup', stopListening);
    el.micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startListening(); });
    el.micBtn.addEventListener('touchend', stopListening);

    // ── PDF Upload ──
    if (el.fileInput) {
        el.fileInput.addEventListener('change', handleFileUpload);
    }

    // ── Quick Action Hints ──
    if (el.hintFeynman) {
        el.hintFeynman.addEventListener('click', triggerFeynman);
    }
    if (el.hintQuiz) {
        el.hintQuiz.addEventListener('click', () => {
            el.userInput.value = '🎯 Quiz me on this topic';
            sendMessage();
        });
    }
    if (el.hintSummary) {
        el.hintSummary.addEventListener('click', () => {
            el.userInput.value = '📋 Summarize what we covered so far';
            sendMessage();
        });
    }

    // ── End Session Button ──
    const endBtn = document.querySelector('.end-btn');
    if (endBtn) {
        endBtn.addEventListener('click', endSession);
    }
}

// ═══════════════════════════════════════════════════════════════
//  CHAT LOGIC
// ═══════════════════════════════════════════════════════════════

async function sendMessage() {
    const text = el.userInput.value.trim();
    if (!text || state.isThinking) return;

    el.userInput.value = '';
    addMessage('you', text);
    state.isThinking = true;
    showLoading(true);

    try {
        const token = localStorage.getItem('sg_token') || '';
        const response = await fetch('/session/respond', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                session_id: state.sessionId,
                topic: el.topicInput.value,
                mode: el.modeSelect.value,
                user_message: text,
                history: formatHistory(),
                course_context: "",
                user_emotion: state.userEmotion,
            })
        });

        if (!response.ok) throw new Error('Backend error');
        const data = await response.json();
        showLoading(false);
        state.questionsAnswered++;

        // ── Sentiment Analysis — show emotion badge ──
        updateEmotionBadge(data);

        // Apply evaluation-based emotional reactions
        if (data.evaluation) {
            Interactions.applyEvaluation(data.evaluation);
        }

        // Process persona responses with full room interactions
        await processResponses(data.responses);

        // Update stats bar
        updateStats();

        // ── Struggle Detection — auto-switch mode ──
        if (data.suggested_mode) {
            if (data.suggested_mode === 'deep_understanding' && el.modeSelect.value !== 'deep_understanding') {
                showStruggleAlert(data.suggested_mode);
            } else {
                addSystemMessage(`💡 Suggestion: switch to ${data.suggested_mode.replace('_', ' ')} mode`);
            }
            el.modeSelect.value = data.suggested_mode;
        }

    } catch (error) {
        console.error("Chat Error:", error);
        addMessage('organizer', "Sorry, I had trouble connecting to the study brain. Is Ollama running?");
        showLoading(false);
    } finally {
        state.isThinking = false;
    }
}

// ── Emotion Badge UI ──
const EMOTION_EMOJIS = {
    happy: '😊', confident: '💪', confused: '😕', sad: '😢',
    stressed: '😰', frustrated: '😤', tired: '😴', neutral: '😐'
};

function updateEmotionBadge(data) {
    const badge = document.getElementById('emotionBadge');
    if (!badge) return;

    // Read emotion from backend's sentiment analysis
    const emotion = (data && data.detected_emotion) ? data.detected_emotion.toLowerCase() : state.userEmotion;
    const emoji = EMOTION_EMOJIS[emotion] || '😐';

    // Must preserve both base classes
    badge.className = 'emotion-badge emotion-badge-avatar';
    
    if (emotion && emotion !== 'neutral') {
        badge.textContent = `${emoji} ${emotion}`;
        badge.classList.add(emotion, 'visible');
    } else {
        badge.textContent = `${emoji} neutral`;
        badge.classList.add('neutral', 'visible');
    }
}

// ── Stats Bar Updates ──
function updateStats() {
    const masteryEl = document.getElementById('statMastery');
    const scoreEl = document.getElementById('statScore');
    const streakEl = document.getElementById('statStreak');

    if (masteryEl) {
        masteryEl.textContent = `${state.mastery}%`;
        masteryEl.classList.add('updated');
        setTimeout(() => masteryEl.classList.remove('updated'), 500);
    }
    if (scoreEl) {
        scoreEl.textContent = `${state.questionsAnswered}`;
        scoreEl.classList.add('updated');
        setTimeout(() => scoreEl.classList.remove('updated'), 500);
    }
    if (streakEl) {
        streakEl.textContent = `${state.streak}`;
        streakEl.classList.add('updated');
        setTimeout(() => streakEl.classList.remove('updated'), 500);
    }
}

function showStruggleAlert(newMode) {
    const alert = document.getElementById('struggleAlert');
    if (alert) {
        alert.style.display = 'flex';
        addSystemMessage(`⚠️ The study group noticed you're struggling — automatically switching to **Deep Understanding** mode. We'll slow down and use more examples.`);
        setTimeout(() => { alert.style.display = 'none'; }, 8000);
    }
}

async function processResponses(responses) {
    for (const resp of responses) {
        const personaId = resp.speaker;
        const char = state.characters[personaId];
        if (!char) continue;

        // 1. Signal that this character is about to speak — others react
        await Interactions.onSpeakStart(personaId);
        await sleep(500); // Let movement settle

        // 2. Add message to chat
        addMessage(personaId, resp.text);

        // 3. Character speaks with audio-reactive animation
        if (state.isVoiceEnabled) {
            try {
                const audioUrl = await fetchTTSAudio(resp.text, personaId);
                char.showSpeech(resp.text);
                char.setState('speaking');
                await char._playWithLipSync(audioUrl);
                char.hideSpeech();
            } catch (e) {
                console.warn('Voice failed, text-only mode:', e);
                char.showSpeech(resp.text);
                char.setState('speaking');
                await simulateSpeaking(resp.text);
                char.hideSpeech();
            }
        } else {
            char.showSpeech(resp.text);
            char.setState('speaking');
            await simulateSpeaking(resp.text);
            char.hideSpeech();
        }

        // 4. Speaking done — interactions end
        char.setState('idle');
        await Interactions.onSpeakEnd(personaId);
        await sleep(400); // Pause between speakers
    }
}

async function fetchTTSAudio(text, persona) {
    const response = await fetch('/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, persona })
    });
    if (!response.ok && response.status !== 204) throw new Error('TTS failed');
    if (response.status === 204) throw new Error('TTS unavailable');
    const blob = await response.blob();
    if (blob.size < 100) throw new Error('TTS returned empty audio');
    return URL.createObjectURL(blob);
}

async function simulateSpeaking(text) {
    // Simulate natural reading pace: ~150 words per minute
    const words = text.split(/\s+/).length;
    const dur = Math.max(1500, (words / 2.5) * 1000);
    await sleep(dur);
}

// ═══════════════════════════════════════════════════════════════
//  MESSAGES
// ═══════════════════════════════════════════════════════════════

function addMessage(speaker, text) {
    const isYou = speaker === 'you';
    const config = PERSONA_CONFIG[speaker] || { name: "Student", emoji: "👤" };

    const div = document.createElement('div');
    div.className = `message ${isYou ? 'you' : ''}`;
    div.innerHTML = `
        <div class="message-header">
            <span class="message-avatar">${isYou ? '👤' : config.emoji}</span>
            <span class="message-name">${isYou ? 'You' : config.name}</span>
        </div>
        <div class="message-content">${escapeHtml(text)}</div>
    `;

    el.messages.appendChild(div);
    el.messages.scrollTop = el.messages.scrollHeight;

    // Remove welcome
    const welcome = el.messages.querySelector('.join-msg:first-child');
    // Keep join messages but scroll down

    state.history.push(`${isYou ? 'Student' : config.name}: ${text}`);
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    el.messages.appendChild(div);
    el.messages.scrollTop = el.messages.scrollHeight;
}

function formatHistory() {
    return state.history.slice(-20).join("\n"); // Last 20 messages
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
//  VOICE / SPEECH RECOGNITION
// ═══════════════════════════════════════════════════════════════

let recognition;

function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn("Speech recognition not supported.");
        el.micBtn.style.display = 'none';
        return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
        state.isListening = true;
        el.micBtn.classList.add('listening');
    };
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        el.userInput.value = transcript;
        sendMessage();
    };
    recognition.onerror = (e) => {
        console.error("STT Error:", e.error);
        stopListening();
    };
    recognition.onend = () => {
        state.isListening = false;
        el.micBtn.classList.remove('listening');
    };
}

function startListening() {
    if (state.isThinking || !recognition) return;
    try { recognition.start(); } catch (e) { console.error(e); }
}

function stopListening() {
    if (recognition) recognition.stop();
}

// ═══════════════════════════════════════════════════════════════
//  USER CAMERA
// ═══════════════════════════════════════════════════════════════

async function startUserCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        el.userVideo.srcObject = stream;
        // Hide the fallback placeholder when camera is active
        const placeholder = document.querySelector('#selfCamCircle .self-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    } catch (e) {
        console.warn("Camera access denied:", e);
    }
}

// ═══════════════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════════════

function showLoading(show) {
    el.loadingOverlay.style.display = show ? 'flex' : 'none';
    if (show) {
        const phrases = [
            "Study group is gathering thoughts...",
            "The Genius is pondering...",
            "The Skeptic is raising an eyebrow...",
            "Consulting the textbooks...",
            "Organizing the discussion...",
        ];
        el.loadingText.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    }
}

// ═══════════════════════════════════════════════════════════════
//  POMODORO
// ═══════════════════════════════════════════════════════════════

function togglePomodoro() {
    if (state.pomodoro.isActive) {
        clearInterval(state.pomodoro.timer);
        state.pomodoro.isActive = false;
        el.pomodoroBtn.textContent = '▶';
    } else {
        state.pomodoro.isActive = true;
        el.pomodoroBtn.textContent = '⏸';
        state.pomodoro.timer = setInterval(updatePomodoro, 1000);
    }
}

function updatePomodoro() {
    state.pomodoro.timeLeft--;
    if (state.pomodoro.timeLeft <= 0) {
        clearInterval(state.pomodoro.timer);
        state.pomodoro.isActive = false;
        state.pomodoro.timeLeft = 25 * 60;
        el.pomodoroBtn.textContent = '▶';
        notifyPomodoroEnd();
    }
    const m = Math.floor(state.pomodoro.timeLeft / 60);
    const s = state.pomodoro.timeLeft % 60;
    el.pomodoroTime.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    const progress = (state.pomodoro.timeLeft / (25 * 60)) * 100;
    el.pomodoroFill.style.strokeDasharray = `${progress}, 100`;
}

function notifyPomodoroEnd() {
    const text = "Time's up! Great focus session. Let's take a 5-minute break. Stand up, stretch, get some water! 🥤";
    addMessage('organizer', text);
    const char = state.characters['organizer'];
    if (char) {
        char.react('nod');
        if (state.isVoiceEnabled) {
            fetchTTSAudio(text, 'organizer').then(url => char.speak(text, url)).catch(() => {});
        }
    }
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
//  📄 PDF UPLOAD
// ═══════════════════════════════════════════════════════════════

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    el.fileStatus.textContent = '⏳ Uploading...';
    el.fileStatus.style.display = 'inline';

    try {
        const formData = new FormData();
        formData.append('session_id', state.sessionId);
        formData.append('file', file);

        const token = localStorage.getItem('sg_token') || '';
        const response = await fetch('/session/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        const data = await response.json();

        if (data.success) {
            el.fileStatus.textContent = `🔄 Indexing ${data.filename}...`;
            addSystemMessage(`📄 ${data.filename} uploaded! Indexing with AI embeddings — this may take a moment...`);

            // Poll for indexing completion
            pollRagStatus();
        } else {
            el.fileStatus.textContent = `❌ ${data.error || 'Upload failed'}`;
        }
    } catch (e) {
        el.fileStatus.textContent = '❌ Upload failed';
        console.error('File upload error:', e);
    }
}

async function pollRagStatus() {
    const dots = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
    let tick = 0;

    const poll = setInterval(async () => {
        try {
            const token = localStorage.getItem('sg_token') || '';
            const res = await fetch(`/session/upload-status?session_id=${state.sessionId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const info = await res.json();

            if (info.status === 'ready') {
                clearInterval(poll);
                state.pdfContext = true;
                el.fileStatus.textContent = `✅ ${info.filename} indexed!`;

                // Auto-fill topic from document if detected
                if (info.detected_topic) {
                    el.topicInput.value = info.detected_topic;
                    el.tableTopic.textContent = info.detected_topic;
                    addSystemMessage(`🧠 RAG indexing complete! Topic detected: "${info.detected_topic}" — agents will reference your course materials.`);
                } else {
                    addSystemMessage(`🧠 RAG indexing complete! Agents now have deep knowledge of your lecture notes.`);
                }
            } else if (info.status === 'error') {
                clearInterval(poll);
                el.fileStatus.textContent = `❌ Indexing failed`;
                addSystemMessage(`❌ RAG indexing failed: ${info.error || 'Unknown error'}`);
            } else {
                // Still processing — animate
                el.fileStatus.textContent = `${dots[tick % dots.length]} Indexing...`;
                tick++;
            }
        } catch (e) {
            // Network error, keep trying
            tick++;
        }
    }, 2000);
}

// ═══════════════════════════════════════════════════════════════
//  🧪 FEYNMAN METHOD — "Explain it to me"
// ═══════════════════════════════════════════════════════════════

function triggerFeynman() {
    state.waitingForFeynman = true;
    addSystemMessage('🧪 Feynman Mode: Explain the current topic in your own words! The AI will evaluate your understanding.');
    el.userInput.placeholder = 'Explain the topic in your own words...';
    el.userInput.focus();
}

// Override sendMessage to handle Feynman state
const _originalSendMessage = sendMessage;

async function sendMessageWithFeynman() {
    if (state.waitingForFeynman) {
        const text = el.userInput.value.trim();
        if (!text || state.isThinking) return;

        el.userInput.value = '';
        el.userInput.placeholder = 'Type a message...';
        addMessage('you', text);
        state.waitingForFeynman = false;
        state.isThinking = true;
        showLoading(true);

        try {
            const token = localStorage.getItem('sg_token') || '';
            const response = await fetch('/session/feynman', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    session_id: state.sessionId,
                    topic: el.topicInput.value,
                    student_explanation: text,
                    course_context: '',
                }),
            });

            const data = await response.json();
            showLoading(false);

            // Show the Feynman evaluation card
            showFeynmanCard(data);

            // Have Julian respond with encouragement
            const scoreMsg = data.score >= 80
                ? `Excellent explanation! You clearly understand the core concept. Score: ${data.score}/100 🎉`
                : `Good attempt! ${data.improvement || 'Try adding more detail.'} Score: ${data.score}/100`;
            addMessage('genius', scoreMsg);

            state.history.push(`Student (Feynman explanation): ${text}`);
            state.history.push(`Julian: ${scoreMsg}`);

        } catch (e) {
            showLoading(false);
            addSystemMessage('❌ Feynman evaluation failed. Try again!');
        } finally {
            state.isThinking = false;
        }
        return;
    }

    // Normal flow
    return _originalSendMessage.call(this);
}

// Replace the sendMessage reference in events
function patchSendMessage() {
    el.sendBtn.removeEventListener('click', sendMessage);
    el.sendBtn.addEventListener('click', sendMessageWithFeynman);
    el.userInput.removeEventListener('keypress', sendMessage);
    el.userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessageWithFeynman();
    });
}

function showFeynmanCard(data) {
    if (!el.feynmanCard || !el.feynmanBody) return;

    let html = '';

    if (data.correct && data.correct.length > 0) {
        data.correct.forEach(point => {
            html += `<div class="fc-item"><span class="fc-ok">✓</span> ${point}</div>`;
        });
    }

    if (data.good_analogy) {
        html += `<div class="fc-item"><span class="fc-ok">✓</span> Good analogy used</div>`;
    }

    if (data.missing && data.missing.length > 0) {
        data.missing.forEach(point => {
            html += `<div class="fc-item"><span class="fc-miss">⚠</span> Missing: ${point}</div>`;
        });
    }

    html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);font-size:12px;color:#94a3b8">
        Explanation score: <strong style="color:#4a9eff;font-family:monospace">${data.score}/100</strong>
    </div>`;

    el.feynmanBody.innerHTML = html;
    el.feynmanCard.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
//  📊 END SESSION EVALUATION
// ═══════════════════════════════════════════════════════════════

async function endSession() {
    if (!el.endModal) return;

    el.endModal.style.display = 'flex';
    el.modalScore.textContent = '...';
    el.modalFeedback.textContent = 'Evaluating your session...';

    try {
        const token = localStorage.getItem('sg_token') || '';
        const response = await fetch('/session/evaluate', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                session_id: state.sessionId,
                topic: el.topicInput.value,
                history: formatHistory(),
            }),
        });

        const data = await response.json();

        el.modalScore.textContent = `${data.score}%`;
        el.modalFeedback.textContent = data.feedback;

        const stats = [
            { val: state.questionsAnswered, lbl: 'Messages sent' },
            { val: state.streak, lbl: 'Focus streak' },
            { val: state.pdfContext ? '✅' : '—', lbl: 'Notes uploaded' },
        ];

        if (el.modalStats) {
            el.modalStats.innerHTML = stats.map(s =>
                `<div class="modal-stat"><div class="modal-stat-val">${s.val}</div><div class="modal-stat-lbl">${s.lbl}</div></div>`
            ).join('');
        }

        if (data.strong_areas && data.strong_areas.length > 0) {
            el.modalFeedback.innerHTML += `<br><br><strong>Strong:</strong> ${data.strong_areas.join(', ')}`;
        }
        if (data.review_areas && data.review_areas.length > 0) {
            el.modalFeedback.innerHTML += `<br><strong>Review:</strong> ${data.review_areas.join(', ')}`;
        }

    } catch (e) {
        el.modalScore.textContent = '—';
        el.modalFeedback.textContent = 'Could not evaluate session. Good work anyway!';
    }
}

// ═══════════════════════════════════════════════════════════════
//  😢 EMOTION DETECTION (face-api.js)
// ═══════════════════════════════════════════════════════════════

async function initEmotionTracking() {
    // Wait a bit for face-api to load
    await sleep(2000);

    if (typeof faceapi === 'undefined') {
        console.warn('face-api.js not loaded — emotion detection disabled');
        return;
    }

    try {
        const MODEL_URL = 'https://unpkg.com/@vladmandic/face-api/model';
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        ]);
        console.log('face-api models loaded — emotion tracking active');

        const videoEl = el.userVideo;
        if (!videoEl || !videoEl.srcObject) {
            console.warn('No camera stream for emotion tracking');
            return;
        }

        // Scan every 3 seconds
        setInterval(async () => {
            try {
                const detections = await faceapi.detectSingleFace(
                    videoEl,
                    new faceapi.TinyFaceDetectorOptions()
                ).withFaceExpressions();

                if (detections) {
                    const expressions = detections.expressions;
                    let dominant = 'neutral';
                    let maxScore = expressions.neutral || 0;

                    for (const [expr, val] of Object.entries(expressions)) {
                        if (expr !== 'neutral' && val > 0.15) {
                            if (val > maxScore || dominant === 'neutral') {
                                maxScore = val;
                                dominant = expr;
                            }
                        }
                    }

                    // Map face-api emotions to simpler categories
                    if (dominant === 'fearful' || dominant === 'angry') dominant = 'stressed';

                    state.userEmotion = dominant;
                }
            } catch (e) {
                // Silently ignore detection errors
            }
        }, 3000);

    } catch (e) {
        console.warn('Emotion tracking init failed:', e);
    }
}

// Start emotion tracking after camera init
const _originalStartCamera = startUserCamera;
async function startUserCameraWithEmotion() {
    await _originalStartCamera();
    initEmotionTracking();
}

// ═══════════════════════════════════════════════════════════════
//  LATE INIT — Patch in advanced feature hooks
// ═══════════════════════════════════════════════════════════════

// Wait for DOMContentLoaded to be sure all elements are ready
document.addEventListener('DOMContentLoaded', () => {
    // Give the main init a moment to run, then patch
    setTimeout(() => {
        patchSendMessage();

        // Apply lobby settings (topic + mode from the upload page)
        const lobbyTopic = localStorage.getItem('sg_topic');
        const lobbyMode = localStorage.getItem('sg_mode');
        if (lobbyTopic && el.topicInput) {
            el.topicInput.value = lobbyTopic;
            if (el.tableTopic) el.tableTopic.textContent = lobbyTopic;
        }
        if (lobbyMode && el.modeSelect) {
            el.modeSelect.value = lobbyMode;
        }

        // Show PDF status if uploaded in lobby
        if (localStorage.getItem('sg_has_pdf') === 'true') {
            addSystemMessage('📄 Your lecture notes are indexed and ready — the AI agents can reference them!');
        }

        // Auto-start pomodoro timer
        if (!state.pomodoro.isActive) {
            togglePomodoro();
        }

        // Initialize stats display
        updateStats();

        loadPreviousSession();
    }, 100);
});


// ── Load previous session from server ──
async function loadPreviousSession() {
    const token = localStorage.getItem('sg_token');
    if (!token) return;

    try {
        const res = await fetch('/session/load', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        if (data.found) {
            // Restore session state
            state.sessionId = data.session_id;
            state.questionsAnswered = data.turn_count || 0;
            state.mastery = data.mastery || 0;
            state.streak = data.streak || 0;

            // Restore topic and mode
            if (data.topic && el.topicInput) {
                el.topicInput.value = data.topic;
            }
            if (data.mode && el.modeSelect) {
                el.modeSelect.value = data.mode;
            }

            // Restore chat history
            if (data.history && data.history.length > 0) {
                addSystemMessage(`📂 Previous session restored — ${data.turn_count} turns, topic: "${data.topic || 'general'}"`);
                // Show last few messages so user has context
                const recent = data.history.slice(-10);
                for (const msg of recent) {
                    if (msg.role === 'user') {
                        addMessage('you', msg.content, true);
                    } else if (msg.speaker) {
                        addMessage(msg.speaker, msg.content, true);
                    }
                }
                addSystemMessage('💬 Conversation restored — continue where you left off!');
            }

            if (data.pdf_filename) {
                addSystemMessage(`📄 PDF loaded: ${data.pdf_filename}`);
            }

            console.log('Session restored:', data.session_id);
        }
    } catch (e) {
        console.warn('Could not load previous session:', e);
    }
}
