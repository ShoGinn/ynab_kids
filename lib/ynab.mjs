const API_BASE = "https://api.ynab.com/v1";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalCsv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeName(value) {
  return String(value).trim().toLowerCase();
}

function formatMilliunits(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) / 1000);
}

function toCurrencyAmount(milliunits) {
  return Number((Number(milliunits) / 1000).toFixed(2));
}

function resolvePayeeName(transaction, transactionsById) {
  const directPayee = transaction.payee_name ?? transaction.transfer_account_name ?? null;
  if (directPayee) {
    return directPayee;
  }

  if (transaction.parent_transaction_id) {
    const parent = transactionsById.get(transaction.parent_transaction_id);
    return parent?.payee_name ?? parent?.transfer_account_name ?? "Split transaction";
  }

  return "Unspecified payee";
}

async function fetchJson(url, token, description) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`${description} failed (${response.status})`);
  }

  return response.json();
}

async function fetchCategoryTransactions(planId, categoryId, token) {
  const url =
    `${API_BASE}/plans/${encodeURIComponent(planId)}/categories/` +
    `${encodeURIComponent(categoryId)}/transactions`;
  const payload = await fetchJson(url, token, "YNAB category transactions request");
  const transactions = payload?.data?.transactions;

  if (!Array.isArray(transactions)) {
    return [];
  }

  const transactionsById = new Map(
    transactions.map((transaction) => [transaction.id, transaction]),
  );

  return transactions
    .filter((transaction) => !transaction.deleted)
    .toSorted((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 30)
    .map((transaction) => ({
      date: transaction.date,
      payee_name: resolvePayeeName(transaction, transactionsById),
      memo: transaction.memo,
      amount_currency: transaction.amount_currency ?? toCurrencyAmount(transaction.amount),
      amount_formatted: transaction.amount_formatted ?? formatMilliunits(transaction.amount),
    }));
}

async function buildGroupSummary(group, allowedCategoryNames, planId, token) {
  const selectedCategories = group.categories.filter(
    (category) =>
      allowedCategoryNames.size === 0 || allowedCategoryNames.has(normalizeName(category.name)),
  );

  const categories = await Promise.all(
    selectedCategories.map(async (category) => ({
      name: category.name,
      balance_currency: category.balance_currency ?? toCurrencyAmount(category.balance),
      balance_formatted: category.balance_formatted ?? formatMilliunits(category.balance),
      recent_transactions: await fetchCategoryTransactions(planId, category.id, token),
    })),
  );

  const totalMilliunits = selectedCategories.reduce(
    (sum, category) => sum + Number(category.balance),
    0,
  );

  return {
    name: group.name,
    total_currency: Number((totalMilliunits / 1000).toFixed(2)),
    total_formatted: formatMilliunits(totalMilliunits),
    categories,
  };
}

export async function fetchBudgetData() {
  const token = requireEnv("YNAB_ACCESS_TOKEN");
  const planId = requireEnv("YNAB_PLAN_ID");
  const targetGroupIds = optionalCsv("YNAB_GROUP_IDS");
  const targetGroupNames = optionalCsv("YNAB_GROUP_NAMES");
  const targetCategoryNames = new Set(
    optionalCsv("YNAB_CATEGORY_NAMES").map((name) => normalizeName(name)),
  );

  if (targetGroupIds.length === 0 && targetGroupNames.length === 0) {
    throw new Error("Set YNAB_GROUP_IDS and/or YNAB_GROUP_NAMES");
  }

  const url = `${API_BASE}/plans/${encodeURIComponent(planId)}/categories`;
  const payload = await fetchJson(url, token, "YNAB categories request");
  const groups = payload?.data?.category_groups;
  if (!Array.isArray(groups)) {
    throw new TypeError("Unexpected YNAB categories response");
  }

  const normalizedTargetNames = new Set(targetGroupNames.map((name) => normalizeName(name)));
  const selectedGroups = groups.filter(
    (group) =>
      !group.hidden &&
      (targetGroupIds.includes(group.id) || normalizedTargetNames.has(normalizeName(group.name))),
  );
  const summaries = await Promise.all(
    selectedGroups.map((group) => buildGroupSummary(group, targetCategoryNames, planId, token)),
  );
  const filteredSummaries = summaries.filter((group) => group.categories.length > 0);

  if (filteredSummaries.length === 0) {
    throw new Error("No matching visible YNAB groups or categories");
  }

  return {
    generated_at: new Date().toISOString(),
    groups: filteredSummaries,
  };
}
