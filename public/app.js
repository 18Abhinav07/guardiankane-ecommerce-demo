async function loadProducts() {
  const res = await fetch('/api/products');
  const products = await res.json();
  const grid = document.getElementById('product-grid');
  grid.innerHTML = products.map(renderCard).join('');
}

function renderCard(product) {
  return `
    <div class="product-card" data-id="${product.id}">
      <div class="emoji">${product.image}</div>
      <h3>${product.name}</h3>
      <p>${product.description}</p>
      <div class="price">$${product.price.toFixed(2)}</div>
    </div>
  `;
}

loadProducts();
