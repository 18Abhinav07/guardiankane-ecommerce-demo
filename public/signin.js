document.getElementById('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signin-email').value.trim();
  const password = document.getElementById('signin-password').value;
  const errorEl = document.getElementById('signin-error');
  errorEl.classList.add('hidden');

  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error;
    errorEl.classList.remove('hidden');
    return;
  }
  window.location.href = '/';
});
