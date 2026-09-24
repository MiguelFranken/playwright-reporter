// Acme Web Shop: the app the demo suite tests. No framework, no build step.
//
// `window.__ACME__` (set by the tests' init script) bends its behaviour:
//   latency: { [api]: [minMs, maxMs] }  how long each fake API call takes
//   bugs:    ['shipping-threshold', …]  regressions a scenario ships with
// so one suite yields stable, flaky, slow and failing runs on demand.
(() => {
  const config = window.__ACME__ ?? {};
  const bugs = new Set(config.bugs ?? []);
  const LATENCY = {
    catalog: [60, 250],
    search: [80, 600],
    coupon: [80, 400],
    payment: [400, 1200],
    login: [80, 300],
    ...config.latency,
  };

  const PRODUCTS = [
    { id: 'trail-runner', name: 'Trail Runner Shoes', category: 'Shoes', price: 8900, rating: 4.6, stock: 12 },
    { id: 'city-sneaker', name: 'City Sneaker', category: 'Shoes', price: 6400, rating: 4.1, stock: 30 },
    { id: 'rain-shell', name: 'Rain Shell Jacket', category: 'Jackets', price: 12900, rating: 4.8, stock: 5 },
    { id: 'down-vest', name: 'Down Vest', category: 'Jackets', price: 9900, rating: 4.3, stock: 0 },
    { id: 'merino-tee', name: 'Merino T-Shirt', category: 'Shirts', price: 4500, rating: 4.7, stock: 40 },
    { id: 'linen-shirt', name: 'Linen Shirt', category: 'Shirts', price: 5200, rating: 3.9, stock: 18 },
    { id: 'wool-socks', name: 'Wool Socks', category: 'Accessories', price: 1400, rating: 4.5, stock: 100 },
    { id: 'canvas-cap', name: 'Canvas Cap', category: 'Accessories', price: 2200, rating: 4.0, stock: 25 },
    { id: 'day-pack', name: 'Day Pack 20L', category: 'Bags', price: 7400, rating: 4.4, stock: 9 },
    { id: 'tote-bag', name: 'Canvas Tote Bag', category: 'Bags', price: 1900, rating: 4.2, stock: 60 },
    { id: 'trail-socks', name: 'Trail Running Socks', category: 'Accessories', price: 1600, rating: 4.6, stock: 3 },
    { id: 'rain-hat', name: 'Rain Hat', category: 'Accessories', price: 2800, rating: 3.8, stock: 14 },
  ];
  const CATEGORIES = [...new Set(PRODUCTS.map((p) => p.category))];
  const SHIPPING = 499;
  const FREE_SHIPPING_FROM = 5000;
  const ACCOUNT = { email: 'shopper@acme.test', password: 'correct-horse', name: 'Sam Shopper' };

  // ------------------------------------------------------------ fake API
  const wait = (api) => {
    const [min, max] = LATENCY[api];
    return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
  };
  const api = {
    async products() {
      await wait('catalog');
      return PRODUCTS;
    },
    async search(q) {
      await wait('search');
      const needle = q.trim().toLowerCase();
      return needle ? PRODUCTS.filter((p) => p.name.toLowerCase().includes(needle)) : [];
    },
    async coupon(code) {
      await wait('coupon');
      const normalized = bugs.has('coupon-case') ? code.trim() : code.trim().toUpperCase();
      return normalized === 'SAVE10' ? { code: 'SAVE10', percent: 10 } : null;
    },
    async pay(card) {
      await wait('payment');
      return /^4\d{15}$/.test(card.replace(/\s+/g, '')) ? { ok: true } : { ok: false, error: 'Your card was declined.' };
    },
    async login(email, password) {
      await wait('login');
      return email.trim().toLowerCase() === ACCOUNT.email && password === ACCOUNT.password ? { name: ACCOUNT.name, email: ACCOUNT.email } : null;
    },
  };

  // ------------------------------------------------------------ state
  const load = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const state = {
    get cart() { return load('acme.cart', []); },
    set cart(v) { save('acme.cart', v); renderCartCount(); },
    get coupon() { return load('acme.coupon', null); },
    set coupon(v) { save('acme.coupon', v); },
    get user() { return load('acme.user', null); },
    set user(v) { save('acme.user', v); renderAccountLink(); },
    get orders() { return load('acme.orders', []); },
    set orders(v) { save('acme.orders', v); },
  };

  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const money = (cents) => `$${(cents / 100).toFixed(2)}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function totals() {
    const lines = state.cart.map((l) => ({ ...l, product: byId(l.id) })).filter((l) => l.product);
    const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
    const coupon = state.coupon;
    const discount = coupon ? Math.round((subtotal * coupon.percent) / 100) : 0;
    const qualifies = bugs.has('shipping-threshold') ? subtotal - discount > FREE_SHIPPING_FROM * 2 : subtotal - discount >= FREE_SHIPPING_FROM;
    const shipping = lines.length === 0 || qualifies ? 0 : SHIPPING;
    return { lines, subtotal, discount, shipping, total: subtotal - discount + shipping };
  }

  function addToCart(id, qty) {
    const cart = state.cart;
    const line = cart.find((l) => l.id === id);
    const stock = byId(id).stock;
    if (line) line.qty = Math.min(stock, line.qty + qty);
    else cart.push({ id, qty: Math.min(stock, qty) });
    state.cart = cart;
    toast(`Added ${byId(id).name} to your cart`);
  }

  // ------------------------------------------------------------ chrome
  const app = document.getElementById('app');
  function renderCartCount() {
    document.getElementById('cart-count').textContent = String(state.cart.reduce((n, l) => n + l.qty, 0));
  }
  function renderAccountLink() {
    document.getElementById('account-link').textContent = state.user ? 'Account' : 'Sign in';
  }
  let toastTimer;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 2500);
  }

  // Search suggestions: the one place latency decides whether a test sees them in time.
  const search = document.getElementById('search');
  const suggestions = document.getElementById('suggestions');
  let searchToken = 0;
  search.addEventListener('input', async () => {
    const token = ++searchToken;
    const q = search.value;
    if (q.trim().length < 2) {
      suggestions.hidden = true;
      return;
    }
    const results = await api.search(q);
    if (token !== searchToken) return;
    suggestions.innerHTML = results.length
      ? results.slice(0, 5).map((p) => `<li role="option"><a href="#/product/${p.id}">${esc(p.name)}</a></li>`).join('')
      : '<li role="option" aria-disabled="true" class="muted">No suggestions</li>';
    suggestions.hidden = false;
  });
  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    suggestions.hidden = true;
    location.hash = `#/search/${encodeURIComponent(search.value.trim())}`;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      search.focus();
    }
  });

  // ------------------------------------------------------------ pages
  const pages = {
    async catalog(params) {
      const category = params.get('category') ?? '';
      const sort = params.get('sort') ?? 'featured';
      app.innerHTML = '<p class="spinner">Loading products…</p>';
      let products = await api.products();
      if (category) products = products.filter((p) => p.category === category);
      products = [...products];
      if (sort === 'price-asc') products.sort((a, b) => (bugs.has('sort-price') ? b.price - a.price : a.price - b.price));
      if (sort === 'price-desc') products.sort((a, b) => b.price - a.price);
      if (sort === 'rating') products.sort((a, b) => b.rating - a.rating);
      app.innerHTML = `
        <h1>${category ? esc(category) : 'All products'}</h1>
        <div class="toolbar">
          <label>Category
            <select id="category">
              <option value="">All</option>
              ${CATEGORIES.map((c) => `<option ${c === category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
            </select>
          </label>
          <label>Sort by
            <select id="sort">
              ${[['featured', 'Featured'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['rating', 'Rating']]
                .map(([v, l]) => `<option value="${v}" ${v === sort ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select>
          </label>
        </div>
        <ul class="grid" aria-label="Products">
          ${products.map(productCard).join('')}
        </ul>`;
      const update = () => {
        const next = new URLSearchParams();
        const c = document.getElementById('category').value;
        const s = document.getElementById('sort').value;
        if (c) next.set('category', c);
        if (s !== 'featured') next.set('sort', s);
        location.hash = `#/?${next}`;
      };
      document.getElementById('category').addEventListener('change', update);
      document.getElementById('sort').addEventListener('change', update);
    },

    async search(params, q) {
      app.innerHTML = '<p class="spinner">Searching…</p>';
      const results = await api.search(q);
      app.innerHTML = `
        <h1>Results for “${esc(q)}”</h1>
        ${results.length ? `<ul class="grid" aria-label="Products">${results.map(productCard).join('')}</ul>` : '<p>No products match your search.</p>'}`;
    },

    async product(params, id) {
      const p = byId(id);
      if (!p) {
        app.innerHTML = '<h1>Product not found</h1>';
        return;
      }
      app.innerHTML = `
        <article class="card">
          <h1>${esc(p.name)}</h1>
          <p class="muted">${esc(p.category)} · ★ ${p.rating}</p>
          <p class="price">${money(p.price)}</p>
          ${p.stock === 0 ? '<p class="stock-out">Out of stock</p>' : `<p class="muted">${p.stock} in stock</p>`}
          <div class="toolbar">
            <label for="qty">Quantity</label>
            <button class="secondary" id="dec" aria-label="Decrease quantity">−</button>
            <input id="qty" type="number" value="1" min="1" max="${p.stock}" style="width:60px" />
            <button class="secondary" id="inc" aria-label="Increase quantity">+</button>
          </div>
          <button id="add" ${p.stock === 0 ? 'disabled' : ''}>Add to cart</button>
        </article>`;
      const qty = document.getElementById('qty');
      const clamp = (n) => Math.max(1, Math.min(p.stock || 1, n));
      document.getElementById('dec').addEventListener('click', () => (qty.value = String(clamp(Number(qty.value) - 1))));
      document.getElementById('inc').addEventListener('click', () => (qty.value = String(clamp(Number(qty.value) + 1))));
      document.getElementById('add').addEventListener('click', () => addToCart(p.id, clamp(Number(qty.value))));
    },

    async cart() {
      const t = totals();
      if (t.lines.length === 0) {
        app.innerHTML = '<h1>Your cart</h1><p>Your cart is empty.</p><a class="button" href="#/">Continue shopping</a>';
        return;
      }
      app.innerHTML = `
        <h1>Your cart</h1>
        <table aria-label="Cart">
          <thead><tr><th>Product</th><th>Quantity</th><th>Price</th><th></th></tr></thead>
          <tbody>
            ${t.lines
              .map(
                (l) => `<tr data-id="${l.id}">
                  <td>${esc(l.product.name)}</td>
                  <td><input type="number" aria-label="Quantity of ${esc(l.product.name)}" value="${l.qty}" min="1" max="${l.product.stock}" style="width:60px" /></td>
                  <td>${money(l.product.price * l.qty)}</td>
                  <td><button class="secondary remove">Remove</button></td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <form id="coupon-form" class="toolbar" style="margin-top:16px">
          <label for="coupon" class="sr-only">Coupon code</label>
          <input id="coupon" placeholder="Coupon code" value="${esc(state.coupon?.code ?? '')}" />
          <button class="secondary">Apply</button>
          <span id="coupon-message" role="status"></span>
        </form>
        ${totalsBlock(t)}
        <p><a class="button" href="#/checkout">Checkout</a></p>`;
      app.querySelectorAll('tbody tr').forEach((row) => {
        const id = row.dataset.id;
        row.querySelector('input').addEventListener('change', (e) => {
          const cart = state.cart;
          cart.find((l) => l.id === id).qty = Math.max(1, Math.min(byId(id).stock, Number(e.target.value) || 1));
          state.cart = cart;
          pages.cart();
        });
        row.querySelector('.remove').addEventListener('click', () => {
          state.cart = state.cart.filter((l) => l.id !== id);
          pages.cart();
        });
      });
      document.getElementById('coupon-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = document.getElementById('coupon-message');
        message.textContent = 'Checking…';
        const coupon = await api.coupon(document.getElementById('coupon').value);
        if (!coupon) {
          message.innerHTML = '<span class="error">This coupon is not valid.</span>';
          return;
        }
        state.coupon = coupon;
        await pages.cart();
        document.getElementById('coupon-message').textContent = `${coupon.code} applied: ${coupon.percent}% off`;
      });
    },

    async checkout() {
      const t = totals();
      if (t.lines.length === 0) {
        location.hash = '#/cart';
        return;
      }
      const user = state.user;
      app.innerHTML = `
        <h1>Checkout</h1>
        <form id="checkout" novalidate>
          <div class="field"><label for="name">Full name</label><input id="name" autocomplete="name" value="${esc(user?.name ?? '')}" /></div>
          <div class="field"><label for="email">Email</label><input id="email" type="email" value="${esc(user?.email ?? '')}" /></div>
          <div class="field"><label for="address">Address</label><input id="address" /></div>
          <div class="field"><label for="zip">Postal code</label><input id="zip" inputmode="numeric" /></div>
          <div class="field"><label for="card">Card number</label><input id="card" inputmode="numeric" /></div>
          <ul id="errors" class="error" aria-label="Errors"></ul>
          ${totalsBlock(t)}
          <button id="place">Place order</button>
        </form>`;
      document.getElementById('checkout').addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = (id) => document.getElementById(id).value.trim();
        const errors = [];
        if (!v('name')) errors.push('Enter your full name.');
        if (!/^\S+@\S+\.\S+$/.test(v('email'))) errors.push('Enter a valid email address.');
        if (!v('address')) errors.push('Enter your address.');
        if (!/^\d{5}$/.test(v('zip'))) errors.push('Enter a 5-digit postal code.');
        const list = document.getElementById('errors');
        list.innerHTML = errors.map((m) => `<li>${m}</li>`).join('');
        if (errors.length) return;
        const place = document.getElementById('place');
        place.disabled = true;
        place.textContent = 'Processing payment…';
        const paid = await api.pay(v('card'));
        if (!paid.ok) {
          list.innerHTML = `<li>${paid.error}</li>`;
          place.disabled = false;
          place.textContent = 'Place order';
          return;
        }
        const order = { id: `A-${Math.floor(10000 + Math.random() * 89999)}`, total: t.total, items: t.lines.length, placedAt: new Date().toISOString(), email: v('email') };
        state.orders = [order, ...state.orders];
        state.cart = [];
        state.coupon = null;
        location.hash = `#/order/${order.id}`;
      });
    },

    async order(params, id) {
      const order = state.orders.find((o) => o.id === id);
      app.innerHTML = order
        ? `<h1>Thank you for your order!</h1><p>Order <strong id="order-id">${esc(order.id)}</strong> is confirmed. We sent a receipt to ${esc(order.email)}.</p><p>Total paid: <span id="order-total">${money(order.total)}</span></p>`
        : '<h1>Order not found</h1>';
    },

    async login() {
      if (state.user) {
        location.hash = '#/account';
        return;
      }
      // The regression `login-label` ships: the email field loses its label.
      const emailLabel = bugs.has('login-label') ? '<span>E-mail address</span>' : '<label for="login-email">Email</label>';
      app.innerHTML = `
        <h1>Sign in</h1>
        <form id="login">
          <div class="field">${emailLabel}<input id="login-email" type="email" autocomplete="username" /></div>
          <div class="field"><label for="login-password">Password</label><input id="login-password" type="password" autocomplete="current-password" /></div>
          <p id="login-error" class="error" role="alert"></p>
          <button>Sign in</button>
        </form>`;
      document.getElementById('login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = await api.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
        if (!user) {
          document.getElementById('login-error').textContent = 'Email or password is incorrect.';
          return;
        }
        state.user = user;
        location.hash = '#/account';
      });
    },

    async account() {
      const user = state.user;
      if (!user) {
        location.hash = '#/login';
        return;
      }
      const orders = state.orders.filter((o) => o.email === user.email);
      app.innerHTML = `
        <h1>Hello, ${esc(user.name)}</h1>
        <h2>Order history</h2>
        ${orders.length
          ? `<table aria-label="Orders"><thead><tr><th>Order</th><th>Items</th><th>Total</th></tr></thead><tbody>${orders
              .map((o) => `<tr><td>${esc(o.id)}</td><td>${o.items}</td><td>${money(o.total)}</td></tr>`)
              .join('')}</tbody></table>`
          : '<p>You have not ordered anything yet.</p>'}
        <p><button id="logout" class="secondary">Sign out</button></p>`;
      document.getElementById('logout').addEventListener('click', () => {
        state.user = null;
        location.hash = '#/';
      });
    },
  };

  function productCard(p) {
    return `<li class="card" data-product="${p.id}">
      <h2><a href="#/product/${p.id}">${esc(p.name)}</a></h2>
      <p class="muted">${esc(p.category)} · ★ <span class="rating">${p.rating}</span></p>
      <p class="price">${money(p.price)}</p>
      ${p.stock === 0 ? '<p class="stock-out">Out of stock</p>' : ''}
    </li>`;
  }

  function totalsBlock(t) {
    return `<div class="totals" aria-label="Order summary">
      <div><span>Subtotal</span><span id="subtotal">${money(t.subtotal)}</span></div>
      ${t.discount ? `<div><span>Discount</span><span id="discount">−${money(t.discount)}</span></div>` : ''}
      <div><span>Shipping</span><span id="shipping">${t.shipping ? money(t.shipping) : 'Free'}</span></div>
      <div class="grand"><span>Total</span><span id="total">${money(t.total)}</span></div>
    </div>`;
  }

  // ------------------------------------------------------------ router
  async function route() {
    const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
    const params = new URLSearchParams(query);
    const [, page = '', arg = ''] = (path || '/').split('/');
    const handler = { '': pages.catalog, search: pages.search, product: pages.product, cart: pages.cart, checkout: pages.checkout, order: pages.order, login: pages.login, account: pages.account }[page];
    await (handler ?? pages.catalog)(params, decodeURIComponent(arg));
    document.title = `${document.querySelector('h1')?.textContent ?? 'Acme'} · Acme Web Shop`;
  }
  window.addEventListener('hashchange', route);
  renderCartCount();
  renderAccountLink();
  route();
})();
