async function loadOrderConfirmation() {
  const orderId = new URLSearchParams(window.location.search).get('order');
  const container = document.getElementById('order-confirmation');
  if (!orderId) {
    container.innerHTML = `<p class="form-error">No order was found.</p>`;
    return;
  }
  const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`);
  if (!res.ok) {
    container.innerHTML = `<p class="form-error">No order was found.</p>`;
    return;
  }
  const order = await res.json();
  const rows = order.items.map(
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
    <p class="order-id">Order ID: <strong>${order.id}</strong></p>
    <div class="cart-lines">${rows.join('')}</div>
    <div class="cart-total">Order total: $${order.total.toFixed(2)}</div>
  `;
  updateCartBadge(0);
}

async function updateCartBadge(count) {
  const badge = document.getElementById('cart-count');
  if (!badge) return;
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

loadOrderConfirmation();
