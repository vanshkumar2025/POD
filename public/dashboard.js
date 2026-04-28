let currentUser = null;
let teamData = null;
let tasksData = [];
let archivedTasksData = [];
let messagesData = [];
const TASK_ARCHIVE_DELAY_MS = 24 * 60 * 60 * 1000;
const MOVE_PERMISSION_MESSAGE = "You can only move tasks assigned to you";
const EDIT_PERMISSION_MESSAGE = "Only the project leader can edit task details";
const DELETE_PERMISSION_MESSAGE = "Only the project leader can delete tasks";
const CREATE_PERMISSION_MESSAGE = "Only the project leader can create tasks";
let taskModalMode = "create";
let editingTaskId = "";
const contributionTrackerState = {
  archived: "idle",
  tasks: "idle",
  team: "idle"
};
const CONTRIBUTION_PALETTE = [
  { end: "#0ea5e9", solid: "#14b8a6", start: "#2dd4bf" },
  { end: "#4f46e5", solid: "#3b82f6", start: "#1d4ed8" },
  { end: "#7c3aed", solid: "#a855f7", start: "#c084fc" },
  { end: "#f97316", solid: "#fb923c", start: "#f59e0b" },
  { end: "#ec4899", solid: "#f43f5e", start: "#fb7185" },
  { end: "#22c55e", solid: "#16a34a", start: "#84cc16" }
];

async function request(url, options = {}) {
  // Automatically inject teamId from URL into API requests
  const urlParams = new URLSearchParams(window.location.search);
  const teamId = urlParams.get("teamId");

  let fetchUrl = url;
  if (teamId) {
    const encodedTeamId = encodeURIComponent(teamId);
    if (!fetchUrl.includes("teamId=")) {
      fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + `teamId=${encodedTeamId}`;
    }

    if (options.method && options.method !== "GET" && options.method !== "HEAD") {
      let bodyObj = {};
      if (typeof options.body === "string" && options.body.trim()) {
        try {
          bodyObj = JSON.parse(options.body);
        } catch {
          bodyObj = {};
        }
      }
      bodyObj.teamId = teamId;
      options.body = JSON.stringify(bodyObj);
    }
  }

  const response = await fetch(fetchUrl, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) throw new Error(payload.error || "Request failed.");
  return payload;
}

// Format date helper
function formatDate(isoString) {
  if(!isoString) return "";
  const d = new Date(isoString);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFullDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function isLeadRole(role) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  return normalizedRole === "leader" || normalizedRole === "project lead";
}

function normalizeTaskStatus(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();

  if (normalizedStatus === "done" || normalizedStatus === "completed") {
    return "Done";
  }

  if (normalizedStatus === "in progress" || normalizedStatus === "in-progress") {
    return "In Progress";
  }

  return "To Do";
}

function formatTaskPriority(priorityValue) {
  const normalizedPriority = String(priorityValue || "").trim().toLowerCase();

  if (!normalizedPriority) {
    return "Normal";
  }

  return normalizedPriority.charAt(0).toUpperCase() + normalizedPriority.slice(1);
}

function initialsForName(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "•";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeTask(task = {}) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const title = String(task.title || "").trim();
  if (!title) {
    return null;
  }

  return {
    ...task,
    assignee: String(task.assignee || "").trim(),
    assigneeId: String(task.assigneeId || "").trim(),
    archivedAt: String(task.archivedAt || "").trim(),
    completedAt: String(task.completedAt || task.doneAt || "").trim(),
    comments: Array.isArray(task.comments) ? task.comments : [],
    deadline: String(task.deadline || "").trim(),
    description: String(task.description || "").trim(),
    id: String(task.id || "").trim(),
    priority: formatTaskPriority(task.priority || task.urgency),
    status: normalizeTaskStatus(task.status),
    teamId: String(task.teamId || "").trim(),
    teamName: String(task.teamName || "").trim(),
    title
  };
}

function isArchivedTask(task) {
  return Boolean(String(task?.archivedAt || "").trim());
}

function getCurrentTeamMember() {
  const members = Array.isArray(teamData?.members) ? teamData.members : [];
  return members.find((member) => member.userId === currentUser?.id) || null;
}

function isCurrentUserLeader() {
  if (!currentUser || !teamData) {
    return false;
  }

  if (teamData.createdBy === currentUser.id) {
    return true;
  }

  return isLeadRole(getCurrentTeamMember()?.role);
}

function isTaskAssignedToCurrentUser(task) {
  if (!task || !currentUser) {
    return false;
  }

  const assigneeId = String(task.assigneeId || "").trim();
  const assigneeName = String(task.assignee || "").trim();

  return (
    (assigneeId && assigneeId === String(currentUser.id || "").trim()) ||
    (assigneeName && assigneeName === String(currentUser.name || "").trim())
  );
}

function canMoveTask(task) {
  return isCurrentUserLeader() || isTaskAssignedToCurrentUser(task);
}

function canEditTask(task) {
  return Boolean(task) && isCurrentUserLeader();
}

function canDeleteTask(task) {
  return Boolean(task) && isCurrentUserLeader();
}

function findTaskById(taskId) {
  return [...tasksData, ...archivedTasksData].find((task) => task?.id === taskId) || null;
}

function getTaskAssigneeMemberId(task) {
  const members = Array.isArray(teamData?.members) ? teamData.members : [];

  if (task?.assigneeId) {
    const byId = members.find((member) => member.userId === task.assigneeId);
    if (byId) {
      return byId.userId;
    }
  }

  const byName = members.find((member) => String(member.name || "").trim() === String(task?.assignee || "").trim());
  return byName?.userId || "";
}

function syncTaskAssigneeOptions(selectedMemberId = "", isEditMode = false) {
  const assigneeSelect = document.getElementById("task-assignee");
  const members = Array.isArray(teamData?.members) ? teamData.members : [];

  if (!assigneeSelect) {
    return;
  }

  const defaultLabel = isEditMode ? "Unassigned" : "✨ Auto-assign with AI";
  assigneeSelect.innerHTML = `<option value="">${defaultLabel}</option>` + members
    .map((member) => `<option value="${member.userId}">${member.name}</option>`)
    .join("");

  assigneeSelect.value = members.some((member) => member.userId === selectedMemberId)
    ? selectedMemberId
    : "";
}

function getSelectedAssigneePayload() {
  const assigneeSelect = document.getElementById("task-assignee");
  const assigneeId = String(assigneeSelect?.value || "").trim();

  if (!assigneeId) {
    return { assignee: "", assigneeId: "" };
  }

  const members = Array.isArray(teamData?.members) ? teamData.members : [];
  const member = members.find((candidate) => candidate.userId === assigneeId);

  if (!member) {
    throw new Error("Please choose a valid team member.");
  }

  return {
    assignee: String(member.name || "").trim(),
    assigneeId: String(member.userId || "").trim()
  };
}

function getCompletionWindowLabel(task) {
  if (isArchivedTask(task)) {
    return task.archivedAt ? `Archived ${formatFullDate(task.archivedAt)}` : "Archived";
  }

  const completedTimestamp = Date.parse(task?.completedAt || "");
  if (!Number.isFinite(completedTimestamp)) {
    return "Movable for 24 hours after completion";
  }

  const remainingMs = Math.max(TASK_ARCHIVE_DELAY_MS - (Date.now() - completedTimestamp), 0);
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.max(1, Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000)));

  if (hours > 0) {
    return `Movable for ${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `Movable for ${minutes}m`;
}

function updateContributionSourceState(source, status) {
  contributionTrackerState[source] = status;
  renderContributionTracker();
}

function isContributionTrackerLoading() {
  return ["team", "tasks", "archived"].some((source) => {
    const status = contributionTrackerState[source];
    return status === "idle" || status === "loading";
  });
}

function hasContributionTrackerError() {
  return ["team", "tasks", "archived"].some((source) => contributionTrackerState[source] === "error");
}

function isContributionTaskCompleted(task) {
  return (
    isArchivedTask(task) ||
    normalizeTaskStatus(task?.status) === "Done" ||
    Boolean(String(task?.completedAt || "").trim())
  );
}

function getContributionTasks() {
  const merged = [...(Array.isArray(tasksData) ? tasksData : []), ...(Array.isArray(archivedTasksData) ? archivedTasksData : [])];
  const seen = new Set();

  return merged
    .map(normalizeTask)
    .filter(Boolean)
    .filter((task) => {
      if (!task.id || seen.has(task.id)) {
        return false;
      }

      seen.add(task.id);
      return true;
    });
}

function buildContributionModel() {
  const members = Array.isArray(teamData?.members) ? teamData.members : [];
  const tasks = getContributionTasks();
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(isContributionTaskCompleted).length;

  const memberRows = members
    .map((member, index) => {
      const assignedTasks = tasks.filter((task) => {
        const assigneeId = String(task.assigneeId || "").trim();
        const assigneeName = String(task.assignee || "").trim();
        return (
          (assigneeId && assigneeId === member.userId) ||
          (assigneeName && assigneeName === String(member.name || "").trim())
        );
      });

      const completedCount = assignedTasks.filter(isContributionTaskCompleted).length;
      const percentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

      return {
        color: CONTRIBUTION_PALETTE[index % CONTRIBUTION_PALETTE.length],
        completedCount,
        initials: initialsForName(member.name),
        name: String(member.name || "Unnamed member").trim(),
        percentage,
        role: String(member.role || "Member").trim() || "Member",
        totalTasks
      };
    })
    .sort((left, right) => right.completedCount - left.completedCount || left.name.localeCompare(right.name));

  return {
    completedTasks,
    hasMembers: memberRows.length > 0,
    members: memberRows,
    totalTasks
  };
}

function buildContributionChartMarkup(model) {
  const chartMembers = model.members.filter((member) => member.percentage > 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let progressOffset = 0;

  const segments = chartMembers.map((member, index) => {
    const dash = Math.max((member.percentage / 100) * circumference, 0);
    const gap = Math.max(circumference - dash, 0);
    const segment = `
      <circle
        class="svg-ring contribution-ring-segment"
        cx="60"
        cy="60"
        r="${radius}"
        stroke="${member.color.solid}"
        style="stroke-dasharray:${dash} ${gap}; stroke-dashoffset:${-progressOffset}; animation-delay:${index * 120}ms;"
      ></circle>
    `;

    progressOffset += dash;
    return segment;
  }).join("");

  return `
    <div class="contribution-donut-frame ${chartMembers.length > 0 ? "is-active" : "is-placeholder"}">
      <svg class="svg-pie contribution-donut" viewBox="0 0 120 120" aria-hidden="true">
        <circle class="contribution-donut-track" cx="60" cy="60" r="${radius}"></circle>
        ${segments || `<circle class="contribution-donut-placeholder" cx="60" cy="60" r="${radius}"></circle>`}
      </svg>
      <div class="contribution-donut-center">
        <span class="contribution-donut-label">Total Tasks</span>
        <strong class="contribution-donut-value">${escapeHtml(model.totalTasks)}</strong>
      </div>
    </div>
  `;
}

function buildContributionLegendMarkup(model) {
  const activeMembers = model.members.filter((member) => member.percentage > 0);

  if (activeMembers.length === 0) {
    return `
      <div class="contribution-legend-empty">
        <span class="contribution-legend-dot is-muted"></span>
        Complete a task to light up the chart
      </div>
    `;
  }

  return activeMembers.map((member) => `
    <div class="contribution-legend-item">
      <span class="contribution-legend-dot" style="--legend-color:${member.color.solid};"></span>
      <span>${escapeHtml(member.name)} - ${escapeHtml(member.percentage)}%</span>
    </div>
  `).join("");
}

function buildContributionCardsMarkup(model) {
  return model.members.map((member, index) => `
    <article
      class="contribution-member-card"
      style="--member-end:${member.color.end}; --member-progress:${member.percentage}%; --member-solid:${member.color.solid}; --member-start:${member.color.start}; animation-delay:${index * 70}ms;"
    >
      <div class="contribution-member-card-head">
        <div class="contribution-member-identity">
          <div class="contribution-member-avatar">${escapeHtml(member.initials)}</div>
          <div class="contribution-member-copy">
            <h3 class="contribution-member-name">${escapeHtml(member.name)}</h3>
            <p class="contribution-member-role">${escapeHtml(member.role)}</p>
          </div>
        </div>
        <strong class="contribution-member-share">${escapeHtml(member.percentage)}%</strong>
      </div>
      <div class="contribution-member-progress">
        <span class="contribution-member-progress-fill"></span>
      </div>
      <div class="contribution-member-stats">
        <span>${escapeHtml(member.completedCount)} / ${escapeHtml(member.totalTasks)} tasks completed</span>
        <span>${escapeHtml(Math.max(member.totalTasks - member.completedCount, 0))} remaining</span>
      </div>
    </article>
  `).join("");
}

function buildContributionLoadingMarkup() {
  return `
    <div class="contribution-chart-skeleton">
      <div class="contribution-skeleton-circle"></div>
      <div class="contribution-skeleton-lines">
        <span class="contribution-skeleton-line is-wide"></span>
        <span class="contribution-skeleton-line"></span>
      </div>
    </div>
  `;
}

function buildContributionLoadingLegendMarkup() {
  return Array.from({ length: 3 }, () => `
    <span class="contribution-legend-skeleton"></span>
  `).join("");
}

function buildContributionLoadingCardsMarkup() {
  return Array.from({ length: 4 }, (_, index) => `
    <div class="contribution-loading-card" style="animation-delay:${index * 80}ms;">
      <div class="contribution-loading-head">
        <span class="contribution-skeleton-avatar"></span>
        <div class="contribution-loading-copy">
          <span class="contribution-skeleton-line is-medium"></span>
          <span class="contribution-skeleton-line is-short"></span>
        </div>
        <span class="contribution-skeleton-line is-tiny"></span>
      </div>
      <span class="contribution-skeleton-bar"></span>
      <div class="contribution-loading-foot">
        <span class="contribution-skeleton-line is-short"></span>
        <span class="contribution-skeleton-line is-short"></span>
      </div>
    </div>
  `).join("");
}

function buildContributionEmptyMarkup() {
  return `
    <div class="contribution-empty-state">
      <div class="contribution-empty-icon" aria-hidden="true"></div>
      <h3 class="contribution-empty-title">No contribution data yet</h3>
      <p class="contribution-empty-copy">Start completing tasks to see insights</p>
    </div>
  `;
}

function renderContributionTracker() {
  const pie = document.getElementById("analytics-pie-chart");
  const legend = document.getElementById("analytics-pie-legend");
  const bars = document.getElementById("analytics-bars");
  if (!pie || !legend || !bars) {
    return;
  }

  if (isContributionTrackerLoading()) {
    pie.innerHTML = buildContributionLoadingMarkup();
    legend.innerHTML = buildContributionLoadingLegendMarkup();
    bars.innerHTML = buildContributionLoadingCardsMarkup();
    return;
  }

  if (hasContributionTrackerError()) {
    const emptyModel = { members: [], totalTasks: 0 };
    pie.innerHTML = buildContributionChartMarkup(emptyModel);
    legend.innerHTML = buildContributionLegendMarkup(emptyModel);
    bars.innerHTML = buildContributionEmptyMarkup();
    return;
  }

  const model = buildContributionModel();

  pie.innerHTML = buildContributionChartMarkup(model);
  legend.innerHTML = buildContributionLegendMarkup(model);

  if (!model.hasMembers || model.totalTasks === 0) {
    bars.innerHTML = buildContributionEmptyMarkup();
    return;
  }

  bars.innerHTML = buildContributionCardsMarkup(model);
}

function loadAnalyticsV2() {
  renderContributionTracker();
}

async function bootstrap() {
  try {
    const payload = await request("/api/auth/me", { method: "GET" });
    currentUser = payload.user;
    renderContributionTracker();
    
    // Add "Back to Home" button
    const chip = document.getElementById("nav-user-chip");
    if(chip) {
      chip.textContent = `Hey, ${currentUser.name.split(' ')[0]}!`;
      const homeBtn = document.createElement("button");
      homeBtn.className = "btn btn-secondary dashboard-home-btn";
      homeBtn.textContent = "Back to Home";
      homeBtn.onclick = () => window.location.href = "/home.html";
      chip.parentNode.appendChild(homeBtn);
    }
    
    await loadTeam();
    await Promise.all([loadTasks(), loadArchivedTasks(), loadMessages(), checkInvitations()]);
  } catch (err) {
    console.error("Not logged in!", err);
    window.location.assign("/index.html");
  }
}

async function checkInvitations() {
  try {
    const res = await request("/api/user/invitations", { method: "GET" });
    const invites = res.invitations || [];
    const btn = document.getElementById("nav-invites-btn");
    const container = document.getElementById("invites-content");
    const modal = document.getElementById("invites-modal");
    
    if(btn && invites.length > 0) {
      btn.style.display = "inline-flex";
      btn.textContent = `Invites (${invites.length})`;
      btn.style.color = "var(--warning)";
      btn.onclick = () => modal.showModal();
      
      container.innerHTML = invites.map(i => `
        <div class="invite-card">
          <div class="invite-title">${i.teamName}</div>
          <div class="invite-subtitle">Invited by ${i.invitedByName}</div>
          <div class="invite-actions">
            <button class="btn btn-primary" onclick="acceptInvite('${i.teamId}')">Accept</button>
            <button class="btn btn-ghost" onclick="rejectInvite('${i.teamId}')">Reject</button>
          </div>
        </div>
      `).join('');
    } else if(btn) {
      btn.style.display = "none";
      if(modal.open) modal.close();
    }
  } catch(e) { }
}

window.acceptInvite = async (teamId) => {
  try {
    await request("/api/team/invitations/accept", { method: "POST", body: JSON.stringify({ teamId }) });
    window.location.reload();
  } catch(e) { alert("Failed to accept"); }
};

window.rejectInvite = async (teamId) => {
  try {
    await request("/api/team/invitations/reject", { method: "POST", body: JSON.stringify({ teamId }) });
    checkInvitations();
  } catch(e) { alert("Failed to reject"); }
};

async function loadTeam() {
  updateContributionSourceState("team", "loading");
  try {
    const payload = await request("/api/team", { method: "GET" });
    teamData = payload.team || null;
    const teamList = document.getElementById("team-list");
    
    // Inject sidebar context data
    const ctxName = document.getElementById("context-team-name");
    const ctxMeta = document.getElementById("context-team-meta");
    if(ctxName) ctxName.textContent = teamData?.projectTitle || teamData?.name || "Workspace";
    if(ctxMeta) ctxMeta.textContent = teamData?.name ? `${teamData.name} • ${teamData.members?.length || 0} members` : "Connected";

    if(!teamList) return;
    
    if(!teamData || !teamData.members || teamData.members.length === 0) {
      teamList.innerHTML = `
        <div class="team-empty">You aren't in a team yet.</div>
        <button class="btn btn-secondary wide-button" onclick="document.getElementById('create-team-modal').showModal()">Create a Squad</button>
      `;
      const invitePanel = document.getElementById("invite-panel");
      if (invitePanel) {
        invitePanel.style.display = "none";
      }
      const addTaskButton = document.getElementById("add-task-btn");
      if (addTaskButton) {
        addTaskButton.disabled = true;
        addTaskButton.title = "Join or create a team to manage tasks";
      }
      syncTaskAssigneeOptions("", false);
      updateContributionSourceState("team", "success");
      return;
    }
    
    teamList.innerHTML = teamData.members.map(m => `
      <div class="team-member-row">
        <div class="team-member-main">
          <div class="team-member-avatar">${initialsForName(m.name)}</div>
          <div class="team-member-copy">
            <strong class="team-member-name">${m.name}</strong>
            <span class="team-member-role team-member-role-badge">${m.role || "Member"}</span>
          </div>
        </div>
      </div>
    `).join('');
    
    const invitePanel = document.getElementById("invite-panel");
    if(invitePanel) {
      invitePanel.style.display = isCurrentUserLeader() ? "block" : "none";
    }

    syncTaskAssigneeOptions("", false);

    const addTaskButton = document.getElementById("add-task-btn");
    if (addTaskButton) {
      const canCreateTask = isCurrentUserLeader();
      addTaskButton.disabled = !canCreateTask;
      addTaskButton.title = canCreateTask ? "" : CREATE_PERMISSION_MESSAGE;
    }

    renderTasks();
    renderArchivedTasks();
    updateContributionSourceState("team", "success");
  } catch(e) {
    console.error("Failed to load team");
    updateContributionSourceState("team", "error");
  }
}


async function loadTasks() {
  updateContributionSourceState("tasks", "loading");
  try {
    const payload = await request("/api/tasks", { method: "GET" });
    tasksData = Array.isArray(payload.tasks)
      ? payload.tasks.map(normalizeTask).filter(Boolean)
      : [];
    renderTasks();
    updateContributionSourceState("tasks", "success");
  } catch(e) {
    console.error("Failed to load tasks");
    updateContributionSourceState("tasks", "error");
  }
}

async function loadArchivedTasks() {
  updateContributionSourceState("archived", "loading");
  try {
    const payload = await request("/api/tasks/archive", { method: "GET" });
    archivedTasksData = Array.isArray(payload.tasks)
      ? payload.tasks.map(normalizeTask).filter(Boolean)
      : [];
    renderArchivedTasks();
    updateContributionSourceState("archived", "success");
  } catch (e) {
    console.error("Failed to load archived tasks");
    updateContributionSourceState("archived", "error");
  }
}

function renderTasks() {
  const cols = {
    "To Do": document.getElementById("col-todo"),
    "In Progress": document.getElementById("col-progress"),
    "Done": document.getElementById("col-done")
  };
  
  if(!cols["To Do"]) return;
  
  Object.values(cols).forEach(c => c.innerHTML = ""); // clear
  
  const safeTasks = Array.isArray(tasksData)
    ? tasksData.map(normalizeTask).filter(Boolean)
    : [];
  const activeTasks = safeTasks.filter((task) => !isArchivedTask(task));
  tasksData = activeTasks;

  if(activeTasks.length === 0) {
    cols["To Do"].innerHTML = `
      <div class="task-empty task-empty-state">
        <div class="task-empty-icon" aria-hidden="true"></div>
        <strong class="task-empty-title">No tasks yet</strong>
        <p class="task-empty-copy">Add the first task to turn this board into motion.</p>
      </div>
    `;
    return;
  }
  
  activeTasks.forEach(task => {
    const targetStatus = task.status || "To Do";
    const col = cols[targetStatus] || cols["To Do"];
    const isDoneTask = targetStatus === "Done";
    const canMove = canMoveTask(task);
    const canEdit = canEditTask(task);
    const canDelete = canDeleteTask(task);
    const actionButtons = [];

    if (isDoneTask) {
      if (canMove) {
        actionButtons.push(
          `<button class="btn btn-ghost" data-task-action="move" data-task-id="${task.id}" data-task-status="To Do">To Do</button>`,
          `<button class="btn btn-ghost" data-task-action="move" data-task-id="${task.id}" data-task-status="In Progress">In Progress</button>`
        );
      }
    } else if (canMove) {
      actionButtons.push(
        `<button class="btn btn-ghost" data-task-action="move" data-task-id="${task.id}" data-task-status="${targetStatus === 'Done' ? 'In Progress' : 'To Do'}">←</button>`,
        `<button class="btn btn-ghost" data-task-action="move" data-task-id="${task.id}" data-task-status="${targetStatus === 'To Do' ? 'In Progress' : 'Done'}">→</button>`
      );
    }

    if (canEdit) {
      actionButtons.push(`<button class="btn btn-ghost" data-task-action="edit" data-task-id="${task.id}">Edit</button>`);
    }

    if (canDelete) {
      actionButtons.push(`<button class="btn btn-ghost task-delete-btn" data-task-action="delete" data-task-id="${task.id}">Trash</button>`);
    }

    const actionMarkup = isDoneTask
      ? `
        <div class="task-locked-row">
          <span class="task-state-pill is-completed">Completed</span>
          <span class="task-state-pill ${canMove ? "is-editable" : "is-locked"}">${canMove ? "Movable" : "View Only"}</span>
        </div>
        <div class="task-lock-note">${canMove ? getCompletionWindowLabel(task) : MOVE_PERMISSION_MESSAGE}</div>
        ${actionButtons.length > 0
          ? `<div class="task-actions" style="--task-action-count:${actionButtons.length}">${actionButtons.join("")}</div>`
          : ""}
      `
      : `
        ${!canMove ? `<div class="task-lock-note">${MOVE_PERMISSION_MESSAGE}</div>` : ""}
        ${actionButtons.length > 0
          ? `<div class="task-actions" style="--task-action-count:${actionButtons.length}">${actionButtons.join("")}</div>`
          : ""}
      `;
    
    const div = document.createElement("div");
    div.className = `task-card ${isDoneTask ? "task-card-completed-window" : ""}`;
    div.draggable = canMove;
    
    div.innerHTML = `
      <div class="task-state-row">
        <span class="task-state-pill ${targetStatus === "Done" ? "is-completed" : "is-active"}">${targetStatus === "Done" ? "Completed" : "Active"}</span>
        ${!canMove ? `<span class="task-state-pill is-locked">View Only</span>` : ""}
      </div>
      <div class="task-title">${task.title}</div>
      <div class="task-desc">${task.description || "No description provided."}</div>
      <div class="task-meta">
        <strong class="task-assignee">${task.assignee || "Unassigned"}</strong>
        <span class="task-urgency">${task.priority || "Normal"}</span>
      </div>
      ${actionMarkup}
    `;
    col.appendChild(div);
  });
}

function renderArchivedTasks() {
  const archiveList = document.getElementById("archive-list");
  const archiveSubtitle = document.getElementById("archive-subtitle");
  if (!archiveList) return;

  const safeArchivedTasks = Array.isArray(archivedTasksData)
    ? archivedTasksData.map(normalizeTask).filter(Boolean).filter(isArchivedTask)
    : [];
  archivedTasksData = safeArchivedTasks;

  if (archiveSubtitle) {
    archiveSubtitle.textContent = safeArchivedTasks.length === 0
      ? "No archived tasks yet."
      : `${safeArchivedTasks.length} archived task${safeArchivedTasks.length === 1 ? "" : "s"} ready to review.`;
  }

  if (safeArchivedTasks.length === 0) {
    archiveList.innerHTML = `
      <div class="archive-empty">
        <div class="task-empty-icon archive-empty-icon" aria-hidden="true"></div>
        <strong class="task-empty-title">Archive is empty</strong>
        <p class="task-empty-copy">Completed work will appear here 24 hours after it lands in Done.</p>
      </div>
    `;
    return;
  }

  archiveList.innerHTML = safeArchivedTasks.map((task) => `
    <article class="archive-card">
      <div class="archive-card-copy">
        <div class="task-state-row">
          <span class="task-state-pill is-archived">Archived</span>
          <span class="task-state-pill is-locked">Locked</span>
        </div>
        <h3 class="archive-card-title">${task.title}</h3>
        <p class="archive-card-desc">${task.description || "No description provided."}</p>
        <div class="archive-meta-grid">
          <div class="archive-meta-item">
            <span class="archive-meta-label">Assignee</span>
            <strong>${task.assignee || "Unassigned"}</strong>
          </div>
          <div class="archive-meta-item">
            <span class="archive-meta-label">Completed</span>
            <strong>${formatFullDate(task.completedAt) || "Recently"}</strong>
          </div>
          <div class="archive-meta-item">
            <span class="archive-meta-label">Archived</span>
            <strong>${formatFullDate(task.archivedAt) || "Now"}</strong>
          </div>
        </div>
      </div>
      ${canDeleteTask(task)
        ? `<div class="archive-card-actions"><button class="btn btn-danger" data-archive-action="delete" data-task-id="${task.id}">Delete</button></div>`
        : ""}
    </article>
  `).join("");
}

window.updateTaskStatus = async (taskId, newStatus) => {
  const task = findTaskById(taskId);
  if (!canMoveTask(task)) {
    alert(MOVE_PERMISSION_MESSAGE);
    return;
  }

  try {
    await request("/api/tasks/" + taskId, { method: "PUT", body: JSON.stringify({ status: newStatus }) });
    loadTasks();
    loadArchivedTasks();
  } catch(e) { alert("Failed to move task or unauthorized. " + e.message); }
};

window.deleteTask = async (taskId) => {
  const task = findTaskById(taskId);
  if (!canDeleteTask(task)) {
    alert(DELETE_PERMISSION_MESSAGE);
    return;
  }

  if(!confirm("Sure you want to delete this task?")) return;
  try {
    await request("/api/tasks/" + taskId, { method: "DELETE" });
    tasksData = tasksData.filter((task) => task.id !== taskId);
    renderTasks();
    loadTasks();
    loadArchivedTasks();
  } catch(e) { alert("Failed to delete task. " + e.message); }
};

window.deleteArchivedTask = async (taskId) => {
  const task = findTaskById(taskId);
  if (!canDeleteTask(task)) {
    alert(DELETE_PERMISSION_MESSAGE);
    return;
  }

  if(!confirm("Delete this archived task permanently?")) return;
  try {
    await request("/api/tasks/" + taskId, { method: "DELETE" });
    archivedTasksData = archivedTasksData.filter((task) => task.id !== taskId);
    renderArchivedTasks();
    loadArchivedTasks();
  } catch(e) { alert("Failed to delete archived task. " + e.message); }
};

const kanbanBoard = document.querySelector(".kanban-board");
if (kanbanBoard) {
  kanbanBoard.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-task-action]");
    if (!actionButton) {
      return;
    }

    const taskId = String(actionButton.dataset.taskId || "").trim();
    const action = actionButton.dataset.taskAction;

    if (!taskId) {
      return;
    }

    if (action === "delete") {
      window.deleteTask(taskId);
      return;
    }

    if (action === "edit") {
      const task = findTaskById(taskId);
      if (task) {
        openTaskModal("edit", task);
      }
      return;
    }

    if (action === "move") {
      const nextStatus = String(actionButton.dataset.taskStatus || "").trim();
      if (nextStatus) {
        window.updateTaskStatus(taskId, nextStatus);
      }
    }
  });
}

const archiveList = document.getElementById("archive-list");
if (archiveList) {
  archiveList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-archive-action]");
    if (!actionButton) {
      return;
    }

    const taskId = String(actionButton.dataset.taskId || "").trim();
    if (!taskId) {
      return;
    }

    if (actionButton.dataset.archiveAction === "delete") {
      window.deleteArchivedTask(taskId);
    }
  });
}

// Team & Invite Form Logic
document.getElementById("create-team-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("new-team-name").value.trim();
  if(!name) return;
  try {
    await request("/api/team", { method: "POST", body: JSON.stringify({ name }) });
    window.location.reload();
  } catch(err) { alert("Failed to create team. " + err.message); }
});

const inviteForm = document.getElementById("invite-form");
if(inviteForm) {
  inviteForm.addEventListener("submit", async(e) => {
    e.preventDefault();
    const email = document.getElementById("invite-email").value.trim();
    try {
      await request("/api/team/members", { method: "POST", body: JSON.stringify({ email }) });
      document.getElementById("invite-email").value = "";
      alert("Invite sent!");
    } catch(err) { alert("Failed to invite. " + err.message); }
  });
}

// --- Global Sidebar Navigation ---
window.switchDashboardView = function(viewId, btnElement) {
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  if(btnElement) btnElement.classList.add('active');
  
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if(target) target.classList.add('active');
  
  if(viewId === 'contributions') loadAnalyticsV2();
  if(viewId === 'archive') loadArchivedTasks();
};

// Add Task Modal Logic
const addTaskBtn = document.getElementById("add-task-btn");
const taskModal = document.getElementById("task-modal");
const closeTaskBtn = document.getElementById("close-task-modal");
const taskForm = document.getElementById("task-form");
const taskModalTitle = document.getElementById("task-modal-title");
const taskSubmitBtn = document.getElementById("task-submit-btn");

function resetTaskModalState() {
  taskModalMode = "create";
  editingTaskId = "";

  if (taskModalTitle) {
    taskModalTitle.textContent = "New Task";
  }

  if (taskSubmitBtn) {
    taskSubmitBtn.textContent = "Create Task";
  }

  if (taskForm) {
    taskForm.reset();
  }

  syncTaskAssigneeOptions("", false);
}

function openTaskModal(mode = "create", task = null) {
  if (!taskModal || !taskForm) {
    return;
  }

  if (mode === "edit") {
    if (!task || !canEditTask(task)) {
      alert(EDIT_PERMISSION_MESSAGE);
      return;
    }

    taskModalMode = "edit";
    editingTaskId = task.id;

    if (taskModalTitle) {
      taskModalTitle.textContent = "Edit Task";
    }

    if (taskSubmitBtn) {
      taskSubmitBtn.textContent = "Save Changes";
    }

    document.getElementById("task-title").value = task.title || "";
    document.getElementById("task-desc").value = task.description || "";
    syncTaskAssigneeOptions(getTaskAssigneeMemberId(task), true);
  } else {
    resetTaskModalState();
  }

  if (!taskModal.open) {
    taskModal.showModal();
  }
}

if(addTaskBtn && taskModal && closeTaskBtn && taskForm) {
  addTaskBtn.addEventListener("click", () => {
    if (!isCurrentUserLeader()) {
      alert(CREATE_PERMISSION_MESSAGE);
      return;
    }

    openTaskModal("create");
  });
  closeTaskBtn.addEventListener("click", () => taskModal.close());
  taskModal.addEventListener("close", resetTaskModalState);
  
  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("task-title");
    const descriptionInput = document.getElementById("task-desc");
    const title = String(titleInput?.value || "").trim();
    const description = String(descriptionInput?.value || "").trim();
    const isEditMode = taskModalMode === "edit";
    const editingTask = isEditMode ? findTaskById(editingTaskId) : null;

    if (isEditMode) {
      if (!canEditTask(editingTask)) {
        alert(EDIT_PERMISSION_MESSAGE);
        return;
      }
    } else if (!isCurrentUserLeader()) {
      alert(CREATE_PERMISSION_MESSAGE);
      return;
    }

    if(!title) {
      if(titleInput) titleInput.focus();
      alert("Task title is required.");
      return;
    }

    if(taskSubmitBtn) {
      taskSubmitBtn.disabled = true;
      taskSubmitBtn.textContent = isEditMode ? "Saving..." : "Creating...";
    }

    try {
      const assigneePayload = getSelectedAssigneePayload();

      if (isEditMode && editingTaskId) {
        const payload = await request("/api/tasks/" + editingTaskId, {
          method: "PUT",
          body: JSON.stringify({ title, description, ...assigneePayload })
        });
        const updatedTask = normalizeTask(payload.task);

        if(updatedTask) {
          tasksData = tasksData.map((task) => task.id === updatedTask.id ? updatedTask : task);
          renderTasks();
        }
      } else {
        const payload = await request("/api/tasks", {
          method: "POST",
          body: JSON.stringify({ title, description, ...assigneePayload })
        });
        const createdTask = normalizeTask(payload.task);

        if(createdTask) {
          tasksData = [...tasksData, createdTask];
          renderTasks();
        }
      }

      if (taskModal.open) {
        taskModal.close();
      }
      loadTasks();
      loadArchivedTasks();
    } catch(err) {
      alert(`Failed to ${isEditMode ? "save" : "create"} task. ` + err.message);
    } finally {
      if(taskSubmitBtn) {
        taskSubmitBtn.disabled = false;
        taskSubmitBtn.textContent = taskModalMode === "edit" ? "Save Changes" : "Create Task";
      }
    }
  });
}

// Chat logic
async function loadMessages() {
  try {
    const payload = await request("/api/messages", { method: "GET" });
    messagesData = payload.messages || [];
    renderMessages();
  } catch(e) {
    console.error("Failed to load messages");
  }
}

function renderMessages() {
  const container = document.getElementById("chat-container");
  if(!container) return;
  
  if(messagesData.length === 0) {
    container.innerHTML = `<div class="chat-empty">It's quiet here.</div>`;
    return;
  }
  
  container.innerHTML = messagesData.map(msg => `
    <div class="chat-message ${msg.email === currentUser.email ? 'is-me' : ''}">
      <div class="chat-message-head">
        <strong>${msg.name}</strong>
        <span class="chat-message-time">${formatDate(msg.timestamp)}</span>
      </div>
      <div>${msg.content}</div>
    </div>
  `).join('');
  
  container.scrollTop = container.scrollHeight;
}

const chatForm = document.getElementById("chat-form");
if(chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const val = input.value.trim();
    if(!val) return;
    
    input.value = "";
    
    // Optimistic update
    messagesData.push({
      id: Date.now().toString(),
      name: currentUser.name,
      email: currentUser.email,
      content: val,
      timestamp: new Date().toISOString()
    });
    renderMessages();
    
    // Async request
    try {
      await request("/api/messages", {
        method: "POST",
        body: JSON.stringify({ content: val })
      });
      // Optionally reload to ensure sync
      loadMessages();
    } catch(err) {
      console.error("Failed to send message", err);
    }
  });
}

const logoutBtn = document.getElementById("nav-logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try { await request("/api/auth/logout", { body: JSON.stringify({}), method: "POST" }); }
    finally { window.location.assign("/"); }
  });
}

// Reload messages every 5 seconds to keep chat fresh!
setInterval(loadMessages, 5000);

bootstrap();
