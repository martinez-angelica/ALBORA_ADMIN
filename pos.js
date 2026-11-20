(() => {
    const draftKey = 'alboraPosDraft';
    const productGrid = document.getElementById('productGrid');
    const cartItems = document.getElementById('cartItems');
    const customerNameInput = document.getElementById('customerName');
    const recordPaymentBtn = document.getElementById('recordPaymentBtn');
    const statusBox = document.getElementById('posStatus');
    const productSearch = document.getElementById('productSearch');
    const categoryFilter = document.getElementById('productCategoryFilter');
    const stockFilter = document.getElementById('productStockFilter');
    const sortSelect = document.getElementById('productSort');
    const bottleReturnPanel = document.getElementById('bottleReturnPanel');
    const bottleReturnStatus = document.getElementById('bottleReturnStatus');
    const vatRate = 0.12;
    const voucherValues = { '10': 5, '30': 20, '50': 25 };
    let catalog = [];
    let cart = [];
    let bottleReturns = [];

    function voucherCode() {
        return `ALB-RET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }

    function bottleReturnValue(item) {
        return (voucherValues[String(item.bottleSize)] || 0) * item.quantity;
    }

    function showStatus(message, isError) {
        statusBox.textContent = message;
        statusBox.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
    }

    function mapProduct(product) {
        const stock = product.stock;
        const totalStock = typeof stock === 'number' ? stock :
            stock && typeof stock === 'object'
                ? Object.values(stock).reduce((sum, amount) => sum + (Number(amount) || 0), 0)
                : 0;
        const sourceVariant = product.variant && Array.isArray(product.variant.opts) ? product.variant : null;
        const options = sourceVariant && sourceVariant.opts.length ? sourceVariant.opts : [''];
        const variants = options.map((name, index) => ({
            name,
            price: Number(sourceVariant?.prices?.[index] ?? product.price),
            stock: stock && typeof stock === 'object' ? Math.max(0, Number(stock[name]) || 0) : Math.max(0, totalStock)
        }));

        return {
            id: String(product.id || product.sku || product.name),
            sku: String(product.sku || ''),
            name: String(product.name || ''),
            category: String(product.cat || 'Other'),
            description: String(product.desc || product.type || ''),
            care: String(product.care || ''),
            location: String(product.location || ''),
            image: typeof product.img === 'string' ? product.img : '',
            threshold: Math.max(0, Number(product.threshold) || 5),
            variants,
            available: Math.max(0, totalStock),
            hasVariantStock: Boolean(stock && typeof stock === 'object')
        };
    }

    async function loadCatalog() {
        let saved;
        try {
            const stored = localStorage.getItem('alboraAdminProducts');
            saved = stored === null ? null : JSON.parse(stored);
        } catch (error) {
            throw new Error(`Saved product catalog could not be read: ${error.message}`);
        }

        let seed = null;
        if (location.protocol !== 'file:' || saved === null) {
            try {
                const response = await fetch('catalog-seed.json', { cache: 'no-store' });
                if (!response.ok) throw new Error(`Product catalog request failed with status ${response.status}`);
                seed = await response.json();
                if (!Array.isArray(seed)) throw new Error('Product catalog has an unexpected format.');
            } catch (error) {
                if (saved === null) throw new Error(`Product catalog could not be loaded: ${error.message}`);
                showStatus(`Could not check for catalog updates: ${error.message}. Showing saved products.`, true);
            }
        }

        if (saved !== null && !Array.isArray(saved)) throw new Error('Saved product catalog has an unexpected format.');
        const products = Array.isArray(saved) ? saved : seed || [];
        const existingIds = new Set(products.map(product => String(product.id || '')));
        const existingSkus = new Set(products.map(product => String(product.sku || '').toLowerCase()));
        let changed = saved === null || products.length !== (saved || []).length;
        if (Array.isArray(seed)) {
            seed.forEach(product => {
                const sku = String(product?.sku || '').toLowerCase();
                if (!product || existingIds.has(String(product.id || '')) || (sku && existingSkus.has(sku))) return;
                products.push(product);
                existingIds.add(String(product.id || ''));
                if (sku) existingSkus.add(sku);
                changed = true;
            });
        }
        if (changed) {
            try {
                localStorage.setItem('alboraAdminProducts', JSON.stringify(products));
            } catch (error) {
                throw new Error(`Catalog updates could not be saved: ${error.message}`);
            }
        }

        catalog = products
            .filter(product => product && product.active !== false && !product.archived)
            .map(mapProduct)
            .filter(product => product.name && product.variants.some(variant =>
                Number.isFinite(variant.price) && variant.price > 0));

        const categories = [...new Set(catalog.map(product => product.category))].sort((a, b) => a.localeCompare(b));
        categoryFilter.replaceChildren(new Option('All categories', ''), ...categories.map(category => new Option(category, category)));
    }

    function fallbackImage(category) {
        const art = /perfume/i.test(category)
            ? '<path d="M92 55h32v18H92zM98 73h20v20H98zM82 93h52v94H82z" rx="8"/><path d="M93 112h30v36H93z" fill="#c6a463"/>'
            : /cosmetic/i.test(category)
                ? '<path d="M92 58h32v34H92zM87 92h42v92H87z" rx="8"/><path d="M96 48h24v10H96z" fill="#b46c62"/>'
                : /jewel/i.test(category)
                    ? '<circle cx="108" cy="116" r="44" fill="none" stroke="#9c7d43" stroke-width="8"/><path d="m108 55 18 20-18 20-18-20z"/>'
                    : /flower/i.test(category)
                        ? '<path d="M108 116v68m0-45c-18-25-38-6-10 7m10 3c18-25 38-6 10 7" fill="none" stroke="#64805d" stroke-width="7"/><g fill="#c98582"><circle cx="108" cy="78" r="19"/><circle cx="88" cy="92" r="19"/><circle cx="128" cy="92" r="19"/><circle cx="94" cy="114" r="19"/><circle cx="122" cy="114" r="19"/></g><circle cx="108" cy="97" r="11" fill="#e5c16e"/>'
                        : '<path d="M62 105a46 46 0 0 1 92 0v9H62zM72 114h72l-12 38H84z" rx="10"/><path d="M89 152h38v20H89z" fill="#c6a463"/>';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 216 216"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#f2eee3"/><stop offset="1" stop-color="#ded2ba"/></linearGradient></defs><rect width="216" height="216" fill="url(#bg)"/><circle cx="158" cy="49" r="24" fill="#fff" opacity=".38"/><ellipse cx="108" cy="184" rx="67" ry="15" fill="#8e7854" opacity=".12"/><g fill="#4a463f">${art}</g></svg>`;
        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function selectedVariant(card) {
        const select = card.querySelector('.product-variant select');
        const product = catalog.find(item => item.id === card.dataset.productId);
        return product.variants[Number(select?.value || 0)] || product.variants[0];
    }

    function productStock(product, variantName) {
        return product.variants.find(variant => variant.name === variantName)?.stock ?? product.available;
    }

    function stockDescription(amount, threshold) {
        if (amount <= 0) return { text: 'Out of stock', className: 'out' };
        if (amount <= threshold) return { text: `Only ${amount} left`, className: 'low' };
        return { text: `${amount} in stock`, className: '' };
    }

    function createProductCard(product) {
        const card = document.createElement('article');
        card.className = 'product-card';
        card.dataset.productId = product.id;

        const image = document.createElement('img');
        image.className = 'product-image';
        image.src = product.image || fallbackImage(product.category);
        image.alt = `${product.name} product image`;
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            image.src = fallbackImage(product.category);
        }, { once: true });

        const body = document.createElement('div');
        body.className = 'product-card-body';
        const topline = document.createElement('div');
        topline.className = 'product-card-topline';
        const category = document.createElement('span');
        category.textContent = product.category;
        const sku = document.createElement('span');
        sku.textContent = product.sku;
        topline.append(category, sku);

        const name = document.createElement('h3');
        name.className = 'product-name';
        name.textContent = product.name;
        const description = document.createElement('p');
        description.className = 'product-description';
        description.textContent = product.description || 'Product details are not available.';
        const details = document.createElement('details');
        details.className = 'product-details';
        const detailsSummary = document.createElement('summary');
        detailsSummary.textContent = 'Care & stock details';
        details.append(detailsSummary);
        if (product.care) {
            const care = document.createElement('p');
            care.textContent = product.care;
            details.append(care);
        }
        if (product.location) {
            const location = document.createElement('p');
            location.textContent = `Stock location: ${product.location}`;
            details.append(location);
        }

        const variantWrap = document.createElement('div');
        variantWrap.className = 'product-variant';
        let variantSelect;
        if (product.variants.length > 1) {
            const label = document.createElement('label');
            label.className = 'visually-hidden';
            label.textContent = `${product.name} option`;
            variantSelect = document.createElement('select');
            variantSelect.className = 'form-select';
            variantSelect.setAttribute('aria-label', `${product.name} option`);
            product.variants.forEach((variant, index) => {
                variantSelect.add(new Option(`${variant.name} · ₱${variant.price.toLocaleString('en-PH')}`, String(index)));
            });
            label.append(variantSelect);
            variantWrap.append(label);
        } else if (product.variants[0].name) {
            variantWrap.textContent = `${product.variants[0].name}`;
        }

        const price = document.createElement('div');
        price.className = 'product-card-price';
        const stock = document.createElement('div');
        stock.className = 'product-stock';
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn btn-outline-custom product-add';
        addButton.textContent = '+ Add to cart';
        addButton.addEventListener('click', () => {
            const variant = selectedVariant(card);
            addProductToCart(product, variant);
        });

        function updateVariantSummary() {
            const variant = selectedVariant(card);
            price.textContent = `₱${variant.price.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
            const summary = stockDescription(variant.stock, product.threshold);
            stock.textContent = summary.text;
            stock.className = `product-stock ${summary.className}`;
            addButton.disabled = variant.stock <= 0;
            addButton.setAttribute('aria-label', variant.stock > 0
                ? `Add ${product.name}${variant.name ? `, ${variant.name}` : ''} to cart`
                : `${product.name} is out of stock`);
        }

        variantSelect?.addEventListener('change', updateVariantSummary);
        body.append(topline, name, description, variantWrap, price, stock);
        if (product.care || product.location) body.append(details);
        body.append(addButton);
        card.append(image, body);
        updateVariantSummary();
        return card;
    }

    function renderCatalog() {
        const query = productSearch.value.trim().toLowerCase();
        const category = categoryFilter.value;
        const stockStatus = stockFilter.value;
        let products = catalog.filter(product => {
            const searchText = [
                product.name,
                product.sku,
                product.category,
                product.description,
                product.care,
                product.location
            ].join(' ').toLowerCase();
            if (query && !searchText.includes(query)) return false;
            if (category && product.category !== category) return false;
            const available = product.available;
            if (stockStatus === 'available' && available <= 0) return false;
            if (stockStatus === 'low' && (available <= 0 || available > product.threshold)) return false;
            if (stockStatus === 'out' && available > 0) return false;
            return true;
        });

        products = [...products].sort((a, b) => {
            if (sortSelect.value === 'price-low') {
                return Math.min(...a.variants.map(variant => variant.price)) -
                    Math.min(...b.variants.map(variant => variant.price));
            }
            if (sortSelect.value === 'price-high') {
                return Math.max(...b.variants.map(variant => variant.price)) -
                    Math.max(...a.variants.map(variant => variant.price));
            }
            if (sortSelect.value === 'stock') return b.available - a.available;
            return a.name.localeCompare(b.name);
        });

        document.getElementById('productResultCount').textContent =
            `${products.length} product${products.length === 1 ? '' : 's'} found`;
        productGrid.replaceChildren();
        if (!products.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-catalog';
            empty.textContent = catalog.length
                ? 'No products match these filters. Try another search or clear the filters.'
                : 'No products are available in the catalog yet.';
            productGrid.append(empty);
            return;
        }
        products.forEach(product => productGrid.append(createProductCard(product)));
    }

    function saveDraft() {
        try {
            localStorage.setItem(draftKey, JSON.stringify({
                items: cart,
                customerName: customerNameInput.value.trim(),
                bottleReturns
            }));
            return true;
        } catch (error) {
            showStatus('Could not save this sale in browser storage. Check browser storage settings and try again.', true);
            return false;
        }
    }

    function addProductToCart(product, variant) {
        const inCart = cart.filter(item => item.productId === product.id &&
            (!product.hasVariantStock || item.variant === variant.name))
            .reduce((sum, item) => sum + item.quantity, 0);
        const available = product.hasVariantStock ? variant.stock : product.available;
        if (inCart >= available) {
            showStatus(`Only ${available - inCart} more unit(s) of ${product.name} are available.`, true);
            return;
        }
        const existing = cart.find(item => item.productId === product.id && item.variant === variant.name);
        if (existing) existing.quantity += 1;
        else cart.push({
            name: product.name,
            price: variant.price,
            quantity: 1,
            category: product.category,
            productId: product.id,
            sku: product.sku,
            variant: variant.name
        });
        if (saveDraft()) {
            renderCart();
            statusBox.classList.add('d-none');
        } else {
            if (existing) existing.quantity -= 1;
            else cart.pop();
        }
    }

    function updateCartQuantity(index, amount) {
        const item = cart[index];
        const product = catalog.find(entry => entry.id === item.productId);
        if (amount > 0 && product) {
            const available = product.hasVariantStock ? productStock(product, item.variant) : product.available;
            const inCart = cart.filter(entry => entry.productId === item.productId &&
                (!product.hasVariantStock || entry.variant === item.variant))
                .reduce((sum, entry) => sum + entry.quantity, 0);
            if (inCart >= available) {
                showStatus(`Only ${available} unit(s) of ${item.name} are available.`, true);
                return;
            }
        }
        const previousQuantity = item.quantity;
        item.quantity += amount;
        const removed = item.quantity <= 0;
        if (removed) cart.splice(index, 1);
        if (saveDraft()) {
            renderCart();
        } else if (removed) {
            cart.splice(index, 0, item);
            item.quantity = previousQuantity;
        } else {
            item.quantity = previousQuantity;
        }
    }

    function renderCart() {
        cartItems.replaceChildren();
        let quantityTotal = 0;
        let subtotal = 0;
        if (cart.length === 0 && bottleReturns.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'text-center text-muted py-4';
            emptyMessage.textContent = 'Your cart is empty';
            cartItems.append(emptyMessage);
        }

        cart.forEach((item, index) => {
            quantityTotal += item.quantity;
            subtotal += item.price * item.quantity;
            const row = document.createElement('div');
            row.className = 'cart-item';
            const name = document.createElement('div');
            name.className = 'cart-item-name';
            name.textContent = item.name;
            const details = document.createElement('div');
            details.className = 'cart-item-price';
            details.textContent = `${item.variant ? `${item.variant} · ` : ''}₱${item.price.toFixed(2)} each`;
            const controls = document.createElement('div');
            controls.className = 'qty-controls';
            const decrease = document.createElement('button');
            decrease.type = 'button';
            decrease.className = 'qty-btn';
            decrease.textContent = '−';
            decrease.setAttribute('aria-label', `Decrease ${item.name} quantity`);
            decrease.addEventListener('click', () => updateCartQuantity(index, -1));
            const quantity = document.createElement('span');
            quantity.textContent = String(item.quantity);
            const increase = document.createElement('button');
            increase.type = 'button';
            increase.className = 'qty-btn';
            increase.textContent = '+';
            increase.setAttribute('aria-label', `Increase ${item.name} quantity`);
            increase.addEventListener('click', () => updateCartQuantity(index, 1));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-btn ms-auto';
            remove.textContent = 'Remove';
            remove.addEventListener('click', () => updateCartQuantity(index, -item.quantity));
            controls.append(decrease, quantity, increase, remove);
            row.append(name, details, controls);
            cartItems.append(row);
        });

        bottleReturns.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'cart-item';
            const name = document.createElement('div');
            name.className = 'cart-item-name';
            name.textContent = `Returned bottle · ${item.bottleSize}ml`;
            const details = document.createElement('div');
            details.className = 'cart-item-price';
            details.textContent = `${item.quantity} bottle${item.quantity === 1 ? '' : 's'} · ₱${bottleReturnValue(item).toFixed(2)} return credit`;
            const controls = document.createElement('div');
            controls.className = 'qty-controls';
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-btn ms-auto';
            remove.textContent = 'Remove return';
            remove.setAttribute('aria-label', `Remove ${item.quantity} returned ${item.bottleSize}ml bottle(s)`);
            remove.addEventListener('click', () => {
                const [removed] = bottleReturns.splice(index, 1);
                if (saveDraft()) renderCart();
                else bottleReturns.splice(index, 0, removed);
            });
            controls.append(remove);
            row.append(name, details, controls);
            cartItems.append(row);
        });

        const vat = subtotal * vatRate;
        const saleGross = Number((subtotal + vat).toFixed(2));
        const returnCredit = bottleReturns.reduce((sum, item) => sum + bottleReturnValue(item), 0);
        const appliedReturnCredit = Math.min(saleGross, returnCredit);
        const voucherBalance = returnCredit - appliedReturnCredit;
        const discountRow = document.getElementById('cartBottleReturnDiscountRow');
        const voucherRow = document.getElementById('cartReturnVoucherRow');
        discountRow.classList.toggle('d-none', appliedReturnCredit <= 0);
        voucherRow.classList.toggle('d-none', voucherBalance <= 0);
        document.getElementById('cartBottleReturnDiscount').textContent = `−₱${appliedReturnCredit.toFixed(2)}`;
        document.getElementById('cartReturnVoucher').textContent = `₱${voucherBalance.toFixed(2)}`;
        document.getElementById('cartSubtitle').textContent = cart.length
            ? bottleReturns.length ? 'Sale and bottle return in progress' : 'Sale in progress'
            : bottleReturns.length ? 'Bottle return ready' : 'No items added';
        document.getElementById('cartCount').textContent = String(quantityTotal);
        document.getElementById('cartSubtotal').textContent = `₱${subtotal.toFixed(2)}`;
        document.getElementById('cartVat').textContent = `₱${vat.toFixed(2)}`;
        document.getElementById('cartTotal').textContent = `₱${(saleGross - appliedReturnCredit).toFixed(2)}`;
        recordPaymentBtn.classList.toggle('disabled', cart.length === 0 && bottleReturns.length === 0);
        recordPaymentBtn.setAttribute('aria-disabled', String(cart.length === 0 && bottleReturns.length === 0));
        recordPaymentBtn.textContent = cart.length
            ? 'Record payment →'
            : bottleReturns.length ? 'Complete return & get receipt →' : 'Record payment →';
    }

    function updateVoucherValue() {
        const size = document.getElementById('returnBottleSize').value;
        const quantity = Number(document.getElementById('returnBottleQuantity').value) || 0;
        document.getElementById('posVoucherValue').textContent =
            `₱${((voucherValues[size] || 0) * quantity).toLocaleString('en-PH')}`;
    }

    productSearch.addEventListener('input', renderCatalog);
    categoryFilter.addEventListener('change', renderCatalog);
    stockFilter.addEventListener('change', renderCatalog);
    sortSelect.addEventListener('change', renderCatalog);
    document.getElementById('resetProductFilters').addEventListener('click', () => {
        productSearch.value = '';
        categoryFilter.value = '';
        stockFilter.value = 'all';
        sortSelect.value = 'name';
        renderCatalog();
        productSearch.focus();
    });

    document.getElementById('toggleBottleReturn').addEventListener('click', () => {
        bottleReturnPanel.hidden = !bottleReturnPanel.hidden;
        document.getElementById('toggleBottleReturn').setAttribute('aria-expanded', String(!bottleReturnPanel.hidden));
        if (!bottleReturnPanel.hidden) {
            const returnNameInput = document.getElementById('returnCustomerName');
            if (!returnNameInput.value.trim()) returnNameInput.value = customerNameInput.value.trim();
            document.getElementById('returnBottleSize').focus();
        }
    });

    document.getElementById('returnBottleSize').addEventListener('change', updateVoucherValue);
    document.getElementById('returnBottleQuantity').addEventListener('input', updateVoucherValue);

    function completeReturnOnly(records) {
        try {
            const savedReceipts = JSON.parse(localStorage.getItem('alboraPosReceipts') || '[]');
            const savedReturns = JSON.parse(localStorage.getItem('alboraBottleReturns') || '[]');
            if (!Array.isArray(savedReceipts) || !Array.isArray(savedReturns)) {
                throw new Error('Saved receipt or bottle return history is not a list.');
            }

            const now = new Date();
            const receiptNumber = `RET-${now.getTime()}`;
            const receiptReturns = records.map(item => ({
                ...item,
                date: item.date || now.toISOString(),
                returnValue: bottleReturnValue(item),
                appliedDiscount: 0,
                voucherValue: bottleReturnValue(item),
                voucherCode: item.voucherCode || voucherCode()
            }));
            const receipt = {
                receiptNumber,
                createdAt: now.toISOString(),
                customerName: receiptReturns.find(item => item.customerName)?.customerName ||
                    customerNameInput.value.trim() || '',
                customerContact: '',
                items: [],
                subtotal: 0,
                vat: 0,
                discount: 0,
                total: 0,
                paymentMethod: 'Bottle return',
                bottleReturns: receiptReturns,
                returnOnly: true
            };
            const nextReceipts = [...savedReceipts, receipt];
            const nextReturns = [...savedReturns, ...receiptReturns];
            const oldReceipts = localStorage.getItem('alboraPosReceipts');
            const oldReturns = localStorage.getItem('alboraBottleReturns');
            try {
                localStorage.setItem('alboraBottleReturns', JSON.stringify(nextReturns));
                localStorage.setItem('alboraPosReceipts', JSON.stringify(nextReceipts));
                localStorage.removeItem(draftKey);
            } catch (error) {
                if (oldReturns === null) localStorage.removeItem('alboraBottleReturns');
                else localStorage.setItem('alboraBottleReturns', oldReturns);
                if (oldReceipts === null) localStorage.removeItem('alboraPosReceipts');
                else localStorage.setItem('alboraPosReceipts', oldReceipts);
                throw error;
            }
            window.location.href = 'pos_digital_reciept.html';
        } catch (error) {
            const message = `Could not save the bottle return receipt: ${error.message}`;
            bottleReturnStatus.textContent = message;
            bottleReturnStatus.className = 'form-text text-danger';
            showStatus(message, true);
        }
    }

    document.getElementById('posBottleReturnForm').addEventListener('submit', event => {
        event.preventDefault();
        const size = document.getElementById('returnBottleSize').value;
        const quantity = Number(document.getElementById('returnBottleQuantity').value);
        const customerName = document.getElementById('returnCustomerName').value.trim();
        if (!voucherValues[size] || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
            bottleReturnStatus.textContent = 'Select a valid bottle size and enter a quantity from 1 to 100.';
            bottleReturnStatus.className = 'form-text text-danger';
            return;
        }

        const record = {
            date: new Date().toISOString(),
            customerName,
            bottleSize: size,
            quantity,
            returnValue: voucherValues[size] * quantity,
            voucherCode: voucherCode()
        };
        bottleReturns.push(record);
        if (saveDraft()) {
            renderCart();
            bottleReturnStatus.textContent = cart.length
                ? `Return added. ₱${record.returnValue.toFixed(2)} credit will reduce this sale; any unused credit becomes a voucher.`
                : 'Return added. Add products to apply the credit, or complete the return to issue a voucher receipt.';
            bottleReturnStatus.className = 'form-text text-success';
            event.currentTarget.reset();
            updateVoucherValue();
        } else {
            bottleReturns.pop();
        }
    });

    customerNameInput.addEventListener('input', saveDraft);
    document.getElementById('clearCartBtn').addEventListener('click', () => {
        cart = [];
        bottleReturns = [];
        customerNameInput.value = '';
        try {
            localStorage.removeItem(draftKey);
            statusBox.classList.add('d-none');
            renderCart();
        } catch (error) {
            showStatus('Could not clear the sale from browser storage.', true);
        }
    });

    recordPaymentBtn.addEventListener('click', event => {
        if (!cart.length) {
            event.preventDefault();
            if (bottleReturns.length) completeReturnOnly(bottleReturns);
            else showStatus('Add a product or return a bottle before continuing.', true);
        } else if (!saveDraft()) {
            event.preventDefault();
        }
    });

    async function initialize() {
        try {
            await loadCatalog();
            renderCatalog();
        } catch (error) {
            showStatus(`Could not load products: ${error.message}`, true);
            document.getElementById('productResultCount').textContent = 'Catalog unavailable';
        }
        updateVoucherValue();
        try {
            const savedDraft = localStorage.getItem(draftKey);
            if (savedDraft) {
                const parsedDraft = JSON.parse(savedDraft);
                if (!parsedDraft || !Array.isArray(parsedDraft.items) ||
                    !parsedDraft.items.every(item => typeof item.name === 'string' &&
                        Number.isFinite(item.price) && item.price > 0 &&
                        Number.isInteger(item.quantity) && item.quantity > 0 &&
                        (item.category === undefined || typeof item.category === 'string'))) {
                    throw new Error('Invalid saved sale data');
                }
                cart = parsedDraft.items;
                customerNameInput.value = typeof parsedDraft.customerName === 'string' ? parsedDraft.customerName : '';
                if (parsedDraft.bottleReturns !== undefined) {
                    if (!Array.isArray(parsedDraft.bottleReturns) || !parsedDraft.bottleReturns.every(item =>
                        item && voucherValues[String(item.bottleSize)] &&
                        Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 100)) {
                        throw new Error('Invalid saved bottle return data');
                    }
                    bottleReturns = parsedDraft.bottleReturns;
                }
            }
        } catch (error) {
            cart = [];
            showStatus('Saved sale data could not be read. Clear the sale and add items again.', true);
        }
        renderCart();
    }

    initialize();
})();
