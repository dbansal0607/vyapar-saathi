// ===========================================================================
// Vyapar Saathi — app shell, router, and all page logic.
// Every number rendered here comes from a backend API response — nothing in
// this file hardcodes a business number. Search for "FIXME-DATA" if that
// ever stops being true somewhere.
// ===========================================================================

const API_BASE = window.API_BASE || "";

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "chat", label: "Saathi" },
  { id: "insights", label: "Business Insights" },
  { id: "customers", label: "Customers" },
  { id: "campaigns", label: "Campaigns" },
  { id: "transactions", label: "Transactions" },
  { id: "signals", label: "Demand Signals" },
  { id: "settings", label: "Settings" },
];

const state = {
  currentPage: "home",
  insight: null,       // cached /api/insight response
  transactions: null,  // cached /api/transactions response
  customers: null,      // cached /api/customers/lapsed response
  signals: null,        // cached /api/demand-signals response
  trend: null,          // cached /api/trend response
  campaignLog: null,    // cached /api/campaign-log response
  chatHistory: [],      // [{role: 'merchant'|'saathi', text, card?}]
};

// ---------------------------------------------------------------------------
// Fetch helper — every API call goes through this so error handling is
// consistent everywhere (loading/error states are the caller's job).
// ---------------------------------------------------------------------------
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed (${res.status})`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res; // caller handles raw response (e.g. audio blobs)
}

function errorBlock(message, retryFn) {
  const wrap = document.createElement("div");
  wrap.className = "error-block";
  wrap.innerHTML = `<div>${message}</div>`;
  const btn = document.createElement("button");
  btn.className = "btn-secondary";
  btn.textContent = "Try again";
  btn.onclick = retryFn;
  wrap.appendChild(btn);
  return wrap;
}

function skeletonRows(n, height = "60px") {
  let html = "";
  for (let i = 0; i < n; i++) {
    html += `<div class="skeleton" style="height:${height}; margin-bottom:10px;"></div>`;
  }
  return html;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function renderNav() {
  const buildNav = (containerId, onClickExtra) => {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    NAV_ITEMS.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "nav-item" + (state.currentPage === item.id ? " active" : "");
      btn.textContent = item.label;
      btn.onclick = () => {
        navigateTo(item.id);
        if (onClickExtra) onClickExtra();
      };
      el.appendChild(btn);
    });
  };
  buildNav("sidebarNav");
  buildNav("drawerNav", closeDrawer);
}

function navigateTo(pageId) {
  state.currentPage = pageId;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const target = document.querySelector(`.page[data-page="${pageId}"]`);
  if (target) target.classList.add("active");
  const navLabel = NAV_ITEMS.find((n) => n.id === pageId)?.label || "";
  document.getElementById("mobileHeaderTitle").textContent = navLabel;
  renderNav();
  loadPage(pageId);
}

function loadPage(pageId) {
  switch (pageId) {
    case "home": return loadHome();
    case "chat": return loadChat();
    case "insights": return loadInsights();
    case "customers": return loadCustomers();
    case "campaigns": return loadCampaigns();
    case "transactions": return loadTransactions();
    case "signals": return loadSignals();
    case "settings": return loadSettings();
  }
}

function openDrawer() {
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawerOverlay").classList.add("open");
}
function closeDrawer() {
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawerOverlay").classList.remove("open");
}

// ---------------------------------------------------------------------------
// Shared: fetch + cache /api/insight (used by Home, Chat, dev panel)
// ---------------------------------------------------------------------------
async function getInsight(forceRefresh = false) {
  if (state.insight && !forceRefresh) return state.insight;
  const data = await apiFetch("/api/insight");
  state.insight = data;
  return data;
}

function trendDirectionLabel(pctChange) {
  if (pctChange > 0.5) return "up";
  if (pctChange < -0.5) return "down";
  return "flat";
}

// ---------------------------------------------------------------------------
// HOME / DASHBOARD
// ---------------------------------------------------------------------------
async function loadHome() {
  const el = document.getElementById("homeContent");
  el.innerHTML = skeletonRows(1, "90px") + skeletonRows(1, "160px") + skeletonRows(1, "70px");
  try {
    const [insight, trend] = await Promise.all([getInsight(), loadTrendCached()]);
    renderHome(insight, trend);
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Saathi couldn't refresh your business insight.", loadHome));
  }
}

async function loadTrendCached() {
  if (state.trend) return state.trend;
  const data = await apiFetch("/api/trend?days=14");
  state.trend = data.series;
  return state.trend;
}

function sparklineSVG(series) {
  if (!series || series.length === 0) return "";
  const w = 100, h = 32;
  const values = series.map((p) => p.revenue);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1 || 1);
  const points = values.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (h - ((v - min) / range) * h).toFixed(1);
    return `${x},${y}`;
  }).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="40" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="#2B6CF6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function renderHome(data, trend) {
  const d = data.detection;
  const dir = trendDirectionLabel(d.pct_change);
  const el = document.getElementById("homeContent");

  el.innerHTML = `
    <div class="card-grid">
      <div class="card metric-card">
        <div class="metric-label">Sales</div>
        <div class="metric-value">${dir === "down" ? "↓" : dir === "up" ? "↑" : "→"} ${Math.abs(d.pct_change)}%</div>
        <div class="metric-sub ${dir}">vs previous 7 days</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Average bill</div>
        <div class="metric-value">₹${d.avg_bill_last7}</div>
        <div class="metric-sub">Previous ₹${d.avg_bill_prev7}</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Transactions</div>
        <div class="metric-value">${d.txn_count_last7}</div>
        <div class="metric-sub">Previous ${d.txn_count_prev7}</div>
      </div>
      <div class="card metric-card">
        <div class="metric-label">Top category</div>
        <div class="metric-value" style="font-size:19px;">${d.top_category || "—"}</div>
        <div class="metric-sub up">Trending this week</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px;">
      <div class="metric-label" style="margin-bottom:10px;">Sales trend, last 14 days</div>
      <div class="sparkline-wrap">${sparklineSVG(trend)}</div>
    </div>

    <div class="callout green">
      <div class="callout-label">Growth opportunity</div>
      <div class="callout-body">${data.insight.opportunity_headline}</div>
    </div>
    <div class="callout blue">
      <div class="callout-label">Recommended action</div>
      <div class="callout-body">${data.insight.recommended_action}</div>
    </div>

    <button class="btn-primary" id="homeReviewBtn" style="max-width:260px;">Review &amp; Launch</button>

    <div class="card" style="margin-top:24px;">
      <div class="metric-label" style="margin-bottom:4px;">New payment received</div>
      <p style="font-size:12.5px; color:var(--text-muted); margin:0 0 12px 0;">
        Demo control — stands in for Paytm's real payment webhook, which isn't wired up here.
        For merchants without an integrated billing/product system, Saathi asks what was sold
        right after each payment instead of guessing from the amount alone.
      </p>
      <div id="paymentTagWidget"></div>
    </div>
  `;

  document.getElementById("homeReviewBtn").onclick = () => navigateTo("campaigns");
  renderPaymentTagWidget();
}

// ---------------------------------------------------------------------------
// Tap-to-tag: "kya becha?" flow for merchants without product/billing
// integration. Simulates an incoming payment, then lets the merchant tag
// its category in one tap — this is real data that gets appended to
// transactions.csv via /api/tag-transaction, not a cosmetic-only demo.
// ---------------------------------------------------------------------------
function renderPaymentTagWidget() {
  const el = document.getElementById("paymentTagWidget");
  el.innerHTML = `<button class="btn-secondary" id="simulatePaymentBtn">Simulate incoming payment</button>`;
  document.getElementById("simulatePaymentBtn").onclick = simulatePayment;
}

async function simulatePayment() {
  const el = document.getElementById("paymentTagWidget");
  el.innerHTML = `<div class="loading-block" style="padding:8px 0;">Waiting for payment…</div>`;
  try {
    const data = await apiFetch("/api/simulate-payment", { method: "POST" });
    const { payment, suggested_categories } = data;
    const categories = [...suggested_categories, "Other"];
    el.innerHTML = `
      <div class="callout blue" style="margin-bottom:0;">
        <div class="callout-label">₹${payment.amount} aaya — kya becha?</div>
        <div id="tagButtons" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          ${categories.map((c) => `<button class="suggested-chip" data-category="${c}" style="background:#fff;">${c}</button>`).join("")}
        </div>
      </div>
    `;
    document.querySelectorAll("#tagButtons button").forEach((btn) => {
      btn.onclick = () => tagPayment(payment.id, btn.dataset.category);
    });
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't simulate a payment right now.", simulatePayment));
  }
}

async function tagPayment(paymentId, category) {
  const el = document.getElementById("paymentTagWidget");
  try {
    const result = await apiFetch("/api/tag-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment_id: paymentId, category }),
    });
    el.innerHTML = `<div class="callout green" style="margin-bottom:0;"><div class="callout-body">${result.message} Saved to today's transactions.</div></div>
      <button class="btn-secondary" style="margin-top:10px;" id="tagAnotherBtn">Simulate another payment</button>`;
    document.getElementById("tagAnotherBtn").onclick = simulatePayment;
    // The dataset just changed — invalidate caches that depend on it.
    state.signals = null;
    state.transactions = null;
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't save that tag — the payment may have expired.", () => renderPaymentTagWidget()));
  }
}

// ---------------------------------------------------------------------------
// SAATHI CHAT
// ---------------------------------------------------------------------------
const SUGGESTED_QUESTIONS = [
  "Why did my sales fall?",
  "Which customers are slipping away?",
  "What should I sell more this weekend?",
  "Which category is trending?",
  "What should I do next?",
];

let chatInitialized = false;

async function loadChat() {
  renderSuggestedChips();
  if (!chatInitialized) {
    chatInitialized = true;
    document.getElementById("chatForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("chatInput");
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      sendChatMessage(text);
    });
    document.getElementById("clearChatBtn").addEventListener("click", () => {
      state.chatHistory = [];
      renderChatMessages();
    });
    setupMic();
    // Seed the conversation with the demo question, once.
    sendChatMessage("Meri sale iss hafte kyun kam hui?");
  }
  // Show/hide mic button based on cached voice availability, once we know it.
  try {
    const insight = await getInsight();
    document.getElementById("micBtn").classList.toggle("hidden", !insight.voice_available);
  } catch (e) { /* insight not available yet — mic just stays hidden */ }
}

function renderSuggestedChips() {
  const row = document.getElementById("suggestedRow");
  row.innerHTML = "";
  SUGGESTED_QUESTIONS.forEach((q) => {
    const chip = document.createElement("button");
    chip.className = "suggested-chip";
    chip.textContent = q;
    chip.onclick = () => sendChatMessage(q);
    row.appendChild(chip);
  });
}

function renderChatMessages() {
  const el = document.getElementById("chatMessages");
  el.innerHTML = "";
  state.chatHistory.forEach((m) => {
    const bubble = document.createElement("div");
    bubble.className = `msg ${m.role === "merchant" ? "merchant" : "saathi"}`;
    bubble.textContent = m.text;
    el.appendChild(bubble);

    if (m.card) {
      if (m.card.opportunity_headline) {
        const c = document.createElement("div");
        c.className = "msg-card callout green";
        c.innerHTML = `<div class="callout-label">Opportunity detected</div><div class="callout-body">${m.card.opportunity_headline}</div>`;
        el.appendChild(c);
      }
      if (m.card.recommended_action) {
        const c = document.createElement("div");
        c.className = "msg-card callout blue";
        c.innerHTML = `<div class="callout-label">Recommended action</div><div class="callout-body">${m.card.recommended_action}</div>
          <button class="btn-secondary" style="margin-top:10px;" onclick="navigateTo('campaigns')">Review Campaign</button>`;
        el.appendChild(c);
      }
    }
    if (m.role === "saathi" && m.listenAvailable) {
      const listenBtn = document.createElement("button");
      listenBtn.className = "link-btn";
      listenBtn.style.marginTop = "-6px";
      listenBtn.textContent = "🔊 Listen";
      listenBtn.onclick = () => playSpeech(m.text);
      el.appendChild(listenBtn);
    }
  });
  el.scrollTop = el.scrollHeight;
}

async function sendChatMessage(text) {
  state.chatHistory.push({ role: "merchant", text });
  renderChatMessages();

  state.chatHistory.push({ role: "saathi", text: "Saathi is typing…", typing: true });
  renderTypingIndicator();

  try {
    const data = await apiFetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
    state.chatHistory.pop(); // remove typing indicator
    let voiceOn = false;
    try { voiceOn = !!(await getInsight()).voice_available; } catch (e) {}
    state.chatHistory.push({
      role: "saathi",
      text: data.answer.answer,
      card: data.answer,
      listenAvailable: voiceOn,
    });
    renderChatMessages();
  } catch (e) {
    state.chatHistory.pop();
    state.chatHistory.push({ role: "saathi", text: "Saathi couldn't reach the server just now. Please try again." });
    renderChatMessages();
  }
}

function renderTypingIndicator() {
  const el = document.getElementById("chatMessages");
  el.innerHTML = "";
  state.chatHistory.forEach((m) => {
    const bubble = document.createElement("div");
    bubble.className = `msg ${m.role === "merchant" ? "merchant" : "saathi"}${m.typing ? " typing" : ""}`;
    bubble.textContent = m.text;
    el.appendChild(bubble);
  });
  el.scrollTop = el.scrollHeight;
}

async function playSpeech(text) {
  try {
    const res = await fetch(`${API_BASE}/api/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if ((res.headers.get("content-type") || "").includes("audio")) {
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play();
    }
  } catch (e) { /* voice is optional — fail silently in the UI, already gated by the button's visibility */ }
}

let mediaRecorder = null;
let audioChunks = [];

function setupMic() {
  document.getElementById("micBtn").addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
      mediaRecorder.onstop = async () => {
        document.getElementById("micStatus").classList.add("hidden");
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", blob, "question.webm");
        try {
          const res = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: formData });
          const data = await res.json();
          if (data.available && data.text) sendChatMessage(data.text);
        } catch (e) { /* transcription optional, ignore */ }
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start();
      document.getElementById("micStatus").classList.remove("hidden");
      setTimeout(() => { if (mediaRecorder.state === "recording") mediaRecorder.stop(); }, 6000);
    } catch (e) { /* mic permission denied or unavailable — button just does nothing */ }
  });
}

// ---------------------------------------------------------------------------
// BUSINESS INSIGHTS
// ---------------------------------------------------------------------------
async function loadInsights() {
  const el = document.getElementById("insightsContent");
  el.innerHTML = skeletonRows(4, "80px");
  try {
    const [insight, signals] = await Promise.all([getInsight(), loadSignalsCached()]);
    renderInsights(insight, signals);
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't load Business Insights.", loadInsights));
  }
}

async function loadSignalsCached() {
  if (state.signals) return state.signals;
  const data = await apiFetch("/api/demand-signals");
  state.signals = data.signals;
  return state.signals;
}

function renderInsights(data, signals) {
  const d = data.detection;
  const el = document.getElementById("insightsContent");
  const risingCount = signals.filter((s) => s.direction === "up").length;
  const fallingCount = signals.filter((s) => s.direction === "down").length;

  el.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="metric-label">Sales performance</div>
      <p style="margin:6px 0 0 0; font-size:14px;">Revenue is <b>${d.pct_change < 0 ? "down" : "up"} ${Math.abs(d.pct_change)}%</b> vs the prior 7 days (${d.txn_count_last7} transactions vs ${d.txn_count_prev7} previously).</p>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="metric-label">Average bill</div>
      <p style="margin:6px 0 0 0; font-size:14px;">Average bill value moved from <b>₹${d.avg_bill_prev7}</b> to <b>₹${d.avg_bill_last7}</b>.</p>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="metric-label">Transaction activity</div>
      <p style="margin:6px 0 0 0; font-size:14px;">${d.txn_count_last7} transactions this week vs ${d.txn_count_prev7} the week before — volume is roughly stable even though revenue moved.</p>
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="metric-label">Category signals</div>
      <p style="margin:6px 0 8px 0; font-size:14px;">${risingCount} categories rising, ${fallingCount} falling this week. <a href="#" onclick="navigateTo('signals'); return false;" style="color:var(--blue);">See Demand Signals →</a></p>
    </div>
    <div class="card">
      <div class="metric-label">Customer signals</div>
      <p style="margin:6px 0 8px 0; font-size:14px;"><b>${d.lapsed_customer_count}</b> high-value customers haven't purchased in 30 days. <a href="#" onclick="navigateTo('customers'); return false;" style="color:var(--blue);">See Customers →</a></p>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------------
async function loadCustomers() {
  const el = document.getElementById("customersContent");
  el.innerHTML = skeletonRows(3, "110px");
  try {
    if (!state.customers) {
      const data = await apiFetch("/api/customers/lapsed?limit=20");
      state.customers = data;
    }
    renderCustomers(state.customers);
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't load customer data.", loadCustomers));
  }
}

function renderCustomers(data) {
  const el = document.getElementById("customersContent");
  el.innerHTML = `
    <div class="callout amber">
      <div class="callout-label">High-value customers at risk</div>
      <div class="callout-body">${data.customers.length} shown here (of your full lapsed segment) — ${data.note}</div>
    </div>
    <div class="table-toolbar">
      <input id="customerSearch" type="text" placeholder="Search by customer ID or category…" style="flex:1; min-width:200px;" />
      <select id="customerSort">
        <option value="days_desc">Longest lapsed first</option>
        <option value="spend_desc">Highest average spend first</option>
        <option value="visits_desc">Most visits first</option>
      </select>
    </div>
    <div class="customer-grid" id="customerGrid"></div>
    <button class="btn-secondary" style="margin-top:16px;" onclick="navigateTo('campaigns')">Create Campaign</button>
  `;

  const renderGrid = () => {
    const q = document.getElementById("customerSearch").value.toLowerCase();
    const sort = document.getElementById("customerSort").value;
    let list = data.customers.filter((c) =>
      c.customer_id.toLowerCase().includes(q) || (c.favorite_category || "").toLowerCase().includes(q)
    );
    if (sort === "days_desc") list.sort((a, b) => b.days_since_last_purchase - a.days_since_last_purchase);
    if (sort === "spend_desc") list.sort((a, b) => b.avg_spend - a.avg_spend);
    if (sort === "visits_desc") list.sort((a, b) => b.visit_count_90d - a.visit_count_90d);

    const grid = document.getElementById("customerGrid");
    grid.innerHTML = list.map((c) => `
      <div class="card customer-card">
        <div class="customer-id">${c.customer_id}</div>
        <div class="customer-row"><span>Last purchase</span><span>${c.days_since_last_purchase} days ago</span></div>
        <div class="customer-row"><span>Visits (90d)</span><span>${c.visit_count_90d}</span></div>
        <div class="customer-row"><span>Avg. spend</span><span>₹${c.avg_spend}</span></div>
        <div class="customer-row"><span>Favorite category</span><span>${c.favorite_category || "—"}</span></div>
      </div>
    `).join("") || `<p style="color:var(--text-muted); font-size:14px;">No customers match that search.</p>`;
  };

  document.getElementById("customerSearch").addEventListener("input", renderGrid);
  document.getElementById("customerSort").addEventListener("change", renderGrid);
  renderGrid();
}

// ---------------------------------------------------------------------------
// CAMPAIGNS
// ---------------------------------------------------------------------------
async function loadCampaigns() {
  const el = document.getElementById("campaignsContent");
  el.innerHTML = skeletonRows(2, "140px");
  try {
    const [insight, log] = await Promise.all([getInsight(), loadCampaignLogCached()]);
    renderCampaigns(insight, log);
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't load campaign data.", loadCampaigns));
  }
}

async function loadCampaignLogCached(forceRefresh = false) {
  if (state.campaignLog && !forceRefresh) return state.campaignLog;
  const data = await apiFetch("/api/campaign-log");
  state.campaignLog = data.campaigns;
  return state.campaignLog;
}

function renderCampaigns(insight, log) {
  const d = insight.detection;
  const el = document.getElementById("campaignsContent");

  el.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div class="metric-label" style="margin-bottom:10px;">Festive Win-back Campaign</div>
      <div class="customer-row"><span>Target</span><span>${d.lapsed_customer_count} high-value lapsed customers</span></div>
      <div class="customer-row"><span>Offer</span><span>${insight.insight.recommended_action}</span></div>
      <div class="customer-row"><span>Audience</span><span>Inactive 30+ days</span></div>
      <label style="display:block; font-size:12.5px; color:var(--text-muted); margin-top:14px; margin-bottom:6px;">Message preview (editable)</label>
      <textarea id="campaignMessage" rows="3" style="width:100%; border:1px solid var(--border); border-radius:10px; padding:10px; font-family:inherit; font-size:13.5px;">${insight.insight.reply_text} ${insight.insight.recommended_action}</textarea>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <button class="btn-secondary" id="editCampaignBtn">Edit</button>
        <button class="btn-primary" id="launchCampaignBtn" style="width:auto; flex:1;">Approve &amp; Launch</button>
      </div>
      <div id="launchStatus" style="margin-top:12px;"></div>
    </div>

    <div class="card">
      <div class="metric-label" style="margin-bottom:10px;">Campaign history</div>
      <div id="campaignHistory">${renderCampaignHistory(log)}</div>
    </div>
  `;

  document.getElementById("editCampaignBtn").onclick = () => {
    document.getElementById("campaignMessage").focus();
  };

  document.getElementById("launchCampaignBtn").onclick = async () => {
    const btn = document.getElementById("launchCampaignBtn");
    const statusEl = document.getElementById("launchStatus");
    btn.disabled = true;
    btn.textContent = "Launching…";
    statusEl.innerHTML = "";
    try {
      const result = await apiFetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_text: insight.insight.recommended_action,
          customer_count: d.lapsed_customer_count,
        }),
      });
      statusEl.innerHTML = `<div class="callout green"><div class="callout-label">Launched</div><div class="callout-body">Campaign launched successfully — ${result.entry.customers.length} sample customers sent to the workflow.</div></div>`;
      btn.textContent = "Launched ✓";
      state.campaignLog = null; // invalidate cache so history refetches
      const log = await loadCampaignLogCached(true);
      document.getElementById("campaignHistory").innerHTML = renderCampaignHistory(log);
    } catch (e) {
      statusEl.innerHTML = `<div class="error-block">Campaign prepared, but launching it failed. The workflow may not have run.</div>`;
      btn.disabled = false;
      btn.textContent = "Approve & Launch";
    }
  };
}

function renderCampaignHistory(log) {
  if (!log || log.length === 0) {
    return `<p style="color:var(--text-muted); font-size:13.5px;">No campaigns launched yet.</p>`;
  }
  return log.slice(0, 8).map((c) => `
    <div class="customer-row" style="padding:8px 0;">
      <span>${new Date(c.timestamp).toLocaleString()}</span>
      <span>${c.action_text} (${c.customer_count})</span>
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// TRANSACTIONS
// ---------------------------------------------------------------------------
async function loadTransactions() {
  const el = document.getElementById("transactionsContent");
  el.innerHTML = skeletonRows(6, "36px");
  try {
    if (!state.transactions) {
      const data = await apiFetch("/api/transactions?limit=300");
      state.transactions = data.transactions;
    }
    renderTransactions(state.transactions);
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't load transactions.", loadTransactions));
  }
}

function renderTransactions(transactions) {
  const el = document.getElementById("transactionsContent");
  const categories = [...new Set(transactions.map((t) => t.category))].sort();

  el.innerHTML = `
    <div class="table-toolbar">
      <input id="txnSearch" type="text" placeholder="Search customer ID…" style="flex:1; min-width:180px;" />
      <select id="txnCategoryFilter">
        <option value="">All categories</option>
        ${categories.map((c) => `<option value="${c}">${c}</option>`).join("")}
      </select>
      <select id="txnSort">
        <option value="date_desc">Newest first</option>
        <option value="date_asc">Oldest first</option>
        <option value="amount_desc">Highest amount first</option>
      </select>
    </div>
    <div class="card" style="overflow-x:auto; padding:0;">
      <table class="data-table">
        <thead><tr><th>Date</th><th>Customer</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody id="txnTableBody"></tbody>
      </table>
    </div>
  `;

  const renderRows = () => {
    const q = document.getElementById("txnSearch").value.toLowerCase();
    const cat = document.getElementById("txnCategoryFilter").value;
    const sort = document.getElementById("txnSort").value;
    let list = transactions.filter((t) =>
      (!q || t.customer_id.toLowerCase().includes(q)) && (!cat || t.category === cat)
    );
    if (sort === "date_desc") list.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (sort === "date_asc") list.sort((a, b) => (a.date > b.date ? 1 : -1));
    if (sort === "amount_desc") list.sort((a, b) => b.amount - a.amount);

    document.getElementById("txnTableBody").innerHTML = list.slice(0, 150).map((t) => `
      <tr><td>${t.date}</td><td>${t.customer_id}</td><td>${t.category}</td><td>₹${t.amount}</td></tr>
    `).join("") || `<tr><td colspan="4" style="color:var(--text-muted);">No matching transactions.</td></tr>`;
  };

  document.getElementById("txnSearch").addEventListener("input", renderRows);
  document.getElementById("txnCategoryFilter").addEventListener("change", renderRows);
  document.getElementById("txnSort").addEventListener("change", renderRows);
  renderRows();
}

// ---------------------------------------------------------------------------
// DEMAND SIGNALS
// ---------------------------------------------------------------------------
async function loadSignals() {
  const el = document.getElementById("signalsContent");
  el.innerHTML = skeletonRows(5, "48px");
  try {
    const signals = await loadSignalsCached();
    renderSignals(signals);
  } catch (e) {
    el.innerHTML = "";
    el.appendChild(errorBlock("Couldn't load demand signals.", loadSignals));
  }
}

function renderSignals(signals) {
  const el = document.getElementById("signalsContent");
  const maxShare = Math.max(...signals.map((s) => s.last7_share_pct), 1);

  el.innerHTML = `
    <div class="card">
      ${signals.map((s) => `
        <div class="signal-row">
          <div>
            <div class="signal-name">${s.category}</div>
            <div class="metric-sub">${s.last7_share_pct}% of transactions this week (was ${s.prev7_share_pct}%)</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="signal-bar-track"><div class="signal-bar-fill" style="width:${(s.last7_share_pct / maxShare) * 100}%; background:${s.direction === "up" ? "var(--green)" : s.direction === "down" ? "var(--red)" : "#B9C2D6"};"></div></div>
            <span class="badge ${s.direction}">${s.direction === "up" ? "Trending up" : s.direction === "down" ? "Trending down" : "Flat"}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
const SETTINGS_PREFS = [
  { key: "notif_growth", label: "Growth opportunity notifications", desc: "Get notified when Saathi detects a new opportunity." },
  { key: "notif_campaign", label: "Campaign reminders", desc: "Reminders to review campaigns before they expire." },
  { key: "use_memory", label: "Use previous campaign outcomes", desc: "Let Saathi factor in what's worked before (requires Cognee memory)." },
];

function loadSettings() {
  const el = document.getElementById("settingsContent");
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="metric-label">Merchant profile</div>
      <p style="margin:8px 0 0 0; font-size:15px; font-weight:700; color:var(--navy);">Sharma Garments</p>
      <p style="margin:2px 0 0 0; font-size:13px; color:var(--text-muted);">Garment Retailer</p>
      <p style="margin:10px 0 0 0; font-size:13px; color:var(--text-muted);">Language: Hindi + English</p>
    </div>
    <div class="card" id="prefsCard"></div>
  `;
  const prefsCard = document.getElementById("prefsCard");
  prefsCard.innerHTML = SETTINGS_PREFS.map((p) => `
    <div class="settings-row">
      <div>
        <div class="settings-label">${p.label}</div>
        <div class="settings-desc">${p.desc}</div>
      </div>
      <button class="toggle" data-key="${p.key}"></button>
    </div>
  `).join("");

  SETTINGS_PREFS.forEach((p) => {
    const btn = prefsCard.querySelector(`[data-key="${p.key}"]`);
    const stored = localStorage.getItem(`pref_${p.key}`) === "true";
    btn.classList.toggle("on", stored);
    btn.onclick = () => {
      const nowOn = !btn.classList.contains("on");
      btn.classList.toggle("on", nowOn);
      localStorage.setItem(`pref_${p.key}`, String(nowOn));
    };
  });
}

// ---------------------------------------------------------------------------
// DEVELOPER STATUS PANEL
// ---------------------------------------------------------------------------
async function openDevPanel() {
  const panel = document.getElementById("devPanel");
  panel.classList.remove("hidden");
  const body = document.getElementById("devPanelBody");
  body.innerHTML = "Loading…";
  try {
    const insight = await getInsight();
    const dot = (on) => `<span class="dev-dot ${on ? "on" : "off"}"></span>`;
    body.innerHTML = `
      <div class="dev-row"><span>${dot(insight.llm_source === "groq")}LLM (Groq)</span><span>${insight.llm_source === "groq" ? "Live" : "Fallback"}</span></div>
      <div class="dev-row"><span>${dot(insight.memory_available)}Memory (Cognee)</span><span>${insight.memory_available ? "Connected" : "Off"}</span></div>
      <div class="dev-row"><span>${dot(insight.voice_available)}Voice (Sarvam)</span><span>${insight.voice_available ? "Connected" : "Off"}</span></div>
      <div class="dev-row"><span>${dot(insight.n8n_configured)}Workflow (n8n)</span><span>${insight.n8n_configured ? "Connected" : "Off"}</span></div>
    `;
  } catch (e) {
    body.innerHTML = `<div style="color:#F3B9B9;">Couldn't reach the backend.</div>`;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.getElementById("hamburgerBtn").addEventListener("click", openDrawer);
document.getElementById("drawerOverlay").addEventListener("click", closeDrawer);
document.getElementById("devToggleDesktop").addEventListener("click", openDevPanel);
document.getElementById("devToggleMobile").addEventListener("click", () => { closeDrawer(); openDevPanel(); });
document.getElementById("devPanelClose").addEventListener("click", () => document.getElementById("devPanel").classList.add("hidden"));

renderNav();
navigateTo("home");
