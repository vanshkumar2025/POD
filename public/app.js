/* ═══════════════════════════════════════════════════════
   CollabSpace — Landing Page Logic
   Auth dialogs, scroll reveal, toast notifications
   ═══════════════════════════════════════════════════════ */

const authDialog = document.getElementById("auth-dialog");
const authFeedback = document.getElementById("auth-feedback");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const closeAuthDialogButton = document.getElementById("close-auth-dialog");
const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const navLogoutButton = document.getElementById("nav-logout");
const navUserChip = document.getElementById("nav-user-chip");
const toastContainer = document.getElementById("toast-container");
const passwordToggleButtons = document.querySelectorAll("[data-toggle-password]");

const guestOnlyElements = document.querySelectorAll(".guest-only");
const authOnlyElements = document.querySelectorAll(".auth-only");
const authTabs = document.querySelectorAll("[data-auth-tab]");
const authPanels = {
  login: document.getElementById("login-panel"),
  register: document.getElementById("register-panel")
};

let currentAuthMode = "register";
let currentUser = null;

/* ── Toast Notifications ─────────────────────────────── */

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-exit");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ── Form Feedback ───────────────────────────────────── */

function setFeedback(message, type = "error") {
  if (!message) {
    authFeedback.hidden = true;
    authFeedback.textContent = "";
    authFeedback.dataset.state = "";
    return;
  }

  authFeedback.hidden = false;
  authFeedback.textContent = message;
  authFeedback.dataset.state = type;
}

function setButtonBusy(button, isBusy, busyLabel) {
  if (!button) {
    return;
  }

  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.textContent.trim();
  }

  button.disabled = isBusy;
  button.textContent = isBusy ? busyLabel : button.dataset.idleLabel;
}

function clearFieldValidation(form) {
  form.querySelectorAll(".field").forEach((field) => field.classList.remove("is-invalid"));
  form.querySelectorAll("input, select").forEach((input) => input.removeAttribute("aria-invalid"));
}

function markFieldInvalid(form, name, message) {
  const input = form.querySelector(`[name="${name}"]`);

  if (!input) {
    setFeedback(message);
    return false;
  }

  clearFieldValidation(form);
  input.setAttribute("aria-invalid", "true");
  input.closest(".field")?.classList.add("is-invalid");
  setFeedback(message);
  input.focus();
  return false;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function validateRegister(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");

  if (name.length < 2) {
    return markFieldInvalid(form, "name", "Please enter your full name.");
  }

  if (!isValidEmail(email)) {
    return markFieldInvalid(form, "email", "Please enter a valid email address.");
  }

  if (password.length < 8) {
    return markFieldInvalid(form, "password", "Use a password with at least 8 characters.");
  }

  clearFieldValidation(form);
  setFeedback("");
  return true;
}

function validateLogin(form) {
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");

  if (!isValidEmail(email)) {
    return markFieldInvalid(form, "email", "Please enter the email you signed up with.");
  }

  if (!password) {
    return markFieldInvalid(form, "password", "Please enter your password.");
  }

  clearFieldValidation(form);
  setFeedback("");
  return true;
}

function focusActiveAuthField() {
  const panel = authPanels[currentAuthMode];
  const firstInput = panel?.querySelector("input:not([type='hidden']), select, textarea");
  firstInput?.focus();
}

/* ── Auth Mode Toggle ────────────────────────────────── */

function setAuthMode(mode) {
  currentAuthMode = mode;

  const isRegister = mode === "register";

  if (authTitle) {
    authTitle.textContent = isRegister ? "Create your account" : "Welcome back";
  }

  if (authSubtitle) {
    authSubtitle.textContent = isRegister
      ? "Let's set up a workspace for you and your group before the deadline hits."
      : "Dive back in and see if your teammates finished their work.";
  }

  for (const tab of authTabs) {
    const isActive = tab.dataset.authTab === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  authPanels.register.hidden = !isRegister;
  authPanels.login.hidden = isRegister;
  authPanels.register.classList.toggle("is-active", isRegister);
  authPanels.login.classList.toggle("is-active", !isRegister);
  clearFieldValidation(registerForm);
  clearFieldValidation(loginForm);
  setFeedback("");
  requestAnimationFrame(focusActiveAuthField);
}

function openAuthDialog(mode = "register") {
  setAuthMode(mode);

  if (!authDialog.open) {
    authDialog.showModal();
  }

  requestAnimationFrame(focusActiveAuthField);
}

/* ── Utilities ───────────────────────────────────────── */

function initialsFor(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

/* ── UI State ────────────────────────────────────────── */

async function updateAuthState(user) {
  currentUser = user;
  const isAuthenticated = Boolean(user);

  for (const element of guestOnlyElements) {
    element.hidden = isAuthenticated;
  }

  for (const element of authOnlyElements) {
    element.hidden = !isAuthenticated;
  }

  if (!isAuthenticated) {
    navUserChip.textContent = "";
    return;
  }

  navUserChip.textContent = `${initialsFor(user.name)} · ${user.name}`;

  // Smart Navigation Logic
  try {
    const teamsData = await request("/api/user/teams", { method: "GET" });
    navUserChip.href = "/home.html?view=profile";
  } catch (err) {
    console.warn("Could not load projects for nav context.");
  }
}

/* ── API Helper ──────────────────────────────────────── */

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let payload = {};

  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong.");
  }

  return payload;
}

/* ── Auth Actions ────────────────────────────────────── */

async function loadCurrentUser() {
  try {
    const payload = await request("/api/auth/me", { method: "GET" });
    updateAuthState(payload.user);
  } catch {
    updateAuthState(null);
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  setFeedback("");
  if (!validateRegister(registerForm)) {
    return;
  }

  const form = new FormData(registerForm);
  const submitButton = registerForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "Creating account...");

  try {
    await request("/api/auth/register", {
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        course: form.get("course"),
        year: form.get("year"),
        password: form.get("password")
      }),
      method: "POST"
    });

    showToast("Account created! Redirecting to dashboard...", "success");
    setTimeout(() => window.location.assign("/home.html?view=profile"), 800);
  } catch (error) {
    setFeedback(error.message);
  } finally {
    setButtonBusy(submitButton, false, "");
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  setFeedback("");
  if (!validateLogin(loginForm)) {
    return;
  }

  const form = new FormData(loginForm);
  const submitButton = loginForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, "Logging in...");

  try {
    await request("/api/auth/login", {
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password")
      }),
      method: "POST"
    });

    showToast("Welcome back! Opening dashboard...", "success");
    setTimeout(() => window.location.assign("/home.html?view=profile"), 800);
  } catch (error) {
    setFeedback(error.message);
  } finally {
    setButtonBusy(submitButton, false, "");
  }
}

async function handleLogout() {
  try {
    await request("/api/auth/logout", {
      body: JSON.stringify({}),
      method: "POST"
    });
  } catch {
    // Ignore logout errors and still refresh state.
  }

  updateAuthState(null);
  showToast("Signed out successfully.", "success");
  setTimeout(() => window.location.assign("/"), 500);
}

/* ── Event Listeners ─────────────────────────────────── */

for (const trigger of document.querySelectorAll("[data-open-auth]")) {
  trigger.addEventListener("click", () => {
    if (currentUser) {
      window.location.assign("/home.html?view=profile");
      return;
    }

    openAuthDialog(trigger.dataset.openAuth || "register");
  });
}

for (const tab of authTabs) {
  tab.addEventListener("click", () => {
    setAuthMode(tab.dataset.authTab || "register");
  });
}

registerForm.addEventListener("submit", handleRegisterSubmit);
loginForm.addEventListener("submit", handleLoginSubmit);
navLogoutButton.addEventListener("click", handleLogout);
closeAuthDialogButton.addEventListener("click", () => authDialog.close());

[registerForm, loginForm].forEach((form) => {
  form.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    event.target.closest(".field")?.classList.remove("is-invalid");
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      event.target.removeAttribute("aria-invalid");
    }
    if (!authFeedback.hidden) {
      setFeedback("");
    }
  });
});

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const inputId = button.dataset.togglePassword;
    const input = inputId ? document.getElementById(inputId) : null;

    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Hide" : "Show";
    button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
  });
});

// Close dialog on backdrop click
authDialog.addEventListener("click", (event) => {
  const box = authDialog.querySelector(".auth-shell");
  const target = event.target;

  if (!(target instanceof Node) || !(target instanceof HTMLElement)) {
    return;
  }

  if (!box.contains(target)) {
    authDialog.close();
  }
});

// Close dialog on Escape (built-in for dialog, but good UX to confirm)
authDialog.addEventListener("close", () => {
  setFeedback("");
});

/* ── Scroll Reveal (Intersection Observer) ───────────── */

function initScrollReveal() {
  const reveals = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    // Fallback: show everything
    reveals.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  for (const el of reveals) {
    observer.observe(el);
  }
}

/* ── Smooth scroll for anchor links ──────────────────── */

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const target = document.querySelector(anchor.getAttribute("href"));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

/* ── Init ────────────────────────────────────────────── */

const initialMode = new URLSearchParams(window.location.search).get("auth");

if (initialMode === "login" || initialMode === "register") {
  openAuthDialog(initialMode);
}

loadCurrentUser();
initScrollReveal();
