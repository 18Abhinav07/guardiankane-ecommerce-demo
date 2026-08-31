document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  errorEl.classList.add('hidden');

  const res = await fetch('/api/auth/signup', {
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
