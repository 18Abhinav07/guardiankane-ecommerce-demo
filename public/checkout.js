async function loadCheckoutSummary() {
  const res = await fetch('/api/cart');
  const cart = await res.json();
  renderCheckoutSummary(cart);
  updateCartBadge(cart.count);
}

function renderCheckoutSummary(cart) {
  const container = document.getElementById('checkout-summary');
  const rows = cart.items.map(
    (item) => `
      <div class="cart-line" data-id="${item.id}">
        <div class="emoji">${item.image}</div>
        <div class="cart-line-name">${item.name}</div>
        <div class="cart-line-price">$${item.price.toFixed(2)}</div>
        <div class="cart-line-qty">Qty: ${item.qty}</div>
        <div class="cart-line-subtotal">$${item.subtotal.toFixed(2)}</div>
      </div>
    `
  );
  container.innerHTML = `
    <div class="cart-lines">${rows.join('')}</div>
    <div class="cart-total">Order total: $${cart.total.toFixed(2)}</div>
  `;
}

function updateCartBadge(count) {
  const badge = document.getElementById('cart-count');
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const cardNumber = document.getElementById('card-number').value.trim();
  const expiry = document.getElementById('card-expiry').value.trim();
  const cvv = document.getElementById('card-cvv').value.trim();
  const errorEl = document.getElementById('payment-error');
  errorEl.classList.add('hidden');

  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardNumber, expiry, cvv }),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error;
    errorEl.classList.remove('hidden');
    return;
  }
  window.location.href = `/order-confirmation.html?order=${encodeURIComponent(data.id)}`;
});

loadCheckoutSummary();
