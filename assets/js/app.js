// All User Website logic lives in this one file (per project rules:
// max two JS files total). Shared helpers run on every page; a small
// dispatcher at the bottom calls the right initPage_() function based
// on <body data-page="...">.

import { API_BASE_URL, WEBSITE_NAME, CURRENCY_SYMBOL } from './font.js';

// ============================================================
// API helper
// ============================================================

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || body.success === false) {
    throw new Error(body.message || 'Something went wrong. Please try again.');
  }
  return body.data;
}

// ============================================================
// Auth / session helpers
// ============================================================

function getToken() {
  return localStorage.getItem('auth_token');
}

function setToken(token) {
  localStorage.setItem('auth_token', token);
}

function clearToken() {
  localStorage.removeItem('auth_token');
}

function isLoggedIn() {
  return Boolean(getToken());
}

function requireLoginOrRedirect() {
  if (isLoggedIn()) return true;
  const next = encodeURIComponent(location.pathname + location.search);
  location.href = `/login/?next=${next}`;
  return false;
}

// ============================================================
// Formatting helpers
// ============================================================

function formatPrice(amount) {
  const n = Number(amount) || 0;
  return `${CURRENCY_SYMBOL}${n.toLocaleString('en-US')}`;
}

function renderStars(rating) {
  const full = Math.round(rating);
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= full ? '★' : '☆';
  return out;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ============================================================
// Toast notifications
// ============================================================

function showToast(message, type = 'info') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ============================================================
// Theme (dark / light mode)
// ============================================================

function initTheme() {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  });
}

// ============================================================
// Mobile menu
// ============================================================

function initMobileMenu() {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

// ============================================================
// Header search box (submits to /search/?q=...)
// ============================================================

function initHeaderSearch() {
  document.querySelectorAll('[data-search-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="search"]');
      const q = input.value.trim();
      if (q) location.href = `/search/?q=${encodeURIComponent(q)}`;
    });
  });
}

// ============================================================
// Auth-aware header state (login link vs account/logout)
// ============================================================

function initHeaderAuthState() {
  const loggedIn = isLoggedIn();
  document.querySelectorAll('[data-auth-only]').forEach((el) => (el.hidden = !loggedIn));
  document.querySelectorAll('[data-guest-only]').forEach((el) => (el.hidden = loggedIn));

  document.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // even if the server call fails, still clear the local session
      }
      clearToken();
      showToast('Logged out');
      location.href = '/';
    });
  });
}

// ============================================================
// Site settings (name, currency) — applied to every page
// ============================================================

async function initSiteSettings() {
  try {
    const settings = await apiFetch('/api/settings');
    const name = settings.website_name || WEBSITE_NAME;
    document.querySelectorAll('[data-site-name]').forEach((el) => (el.textContent = name));
    if (settings.tagline) {
      document.querySelectorAll('[data-site-tagline]').forEach((el) => (el.textContent = settings.tagline));
    }
    if (settings.contact_phone) {
      document.querySelectorAll('[data-contact-phone]').forEach((el) => (el.textContent = settings.contact_phone));
    }
    if (settings.contact_email) {
      document.querySelectorAll('[data-contact-email]').forEach((el) => (el.textContent = settings.contact_email));
    }
  } catch {
    document.querySelectorAll('[data-site-name]').forEach((el) => (el.textContent = WEBSITE_NAME));
  }
}

// ============================================================
// Cart — used by the header badge and by the product/cart pages
// ============================================================

function refreshCartBadgeFromCart(cart) {
  document.querySelectorAll('[data-cart-count]').forEach((el) => (el.textContent = String(cart.count)));
}

async function updateCartBadge() {
  if (!isLoggedIn()) return;
  try {
    const cart = await apiFetch('/api/cart');
    refreshCartBadgeFromCart(cart);
  } catch {
    // leave the badge at its default "0" — not worth a toast on every page
  }
}

async function addToCart(productId, variantId, quantity = 1) {
  if (!requireLoginOrRedirect()) return null;
  try {
    const cart = await apiFetch('/api/cart', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, variant_id: variantId || undefined, quantity }),
    });
    refreshCartBadgeFromCart(cart);
    showToast('Added to cart', 'success');
    return cart;
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

// ============================================================
// Skeleton loading
// ============================================================

function renderSkeletonCards(container, count) {
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="product-card skeleton-card" aria-hidden="true">
        <div class="skeleton skeleton-image"></div>
        <div class="skeleton skeleton-line" style="width:80%"></div>
        <div class="skeleton skeleton-line" style="width:50%"></div>
      </div>`
    )
    .join('');
}

// ============================================================
// Product card (shared across home / category / search / related)
// ============================================================

function productCardHtml(product) {
  const hasDiscount = Number(product.discount_percent) > 0;
  return `
    <a class="product-card" href="/product/?slug=${encodeURIComponent(product.slug)}">
      <div class="product-card-image">
        <img src="${escapeHtml(product.thumbnail_url)}" alt="${escapeHtml(product.title)}" loading="lazy" width="400" height="400">
        ${hasDiscount ? `<span class="badge-discount">-${Math.round(product.discount_percent)}%</span>` : ''}
      </div>
      <div class="product-card-body">
        <h3 class="product-card-title">${escapeHtml(product.title)}</h3>
        ${
          product.review_count
            ? `<div class="rating-stars" aria-label="${product.rating} out of 5 stars">${renderStars(product.rating)} <span class="rating-count">(${product.review_count})</span></div>`
            : ''
        }
        <div class="price-tag">
          <span class="price-tag-final">${formatPrice(product.final_price)}</span>
          ${hasDiscount ? `<span class="price-tag-original">${formatPrice(product.original_price)}</span>` : ''}
        </div>
      </div>
    </a>`;
}

function renderProducts(container, products) {
  if (!products.length) {
    container.innerHTML = `<p class="empty-state">No products here yet — check back soon.</p>`;
    return;
  }
  container.innerHTML = products.map(productCardHtml).join('');
}

function renderCategories(container, categories) {
  if (!categories.length) {
    container.innerHTML = `<p class="empty-state">No categories yet.</p>`;
    return;
  }
  container.innerHTML = categories
    .map(
      (cat) => `
    <a class="category-chip" href="/category/?slug=${encodeURIComponent(cat.slug)}">
      <span class="category-chip-icon"><img src="${escapeHtml(cat.icon_url || '')}" alt="" loading="lazy" width="28" height="28"></span>
      <span>${escapeHtml(cat.name)}</span>
    </a>`
    )
    .join('');
}

// ============================================================
// Page: Home
// ============================================================

async function initHomePage() {
  const categoryList = document.querySelector('[data-category-list]');
  const popularList = document.querySelector('[data-popular-products]');
  const latestList = document.querySelector('[data-latest-products]');

  if (categoryList) renderSkeletonCards(categoryList, 6);
  if (popularList) renderSkeletonCards(popularList, 8);
  if (latestList) renderSkeletonCards(latestList, 8);

  try {
    const categories = await apiFetch('/api/categories?limit=6');
    if (categoryList) renderCategories(categoryList, categories);
  } catch {
    if (categoryList) categoryList.innerHTML = `<p class="empty-state">Couldn't load categories.</p>`;
  }

  try {
    const { items } = await apiFetch('/api/products?popular=true&limit=8');
    if (popularList) renderProducts(popularList, items);
  } catch {
    if (popularList) popularList.innerHTML = `<p class="empty-state">Couldn't load popular products.</p>`;
  }

  try {
    const { items } = await apiFetch('/api/products?sort=latest&limit=8');
    if (latestList) renderProducts(latestList, items);
  } catch {
    if (latestList) latestList.innerHTML = `<p class="empty-state">Couldn't load the latest collection.</p>`;
  }
}

// ============================================================
// Page: Category
// ============================================================

async function initCategoryPage() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const titleEl = document.querySelector('[data-category-title]');
  const grid = document.querySelector('[data-category-products]');
  const listEl = document.querySelector('[data-category-list]');

  // The category chips at the top double as navigation between
  // categories, so they're always loaded regardless of which (if
  // any) category is currently selected.
  if (listEl) {
    apiFetch('/api/categories')
      .then((categories) => renderCategories(listEl, categories))
      .catch(() => (listEl.innerHTML = `<p class="empty-state">Couldn't load categories.</p>`));
  }

  if (grid) renderSkeletonCards(grid, 8);

  if (!slug) {
    if (titleEl) titleEl.textContent = 'All products';
    try {
      const { items } = await apiFetch('/api/products?limit=24');
      if (grid) renderProducts(grid, items);
    } catch {
      if (grid) grid.innerHTML = `<p class="empty-state">Couldn't load products.</p>`;
    }
    return;
  }

  try {
    const category = await apiFetch(`/api/categories/${encodeURIComponent(slug)}`);
    if (titleEl) titleEl.textContent = category.name;
    document.title = `${category.name} — ${WEBSITE_NAME}`;
  } catch {
    if (titleEl) titleEl.textContent = 'Category not found';
    if (grid) grid.innerHTML = `<p class="empty-state">This category doesn't exist.</p>`;
    return;
  }

  try {
    const { items } = await apiFetch(`/api/products?category=${encodeURIComponent(slug)}&limit=24`);
    if (grid) renderProducts(grid, items);
  } catch {
    if (grid) grid.innerHTML = `<p class="empty-state">Couldn't load products for this category.</p>`;
  }
}

// ============================================================
// Page: Product detail
// ============================================================

async function initProductPage() {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug');
  const root = document.querySelector('[data-product-root]');
  if (!slug || !root) return;

  try {
    const product = await apiFetch(`/api/products/${encodeURIComponent(slug)}`);
    document.title = `${product.title} — ${WEBSITE_NAME}`;

    const gallery = [product.thumbnail_url, ...(product.images || [])].filter(Boolean);
    const hasDiscount = Number(product.discount_percent) > 0;

    document.querySelector('[data-product-breadcrumb-category]').textContent = product.category_name;
    document.querySelector('[data-product-breadcrumb-category]').href = `/category/?slug=${encodeURIComponent(product.category_slug)}`;
    document.querySelector('[data-product-breadcrumb-title]').textContent = product.title;

    document.querySelector('[data-product-main-image]').src = gallery[0];
    document.querySelector('[data-product-main-image]').alt = product.title;
    document.querySelector('[data-product-thumbs]').innerHTML = gallery
      .map((src, i) => `<button class="product-thumb${i === 0 ? ' is-active' : ''}" data-thumb="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="" loading="lazy" width="80" height="80"></button>`)
      .join('');
    document.querySelectorAll('[data-thumb]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelector('[data-product-main-image]').src = btn.dataset.thumb;
        document.querySelectorAll('[data-thumb]').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });

    document.querySelector('[data-product-title]').textContent = product.title;
    document.querySelector('[data-product-description]').innerHTML = product.description_html || '';

    const priceEl = document.querySelector('[data-product-price]');
    priceEl.innerHTML = `
      <span class="price-tag-final price-tag-final-lg">${formatPrice(product.final_price)}</span>
      ${hasDiscount ? `<span class="price-tag-original">${formatPrice(product.original_price)}</span><span class="badge-discount">-${Math.round(product.discount_percent)}%</span>` : ''}
    `;

    if (product.review_count) {
      document.querySelector('[data-product-rating]').innerHTML =
        `<span class="rating-stars">${renderStars(product.rating)}</span> <span class="rating-count">${product.rating} (${product.review_count} reviews)</span>`;
    }

    const stockEl = document.querySelector('[data-product-stock]');
    const inStock = product.variant_enabled ? product.variants.some((v) => v.stock > 0) : product.total_stock > 0;
    stockEl.textContent = inStock ? 'In stock' : 'Out of stock';
    stockEl.classList.toggle('stock-out', !inStock);

    const variantsEl = document.querySelector('[data-product-variants]');
    let selectedVariantId = null;
    if (product.variant_enabled && product.variants.length) {
      selectedVariantId = product.variants.find((v) => v.stock > 0)?.id ?? product.variants[0].id;
      variantsEl.hidden = false;
      variantsEl.innerHTML = product.variants
        .map((v, i) => `<button class="variant-chip${v.id === selectedVariantId ? ' is-active' : ''}" data-variant-id="${v.id}" ${v.stock <= 0 ? 'disabled' : ''}>${escapeHtml(v.variant_name)}</button>`)
        .join('');
      variantsEl.querySelectorAll('.variant-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedVariantId = Number(btn.dataset.variantId);
          variantsEl.querySelectorAll('.variant-chip').forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
        });
      });
    }

    const addBtn = document.querySelector('[data-add-to-cart]');
    const buyBtn = document.querySelector('[data-buy-now]');
    if (!inStock) {
      addBtn.disabled = true;
      buyBtn.disabled = true;
    }
    addBtn.addEventListener('click', () => addToCart(product.id, selectedVariantId, 1));
    buyBtn.addEventListener('click', async () => {
      const cart = await addToCart(product.id, selectedVariantId, 1);
      if (cart) location.href = '/cart/';
    });

    // related products
    const relatedEl = document.querySelector('[data-related-products]');
    if (relatedEl) {
      renderSkeletonCards(relatedEl, 4);
      apiFetch(`/api/products/${encodeURIComponent(slug)}/related`)
        .then((related) => renderProducts(relatedEl, related))
        .catch(() => (relatedEl.innerHTML = ''));
    }

    // reviews
    const reviewsEl = document.querySelector('[data-product-reviews]');
    if (reviewsEl) {
      apiFetch(`/api/products/${encodeURIComponent(slug)}/reviews`)
        .then(({ items }) => {
          reviewsEl.innerHTML = items.length
            ? items
                .map(
                  (r) => `
              <div class="review-item">
                <div class="rating-stars">${renderStars(r.rating)}</div>
                <p class="review-comment">${escapeHtml(r.comment)}</p>
                <p class="review-author">${escapeHtml(r.user_name)}</p>
              </div>`
                )
                .join('')
            : `<p class="empty-state">No reviews yet — be the first to buy and review this.</p>`;
        })
        .catch(() => (reviewsEl.innerHTML = ''));
    }

    root.hidden = false;
    document.querySelector('[data-product-loading]')?.setAttribute('hidden', '');
  } catch {
    document.querySelector('[data-product-loading]')?.setAttribute('hidden', '');
    document.querySelector('[data-product-not-found]')?.removeAttribute('hidden');
  }
}

// ============================================================
// Page: Search
// ============================================================

async function initSearchPage() {
  const params = new URLSearchParams(location.search);
  const input = document.querySelector('[data-search-input]');
  const grid = document.querySelector('[data-search-results]');
  const heading = document.querySelector('[data-search-heading]');
  let debounceTimer;

  async function runSearch(q) {
    if (!q) {
      grid.innerHTML = `<p class="empty-state">Type something to search for products.</p>`;
      if (heading) heading.textContent = 'Search';
      return;
    }
    if (heading) heading.textContent = `Results for "${q}"`;
    renderSkeletonCards(grid, 8);
    try {
      const { items } = await apiFetch(`/api/products?q=${encodeURIComponent(q)}&limit=24`);
      renderProducts(grid, items);
    } catch {
      grid.innerHTML = `<p class="empty-state">Search failed — please try again.</p>`;
    }
  }

  const initialQ = params.get('q') || '';
  if (input) input.value = initialQ;
  runSearch(initialQ);

  if (input) {
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const q = input.value.trim();
        history.replaceState(null, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
        runSearch(q);
      }, 350);
    });
  }
}

// ============================================================
// Page: Login
// ============================================================

function initLoginPage() {
  const form = document.querySelector('[data-login-form]');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = form.identifier.value.trim();
    const password = form.password.value;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const result = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
      setToken(result.token);
      showToast('Welcome back!', 'success');
      const params = new URLSearchParams(location.search);
      location.href = params.get('next') || '/';
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });

  const googleBtn = document.querySelector('[data-google-login]');
  if (googleBtn) googleBtn.addEventListener('click', () => showToast('Add your Google Client ID in font.js to enable this.', 'info'));
}

// ============================================================
// Page: Signup (two steps: form -> OTP)
// ============================================================

function initSignupPage() {
  const form = document.querySelector('[data-signup-form]');
  const otpForm = document.querySelector('[data-otp-form]');
  if (!form) return;

  let signupEmail = '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: form.name.value.trim(),
      username: form.username.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      password: form.password.value,
      confirmPassword: form.confirmPassword.value,
    };
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) });
      signupEmail = body.email;
      form.hidden = true;
      otpForm.hidden = false;
      showToast('Check your email for a 6-digit code');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = otpForm.code.value.trim();
      const btn = otpForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await apiFetch('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email: signupEmail, code, purpose: 'signup' }) });
        showToast('Account verified — please log in', 'success');
        location.href = '/login/';
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }
}

// ============================================================
// Page: Forgot password (two steps: request -> reset)
// ============================================================

function initForgetPage() {
  const requestForm = document.querySelector('[data-forget-request-form]');
  const resetForm = document.querySelector('[data-forget-reset-form]');
  if (!requestForm) return;

  let targetEmail = '';

  requestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = requestForm.email.value.trim();
    const btn = requestForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      targetEmail = email;
      requestForm.hidden = true;
      resetForm.hidden = false;
      showToast('If that email exists, a code is on its way');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = resetForm.code.value.trim();
      const newPassword = resetForm.newPassword.value;
      const btn = resetForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await apiFetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: targetEmail, code, newPassword }) });
        showToast('Password reset — please log in', 'success');
        location.href = '/login/';
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }
}

// ============================================================
// Page: Cart
// ============================================================

function cartLineHtml(item) {
  return `
    <div class="cart-line" data-cart-item-id="${item.id}">
      <img class="cart-line-thumb" src="${escapeHtml(item.product.thumbnail_url)}" alt="" loading="lazy">
      <div class="cart-line-info">
        <a href="/product/?slug=${encodeURIComponent(item.product.slug)}">${escapeHtml(item.product.title)}</a>
        ${item.variant ? `<p class="text-soft text-sm">${escapeHtml(item.variant.name)}</p>` : ''}
        ${!item.in_stock ? `<p class="text-sm" style="color:var(--c-accent-red);">Out of stock</p>` : ''}
        <div class="price-tag"><span class="price-tag-final">${formatPrice(item.price)}</span></div>
      </div>
      <div class="cart-line-actions">
        <div class="qty-stepper">
          <button type="button" data-qty-decrease aria-label="Decrease quantity">−</button>
          <span>${item.quantity}</span>
          <button type="button" data-qty-increase aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-remove-item>Remove</button>
      </div>
    </div>`;
}

async function initCartPage() {
  if (!requireLoginOrRedirect()) return;
  const itemsEl = document.querySelector('[data-cart-items]');
  const emptyEl = document.querySelector('[data-cart-empty]');
  const summaryEl = document.querySelector('[data-cart-summary]');

  async function refresh() {
    try {
      const cart = await apiFetch('/api/cart');
      refreshCartBadgeFromCart(cart);
      if (!cart.items.length) {
        itemsEl.innerHTML = '';
        emptyEl.hidden = false;
        summaryEl.hidden = true;
        return;
      }
      emptyEl.hidden = true;
      summaryEl.hidden = false;
      itemsEl.innerHTML = cart.items.map(cartLineHtml).join('');
      document.querySelector('[data-cart-subtotal]').textContent = formatPrice(cart.subtotal);

      itemsEl.querySelectorAll('[data-cart-item-id]').forEach((row) => {
        const id = row.dataset.cartItemId;
        const qtyEl = row.querySelector('.qty-stepper span');
        row.querySelector('[data-qty-increase]').addEventListener('click', () => changeQty(id, Number(qtyEl.textContent) + 1));
        row.querySelector('[data-qty-decrease]').addEventListener('click', () => {
          const next = Number(qtyEl.textContent) - 1;
          if (next >= 1) changeQty(id, next);
        });
        row.querySelector('[data-remove-item]').addEventListener('click', async () => {
          try {
            await apiFetch(`/api/cart/${id}`, { method: 'DELETE' });
            refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function changeQty(id, quantity) {
    try {
      await apiFetch(`/api/cart/${id}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
      refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  document.querySelector('[data-checkout-btn]')?.addEventListener('click', () => {
    location.href = '/checkout/';
  });

  await refresh();
}

// ============================================================
// Page: Checkout (delivery address, then on to payment)
// ============================================================

function addressOptionHtml(address, checked) {
  return `
    <label class="address-option">
      <input type="radio" name="address" value="${address.id}" ${checked ? 'checked' : ''}>
      <span><strong>${escapeHtml(address.recipient_name)}</strong> · ${escapeHtml(address.phone)}<br>
        ${escapeHtml(address.address_line)}${address.area ? `, ${escapeHtml(address.area)}` : ''}${address.city ? `, ${escapeHtml(address.city)}` : ''}
      </span>
    </label>`;
}

async function initCheckoutPage() {
  if (!requireLoginOrRedirect()) return;

  try {
    const cart = await apiFetch('/api/cart');
    if (!cart.items.length) {
      location.href = '/cart/';
      return;
    }
    document.querySelector('[data-checkout-summary]').innerHTML = cart.items
      .map((i) => `<div class="checkout-line"><span>${escapeHtml(i.product.title)} × ${i.quantity}</span><span>${formatPrice(i.line_total)}</span></div>`)
      .join('');
    document.querySelector('[data-checkout-subtotal]').textContent = formatPrice(cart.subtotal);
  } catch (err) {
    showToast(err.message, 'error');
  }

  const listEl = document.querySelector('[data-address-list]');

  async function refreshAddresses() {
    try {
      const addresses = await apiFetch('/api/addresses');
      listEl.innerHTML = addresses.length
        ? addresses.map((a, i) => addressOptionHtml(a, i === 0)).join('')
        : `<p class="text-soft">No saved addresses yet — add one below.</p>`;
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  await refreshAddresses();

  const newForm = document.querySelector('[data-new-address-form]');
  document.querySelector('[data-add-address-toggle]').addEventListener('click', () => {
    newForm.hidden = !newForm.hidden;
  });

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: newForm.label.value.trim(),
          recipient_name: newForm.recipient_name.value.trim(),
          phone: newForm.phone.value.trim(),
          address_line: newForm.address_line.value.trim(),
          area: newForm.area.value.trim(),
          city: newForm.city.value.trim(),
        }),
      });
      newForm.reset();
      newForm.hidden = true;
      showToast('Address saved', 'success');
      await refreshAddresses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.querySelector('[data-continue-to-payment]').addEventListener('click', () => {
    const selected = document.querySelector('input[name="address"]:checked');
    if (!selected) {
      showToast('Please select a delivery address', 'error');
      return;
    }
    sessionStorage.setItem('checkout_address_id', selected.value);
    location.href = '/payment/';
  });
}

// ============================================================
// Page: Payment (method + transaction details -> places the order)
// ============================================================

function paymentOptionHtml(method, checked) {
  return `
    <label class="payment-option">
      <input type="radio" name="payment_method" value="${method.id}" data-instruction="${escapeHtml(method.instruction || '')}" data-number="${escapeHtml(method.number)}" ${checked ? 'checked' : ''}>
      <span>${method.logo_url ? `<img src="${escapeHtml(method.logo_url)}" alt="" style="height:20px; vertical-align:middle;">` : ''} <strong>${escapeHtml(method.name)}</strong> — send to ${escapeHtml(method.number)}</span>
    </label>`;
}

async function initPaymentPage() {
  if (!requireLoginOrRedirect()) return;
  const addressId = sessionStorage.getItem('checkout_address_id');
  if (!addressId) {
    location.href = '/checkout/';
    return;
  }

  try {
    const cart = await apiFetch('/api/cart');
    if (!cart.items.length) {
      location.href = '/cart/';
      return;
    }
    document.querySelector('[data-payment-subtotal]').textContent = formatPrice(cart.subtotal);
  } catch (err) {
    showToast(err.message, 'error');
  }

  const methodsEl = document.querySelector('[data-payment-methods]');
  const instructionEl = document.querySelector('[data-payment-instruction]');
  try {
    const methods = await apiFetch('/api/payment-methods');
    methodsEl.innerHTML = methods.length ? methods.map((m, i) => paymentOptionHtml(m, i === 0)).join('') : `<p class="text-soft">No payment methods configured yet — contact support.</p>`;
    const updateInstruction = () => {
      const checked = methodsEl.querySelector('input:checked');
      instructionEl.textContent = checked?.dataset.instruction || '';
    };
    methodsEl.querySelectorAll('input').forEach((input) => input.addEventListener('change', updateInstruction));
    updateInstruction();
  } catch (err) {
    showToast(err.message, 'error');
  }

  document.querySelector('[data-payment-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const selectedMethod = methodsEl.querySelector('input:checked');
    if (!selectedMethod) {
      showToast('Please select a payment method', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;

    let screenshotUrl = null;
    const file = document.getElementById('pay-screenshot').files[0];
    if (file) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const result = await apiFetch('/api/upload', { method: 'POST', body: formData });
        screenshotUrl = `${API_BASE_URL}${result.url}`;
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        return;
      }
    }

    try {
      const order = await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          address_id: Number(addressId),
          payment_method_id: Number(selectedMethod.value),
          transaction_id: form.transaction_id.value.trim(),
          sender_number: form.sender_number.value.trim(),
          payment_screenshot_url: screenshotUrl,
        }),
      });
      sessionStorage.removeItem('checkout_address_id');
      showToast('Order placed!', 'success');
      location.href = `/tracking/?id=${encodeURIComponent(order.tracking_id)}`;
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ============================================================
// Page: My Orders
// ============================================================

async function initOrdersPage() {
  if (!requireLoginOrRedirect()) return;
  const container = document.querySelector('[data-orders-list]');
  try {
    const { items } = await apiFetch('/api/orders');
    container.innerHTML = items.length
      ? items
          .map(
            (o) => `
        <a class="order-row" href="/tracking/?id=${encodeURIComponent(o.tracking_id)}">
          <div><strong>${o.tracking_id}</strong><p class="text-soft text-sm">${formatDate(o.created_at)}</p></div>
          <span class="pill-status pill-status-${o.status}">${o.status.replace('_', ' ')}</span>
          <div class="price-tag"><span class="price-tag-final">${formatPrice(o.total)}</span></div>
        </a>`
          )
          .join('')
      : `<p class="empty-state">No orders yet — <a href="/">start shopping</a>.</p>`;
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Couldn't load your orders.</p>`;
    showToast(err.message, 'error');
  }
}

function formatDate(sqlDate) {
  if (!sqlDate) return '';
  return new Date(sqlDate.replace(' ', 'T') + 'Z').toLocaleDateString();
}

// ============================================================
// Page: Order tracking (public — no login required)
// ============================================================

async function initTrackingPage() {
  const form = document.querySelector('[data-tracking-form]');
  const input = document.getElementById('tracking-id-input');
  const resultEl = document.querySelector('[data-tracking-result]');

  async function lookup(trackingId) {
    resultEl.innerHTML = `<div class="skeleton skeleton-line" style="width:100%; height:120px;"></div>`;
    try {
      const order = await apiFetch(`/api/orders/track/${encodeURIComponent(trackingId)}`);
      resultEl.innerHTML = `
        <div class="tracking-card">
          <div class="tracking-card-head">
            <strong>${escapeHtml(order.tracking_id)}</strong>
            <span class="pill-status pill-status-${order.status}">${order.status.replace('_', ' ')}</span>
          </div>
          <p class="text-soft text-sm">Total: ${formatPrice(order.total)}</p>
          <div class="timeline">
            ${order.history
              .map(
                (h) => `
              <div class="timeline-item">
                <strong>${h.status.replace('_', ' ')}</strong>
                <p class="text-soft text-sm">${escapeHtml(h.message)}</p>
                <p class="text-soft text-sm">${new Date(h.created_at.replace(' ', 'T') + 'Z').toLocaleString()}</p>
              </div>`
              )
              .join('')}
          </div>
        </div>`;
    } catch (err) {
      resultEl.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    }
  }

  const prefill = new URLSearchParams(location.search).get('id');
  if (prefill) {
    input.value = prefill;
    lookup(prefill);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = input.value.trim();
    if (!id) return;
    history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
    lookup(id);
  });
}

// ============================================================
// Page: Profile (account info + saved addresses)
// ============================================================

async function initProfilePage() {
  if (!requireLoginOrRedirect()) return;

  try {
    const user = await apiFetch('/api/auth/session-check');
    document.querySelector('[data-profile-name]').textContent = user.name;
    document.querySelector('[data-profile-email]').textContent = user.email;
    document.querySelector('[data-profile-phone]').textContent = user.phone || '—';
  } catch (err) {
    showToast(err.message, 'error');
  }

  const listEl = document.querySelector('[data-profile-addresses]');
  async function refreshAddresses() {
    try {
      const addresses = await apiFetch('/api/addresses');
      listEl.innerHTML = addresses.length
        ? addresses
            .map(
              (a) => `
          <div class="address-card">
            <p><strong>${escapeHtml(a.recipient_name)}</strong> · ${escapeHtml(a.phone)}</p>
            <p class="text-soft text-sm">${escapeHtml(a.address_line)}${a.area ? `, ${escapeHtml(a.area)}` : ''}${a.city ? `, ${escapeHtml(a.city)}` : ''}</p>
            <button type="button" class="btn btn-ghost btn-sm" data-delete-address="${a.id}">Remove</button>
          </div>`
            )
            .join('')
        : `<p class="text-soft">No saved addresses yet.</p>`;

      listEl.querySelectorAll('[data-delete-address]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          try {
            await apiFetch(`/api/addresses/${btn.dataset.deleteAddress}`, { method: 'DELETE' });
            refreshAddresses();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  await refreshAddresses();

  document.querySelector('[data-profile-address-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await apiFetch('/api/addresses', {
        method: 'POST',
        body: JSON.stringify({
          recipient_name: form.recipient_name.value.trim(),
          phone: form.phone.value.trim(),
          address_line: form.address_line.value.trim(),
          area: form.area.value.trim(),
          city: form.city.value.trim(),
        }),
      });
      form.reset();
      showToast('Address added', 'success');
      refreshAddresses();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ============================================================
// Page: Write a review
// ============================================================

async function initReviewPage() {
  if (!requireLoginOrRedirect()) return;
  const listEl = document.querySelector('[data-reviewable-list]');
  const formSection = document.querySelector('[data-review-form-section]');
  let selected = null;

  try {
    const items = await apiFetch('/api/reviews/reviewable');
    listEl.innerHTML = items.length
      ? items
          .map(
            (i) => `
        <button type="button" class="reviewable-item" data-order-id="${i.order_id}" data-product-id="${i.product_id}" data-product-title="${escapeHtml(i.title)}">
          <img src="${escapeHtml(i.thumbnail_url)}" alt="" loading="lazy">
          <span>${escapeHtml(i.title)}</span>
        </button>`
          )
          .join('')
      : `<p class="empty-state">No products to review right now — this list fills up once an order is marked completed.</p>`;

    listEl.querySelectorAll('[data-order-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        selected = { order_id: btn.dataset.orderId, product_id: btn.dataset.productId };
        document.querySelector('[data-review-product-name]').textContent = btn.dataset.productTitle;
        formSection.hidden = false;
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  } catch (err) {
    showToast(err.message, 'error');
  }

  document.querySelector('[data-review-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selected) return;
    const form = e.target;
    const rating = Number(form.querySelector('input[name="rating"]:checked')?.value);
    if (!rating) {
      showToast('Please select a star rating', 'error');
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ order_id: selected.order_id, product_id: selected.product_id, rating, comment: form.comment.value.trim() }),
      });
      showToast('Review submitted — thank you!', 'success');
      location.reload();
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
    }
  });
}

// ============================================================
// Boot
// ============================================================

function init() {
  initTheme();
  initMobileMenu();
  initHeaderSearch();
  initHeaderAuthState();
  updateCartBadge();
  initSiteSettings();

  const page = document.body.dataset.page;
  const byPage = {
    home: initHomePage,
    category: initCategoryPage,
    product: initProductPage,
    search: initSearchPage,
    login: initLoginPage,
    signup: initSignupPage,
    forget: initForgetPage,
    cart: initCartPage,
    checkout: initCheckoutPage,
    payment: initPaymentPage,
    orders: initOrdersPage,
    tracking: initTrackingPage,
    profile: initProfilePage,
    review: initReviewPage,
  };
  byPage[page]?.();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
