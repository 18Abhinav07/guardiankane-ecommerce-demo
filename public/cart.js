async function loadCart() {
  const res = await fetch('/api/cart');
  const cart = await res.json();
  renderCart(cart);
  updateCartBadge(cart.count);
}

function renderCart(cart) {
  const container = document.getElementById('cart-contents');
  if (cart.items.length === 0) {
    container.innerHTML = `<p class="empty-cart">Your cart is empty.</p>`;
    return;
  }
  const rows = cart.items.map(
    (item) => `
      <div class="cart-line" data-id="${item.id}">
        <div class="emoji">${item.image}</div>
        <div class="cart-line-name">${item.name}</div>
        <div class="cart-line-price">$${item.price.toFixed(2)}</div>
        <div class="cart-line-qty">
          <button type="button" class="qty-decrement" data-id="${item.id}" data-qty="${item.qty}" aria-label="Decrease quantity">−</button>
          <span class="qty-value">${item.qty}</span>
          <button type="button" class="qty-increment" data-id="${item.id}" data-qty="${item.qty}" aria-label="Increase quantity">+</button>
        </div>
        <div class="cart-line-subtotal">$${item.subtotal.toFixed(2)}</div>
        <button type="button" class="remove-line" data-id="${item.id}">Remove</button>
      </div>
    `
  );
  container.innerHTML = `
    <div class="cart-lines">${rows.join('')}</div>
    <div class="cart-total">Total: $${cart.total.toFixed(2)}</div>
    <a class="checkout-link" href="/checkout">Proceed to checkout</a>
  `;

  async function setQty(productId, qty) {
    const res = await fetch(`/api/cart/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qty }),
    });
    const cart = await res.json();
    renderCart(cart);
    updateCartBadge(cart.count);
  }

  container.querySelectorAll('.qty-increment').forEach((button) => {
    button.addEventListener('click', (e) => {
      setQty(e.target.dataset.id, Number(e.target.dataset.qty) + 1);
    });
  });

  container.querySelectorAll('.qty-decrement').forEach((button) => {
    button.addEventListener('click', (e) => {
      const nextQty = Number(e.target.dataset.qty) - 1;
      if (nextQty < 1) return;
      setQty(e.target.dataset.id, nextQty);
    });
  });

  container.querySelectorAll('.remove-line').forEach((button) => {
    button.addEventListener('click', async (e) => {
      const productId = e.target.dataset.id;
      const res = await fetch(`/api/cart/${productId}`, { method: 'DELETE' });
      const cart = await res.json();
      renderCart(cart);
      updateCartBadge(cart.count);
    });
  });
}

function updateCartBadge(count) {
  const badge = document.getElementById('cart-count');
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

loadCart();
