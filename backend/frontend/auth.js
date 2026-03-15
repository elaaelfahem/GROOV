// ── AI Study Group — Auth Frontend ──

// If already logged in, go straight to study room
if (localStorage.getItem('sg_token')) {
    window.location.href = '/lobby.html';
}

function switchTab(tab) {
    const loginPanel = document.getElementById('loginPanel');
    const registerPanel = document.getElementById('registerPanel');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const msg = document.getElementById('authMsg');

    // Clear messages
    msg.className = 'msg';
    msg.textContent = '';

    if (tab === 'login') {
        loginPanel.classList.add('active');
        registerPanel.classList.remove('active');
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
    } else {
        registerPanel.classList.add('active');
        loginPanel.classList.remove('active');
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
    }
}

function showMsg(text, type) {
    const msg = document.getElementById('authMsg');
    msg.textContent = text;
    msg.className = `msg ${type}`;
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('loginEmail').value,
                password: document.getElementById('loginPassword').value,
            }),
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem('sg_token', data.token);
            localStorage.setItem('sg_user', JSON.stringify(data.user));
            showMsg('Welcome back! Redirecting...', 'success');
            setTimeout(() => { window.location.href = '/lobby.html'; }, 800);
        } else {
            showMsg(data.error || 'Login failed', 'error');
        }
    } catch (err) {
        showMsg('Could not connect to server', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('regBtn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('regUsername').value,
                email: document.getElementById('regEmail').value,
                password: document.getElementById('regPassword').value,
            }),
        });

        const data = await res.json();

        if (data.success) {
            localStorage.setItem('sg_token', data.token);
            localStorage.setItem('sg_user', JSON.stringify(data.user));
            showMsg('Account created! Redirecting...', 'success');
            setTimeout(() => { window.location.href = '/lobby.html'; }, 800);
        } else {
            showMsg(data.error || 'Registration failed', 'error');
        }
    } catch (err) {
        showMsg('Could not connect to server', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}
