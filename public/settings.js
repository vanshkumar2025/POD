async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

let currentUser = null;
const tagState = {
  skills: [],
  workFocus: []
};

const tagConfig = {
  skills: {
    inputId: "skills-input",
    listId: "skills-tags",
    emptyLabel: "No skills added yet"
  },
  workFocus: {
    inputId: "work-focus-input",
    listId: "work-focus-tags",
    emptyLabel: "No focus areas added yet"
  }
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTag(tag) {
  return String(tag || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function parseTagInput(rawValue) {
  return String(rawValue || "")
    .split(/[,\n]/g)
    .map(normalizeTag)
    .filter(Boolean);
}

function setTagValues(key, values) {
  const uniqueTags = [];
  const seen = new Set();

  values.forEach((value) => {
    const normalized = normalizeTag(value);
    if (!normalized) {
      return;
    }

    const lookupKey = normalized.toLowerCase();
    if (seen.has(lookupKey)) {
      return;
    }

    seen.add(lookupKey);
    uniqueTags.push(normalized);
  });

  tagState[key] = uniqueTags;
  renderTagList(key);
}

function addTagValues(key, values) {
  setTagValues(key, [...tagState[key], ...values]);
}

function commitPendingTag(key) {
  const config = tagConfig[key];
  const input = document.getElementById(config.inputId);
  if (!input) {
    return;
  }

  const nextTags = parseTagInput(input.value);
  if (nextTags.length > 0) {
    addTagValues(key, nextTags);
  }

  input.value = "";
}

function renderTagList(key) {
  const config = tagConfig[key];
  const container = document.getElementById(config.listId);
  if (!container) {
    return;
  }

  const tags = Array.isArray(tagState[key]) ? tagState[key] : [];

  if (tags.length === 0) {
    container.innerHTML = `<span class="tag-editor-empty">${config.emptyLabel}</span>`;
    return;
  }

  container.innerHTML = tags.map((tag) => `
    <span class="tag-editor-pill">
      <span>${escapeHtml(tag)}</span>
      <button type="button" class="tag-editor-remove" data-tag-key="${key}" data-tag-value="${escapeHtml(tag)}" aria-label="Remove ${escapeHtml(tag)}">×</button>
    </span>
  `).join("");
}

function wireTagInput(key) {
  const config = tagConfig[key];
  const input = document.getElementById(config.inputId);
  const list = document.getElementById(config.listId);

  if (!input || !list) {
    return;
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitPendingTag(key);
      return;
    }

    if (event.key === "Backspace" && !input.value.trim() && tagState[key].length > 0) {
      const nextTags = tagState[key].slice(0, -1);
      setTagValues(key, nextTags);
    }
  });

  input.addEventListener("blur", () => {
    commitPendingTag(key);
  });

  list.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-tag-key]");
    if (!removeButton) {
      return;
    }

    const tagValue = String(removeButton.dataset.tagValue || "");
    setTagValues(
      key,
      tagState[key].filter((tag) => tag.toLowerCase() !== tagValue.toLowerCase())
    );
  });
}

async function bootstrap() {
  try {
    const payload = await request("/api/auth/me", { method: "GET" });
    currentUser = payload.user;

    document.getElementById("name").value = currentUser.name || "";
    document.getElementById("course").value = currentUser.course || "";
    document.getElementById("about").value = currentUser.about || "";
    setTagValues("skills", Array.isArray(currentUser.skills) ? currentUser.skills : []);
    setTagValues("workFocus", Array.isArray(currentUser.workFocus) ? currentUser.workFocus : []);
  } catch (err) {
    window.location.assign("/?auth=login");
  }
}

document.getElementById("settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  commitPendingTag("skills");
  commitPendingTag("workFocus");

  const button = event.target.querySelector('button[type="submit"]');
  const originalText = button.textContent;
  button.textContent = "Saving...";
  button.disabled = true;

  try {
    const body = {
      about: document.getElementById("about").value,
      course: document.getElementById("course").value,
      name: document.getElementById("name").value,
      skills: tagState.skills,
      workFocus: tagState.workFocus
    };

    const payload = await request("/api/users/profile", {
      method: "PUT",
      body: JSON.stringify(body)
    });

    currentUser = payload.user || currentUser;
    setTagValues("skills", Array.isArray(currentUser.skills) ? currentUser.skills : []);
    setTagValues("workFocus", Array.isArray(currentUser.workFocus) ? currentUser.workFocus : []);
    alert("Looking good! Profile updated.");
  } catch (err) {
    alert("Failed to save: " + err.message);
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
});

Object.keys(tagConfig).forEach(wireTagInput);
bootstrap();
