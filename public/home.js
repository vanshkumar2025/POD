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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTaskStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "done" || normalized === "completed") {
    return "Done";
  }

  if (normalized === "in progress" || normalized === "in-progress") {
    return "In Progress";
  }

  return "To Do";
}

function normalizeTags(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const tags = [];

  values.forEach((value) => {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return;
    }

    const lookupKey = normalized.toLowerCase();
    if (seen.has(lookupKey)) {
      return;
    }

    seen.add(lookupKey);
    tags.push(normalized);
  });

  return tags;
}

function inferRole(user) {
  if (user.role) {
    return user.role;
  }

  const skills = normalizeTags(user.skills);
  if (skills.some((skill) => skill.toLowerCase().includes("design"))) {
    return "Designer";
  }
  if (skills.some((skill) => skill.toLowerCase().includes("test"))) {
    return "Tester";
  }
  if (skills.some((skill) => skill.toLowerCase().includes("manage"))) {
    return "Project Manager";
  }
  if (skills.length > 0) {
    return "Developer";
  }

  return "Member";
}

function deriveFocusAreas(user) {
  const explicitFocus = normalizeTags(user.workFocus);
  if (explicitFocus.length > 0) {
    return explicitFocus;
  }

  const derived = [];
  const skills = normalizeTags(user.skills);

  skills.forEach((skill) => {
    const lowerSkill = skill.toLowerCase();
    if (
      (lowerSkill.includes("react") || lowerSkill.includes("ui") || lowerSkill.includes("figma")) &&
      !derived.includes("Frontend")
    ) {
      derived.push("Frontend");
    }
    if (
      (lowerSkill.includes("node") || lowerSkill.includes("api") || lowerSkill.includes("python")) &&
      !derived.includes("Backend")
    ) {
      derived.push("Backend");
    }
    if (
      (lowerSkill.includes("design") || lowerSkill.includes("wireframe")) &&
      !derived.includes("Design")
    ) {
      derived.push("Design");
    }
    if (
      (lowerSkill.includes("research") || lowerSkill.includes("machine learning")) &&
      !derived.includes("Research")
    ) {
      derived.push("Research");
    }
    if (lowerSkill.includes("test") && !derived.includes("QA")) {
      derived.push("QA");
    }
  });

  if (derived.length === 0) {
    derived.push("Collaboration");
  }

  return derived.slice(0, 6);
}

function getDefaultAbout(user) {
  const firstName = String(user.name || "This teammate").trim().split(/\s+/)[0] || "This teammate";
  const focusAreas = deriveFocusAreas(user).slice(0, 2);
  const focusLabel = focusAreas.length > 0 ? focusAreas.join(" and ").toLowerCase() : "collaborative project work";
  return `${firstName} enjoys contributing to ${focusLabel} and working closely with the team to keep projects moving forward.`;
}

function formatRelativeTime(dateValue) {
  const timestamp = Date.parse(dateValue || "");
  if (!Number.isFinite(timestamp)) {
    return "Recently";
  }

  const diffMs = Math.max(Date.now() - timestamp, 0);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute));
    return `${minutes}m ago`;
  }

  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour));
    return `${hours}h ago`;
  }

  const days = Math.max(1, Math.round(diffMs / day));
  return `${days}d ago`;
}

function renderTagBadges(containerId, tags, emptyLabel) {
  const container = document.getElementById(containerId);
  if (!container) {
    return;
  }

  const safeTags = normalizeTags(tags);
  if (safeTags.length === 0) {
    container.innerHTML = `<span class="skill-tag skill-tag-empty">${escapeHtml(emptyLabel)}</span>`;
    return;
  }

  container.innerHTML = safeTags
    .map((tag) => `<span class="skill-tag">${escapeHtml(tag)}</span>`)
    .join("");
}

function renderStaticProfile(user) {
  const safeUser = user || {};
  const safeRole = inferRole(safeUser);
  const safeAbout = String(safeUser.about || "").trim() || getDefaultAbout(safeUser);

  document.getElementById("user-greeting").textContent = safeUser.name
    ? `Hey, ${safeUser.name.split(" ")[0]}!`
    : "Hey there!";
  document.getElementById("p-avatar").textContent = safeUser.name
    ? safeUser.name.charAt(0).toUpperCase()
    : "?";
  document.getElementById("p-name").textContent = safeUser.name || "User Name";
  document.getElementById("p-role").textContent = safeRole;
  document.getElementById("p-course").textContent = safeUser.course || "Course not added yet";
  document.getElementById("p-about").textContent = safeAbout;

  renderTagBadges("p-skills", safeUser.skills, "Add your strengths in settings");
  renderTagBadges("p-work-focus", deriveFocusAreas(safeUser), "Add your focus areas in settings");
}

function buildProjectStats(projects, tasks) {
  const completedTasks = tasks.filter((task) => {
    const isAssignee = task.assigneeId === currentUser.id || task.assignee === currentUser.name;
    return isAssignee && (normalizeTaskStatus(task.status) === "Done" || String(task.archivedAt || "").trim());
  }).length;

  const contributions = new Set(
    tasks
      .filter((task) => {
        const isCreator = task.createdBy === currentUser.id;
        const isAssignee = task.assigneeId === currentUser.id || task.assignee === currentUser.name;
        return isCreator || isAssignee;
      })
      .map((task) => task.id)
  ).size;

  return [
    { label: "Projects", value: projects.length },
    { label: "Tasks Completed", value: completedTasks },
    { label: "Contributions", value: contributions }
  ];
}

function renderProfileStats(projects, tasks) {
  const container = document.getElementById("p-stats");
  if (!container) {
    return;
  }

  const stats = buildProjectStats(projects, tasks);
  container.innerHTML = stats.map((stat) => `
    <div class="profile-stat-card">
      <span class="profile-stat-value">${escapeHtml(stat.value)}</span>
      <span class="profile-stat-label">${escapeHtml(stat.label)}</span>
    </div>
  `).join("");
}

function renderProjectInvolvement(projects) {
  const container = document.getElementById("p-projects");
  if (!container) {
    return;
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    container.innerHTML = `<div class="team-empty">No active projects yet.</div>`;
    return;
  }

  container.innerHTML = projects.map((project) => `
    <div class="profile-project-item" onclick="window.location.href='/dashboard.html?teamId=${encodeURIComponent(project.id)}'">
      <div class="profile-project-copy">
        <strong class="profile-project-title">${escapeHtml(project.projectTitle || project.name || "Untitled Project")}</strong>
        <span class="profile-project-meta">${escapeHtml(project.name || "Workspace")} • ${escapeHtml(project.memberCount)} members</span>
      </div>
      <span class="profile-project-role">${escapeHtml(project.role || "Member")}</span>
    </div>
  `).join("");
}

function taskBelongsToProject(task, project) {
  if (!task || !project) {
    return false;
  }

  return task.teamId === project.id || (!task.teamId && task.teamName === project.name);
}

function isUserTask(task) {
  return task.assigneeId === currentUser.id || task.assignee === currentUser.name;
}

function isCompletedTask(task) {
  return (
    normalizeTaskStatus(task.status) === "Done" ||
    Boolean(String(task.archivedAt || "").trim()) ||
    Boolean(String(task.completedAt || "").trim())
  );
}

function buildContributionEntries(projects, tasks) {
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => taskBelongsToProject(task, project));
    const completedByUser = projectTasks.filter((task) => isUserTask(task) && isCompletedTask(task)).length;
    const totalTasks = projectTasks.length;
    const contributionPercentage = totalTasks > 0
      ? Math.round((completedByUser / totalTasks) * 100)
      : 0;

    return {
      completedByUser,
      contributionPercentage,
      project,
      totalTasks
    };
  });
}

function renderProjectContributions(projects, tasks) {
  const container = document.getElementById("p-contributions");
  if (!container) {
    return;
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    container.innerHTML = `<div class="team-empty">Contribution details will appear once you join a project.</div>`;
    return;
  }

  const entries = buildContributionEntries(projects, tasks);

  container.innerHTML = entries.map(({ completedByUser, contributionPercentage, project, totalTasks }) => `
    <article class="contribution-card">
      <div class="contribution-card-header">
        <div class="contribution-card-copy">
          <h3 class="contribution-card-title">${escapeHtml(project.projectTitle || project.name || "Untitled Project")}</h3>
          <p class="contribution-card-subtitle">${escapeHtml(project.name || "Workspace")}</p>
        </div>
        <span class="profile-project-role">${escapeHtml(project.role || "Member")}</span>
      </div>

      <div class="contribution-card-stats">
        <span class="contribution-card-ratio">${escapeHtml(completedByUser)} / ${escapeHtml(totalTasks)} tasks completed</span>
        <span class="contribution-card-percentage">${escapeHtml(contributionPercentage)}%</span>
      </div>

      <div class="contribution-progress-track" aria-hidden="true">
        <div class="contribution-progress-fill" style="width: ${Math.min(Math.max(contributionPercentage, 0), 100)}%;"></div>
      </div>
    </article>
  `).join("");
}

function buildActivityEvents(projects, tasks, user) {
  const events = [];
  const taskEventIds = new Set();

  if (user.profileUpdatedAt) {
    events.push({
      timestamp: user.profileUpdatedAt,
      title: "Updated profile",
      description: "Refreshed profile details, interests, or work focus."
    });
  }

  projects.forEach((project) => {
    const isLeader = String(project.role || "").toLowerCase().includes("leader");
    events.push({
      timestamp: project.joinedAt || project.createdAt,
      title: isLeader ? "Started project" : "Joined project",
      description: `${isLeader ? "Leading" : "Contributing to"} ${project.projectTitle || project.name}`
    });
  });

  tasks.forEach((task) => {
    const taskKey = String(task.id || "");
    const isCreator = task.createdBy === user.id;
    const isAssignee = task.assigneeId === user.id || task.assignee === user.name;

    if (isAssignee && task.completedAt && !taskEventIds.has(`${taskKey}:completed`)) {
      taskEventIds.add(`${taskKey}:completed`);
      events.push({
        timestamp: task.completedAt,
        title: "Completed task",
        description: `${task.title || "Untitled task"} in ${task.teamName || "your workspace"}`
      });
    }

    if (isCreator && task.createdAt && !taskEventIds.has(`${taskKey}:created`)) {
      taskEventIds.add(`${taskKey}:created`);
      events.push({
        timestamp: task.createdAt,
        title: "Created task",
        description: `${task.title || "Untitled task"} for ${task.teamName || "your workspace"}`
      });
    }
  });

  return events
    .filter((event) => Number.isFinite(Date.parse(event.timestamp || "")))
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 6);
}

function renderActivity(projects, tasks, user) {
  const container = document.getElementById("p-activity");
  if (!container) {
    return;
  }

  const events = buildActivityEvents(projects, tasks, user);
  if (events.length === 0) {
    container.innerHTML = `<div class="team-empty">No recent workspace activity.</div>`;
    return;
  }

  container.innerHTML = events.map((event) => `
    <div class="activity-item">
      <div class="activity-marker"></div>
      <div class="activity-copy">
        <div class="activity-time">${escapeHtml(formatRelativeTime(event.timestamp))}</div>
        <div class="activity-desc">
          <strong>${escapeHtml(event.title)}</strong>
          <span>${escapeHtml(event.description)}</span>
        </div>
      </div>
    </div>
  `).join("");
}

function generateCard(team, isLeader) {
  return `
    <div class="project-card ${isLeader ? "p-leader" : ""}" onclick="window.location.href='/dashboard.html?teamId=${encodeURIComponent(team.id)}'">
      <h4 class="p-title">${escapeHtml(team.projectTitle || "Untitled Project")}</h4>
      <div class="p-desc">Team: ${escapeHtml(team.name || "Workspace")} &bull; ${escapeHtml(team.memberCount)} members</div>
      <div class="p-footer">
        <span class="p-role">${escapeHtml(team.role || "Member")}</span>
        <span class="arrow-icon">&rarr;</span>
      </div>
    </div>
  `;
}

async function loadAllTasksForProjects(projects) {
  const settledResults = await Promise.allSettled(
    projects.map(async (project) => {
      const teamId = encodeURIComponent(project.id);
      const [activePayload, archivedPayload] = await Promise.all([
        request(`/api/tasks?teamId=${teamId}`, { method: "GET" }),
        request(`/api/tasks/archive?teamId=${teamId}`, { method: "GET" })
      ]);

      return [
        ...(Array.isArray(activePayload.tasks) ? activePayload.tasks : []),
        ...(Array.isArray(archivedPayload.tasks) ? archivedPayload.tasks : [])
      ];
    })
  );

  const mergedTasks = settledResults
    .filter((result) => result.status === "fulfilled")
    .flatMap((result) => result.value || []);

  const seenTaskIds = new Set();
  return mergedTasks.filter((task) => {
    const taskId = String(task.id || "");
    if (!taskId) {
      return false;
    }

    if (seenTaskIds.has(taskId)) {
      return false;
    }

    seenTaskIds.add(taskId);
    return true;
  });
}

async function bootstrap() {
  try {
    const payload = await request("/api/auth/me", { method: "GET" });
    currentUser = payload.user || payload;

    const urlParams = new URLSearchParams(window.location.search);
    const requestedView = urlParams.get("view");
    renderStaticProfile(currentUser);
    switchView(requestedView === "profile" ? "profile" : "projects");

    await loadProjects();
  } catch (err) {
    console.error(err);
    window.location.href = "/index.html";
  }
}

async function loadProjects() {
  try {
    const payload = await request("/api/user/teams");
    const leaderTeams = Array.isArray(payload.leaderTeams) ? payload.leaderTeams : [];
    const memberTeams = Array.isArray(payload.memberTeams) ? payload.memberTeams : [];
    const allProjects = [...leaderTeams, ...memberTeams];

    const leaderGrid = document.getElementById("leader-grid");
    const memberGrid = document.getElementById("member-grid");

    if (leaderTeams.length === 0) {
      leaderGrid.innerHTML = `
        <div class="empty-state">
          <h4 class="empty-state-title">No enterprise projects</h4>
          <p class="empty-state-desc">You haven't initialized any workspace environments.</p>
          <button onclick="document.getElementById('create-project-modal').showModal()" class="btn btn-primary">+ Initialize Workspace</button>
        </div>`;
    } else {
      leaderGrid.innerHTML = leaderTeams.map((team) => generateCard(team, true)).join("");
    }

    if (memberTeams.length === 0) {
      memberGrid.innerHTML = `
        <div class="empty-state">
          <h4 class="empty-state-title">No collaborations joined</h4>
          <p class="empty-state-desc">Wait for an invite or create a workspace of your own.</p>
        </div>`;
    } else {
      memberGrid.innerHTML = memberTeams.map((team) => generateCard(team, false)).join("");
    }

    const allTasks = await loadAllTasksForProjects(allProjects);
    renderProfileStats(allProjects, allTasks);
    renderProjectInvolvement(allProjects);
    renderProjectContributions(allProjects, allTasks);
    renderActivity(allProjects, allTasks, currentUser);
  } catch (error) {
    console.error("Failed to load projects", error);
    const crashView = document.createElement("div");
    crashView.className = "debug-crash";
    crashView.innerHTML = `<h3>CRITICAL JS CRASH</h3>${escapeHtml(error.message)}<br><br>${escapeHtml(error.stack || "")}`;
    document.body.appendChild(crashView);
  }
}

function switchView(viewId) {
  document.getElementById("view-profile").classList.remove("active");
  document.getElementById("view-projects").classList.remove("active");
  document.getElementById("nav-btn-profile").classList.remove("active");
  document.getElementById("nav-btn-projects").classList.remove("active");

  if (viewId === "profile") {
    document.getElementById("view-profile").classList.add("active");
    document.getElementById("nav-btn-profile").classList.add("active");
  } else {
    document.getElementById("view-projects").classList.add("active");
    document.getElementById("nav-btn-projects").classList.add("active");
  }
}

async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } catch (error) {
    console.error("Logout failed", error);
  }
  window.location.href = "/index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("create-project-form");
  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("cp-name").value.trim();
      const projectTitle = document.getElementById("cp-title").value.trim();
      if (!name) {
        return;
      }

      try {
        await request("/api/team", {
          method: "POST",
          body: JSON.stringify({ name, projectTitle })
        });
        document.getElementById("create-project-modal").close();
        document.getElementById("cp-name").value = "";
        document.getElementById("cp-title").value = "";
        await loadProjects();
      } catch (error) {
        alert("Failed to create workspace. " + error.message);
      }
    });
  }
});

window.switchView = switchView;
window.logout = logout;
window.onload = bootstrap;
