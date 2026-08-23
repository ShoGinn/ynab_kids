function formatDate(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getSignClass(value) {
  return Number(value) < 0 ? "negative" : "";
}

function formatTxnDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildTransactionItemHtml(transaction) {
  return `
    <li class="txn-item">
      <div class="txn-main">
        <span class="txn-payee">${escapeHtml(transaction.payee_name)}</span>
        <span class="value ${getSignClass(transaction.amount_currency)}">${escapeHtml(transaction.amount_formatted)}</span>
      </div>
      <div class="txn-sub">
        <span>${formatTxnDate(transaction.date)}</span>
        <span>${escapeHtml(transaction.memo || "")}</span>
      </div>
    </li>
  `;
}

function buildTransactionListHtml(transactions) {
  if (transactions.length === 0) {
    return '<li class="txn-empty">No recent transactions.</li>';
  }

  return transactions.map((transaction) => buildTransactionItemHtml(transaction)).join("");
}

function buildCategoryPanelHtml(category) {
  const transactions = Array.isArray(category.recent_transactions)
    ? category.recent_transactions
    : [];

  return `
    <details class="category-panel">
      <summary>
        <span class="category-title">${escapeHtml(category.name)}</span>
        <span class="category-meta">
          <span class="txn-count">${transactions.length} recent</span>
          <span class="value ${getSignClass(category.balance_currency)}">${escapeHtml(category.balance_formatted)}</span>
        </span>
      </summary>
      <ul class="txn-list">${buildTransactionListHtml(transactions)}</ul>
    </details>
  `;
}

function buildGroupCardHtml(group, index) {
  const categoryHtml = group.categories
    .map((category) => buildCategoryPanelHtml(category))
    .join("");

  return `
    <article class="card" style="animation-delay:${index * 80}ms">
      <div class="card-header">
        <h2>${group.name}</h2>
        <p class="total ${getSignClass(group.total_currency)}">${group.total_formatted}</p>
      </div>
      <div class="category-list">${categoryHtml}</div>
    </article>
  `;
}

function renderGroups(groups) {
  const container = document.querySelector("#groups");

  if (!container) {
    return;
  }

  if (groups.length === 0) {
    container.innerHTML = "<p>No groups configured yet.</p>";
    return;
  }

  container.innerHTML = groups.map((group, index) => buildGroupCardHtml(group, index)).join("");
}

async function init() {
  const status = document.querySelector("#status");
  const updatedAt = document.querySelector("#updatedAt");

  try {
    const response = await fetch(`/api/budget?v=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed loading data: ${response.status}`);
    }

    const data = await response.json();
    if (updatedAt) {
      updatedAt.textContent = `Updated: ${formatDate(data.generated_at)}`;
    }
    if (status) {
      status.textContent = "";
    }
    renderGroups(Array.isArray(data.groups) ? data.groups : []);
  } catch (error) {
    if (status) {
      status.textContent =
        "Could not load budget data. Try refreshing, or check the Railway service logs.";
    }
    console.error(error);
  }
}

await init();
