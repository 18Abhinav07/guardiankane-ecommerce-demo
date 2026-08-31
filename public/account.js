async function initAccountLink() {
  const el = document.getElementById('account-link');
  if (!el) return;
  const res = await fetch('/api/auth/me');
  const { email } = await res.json();
  if (email) {
    el.textContent = email;
    el.removeAttribute('href');
  } else {
    el.textContent = 'Sign in';
    el.setAttribute('href', '/signin.html');
  }
}

initAccountLink();
