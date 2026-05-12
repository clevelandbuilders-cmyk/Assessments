const Auth = (() => {
  let _user = null;
  let _messaging = null;

  function init(onSignedIn, onSignedOut) {
    firebase.auth().onAuthStateChanged(async user => {
      _user = user;
      if (user) {
        await onSignedIn(user);
        _initFCM(user);
      } else {
        onSignedOut();
      }
    });
  }

  async function signIn(email, password) {
    await firebase.auth().signInWithEmailAndPassword(email, password);
  }

  async function signUp(email, password, name) {
    const { user } = await firebase.auth().createUserWithEmailAndPassword(email, password);
    await user.updateProfile({ displayName: name });
    await DB.saveUserProfile(user.uid, { name, email });
    return user;
  }

  async function signOut() {
    await firebase.auth().signOut();
  }

  async function _initFCM(user) {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
    try {
      await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      _messaging = firebase.messaging();
      const token = await _messaging.getToken({ vapidKey: firebaseConfig.vapidKey });
      if (token) await DB.saveFCMToken(user.uid, token);
      _messaging.onMessage(payload => {
        const { title, body } = payload.notification || {};
        if (title) showToast(`🔔 ${title}: ${body || ''}`);
      });
    } catch (e) {
      // FCM unavailable (config not set or localhost) — in-app notifications still work
    }
  }

  return {
    init,
    signIn,
    signUp,
    signOut,
    get currentUser() { return _user; },
  };
})();

/* ── Login screen wiring ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const show = id => document.getElementById(id).hidden = false;
  const hide = id => document.getElementById(id).hidden = true;
  const err  = msg => { document.getElementById('authError').textContent = msg || ''; };

  // Toggle forms
  document.getElementById('showRegisterBtn').addEventListener('click', () => {
    hide('loginForm'); show('registerForm'); err();
  });
  document.getElementById('showLoginBtn').addEventListener('click', () => {
    hide('registerForm'); show('loginForm'); err();
  });

  // Sign in
  document.getElementById('signInBtn').addEventListener('click', async () => {
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { err('Email and password are required.'); return; }
    try {
      document.getElementById('signInBtn').disabled = true;
      await Auth.signIn(email, password);
    } catch (e) {
      err(friendlyError(e.code));
    } finally {
      document.getElementById('signInBtn').disabled = false;
    }
  });

  // Sign up
  document.getElementById('signUpBtn').addEventListener('click', async () => {
    const name     = document.getElementById('regName').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;
    if (!name)     { err('Please enter your name.'); return; }
    if (!email)    { err('Please enter your email.'); return; }
    if (password.length < 6) { err('Password must be at least 6 characters.'); return; }
    try {
      document.getElementById('signUpBtn').disabled = true;
      await Auth.signUp(email, password, name);
    } catch (e) {
      err(friendlyError(e.code));
    } finally {
      document.getElementById('signUpBtn').disabled = false;
    }
  });

  // Sign out
  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await Auth.signOut();
  });

  // Enter key on login fields
  ['loginEmail', 'loginPassword'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('signInBtn').click();
    });
  });

  // User dropdown toggle
  document.getElementById('userBtn').addEventListener('click', e => {
    e.stopPropagation();
    const d = document.getElementById('userDropdown');
    d.hidden = !d.hidden;
  });
  document.addEventListener('click', () => {
    document.getElementById('userDropdown').hidden = true;
  });
});

function friendlyError(code) {
  const map = {
    'auth/user-not-found':       'No account found with that email.',
    'auth/wrong-password':       'Incorrect password.',
    'auth/email-already-in-use': 'An account already exists with that email.',
    'auth/invalid-email':        'Please enter a valid email address.',
    'auth/weak-password':        'Password must be at least 6 characters.',
    'auth/too-many-requests':    'Too many attempts. Please try again later.',
    'auth/invalid-credential':   'Incorrect email or password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
