const SESSION_KEY = "smartLibrarySession.v2";

const viewMeta = {
  dashboard: {
    admin: ["Dashboard", "Library overview and activity"],
    student: ["Student Dashboard", "Borrowing overview and available books"]
  },
  books: ["Books", "Catalog search and availability"],
  members: ["Members", "Student and member records"],
  issue: ["Issue Book", "Create active borrowing transactions"],
  return: {
    admin: ["Return Book", "Close transactions and calculate fines"],
    student: ["Return Book", "Return your issued books"]
  },
  transactions: ["Transactions", "Search the complete circulation history"],
  reports: ["Reports", "Fine, stock, overdue, and activity summaries"],
  settings: {
    admin: ["Settings", "Rules, credentials, and data tools"],
    student: ["Settings", "Profile and password details"]
  }
};

const ADMIN_VIEWS = ["dashboard", "books", "members", "issue", "return", "transactions", "reports", "settings"];
const STUDENT_VIEWS = ["dashboard", "books", "return", "settings"];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

let state = createDefaultState();
let activeView = "dashboard";
let activeUser = null;
let saveQueue = Promise.resolve();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  try {
    state = await window.LibraryDatabase.load(createDefaultState(), normalizeState);
  } catch (error) {
    console.error("Could not load MongoDB data.", error);
    toast("MongoDB unavailable. Start the Node server and check Atlas credentials.", "error");
    state = normalizeState(createDefaultState());
  }

  activeUser = getSessionUser();
  wireEvents();
  hydrateSession();
  renderAll();
}

function wireEvents() {
  $$(".auth-tab").forEach((button) => {
    button.addEventListener("click", () => showAuthTab(button.dataset.authTab));
  });

  $("#login-form").addEventListener("submit", handleLogin);
  $("#signup-form").addEventListener("submit", handleSignup);
  $("#logout-button").addEventListener("click", handleLogout);
  $("#menu-toggle").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $("#book-form").addEventListener("submit", handleBookSubmit);
  $("#cancel-book-edit").addEventListener("click", resetBookForm);
  $("#book-search").addEventListener("input", renderBooks);
  $("#book-category-filter").addEventListener("change", renderBooks);
  $("#book-availability-filter").addEventListener("change", renderBooks);
  $("#books-table-body").addEventListener("click", handleBookAction);

  $("#member-form").addEventListener("submit", handleMemberSubmit);
  $("#cancel-member-edit").addEventListener("click", resetMemberForm);
  $("#member-search").addEventListener("input", renderMembers);
  $("#member-status-filter").addEventListener("change", renderMembers);
  $("#members-table-body").addEventListener("click", handleMemberAction);

  $("#issue-form").addEventListener("submit", handleIssueSubmit);
  $("#issue-date").addEventListener("change", syncDueDate);

  $("#return-form").addEventListener("submit", handleReturnSubmit);
  $("#return-transaction").addEventListener("change", renderReturnPreview);
  $("#return-date").addEventListener("change", renderReturnPreview);

  $("#transaction-search").addEventListener("input", renderTransactions);
  $("#transaction-status-filter").addEventListener("change", renderTransactions);
  $("#transactions-table-body").addEventListener("click", handleTransactionAction);

  $("#settings-form").addEventListener("submit", handleSettingsSubmit);
  $("#student-settings-form").addEventListener("submit", handleStudentSettingsSubmit);
  $("#export-data").addEventListener("click", exportData);
  $("#import-data").addEventListener("change", importData);
  $("#clear-data").addEventListener("click", clearLibraryData);
}

function createDefaultState() {
  return {
    settings: {
      libraryName: "Smart Library",
      fineRate: 5,
      defaultLoanDays: 14,
      username: "Akanksha",
      password: "Akanksha12"
    },
    users: [
      {
        id: "U001",
        username: "Akanksha",
        password: "Akanksha12",
        role: "admin",
        name: "Admin",
        email: "",
        memberId: "",
        status: "Active",
        createdAt: todayISO()
      }
    ],
    books: [],
    members: [],
    transactions: []
  };
}

function normalizeState(data) {
  const defaults = createDefaultState();
  const settings = { ...defaults.settings, ...(data?.settings || {}) };
  let users = Array.isArray(data?.users) ? data.users : [];

  users = users.map((user, index) => ({
    id: user.id || `U${String(index + 1).padStart(3, "0")}`,
    username: String(user.username || "").trim(),
    password: String(user.password || ""),
    role: user.role === "admin" ? "admin" : "student",
    name: user.name || user.fullName || user.username || "User",
    email: user.email || "",
    memberId: user.memberId || "",
    status: user.status || "Active",
    createdAt: user.createdAt || todayISO()
  })).filter((user) => user.username);

  if (!users.some((user) => user.role === "admin")) {
    const defaultAdmin = defaults.users[0];
    users.unshift({
      ...defaultAdmin,
      id: users.some((user) => user.id === defaultAdmin.id) ? nextId("U", users, "id") : defaultAdmin.id
    });
  }

  const admin = users.find((user) => user.role === "admin");
  settings.username = admin?.username || "";
  settings.password = admin?.password || "";

  return {
    settings,
    users,
    books: Array.isArray(data?.books) ? data.books : [],
    members: Array.isArray(data?.members) ? data.members : [],
    transactions: Array.isArray(data?.transactions)
      ? data.transactions.map((transaction) => ({
          ...transaction,
          finePaid: Boolean(transaction.finePaid)
        }))
      : []
  };
}

function saveState() {
  const snapshot = JSON.parse(JSON.stringify(state));
  saveQueue = saveQueue
    .then(() => window.LibraryDatabase.save(snapshot))
    .catch((error) => {
      console.error("Could not save library data.", error);
      toast("Database save failed.", "error");
    });
  return saveQueue;
}

function showAuthTab(tabName) {
  $$(".auth-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tabName);
  });
  $("#login-form").classList.toggle("hidden", tabName !== "login");
  $("#signup-form").classList.toggle("hidden", tabName !== "signup");
  $("#login-error").textContent = "";
  $("#signup-error").textContent = "";
  refreshIcons();
}

function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = String(form.get("username") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const error = $("#login-error");
  const user = state.users.find((item) => item.username.toLowerCase() === username && item.password === password);

  if (!user) {
    error.textContent = "Invalid username or password.";
    return;
  }

  if (!canUserSignIn(user)) {
    error.textContent = "This account is blocked. Contact the librarian.";
    return;
  }

  activeUser = user;
  setSessionUser(user);
  error.textContent = "";
  $("#login-form").reset();
  activeView = "dashboard";
  hydrateSession();
  renderAll();
  toast("Logged in successfully.", "success");
}

function handleSignup(event) {
  event.preventDefault();
  const name = $("#signup-name").value.trim();
  const registrationNo = $("#signup-registration").value.trim();
  const email = $("#signup-email").value.trim();
  const phone = $("#signup-phone").value.trim();
  const department = $("#signup-department").value.trim();
  const semester = $("#signup-semester").value ? Number($("#signup-semester").value) : "";
  const username = $("#signup-username").value.trim();
  const password = $("#signup-password").value;
  const error = $("#signup-error");

  if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    error.textContent = "Username already exists.";
    return;
  }

  if (state.members.some((member) => member.registrationNo.toLowerCase() === registrationNo.toLowerCase())) {
    error.textContent = "Registration number already exists.";
    return;
  }

  const memberId = nextId("M", state.members, "id");
  const user = {
    id: nextId("U", state.users, "id"),
    username,
    password,
    role: "student",
    name,
    email,
    memberId,
    status: "Active",
    createdAt: todayISO()
  };

  state.members.push({
    id: memberId,
    name,
    registrationNo,
    email,
    phone,
    department,
    semester,
    address: "",
    joinDate: todayISO(),
    status: "Active"
  });
  state.users.push(user);

  saveState();
  activeUser = user;
  setSessionUser(user);
  $("#signup-form").reset();
  activeView = "dashboard";
  hydrateSession();
  renderAll();
  toast("Student account created.", "success");
}

function handleLogout() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  activeUser = null;
  activeView = "dashboard";
  hydrateSession();
  showAuthTab("login");
  renderAll();
  toast("Logged out.");
}

function hydrateSession() {
  const isSignedIn = Boolean(activeUser);
  $("#login-screen").classList.toggle("hidden", isSignedIn);
  $("#app-shell").classList.toggle("hidden", !isSignedIn);
  document.body.dataset.role = activeUser?.role || "guest";
  configureRole();
  if (isSignedIn) {
    setDefaultDates();
  }
}

function configureRole() {
  const admin = isAdmin();
  const signedIn = Boolean(activeUser);
  $$("[data-admin-only]").forEach((element) => element.classList.toggle("hidden", !admin));
  $$("[data-student-only]").forEach((element) => element.classList.toggle("hidden", !signedIn || admin));

  const allowed = allowedViews();
  if (!allowed.includes(activeView)) {
    activeView = "dashboard";
  }

  $$(".nav-item").forEach((button) => {
    const visible = allowed.includes(button.dataset.view);
    button.classList.toggle("hidden", !visible);
    button.classList.toggle("active", button.dataset.view === activeView);
  });
}

function showView(view) {
  const allowed = allowedViews();
  activeView = allowed.includes(view) ? view : "dashboard";
  const meta = getViewMeta(activeView);
  $("#view-title").textContent = meta[0];
  $("#view-subtitle").textContent = meta[1];

  $$(".view").forEach((section) => section.classList.remove("active-view"));
  $(`#view-${activeView}`).classList.add("active-view");

  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });
  document.body.classList.remove("sidebar-open");
  renderAll();
}

function renderAll() {
  renderHeader();
  if (!activeUser) {
    refreshIcons();
    return;
  }

  renderDashboard();
  renderBooks();
  renderMembers();
  renderIssue();
  renderReturn();
  renderTransactions();
  renderReports();
  renderSettings();
  refreshIcons();
}

function renderHeader() {
  const meta = getViewMeta(activeView);
  $("#current-date").textContent = formatDateLong(todayISO());
  $("#view-title").textContent = meta[0];
  $("#view-subtitle").textContent = meta[1];
  $("#sidebar-org-name").textContent = state.settings.libraryName;
  $("#sidebar-role-label").textContent = isAdmin() ? "Admin Console" : "Student Console";
  $("#active-user-label").textContent = activeUser?.name || "Guest";
  $("#active-user-role").textContent = activeUser ? roleLabel(activeUser.role) : "Signed out";
  $("#active-user-avatar").textContent = initials(activeUser?.name || "Guest");
  configureRole();
}

function renderDashboard() {
  if (!isAdmin()) {
    renderStudentDashboard();
    return;
  }

  $("#dashboard-table-title").textContent = "Recent Transactions";
  $("#dashboard-table-subtitle").textContent = "Latest issue and return activity";
  $("#dashboard-chart-title").textContent = "Category Mix";
  $("#dashboard-chart-subtitle").textContent = "Book copies by category";

  const stats = getStats();
  renderStats("#dashboard-stats", [
    ["Book Copies", stats.totalCopies, "book-copy"],
    ["Available", stats.availableCopies, "check-circle-2"],
    ["Issued", stats.issuedCount, "arrow-up-right"],
    ["Members", stats.totalMembers, "users-round"],
    ["Overdue", stats.overdueCount, "alarm-clock"],
    ["Pending Fine", formatMoney(stats.pendingFine), "indian-rupee"]
  ]);

  const recent = [...state.transactions]
    .sort((a, b) => compareDate(descDate(b), descDate(a)))
    .slice(0, 6);

  $("#recent-transactions-body").innerHTML = recent.map(transactionRow).join("") || emptyRow(5, "No transactions yet.");
  renderBarChart("#dashboard-category-chart", categoryTotals());
}

function renderStudentDashboard() {
  $("#dashboard-table-title").textContent = "My Transactions";
  $("#dashboard-table-subtitle").textContent = "Your issue and return activity";
  $("#dashboard-chart-title").textContent = "Borrowing Status";
  $("#dashboard-chart-subtitle").textContent = "Your open, returned, and overdue books";

  const myTransactions = transactionsForActiveUser();
  const issued = myTransactions.filter((transaction) => transaction.status === "Issued");
  const overdue = issued.filter((transaction) => isOverdue(transaction));
  const returned = myTransactions.filter((transaction) => transaction.status === "Returned");
  const pendingFine = myTransactions
    .filter((transaction) => !transaction.finePaid)
    .reduce((total, transaction) => total + Number(transaction.fine || 0), 0);
  const dueSoon = issued.filter((transaction) => daysBetween(todayISO(), transaction.dueDate) >= 0 && daysBetween(todayISO(), transaction.dueDate) <= 3);

  renderStats("#dashboard-stats", [
    ["Available Books", state.books.filter((book) => Number(book.available) > 0).length, "book-open"],
    ["My Issued", issued.length, "arrow-up-right"],
    ["Due Soon", dueSoon.length, "calendar-clock"],
    ["Overdue", overdue.length, "alarm-clock"],
    ["Returned", returned.length, "circle-check"],
    ["Pending Fine", formatMoney(pendingFine), "indian-rupee"]
  ]);

  $("#recent-transactions-body").innerHTML = myTransactions
    .sort((a, b) => compareDate(descDate(b), descDate(a)))
    .slice(0, 6)
    .map(transactionRow)
    .join("") || emptyRow(5, "No transactions yet.");

  renderBarChart("#dashboard-category-chart", [
    { label: "Issued", value: issued.length },
    { label: "Returned", value: returned.length },
    { label: "Overdue", value: overdue.length }
  ]);
}

function renderBooks() {
  populateCategoryFilter();
  const search = $("#book-search").value.trim().toLowerCase();
  const category = $("#book-category-filter").value;
  const availability = $("#book-availability-filter").value;
  const showActions = isAdmin();

  const filtered = state.books.filter((book) => {
    const haystack = [book.id, book.isbn, book.title, book.author, book.category].join(" ").toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesCategory = !category || book.category === category;
    const matchesAvailability = !availability
      || (availability === "available" && Number(book.available) > 0)
      || (availability === "out" && Number(book.available) <= 0);
    return matchesSearch && matchesCategory && matchesAvailability;
  });

  $("#book-count-label").textContent = `${filtered.length} of ${state.books.length} titles shown`;
  $("#books-table-body").innerHTML = filtered.map((book) => `
    <tr>
      <td>${escapeHTML(book.id)}</td>
      <td>${escapeHTML(book.title)}</td>
      <td>${escapeHTML(book.author)}</td>
      <td>${escapeHTML(book.category)}</td>
      <td>${Number(book.quantity)}</td>
      <td>${Number(book.available)}</td>
      <td>${escapeHTML(book.shelf || "-")}</td>
      <td>${bookStatusBadge(book)}</td>
      ${showActions ? `
        <td>
          <div class="table-actions">
            <button class="table-action" type="button" data-action="edit" data-id="${escapeHTML(book.id)}" aria-label="Edit ${escapeHTML(book.title)}" title="Edit">
              <i data-lucide="pencil"></i>
            </button>
            <button class="table-action danger" type="button" data-action="delete" data-id="${escapeHTML(book.id)}" aria-label="Delete ${escapeHTML(book.title)}" title="Delete">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      ` : ""}
    </tr>
  `).join("") || emptyRow(showActions ? 9 : 8, "No books match the current filters.");
  refreshIcons();
}

function renderMembers() {
  if (!isAdmin()) return;

  const search = $("#member-search").value.trim().toLowerCase();
  const status = $("#member-status-filter").value;

  const filtered = state.members.filter((member) => {
    const haystack = [member.id, member.name, member.registrationNo, member.email, member.phone, member.department].join(" ").toLowerCase();
    return (!search || haystack.includes(search)) && (!status || member.status === status);
  });

  $("#member-count-label").textContent = `${filtered.length} of ${state.members.length} members shown`;
  $("#members-table-body").innerHTML = filtered.map((member) => `
    <tr>
      <td>${escapeHTML(member.id)}</td>
      <td>${escapeHTML(member.name)}</td>
      <td>${escapeHTML(member.registrationNo)}</td>
      <td>${escapeHTML(member.department || "-")}</td>
      <td>${escapeHTML(member.semester || "-")}</td>
      <td>${escapeHTML(member.phone || "-")}</td>
      <td>${statusBadge(member.status)}</td>
      <td>
        <div class="table-actions">
          <button class="table-action" type="button" data-action="edit" data-id="${escapeHTML(member.id)}" aria-label="Edit ${escapeHTML(member.name)}" title="Edit">
            <i data-lucide="pencil"></i>
          </button>
          <button class="table-action" type="button" data-action="toggle" data-id="${escapeHTML(member.id)}" aria-label="Toggle status for ${escapeHTML(member.name)}" title="${member.status === "Active" ? "Block" : "Unblock"}">
            <i data-lucide="${member.status === "Active" ? "ban" : "circle-check"}"></i>
          </button>
          <button class="table-action danger" type="button" data-action="delete" data-id="${escapeHTML(member.id)}" aria-label="Delete ${escapeHTML(member.name)}" title="Delete">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join("") || emptyRow(8, "No members match the current filters.");
  refreshIcons();
}

function renderIssue() {
  if (!isAdmin()) return;

  populateSelect("#issue-member", state.members.filter((member) => member.status === "Active"), "id", (member) => `${member.id} - ${member.name}`);
  populateSelect("#issue-book", state.books.filter((book) => Number(book.available) > 0), "id", (book) => `${book.id} - ${book.title} (${book.available} available)`);

  $("#issue-available-body").innerHTML = state.books
    .filter((book) => Number(book.available) > 0)
    .map((book) => `
      <tr>
        <td>${escapeHTML(book.id)}</td>
        <td>${escapeHTML(book.title)}</td>
        <td>${escapeHTML(book.author)}</td>
        <td>${Number(book.available)}</td>
        <td>${escapeHTML(book.shelf || "-")}</td>
      </tr>
    `).join("") || emptyRow(5, "No books are currently available.");
}

function renderReturn() {
  const openTransactions = issuedTransactions().filter(canAccessTransaction);
  $("#open-transactions-title").textContent = isAdmin() ? "Currently Issued" : "My Issued Books";
  $("#open-transactions-subtitle").textContent = isAdmin() ? "Open transactions" : "Books currently issued to you";

  populateSelect("#return-transaction", openTransactions, "transactionId", (transaction) => {
    return `${transaction.transactionId} - ${memberName(transaction.memberId)} / ${bookTitle(transaction.bookId)}`;
  });

  $("#open-transactions-body").innerHTML = openTransactions.map((transaction) => `
    <tr>
      <td>${escapeHTML(transaction.transactionId)}</td>
      <td>${escapeHTML(memberName(transaction.memberId))}</td>
      <td>${escapeHTML(bookTitle(transaction.bookId))}</td>
      <td>${formatDate(transaction.issueDate)}</td>
      <td>${formatDate(transaction.dueDate)}</td>
      <td>${statusBadge(displayStatus(transaction))}</td>
    </tr>
  `).join("") || emptyRow(6, isAdmin() ? "No books are currently issued." : "No books are currently issued to you.");

  renderReturnPreview();
}

function renderTransactions() {
  if (!isAdmin()) return;

  const search = $("#transaction-search").value.trim().toLowerCase();
  const status = $("#transaction-status-filter").value;

  const filtered = state.transactions.filter((transaction) => {
    const display = displayStatus(transaction);
    const haystack = [
      transaction.transactionId,
      transaction.memberId,
      transaction.bookId,
      memberName(transaction.memberId),
      bookTitle(transaction.bookId),
      transaction.issueDate,
      transaction.dueDate,
      transaction.returnDate || "",
      display
    ].join(" ").toLowerCase();

    return (!search || haystack.includes(search)) && (!status || display === status);
  }).sort((a, b) => compareDate(descDate(b), descDate(a)));

  $("#transaction-count-label").textContent = `${filtered.length} of ${state.transactions.length} transactions shown`;
  $("#transactions-table-body").innerHTML = filtered.map((transaction) => {
    const canMarkPaid = transaction.status === "Returned" && Number(transaction.fine) > 0 && !transaction.finePaid;
    return `
      <tr>
        <td>${escapeHTML(transaction.transactionId)}</td>
        <td>${escapeHTML(memberName(transaction.memberId))}</td>
        <td>${escapeHTML(bookTitle(transaction.bookId))}</td>
        <td>${formatDate(transaction.issueDate)}</td>
        <td>${formatDate(transaction.dueDate)}</td>
        <td>${transaction.returnDate ? formatDate(transaction.returnDate) : "-"}</td>
        <td>${formatMoney(transaction.fine)} ${fineBadge(transaction)}</td>
        <td>${statusBadge(displayStatus(transaction))}</td>
        <td>
          ${canMarkPaid ? `
            <button class="table-action" type="button" data-action="mark-paid" data-id="${escapeHTML(transaction.transactionId)}" aria-label="Mark fine paid" title="Mark paid">
              <i data-lucide="badge-check"></i>
            </button>
          ` : "-"}
        </td>
      </tr>
    `;
  }).join("") || emptyRow(9, "No transactions match the current filters.");
  refreshIcons();
}

function renderReports() {
  if (!isAdmin()) return;

  const stats = getStats();
  renderStats("#report-stats", [
    ["Titles", state.books.length, "book-open"],
    ["Copies", stats.totalCopies, "book-copy"],
    ["Active Members", stats.activeMembers, "user-check"],
    ["Blocked", stats.blockedMembers, "user-x"],
    ["Returned", stats.returnedCount, "circle-check"],
    ["Total Fine", formatMoney(stats.totalFine), "receipt"]
  ]);

  renderBarChart("#report-category-chart", categoryTotals());
  renderBarChart("#report-month-chart", monthlyTransactionTotals());

  const overdue = issuedTransactions().filter((transaction) => isOverdue(transaction));
  $("#overdue-report-body").innerHTML = overdue.map((transaction) => {
    const lateDays = lateDaysFor(transaction, todayISO());
    return `
      <tr>
        <td>${escapeHTML(transaction.transactionId)}</td>
        <td>${escapeHTML(memberName(transaction.memberId))}</td>
        <td>${escapeHTML(bookTitle(transaction.bookId))}</td>
        <td>${formatDate(transaction.dueDate)}</td>
        <td>${lateDays}</td>
        <td>${formatMoney(lateDays * Number(state.settings.fineRate))}</td>
      </tr>
    `;
  }).join("") || emptyRow(6, "No overdue books today.");
}

function renderSettings() {
  if (isAdmin()) {
    $("#setting-library-name").value = state.settings.libraryName;
    $("#setting-fine-rate").value = state.settings.fineRate;
    $("#setting-loan-days").value = state.settings.defaultLoanDays;
    $("#setting-username").value = activeUser.username;
    $("#setting-password").value = "";
    return;
  }

  const member = activeMember();
  $("#student-setting-name").value = activeUser.name || member?.name || "";
  $("#student-setting-email").value = activeUser.email || member?.email || "";
  $("#student-setting-phone").value = member?.phone || "";
  $("#student-setting-department").value = member?.department || "";
  $("#student-setting-semester").value = member?.semester || "";
  $("#student-setting-password").value = "";
}

function renderStats(target, stats) {
  $(target).innerHTML = stats.map(([label, value, icon]) => `
    <article class="stat-card">
      <span class="stat-icon"><i data-lucide="${icon}"></i></span>
      <div>
        <div class="stat-value">${escapeHTML(value)}</div>
        <p class="stat-label">${escapeHTML(label)}</p>
      </div>
    </article>
  `).join("");
}

function renderBarChart(target, rows) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value)));
  $(target).innerHTML = rows.map((row) => `
    <div class="bar-row">
      <span class="bar-label" title="${escapeHTML(row.label)}">${escapeHTML(row.label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width: ${Math.max(3, (Number(row.value) / max) * 100)}%"></span></span>
      <span class="bar-value">${escapeHTML(row.value)}</span>
    </div>
  `).join("") || `<p class="subtle">No data available.</p>`;
}

function transactionRow(transaction) {
  return `
    <tr>
      <td>${escapeHTML(transaction.transactionId)}</td>
      <td>${escapeHTML(memberName(transaction.memberId))}</td>
      <td>${escapeHTML(bookTitle(transaction.bookId))}</td>
      <td>${formatDate(transaction.dueDate)}</td>
      <td>${statusBadge(displayStatus(transaction))}</td>
    </tr>
  `;
}

function handleBookSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const editId = $("#book-edit-id").value;
  const book = {
    id: ($("#book-id").value.trim() || nextId("B", state.books, "id")).toUpperCase(),
    isbn: $("#book-isbn").value.trim(),
    title: $("#book-title").value.trim(),
    author: $("#book-author").value.trim(),
    category: $("#book-category").value.trim(),
    publisher: $("#book-publisher").value.trim(),
    year: Number($("#book-year").value),
    quantity: Number($("#book-quantity").value),
    available: Number($("#book-available").value),
    shelf: $("#book-shelf").value.trim()
  };

  const duplicate = state.books.some((item) => item.id === book.id && item.id !== editId);
  if (duplicate) {
    toast("Book ID already exists.", "error");
    return;
  }

  if (book.available > book.quantity) {
    toast("Available copies cannot be greater than total quantity.", "error");
    return;
  }

  const issuedCount = editId
    ? state.transactions.filter((transaction) => transaction.bookId === editId && transaction.status === "Issued").length
    : 0;
  const maxAvailable = book.quantity - issuedCount;

  if (editId && book.quantity < issuedCount) {
    toast("Quantity cannot be lower than active issued copies.", "error");
    return;
  }

  if (book.available > maxAvailable) {
    toast(`Available copies cannot exceed ${maxAvailable} while ${issuedCount} copies are issued.`, "error");
    return;
  }

  if (editId) {
    state.books = state.books.map((item) => item.id === editId ? book : item);
    state.transactions = state.transactions.map((transaction) => transaction.bookId === editId ? { ...transaction, bookId: book.id } : transaction);
    toast("Book updated.", "success");
  } else {
    state.books.push(book);
    toast("Book added.", "success");
  }

  saveState();
  resetBookForm();
  renderAll();
}

function handleBookAction(event) {
  if (!isAdmin()) return;

  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const book = state.books.find((item) => item.id === id);
  if (!book) return;

  if (action === "edit") {
    $("#book-form-title").textContent = "Edit Book";
    $("#cancel-book-edit").classList.remove("hidden");
    $("#book-edit-id").value = book.id;
    $("#book-id").value = book.id;
    $("#book-isbn").value = book.isbn;
    $("#book-title").value = book.title;
    $("#book-author").value = book.author;
    $("#book-category").value = book.category;
    $("#book-publisher").value = book.publisher;
    $("#book-year").value = book.year;
    $("#book-quantity").value = book.quantity;
    $("#book-available").value = book.available;
    $("#book-shelf").value = book.shelf;
    $("#book-title").focus();
  }

  if (action === "delete") {
    const hasTransactions = state.transactions.some((transaction) => transaction.bookId === id);
    if (hasTransactions) {
      toast("Books with transactions are kept for history.", "error");
      return;
    }
    if (confirm(`Delete ${book.title}?`)) {
      state.books = state.books.filter((item) => item.id !== id);
      saveState();
      renderAll();
      toast("Book deleted.", "success");
    }
  }
}

function resetBookForm() {
  $("#book-form").reset();
  $("#book-edit-id").value = "";
  $("#book-form-title").textContent = "Add Book";
  $("#cancel-book-edit").classList.add("hidden");
  $("#book-year").value = new Date().getFullYear();
  $("#book-quantity").value = 1;
  $("#book-available").value = 1;
}

function handleMemberSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const editId = $("#member-edit-id").value;
  const member = {
    id: ($("#member-id").value.trim() || nextId("M", state.members, "id")).toUpperCase(),
    name: $("#member-name").value.trim(),
    registrationNo: $("#member-registration").value.trim(),
    email: $("#member-email").value.trim(),
    phone: $("#member-phone").value.trim(),
    department: $("#member-department").value.trim(),
    semester: $("#member-semester").value ? Number($("#member-semester").value) : "",
    address: $("#member-address").value.trim(),
    joinDate: $("#member-join-date").value,
    status: $("#member-status").value
  };

  const duplicateId = state.members.some((item) => item.id === member.id && item.id !== editId);
  if (duplicateId) {
    toast("Member ID already exists.", "error");
    return;
  }

  const duplicateRegistration = state.members.some((item) => (
    item.registrationNo.toLowerCase() === member.registrationNo.toLowerCase() && item.id !== editId
  ));
  if (duplicateRegistration) {
    toast("Registration number already exists.", "error");
    return;
  }

  if (editId) {
    state.members = state.members.map((item) => item.id === editId ? member : item);
    state.transactions = state.transactions.map((transaction) => transaction.memberId === editId ? { ...transaction, memberId: member.id } : transaction);
    state.users = state.users.map((user) => {
      if (user.memberId !== editId) return user;
      return {
        ...user,
        memberId: member.id,
        name: member.name,
        email: member.email,
        status: member.status
      };
    });
    toast("Member updated.", "success");
  } else {
    state.members.push(member);
    toast("Member added.", "success");
  }

  saveState();
  resetMemberForm();
  renderAll();
}

function handleMemberAction(event) {
  if (!isAdmin()) return;

  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  const member = state.members.find((item) => item.id === id);
  if (!member) return;

  if (action === "edit") {
    $("#member-form-title").textContent = "Edit Member";
    $("#cancel-member-edit").classList.remove("hidden");
    $("#member-edit-id").value = member.id;
    $("#member-id").value = member.id;
    $("#member-name").value = member.name;
    $("#member-registration").value = member.registrationNo;
    $("#member-email").value = member.email;
    $("#member-phone").value = member.phone;
    $("#member-department").value = member.department;
    $("#member-semester").value = member.semester;
    $("#member-address").value = member.address;
    $("#member-join-date").value = member.joinDate;
    $("#member-status").value = member.status;
    $("#member-name").focus();
  }

  if (action === "toggle") {
    member.status = member.status === "Active" ? "Blocked" : "Active";
    state.users = state.users.map((user) => user.memberId === member.id ? { ...user, status: member.status } : user);
    saveState();
    renderAll();
    toast(`Member ${member.status.toLowerCase()}.`, "success");
  }

  if (action === "delete") {
    const hasTransactions = state.transactions.some((transaction) => transaction.memberId === id);
    if (hasTransactions) {
      toast("Members with transactions are kept for history.", "error");
      return;
    }
    if (confirm(`Delete ${member.name}?`)) {
      state.members = state.members.filter((item) => item.id !== id);
      state.users = state.users.filter((user) => user.memberId !== id);
      saveState();
      renderAll();
      toast("Member deleted.", "success");
    }
  }
}

function resetMemberForm() {
  $("#member-form").reset();
  $("#member-edit-id").value = "";
  $("#member-form-title").textContent = "Add Member";
  $("#cancel-member-edit").classList.add("hidden");
  $("#member-join-date").value = todayISO();
  $("#member-status").value = "Active";
}

function handleIssueSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const memberId = $("#issue-member").value;
  const bookId = $("#issue-book").value;
  const issueDate = $("#issue-date").value;
  const dueDate = $("#due-date").value;
  const member = state.members.find((item) => item.id === memberId);
  const book = state.books.find((item) => item.id === bookId);

  if (!member || member.status !== "Active") {
    toast("Select an active member.", "error");
    return;
  }

  if (!book || Number(book.available) <= 0) {
    toast("Selected book is not available.", "error");
    return;
  }

  if (compareDate(issueDate, dueDate) > 0) {
    toast("Due date must be after issue date.", "error");
    return;
  }

  state.transactions.push({
    transactionId: nextId("T", state.transactions, "transactionId"),
    memberId,
    bookId,
    issueDate,
    dueDate,
    returnDate: null,
    status: "Issued",
    fine: 0,
    finePaid: false
  });

  book.available = Number(book.available) - 1;
  saveState();
  setDefaultDates();
  renderAll();
  toast("Book issued.", "success");
}

function handleReturnSubmit(event) {
  event.preventDefault();
  const transactionId = $("#return-transaction").value;
  const returnDate = $("#return-date").value;
  const transaction = state.transactions.find((item) => item.transactionId === transactionId);

  if (!transaction || transaction.status !== "Issued" || !canAccessTransaction(transaction)) {
    toast("Select an issued transaction.", "error");
    return;
  }

  if (compareDate(transaction.issueDate, returnDate) > 0) {
    toast("Return date cannot be before issue date.", "error");
    return;
  }

  const lateDays = lateDaysFor(transaction, returnDate);
  transaction.returnDate = returnDate;
  transaction.status = "Returned";
  transaction.fine = lateDays * Number(state.settings.fineRate);
  transaction.finePaid = transaction.fine === 0 || (isAdmin() && $("#fine-paid").checked);

  const book = state.books.find((item) => item.id === transaction.bookId);
  if (book) {
    book.available = Math.min(Number(book.quantity), Number(book.available) + 1);
  }

  saveState();
  setDefaultDates();
  renderAll();
  toast(`Book returned. Fine: ${formatMoney(transaction.fine)}.`, "success");
}

function handleTransactionAction(event) {
  if (!isAdmin()) return;

  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const transaction = state.transactions.find((item) => item.transactionId === button.dataset.id);
  if (!transaction) return;

  if (button.dataset.action === "mark-paid") {
    transaction.finePaid = true;
    saveState();
    renderAll();
    toast("Fine marked as paid.", "success");
  }
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  if (!isAdmin()) return;

  const username = $("#setting-username").value.trim();
  const nextPassword = $("#setting-password").value;
  const duplicate = state.users.some((user) => (
    user.username.toLowerCase() === username.toLowerCase() && user.id !== activeUser.id
  ));

  if (duplicate) {
    toast("Username already exists.", "error");
    return;
  }

  const adminUser = state.users.find((user) => user.id === activeUser.id) || state.users.find((user) => user.role === "admin");
  adminUser.username = username;
  if (nextPassword) {
    adminUser.password = nextPassword;
  }

  state.settings = {
    ...state.settings,
    libraryName: $("#setting-library-name").value.trim(),
    fineRate: Number($("#setting-fine-rate").value),
    defaultLoanDays: Number($("#setting-loan-days").value),
    username: adminUser.username,
    password: adminUser.password
  };
  activeUser = adminUser;
  setSessionUser(adminUser);
  saveState();
  renderAll();
  toast("Settings saved.", "success");
}

function handleStudentSettingsSubmit(event) {
  event.preventDefault();
  if (isAdmin()) return;

  const user = state.users.find((item) => item.id === activeUser.id);
  const member = activeMember();
  const name = $("#student-setting-name").value.trim();
  const email = $("#student-setting-email").value.trim();
  const nextPassword = $("#student-setting-password").value;

  user.name = name;
  user.email = email;
  if (nextPassword) {
    user.password = nextPassword;
  }

  if (member) {
    member.name = name;
    member.email = email;
    member.phone = $("#student-setting-phone").value.trim();
    member.department = $("#student-setting-department").value.trim();
    member.semester = $("#student-setting-semester").value ? Number($("#student-setting-semester").value) : "";
  }

  activeUser = user;
  setSessionUser(user);
  saveState();
  renderAll();
  toast("Profile saved.", "success");
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "smart-library-mongodb-export.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = normalizeState(JSON.parse(reader.result));
      const currentUsername = activeUser?.username;
      state = imported;
      activeUser = state.users.find((user) => user.username === currentUsername) || state.users.find((user) => user.role === "admin");
      setSessionUser(activeUser);
      saveState();
      renderAll();
      toast("Library data imported.", "success");
    } catch (error) {
      console.error(error);
      toast("Import failed. Choose a valid JSON export.", "error");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function clearLibraryData() {
  if (!confirm("Clear all books, members, student accounts, and transactions?")) return;
  state = {
    settings: { ...state.settings },
    users: state.users.filter((user) => user.role === "admin"),
    books: [],
    members: [],
    transactions: []
  };
  activeUser = state.users.find((user) => user.id === activeUser.id) || state.users[0];
  setSessionUser(activeUser);
  saveState();
  renderAll();
  toast("Library records cleared.");
}

function setDefaultDates() {
  const today = todayISO();
  const due = addDaysISO(today, Number(state.settings.defaultLoanDays));
  $("#issue-date").value = today;
  $("#due-date").value = due;
  $("#return-date").value = today;
  $("#fine-paid").checked = false;
  resetBookForm();
  resetMemberForm();
}

function syncDueDate() {
  const issueDate = $("#issue-date").value || todayISO();
  $("#due-date").value = addDaysISO(issueDate, Number(state.settings.defaultLoanDays));
}

function renderReturnPreview() {
  const transaction = state.transactions.find((item) => item.transactionId === $("#return-transaction").value);
  const target = $("#return-preview");
  if (!transaction || !canAccessTransaction(transaction)) {
    target.innerHTML = `<div class="preview-cell"><span>Status</span><strong>No issued transaction selected</strong></div>`;
    return;
  }

  const returnDate = $("#return-date").value || todayISO();
  const lateDays = lateDaysFor(transaction, returnDate);
  const fine = lateDays * Number(state.settings.fineRate);
  target.innerHTML = `
    <div class="preview-cell"><span>Member</span><strong>${escapeHTML(memberName(transaction.memberId))}</strong></div>
    <div class="preview-cell"><span>Book</span><strong>${escapeHTML(bookTitle(transaction.bookId))}</strong></div>
    <div class="preview-cell"><span>Late Days</span><strong>${lateDays}</strong></div>
    <div class="preview-cell"><span>Fine</span><strong>${formatMoney(fine)}</strong></div>
  `;
}

function populateCategoryFilter() {
  const select = $("#book-category-filter");
  const current = select.value;
  const categories = [...new Set(state.books.map((book) => book.category).filter(Boolean))].sort();
  select.innerHTML = `<option value="">All categories</option>` + categories.map((category) => (
    `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
  )).join("");
  select.value = categories.includes(current) ? current : "";
}

function populateSelect(selector, items, valueKey, labelFactory) {
  const select = $(selector);
  const previous = select.value;

  if (!items.length) {
    select.innerHTML = `<option value="">No records available</option>`;
    return;
  }

  select.innerHTML = items.map((item) => {
    const value = item[valueKey];
    return `<option value="${escapeHTML(value)}">${escapeHTML(labelFactory(item))}</option>`;
  }).join("");
  if (items.some((item) => String(item[valueKey]) === previous)) {
    select.value = previous;
  }
}

function getStats() {
  const totalCopies = sum(state.books, "quantity");
  const availableCopies = sum(state.books, "available");
  const issued = issuedTransactions();
  const returned = state.transactions.filter((transaction) => transaction.status === "Returned");
  const overdue = issued.filter((transaction) => isOverdue(transaction));
  const totalFine = state.transactions.reduce((total, transaction) => total + Number(transaction.fine || 0), 0);
  const paidFine = state.transactions
    .filter((transaction) => transaction.finePaid)
    .reduce((total, transaction) => total + Number(transaction.fine || 0), 0);

  return {
    totalCopies,
    availableCopies,
    issuedCount: issued.length,
    returnedCount: returned.length,
    overdueCount: overdue.length,
    totalMembers: state.members.length,
    activeMembers: state.members.filter((member) => member.status === "Active").length,
    blockedMembers: state.members.filter((member) => member.status === "Blocked").length,
    totalFine,
    paidFine,
    pendingFine: totalFine - paidFine
  };
}

function categoryTotals() {
  const totals = new Map();
  state.books.forEach((book) => {
    const category = book.category || "Uncategorized";
    totals.set(category, (totals.get(category) || 0) + Number(book.quantity || 0));
  });
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function monthlyTransactionTotals() {
  const totals = new Map();
  state.transactions.forEach((transaction) => {
    const date = parseISO(transaction.issueDate);
    const label = date.toLocaleString(undefined, { month: "short", year: "2-digit" });
    totals.set(label, (totals.get(label) || 0) + 1);
  });
  return [...totals.entries()].map(([label, value]) => ({ label, value }));
}

function issuedTransactions() {
  return state.transactions.filter((transaction) => transaction.status === "Issued");
}

function transactionsForActiveUser() {
  return state.transactions.filter(canAccessTransaction);
}

function canAccessTransaction(transaction) {
  return isAdmin() || transaction.memberId === activeUser?.memberId;
}

function canUserSignIn(user) {
  if (user.status !== "Active") return false;
  if (user.role !== "student") return true;
  const member = state.members.find((item) => item.id === user.memberId);
  return !member || member.status === "Active";
}

function activeMember() {
  return state.members.find((member) => member.id === activeUser?.memberId);
}

function memberName(memberId) {
  return state.members.find((member) => member.id === memberId)?.name || memberId;
}

function bookTitle(bookId) {
  return state.books.find((book) => book.id === bookId)?.title || bookId;
}

function displayStatus(transaction) {
  if (transaction.status === "Issued" && isOverdue(transaction)) return "Overdue";
  return transaction.status;
}

function isOverdue(transaction) {
  return transaction.status === "Issued" && compareDate(transaction.dueDate, todayISO()) < 0;
}

function lateDaysFor(transaction, returnDate) {
  return Math.max(0, daysBetween(transaction.dueDate, returnDate));
}

function bookStatusBadge(book) {
  const available = Number(book.available);
  if (available <= 0) return `<span class="badge out">Out of Stock</span>`;
  if (available <= 2) return `<span class="badge low">Low Stock</span>`;
  return `<span class="badge available">Available</span>`;
}

function statusBadge(status) {
  const key = String(status).toLowerCase();
  return `<span class="badge ${escapeHTML(key)}">${escapeHTML(status)}</span>`;
}

function fineBadge(transaction) {
  const fine = Number(transaction.fine || 0);
  if (fine <= 0) return "";
  return transaction.finePaid
    ? `<span class="badge paid">Paid</span>`
    : `<span class="badge unpaid">Pending</span>`;
}

function emptyRow(colspan, text) {
  return `<tr><td class="empty-row" colspan="${colspan}">${escapeHTML(text)}</td></tr>`;
}

function sum(collection, key) {
  return collection.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function nextId(prefix, collection, field) {
  const max = collection.reduce((current, item) => {
    const number = Number(String(item[field] || "").replace(prefix, ""));
    return Number.isFinite(number) ? Math.max(current, number) : current;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function descDate(transaction) {
  return transaction.returnDate || transaction.issueDate;
}

function compareDate(a, b) {
  return parseISO(a).getTime() - parseISO(b).getTime();
}

function daysBetween(startDate, endDate) {
  const ms = parseISO(endDate).getTime() - parseISO(startDate).getTime();
  return Math.floor(ms / 86400000);
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysISO(isoDate, days) {
  const date = parseISO(isoDate);
  date.setDate(date.getDate() + Number(days));
  return toISO(date);
}

function toISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISO(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(isoDate) {
  if (!isoDate) return "-";
  return parseISO(isoDate).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateLong(isoDate) {
  return parseISO(isoDate).toLocaleDateString(undefined, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function formatMoney(value) {
  return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function allowedViews() {
  if (!activeUser) return [];
  return isAdmin() ? ADMIN_VIEWS : STUDENT_VIEWS;
}

function getViewMeta(view) {
  const meta = viewMeta[view] || viewMeta.dashboard;
  if (Array.isArray(meta)) return meta;
  return meta[activeUser?.role || "admin"] || meta.admin;
}

function isAdmin() {
  return activeUser?.role === "admin";
}

function roleLabel(role) {
  return role === "admin" ? "Admin" : "Student";
}

function initials(name) {
  return String(name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function setSessionUser(user) {
  sessionStorage.setItem(SESSION_KEY, user.username);
}

function getSessionUser() {
  // Use sessionStorage so a previous browser session never bypasses the login screen.
  // Remove the legacy persistent session key left by earlier versions of the app.
  localStorage.removeItem(SESSION_KEY);
  const username = sessionStorage.getItem(SESSION_KEY);
  if (!username) return null;
  return state.users.find((user) => user.username === username && canUserSignIn(user)) || null;
}

function toast(message, type = "") {
  const toastNode = document.createElement("div");
  toastNode.className = `toast ${type}`;
  toastNode.textContent = message;
  $("#toast-region").appendChild(toastNode);
  setTimeout(() => toastNode.remove(), 2800);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
