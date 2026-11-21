# Gabay sa ALBORÁ Admin

Ang dokumentong ito ay paliwanag sa mga file sa `admin` folder: para saan ang bawat page o script, paano dumadaloy ang trabaho, at saan inilalagay ang data. Filipino ang paliwanag; English ang ilang pangalan ng fields at code para tumugma sa mismong interface.

## Mahalagang malaman muna

Ang kasalukuyang admin ay browser-based prototype:

- HTML, CSS, at JavaScript ang bumubuo sa interface at mga interaction.
- `localStorage` ang imbakan ng catalog, receipts, settings, at iba pang records sa browser na ginagamit. Hindi ito shared database.
- `sessionStorage` ang pansamantalang login session. Magkakaiba ang data ng ibang browser, device, o browser profile.
- Walang backend/API o database sa mga file na inilalarawan dito. Ang login ay gumagamit ng demo credentials na nasa JavaScript, hindi ng account database.
- Ang ilang feature ay demo o interface lamang. Halimbawa, hindi totoong nagba-backup o nagre-restore ng business records ang backup page.
- May mga produktong may markang **Sample** sa starter catalog. Ang karagdagang sample POS at online-order records ay idinadagdag lamang kapag Admin ang kasalukuyang user at binuksan ang page na may `?sample=1`.
- Patakbuhin sa XAMPP/HTTP habang ginagamit, lalo na para gumana ang pag-load ng `catalog-seed.json` gamit ang `fetch()`. Huwag ituring na secure production system ang browser-only login at role checks.

## Paano magkakaugnay ang mga file

1. **`admin_login.html`** ang entry page. Kapag tama ang demo account, `admin-app.js` ang naglalagay ng role, pangalan, at expiration sa `sessionStorage`, nagtatala ng login sa activity log, at nagbubukas ng dashboard.
2. Karamihan sa admin pages ay naglo-load ng **`admin-app.js`**. Tinitingnan nito kung aling HTML page ang bukas at pinapatakbo lamang ang mga kaugnay na function—halimbawa, product rendering sa catalog page o order rendering sa orders page.
3. Ang **`catalog-seed.json`** ang panimulang listahan ng produkto. Kinokopya o dinadagdag ito sa `localStorage` catalog; ang mga pagbabagong ginawa sa admin ay doon nai-save.
4. Ang **`point_of_sales.html`** ay naglo-load ng **`pos.js`** para sa catalog, cart, bottle-return credit, at draft sale. Ang **`pos_payment_record.html`** ang nagtatapos sa sale. Pagkatapos, iniimbak nito ang receipt at stock updates sa `localStorage`, saka binubuksan ang **`pos_digital_receipt.html`**. May redirect mula sa lumang filename para sa dating links/bookmarks.
5. Ang POS receipts at product catalog ang pinanggagalingan ng ilang transaction at report pages. Ang online orders ay binabasa sa `albora-orders-v1`; kailangan munang may orders sa browser storage bago lumabas ang kaukulang online order/payment data.
6. May mga page na may sariling inline JavaScript (hal. `sales.html`, `transaction_list.html`, at `pos_digital_receipt.html`). Bukod dito, tumutulong ang shared script sa role restrictions, feedback messages, audit history, at ilang table controls.

### Mga pangunahing browser storage key

| Key | Nilalaman / gumagamit |
|---|---|
| `alboraAdminProducts` | Product catalog at stock; ginagamit ng product pages, POS, inventory, at reports. |
| `alboraPosDraft` | Kasalukuyang hindi pa kinukumpletong POS cart at customer name. |
| `alboraPosReceipts` | Nakumpletong POS sales at return receipts; ginagamit ng receipt, transaction, dashboard, at report pages. |
| `alboraStockMovements` | Stock-in, stock-out, adjustment, at POS sale movement history. |
| `alboraBottleReturns` | Mga naitalang bottle return records. |
| `albora-orders-v1` | Online order records; ginagamit ng order management, payment review, at ilang reports. |
| `alboraAdminUsers` | Mga lokal na invitation/account records sa People & Permissions page. Hindi ito ang pinagmumulan ng login credentials. |
| `alboraAdminSettings` | Business name, low-stock threshold, at session timeout preferences. |
| `alboraAdminAudit` | Activity log sa browser na ito. |
| `alboraAdminRole`, `alboraAdminUser`, `alboraAdminExpires` | Kasalukuyang login session sa `sessionStorage`. |

## Mga pahina at data file

### Login, access, at dashboard

- **`admin_login.html`** — Login form para sa Admin o Staff, at “Forgot Password?” view. Ang `switchView()` ay nagpapalit sa login at recovery panels. Nasa `admin-app.js` ang pag-check ng demo credentials at submit handler. Hindi gumagana ang password reset email; nagpapakita lamang ito ng mensaheng kailangan ng verified email service. Wala na ang self-service signup.
- **`admin_logout.html`** — Logout confirmation page. Kapag binuksan, nililinis ng shared script ang session keys at nagpapakita ng mensaheng naka-log out; may link pabalik sa login.
- **`dashboard_admin.html`** — Pangunahing overview. Ipinapakita ang sales, online orders, stock alerts, action queue, chart, at latest orders. Karamihan ng dynamic values ay nilalagyan ng `admin-app.js`, gamit ang product, POS receipt, at online order data.
- **`admin-app.js`** — Shared logic ng admin pages; kasama rito ang opt-in na pagdagdag ng magkakaugnay na Sample POS at online-order records para sa dashboard, orders, at reports.

### Products at inventory

- **`products.html`** — Catalog/list view na may search, filters, product selection, at actions para magdagdag, mag-edit, o mag-archive/magbura. Ikinokonekta ng shared script ang mga action sa product records.
- **`add_product.html`** — Standalone form para gumawa ng produkto. Bine-validate ang SKU, category, price, cost, stock, at threshold; puwedeng maghanda ng product image. Isinusulat ang bagong item sa `alboraAdminProducts`.
- **`edit_product.html`** — Standalone form na kumukuha ng produkto ayon sa `?id=...`, nagpapakita ng kasalukuyang values, at nagse-save ng pagbabago sa catalog.
- **`delete_product.html`** — Standalone confirmation para permanenteng magtanggal ng napiling produkto. Kailangang itugma ang SKU at kumpirmahin ang aksyon. Sa `products.html` naman may hiwalay na archive/restore at bulk actions. Ang add/edit/delete product actions ay nililimit ng app sa Admin role.
- **`alerts_stock.html`** — Listahan ng mga produktong mababa o ubos na ang stock, kasama ang mungkahing restock quantity. Ang “Adjust stock” ay nagbubukas ng `stock_list_update.html?id=...`.
- **`stock_list_update.html`** — Stock summary, filters, movement history, at adjustment form. Puwedeng tumanggap, magbawas, o magtakda ng eksaktong stock; nagtatala ng dahilan, actor, before/after values, at audit event.
- **`inventory.html`** — Inventory report na nag-aaggregate ng bilang ng produkto at stock ayon sa category.
- **`catalog-seed.json`** — Panimulang catalog data. Hindi ito live database; pagkatapos i-load, ang browser catalog sa `localStorage` ang ginagamit sa edits at POS.

### POS, receipts, bottle returns, at transactions

- **`point_of_sales.html`** — POS screen: catalog, search/filter/sort, cart, customer, VAT, payment continuation, at bottle-return form. Naglo-load ng `pos.js` at `admin-app.js`.
- **`pos.js`** — POS-specific behavior: naglo-load ng saved/seed catalog, gumagawa ng product cards at cart, naglilimit ng quantity ayon sa stock, nagse-save ng draft, nagkakalkula ng VAT at bottle-return credit, at nagpapasa sa payment page. Ang hiwalay na bottle return ay gumagawa rin ng return receipt. Sa successful sale, ang payment page ang nagbabawas ng stock at nagse-save ng receipt.
- **`pos_payment_record.html`** — Payment confirmation para sa draft sale. Kinukuwenta ang subtotal/VAT/discount; nangangailangan ng sapat na cash o wallet reference at confirmation. Kapag natapos, nagsusulat ito sa receipts, stock catalog, stock movements at bottle-return history kung kailangan.
- **`pos_digital_receipt.html`** — Ipinapakita ang pinakahuling valid POS receipt mula sa `alboraPosReceipts`. May print action at gumagawa ng `mailto:` o `sms:` link para buksan ang messaging app; hindi ito awtomatikong nagpapadala ng mensahe. Ang `pos_digital_reciept.html` ay compatibility redirect lang papunta rito.
- **`transaction_list.html`** — Walk-in POS transaction history. Nagfi-filter ayon sa date/payment/search, nagpapakita ng totals, nag-e-export ng CSV, at may aksyong mag-clear ng POS receipts. Tahasang hindi nito isinasama ang online orders.
- **`transaction.html`** — Transactions report tab sa report section. Sa kasalukuyang code, pangunahing report/template page ito; hindi ito ang same POS history view na may working local receipt filters (iyon ay `transaction_list.html`).
- **`bottle_returns.html`** — Karagdagang bottle-return page sa folder, bagama't hindi ito kasama sa listahang ibinigay. Ang active na bottle-return transaction flow ay nasa `point_of_sales.html` + `pos.js`; ang page na ito ay hiwalay na interface at hindi dapat ipagpalagay na kapareho ng POS persistence flow.

### Online orders at payments

- **`order_list.html`** — Order list mula sa `albora-orders-v1`, may search/filter, payment status, fulfillment stage, at links sa order detail at payment review. Ang pangalan sa tanong na `order list.html` ay may space, pero ang aktuwal na file ay `order_list.html`.
- **`order_details.html`** — Order details na binubuksan gamit ang `?id=...`. Ipinapakita ang customer, items, two-stage payments at activity timeline. Puwedeng magtakda ng shipping fee pagkatapos ma-verify ang product payment; fulfillment/tracking naman pagkatapos ma-verify ang parehong bayad.
- **`product_payment_proof.html`** — Review ng unang bayad (produkto). Ipinapakita ang proof kung may image data, at nagbibigay ng verify/reject action. Kailangan ang review checkboxes bago mag-verify; rejection ay nangangailangan ng dahilan.
- **`shipping_payment_proof.html`** — Katulad ng product proof review, para sa ikalawang bayad na shipping fee.
- **`two_stage_payment.html`** — Paliwanag/overview ng dalawang hakbang ng bayad: product muna, saka shipping kapag naitakda ang fee. Ang mismong order status update at proof verification ay ginagawa sa `order_details.html` at sa dalawang payment-proof pages.

### Sales, analytics, history, settings, at access management

- **`sales.html`** — Sales report na may date/period/category filters, charts, breakdown, at CSV export. Daily at Monthly category sales ay ipinapakita bilang doughnut chart na may total revenue sa gitna at clickable category details. Ang Top/Least ranking ay may tie-breaker at hindi inuulit ang nag-iisang produktong naibenta. May page-specific JavaScript na nagbabasa ng POS receipts, catalog, at available online order records; may malinaw na paalala kapag kasama ang Sample records.
- **`profits.html`** — Profit report na kinukuwenta ang revenue less product costs at naghahambing ng Walk-in/Online. Hindi nito ibinabawas ang operating expenses dahil hindi naka-record ang mga iyon sa prototype.
- **`product_performance.html`** — Ranking ng produkto ayon sa units/revenue/cost, top product at margin metrics, chart, at CSV export. Kinukuwenta ito ng `admin-app.js` mula sa report rows.
- **`business_analytics.html`** — Pinagsamang online/walk-in sales, gross profit, category breakdown, top products, at insights export. Ang metrics ay galing sa receipts at mga verified online product payments.
- **`historical_data.html`** — Historical-data/archive presentation page. Ibinabahagi nito ang navigation at visual theme; huwag ipagpalagay na hiwalay itong database o kumpletong data warehouse.
- **`system_settings.html`** — Business name, currency preference, low-stock threshold, at session timeout settings; may recent activity at CSV audit export. Nai-save ang settings sa `alboraAdminSettings`. Ang ilang preference, gaya ng currency, ay hindi nangangahulugang lahat ng page ay awtomatikong nagbabago ng currency.
- **`user & permissions.html`** — Lokal na invitation/account list at role/status management. Nagbibigay ito ng invitation record sa browser, hindi nag-e-email. Hindi rin nito binabago ang hardcoded demo login; hindi ito tunay na authentication/authorization service.
- **`backup & data recovery.html`** — Demo-only backup interface. Gumagawa at nagda-download ito ng metadata manifest, hindi ng business data. Malinaw na itong naka-label na preview lamang; ang restore form ay nagva-validate ng confirmation fields pero tahasang hindi nagre-restore ng live records. Kailangan ng backend bago gumawa ng totoong backup/restore.

### Mga visual asset

- **`alborá-logo.png`** — Logo na ginagamit ng karamihan ng pages.
- **`alborá-logo_white.png`** — White logo asset. Hindi ito direktang nire-reference ng kasalukuyang HTML pages sa folder.
- **`admin.png`** — Admin image asset; hindi ito direktang nire-reference ng kasalukuyang HTML pages sa folder.
- **`alert.png`** — Alert image asset; hindi ito direktang nire-reference ng kasalukuyang HTML pages sa folder.

## Ano ang ginagawa ng `admin-app.js`

Isang shared JavaScript file ito na may maraming helper at page-specific function. Sa pagsisimula, binabasa nito ang kasalukuyang filename at ginagamit ang mga `if (page === ...)` check para pumili ng tamang behavior.

- **Storage at feedback:** `readJSON()` / `writeJSON()` ang nagbabasa at nagsusulat ng JSON sa `localStorage`; `notice()` ang nagpapakita ng status/error; `escapeHTML()` ang tumutulong mag-render ng text nang ligtas sa HTML.
- **Login/access:** `signIn()`, `initializeLogin()`, `initializeAccess()`, `canVisit()`, at `applyRoleUI()` ang nagha-handle ng demo login, page access at Staff UI restrictions. Ang `installSessionControls()` at mga session helper ang nagre-refresh/nag-e-expire ng session. Client-side lamang ang mga check na ito.
- **Activity log:** `recordAudit()` ang nag-iimbak ng recent actions sa `alboraAdminAudit`. Ginagamit ito ng `renderAuditHistory()`, logout/login, changes, at export.
- **Navigation/styles:** `installSharedStyles()` at `installNavigation()` ang nagdadagdag ng shared styling/navigation behavior sa pages.
- **Product catalog:** `loadProducts()`, `normalizeProduct()`, `saveProducts()`, `productFormValues()`, `fillProductForm()`, `setupStandaloneProductPage()`, `renderProductCatalog()`, at `bindProductCatalog()` ang naglo-load, nagva-validate, nagse-save, at nagre-render ng products. Kasama rin ang photo processing, bulk tools at CSV export.
- **Inventory:** `stockCount()`, `stockStatus()`, `updateInventoryStats()`, `renderStockUpdate()`, `setupStockForm()`, `renderStockAlerts()`, at `renderInventoryReport()` ang nagko-compute at nagpapakita ng stock, alerts at movement history.
- **Dashboard at reports:** `reportingRows()` ang nagko-convert ng POS receipts at verified online order items tungo sa common report rows. Gamit ito ng dashboard, business analytics, profit report, at product performance functions. May mga date bucketing/chart helpers at `exportCSV()`.
- **People/settings/tables:** `renderUsers()` at `bindUserActions()` ang namamahala sa lokal na accounts/invitations; `bindSettings()` ang nagse-save ng settings at nagbabasa ng audit log; `enhanceTables()` at `updateTable()` ang nagdadagdag ng generic sort/search/pagination sa mga table na sakop nito.
- **Orders/payments:** `customerOrders()` ang nagbabasa ng `albora-orders-v1`; `renderOrderList()` at `renderOrderDetails()` ang nag-a-update ng order views; `initializePaymentReview()` ang nagva-verify o nagre-reject ng payment proof.
- **Startup:** `initialize()` ang unang tumatakbo. Sa login page, ikinakabit nito ang login handlers at hihinto. Sa ibang page, chine-check muna ang session/access, pagkatapos ay ikinakabit ang shared behavior at pinapatakbo ang page renderers.

## Mga limitasyon at payo bago gamitin sa totoong negosyo

1. **Gawing backend-based ang login.** Ilipat ang credential verification, password hashing, role checks, sessions, invitations at reset flow sa server. Huwag mag-imbak ng production passwords o magtiwala sa JavaScript checks.
2. **Gumamit ng database/API.** Ang `localStorage` ay hindi multi-user database, walang server backup, at madaling mawala kapag nilinis ang browser data. Hindi rin nito maayos na sini-synchronize ang magkakaibang device.
3. **Ihiwalay at i-secure ang payment/order data.** Tanging server ang dapat mag-authorize ng verification, mag-record ng proof securely, at mag-update ng stock/order totals. Pinili sa prototype na parehong Admin at Staff ay maaaring mag-adjust ng stock; browser-side role checks at `localStorage` ay hindi security boundary.
4. **Palitan ang demo backup.** Kailangan ng server-side snapshots, integrity checks, access logs, at tunay na restore workflow bago ito ituring na recovery feature.
5. **Sample records ay malinaw at opt-in.** Ang tatlong produktong Sample sa `catalog-seed.json` ay makikita sa catalog at inventory totals. Admin lamang ang makakapagdagdag ng 15 Sample POS receipts, 3 Sample online orders, at Sample opening-stock history sa pamamagitan ng pagbukas ng admin page na may `?sample=1` (hal. `dashboard_admin.html?sample=1`). Makikita ang mga ito sa dashboard, POS/stock history, order list, payment review, at reports. Hindi binabago ng seed ang kasalukuyang stock quantities at hindi ito gumagawa ng totoong bayad. Ang lumang `?demo=1` link ay tinatanggap pa rin para sa compatibility. Mananatili ang data sa browser hanggang mano-manong linisin; iwasang gamitin ang mga ito bilang tunay na benta. Mananatiling template/static-only ang mga pahinang walang reader para sa mga storage record na ito.
6. **Naayos ang receipt filename.** Ang opisyal na pangalan ay `pos_digital_receipt.html`; naka-redirect pa rin ang lumang `pos_digital_reciept.html`. Iniwan ang `order_list.html` dahil ito ang aktuwal na file name at gumagana ang mga navigation links.

