async function loadProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();
  const grid = document.getElementById('product-grid');
  grid.innerHTML = products.map(renderCard).join('');
  grid.querySelectorAll('.add-to-cart').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.closest('.product-card').dataset.id));
  });
}

function renderCard(product) {
  return `
    <div class="product-card" data-id="${product.id}">
      <div class="emoji">${product.image}</div>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="price">$${product.price.toFixed(2)}</div>
      <button class="add-to-cart primary" type="button">Add to cart</button>
    </div>
  `;
}

async function addToCart(productId) {
  const res = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId }),
  });
  const cart = await res.json();
  updateCartBadge(cart.count);
}

async function refreshCartBadge() {
  const res = await fetch('/api/cart');
  const cart = await res.json();
  updateCartBadge(cart.count);
}

function updateCartBadge(count) {
  const badge = document.getElementById('cart-count');
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

loadProducts();
refreshCartBadge();
