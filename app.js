const STORAGE_KEY = "focuslist-storage-v2";
const WINDOW_NAME_PREFIX = "__focuslist_tasks__:";
const PRIORITY_ORDER = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};
const PRIORITY_LABEL = {
  urgent: "Khẩn cấp",
  high: "Cao",
  medium: "Vừa",
  low: "Thấp",
};
const VIEW_CONFIG = {
  inbox: {
    title: "Inbox",
    label: "My tasks",
    description: "Nơi gom mọi việc cần làm để bạn xử lý dần từng cái một.",
  },
  today: {
    title: "Today",
    label: "Today focus",
    description: "Các việc cần hoàn thành trong hôm nay hoặc đang tới hạn.",
  },
  upcoming: {
    title: "Upcoming",
    label: "Next up",
    description: "Danh sách việc sắp tới để bạn chủ động sắp xếp thời gian.",
  },
  completed: {
    title: "Completed",
    label: "Archive",
    description: "Những việc bạn đã hoàn thành.",
  },
};

const state = {
  tasks: [],
  activeView: "inbox",
  activeProject: "",
  search: "",
  priorityFilter: "all",
  showCompleted: false,
  editingTaskId: null,
  storage: createStorageBridge(),
};

const elements = {
  mainNav: document.querySelector("#mainNav"),
  openComposerButton: document.querySelector("#openComposerButton"),
  searchInput: document.querySelector("#searchInput"),
  inboxCount: document.querySelector("#inboxCount"),
  todayCount: document.querySelector("#todayCount"),
  upcomingCount: document.querySelector("#upcomingCount"),
  completedCount: document.querySelector("#completedCount"),
  projectList: document.querySelector("#projectList"),
  storageStatus: document.querySelector("#storageStatus"),
  sectionLabel: document.querySelector("#sectionLabel"),
  viewTitle: document.querySelector("#viewTitle"),
  viewDescription: document.querySelector("#viewDescription"),
  priorityFilter: document.querySelector("#priorityFilter"),
  clearCompletedButton: document.querySelector("#clearCompletedButton"),
  composerTitle: document.querySelector("#composerTitle"),
  composerHint: document.querySelector("#composerHint"),
  taskForm: document.querySelector("#taskForm"),
  taskTitle: document.querySelector("#taskTitle"),
  taskNotes: document.querySelector("#taskNotes"),
  taskProject: document.querySelector("#taskProject"),
  taskPriority: document.querySelector("#taskPriority"),
  taskDueDate: document.querySelector("#taskDueDate"),
  submitButton: document.querySelector("#submitButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  projectSuggestions: document.querySelector("#projectSuggestions"),
  resultCount: document.querySelector("#resultCount"),
  toggleCompletedButton: document.querySelector("#toggleCompletedButton"),
  taskList: document.querySelector("#taskList"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyMessage: document.querySelector("#emptyMessage"),
  toast: document.querySelector("#toast"),
};

let toastTimer = 0;

bootstrap();

function bootstrap() {
  state.tasks = loadTasks();
  bindEvents();
  render();
}

function bindEvents() {
  elements.openComposerButton.addEventListener("click", () => {
    if (state.editingTaskId) {
      resetForm(false);
    }
    applyViewContextToForm();
    focusComposer();
  });

  elements.mainNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) {
      return;
    }

    state.activeView = button.dataset.view;
    state.activeProject = "";
    state.showCompleted = state.activeView === "completed";
    render();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    render();
  });

  elements.priorityFilter.addEventListener("change", (event) => {
    state.priorityFilter = event.target.value;
    render();
  });

  elements.clearCompletedButton.addEventListener("click", clearCompletedTasks);
  elements.toggleCompletedButton.addEventListener("click", () => {
    state.showCompleted = !state.showCompleted;
    render();
  });

  elements.cancelEditButton.addEventListener("click", () => resetForm(true));
  elements.taskForm.addEventListener("submit", handleTaskSubmit);

  document.addEventListener("click", (event) => {
    const presetButton = event.target.closest("[data-date-preset]");
    if (presetButton) {
      elements.taskDueDate.value = getPresetDate(presetButton.dataset.datePreset);
      return;
    }

    const projectButton = event.target.closest("[data-project]");
    if (projectButton) {
      state.activeView = "project";
      state.activeProject = projectButton.dataset.project;
      state.showCompleted = false;
      render();
    }
  });

  elements.taskList.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-task-toggle]");
    if (!toggle) {
      return;
    }

    toggleTask(toggle.dataset.taskToggle, event.target.checked);
  });

  elements.taskList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const { action, taskId } = actionButton.dataset;

    if (action === "edit") {
      startEditing(taskId);
      return;
    }

    if (action === "delete") {
      deleteTask(taskId);
    }
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");

    if (event.key.toLowerCase() === "n" && !typing) {
      event.preventDefault();
      applyViewContextToForm();
      focusComposer();
    }

    if (event.key === "/" && !typing) {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
    }

    if (event.key === "Escape" && state.editingTaskId) {
      resetForm(true);
    }
  });
}

function handleTaskSubmit(event) {
  event.preventDefault();

  const payload = {
    title: elements.taskTitle.value.trim(),
    notes: elements.taskNotes.value.trim(),
    project: elements.taskProject.value.trim(),
    priority: elements.taskPriority.value,
    dueDate: elements.taskDueDate.value,
  };

  if (!payload.title) {
    showToast("Hãy nhập tên công việc.");
    elements.taskTitle.focus();
    return;
  }

  if (state.editingTaskId) {
    const task = state.tasks.find((item) => item.id === state.editingTaskId);
    if (!task) {
      resetForm(false);
      return;
    }

    task.title = payload.title;
    task.notes = payload.notes;
    task.project = normalizeProject(payload.project);
    task.priority = payload.priority;
    task.dueDate = payload.dueDate;
    task.updatedAt = new Date().toISOString();
    persistTasks();
    render();
    resetForm(false);
    showToast("Đã cập nhật công việc.");
    return;
  }

  state.tasks.unshift(createTask(payload));
  persistTasks();
  render();
  resetForm(false);
  showToast("Đã thêm công việc.");
}

function render() {
  const visibleTasks = getVisibleTasks();

  renderHeader();
  renderSidebar();
  renderStorageStatus();
  renderProjectSuggestions();
  renderFormState();
  renderControls(visibleTasks.length);
  renderList(visibleTasks);
  renderEmptyState(visibleTasks);
}

function renderHeader() {
  const config =
    state.activeView === "project"
      ? {
          title: state.activeProject || "Project",
          label: "Project view",
          description: "Theo dõi công việc trong project này.",
        }
      : VIEW_CONFIG[state.activeView];

  elements.sectionLabel.textContent = config.label;
  elements.viewTitle.textContent = config.title;
  elements.viewDescription.textContent = config.description;
}

function renderSidebar() {
  const counts = getCounts();
  elements.inboxCount.textContent = String(counts.inbox);
  elements.todayCount.textContent = String(counts.today);
  elements.upcomingCount.textContent = String(counts.upcoming);
  elements.completedCount.textContent = String(counts.completed);

  elements.mainNav.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.activeView && !state.activeProject);
  });

  const projects = getProjectCounts();
  if (!projects.length) {
    elements.projectList.innerHTML = '<div class="storage-status">Chưa có project nào.</div>';
    return;
  }

  elements.projectList.innerHTML = projects
    .map(
      (project) => `
        <button
          class="project-item ${state.activeView === "project" && state.activeProject === project.name ? "active" : ""}"
          type="button"
          data-project="${escapeHtml(project.name)}"
        >
          <span>${escapeHtml(project.name)}</span>
          <strong>${project.count}</strong>
        </button>
      `,
    )
    .join("");
}

function renderStorageStatus() {
  if (state.storage.mode === "localStorage") {
    elements.storageStatus.textContent = "Dữ liệu đang được lưu cục bộ trên trình duyệt này.";
    return;
  }

  if (state.storage.mode === "windowName") {
    elements.storageStatus.textContent =
      "Trình duyệt đang chặn localStorage. App vẫn giữ dữ liệu trong tab này, kể cả khi tải lại trang.";
    return;
  }

  elements.storageStatus.textContent =
    "Trình duyệt đang chặn lưu lâu dài. Dữ liệu chỉ giữ tạm trong phiên hiện tại.";
}

function renderProjectSuggestions() {
  elements.projectSuggestions.innerHTML = getProjectCounts()
    .map((project) => `<option value="${escapeHtml(project.name)}"></option>`)
    .join("");
}

function renderFormState() {
  if (state.editingTaskId) {
    elements.composerTitle.textContent = "Chỉnh sửa công việc";
    elements.composerHint.textContent = "Cập nhật xong thì bấm lưu để thay thế mục cũ.";
    elements.submitButton.textContent = "Lưu thay đổi";
    elements.cancelEditButton.classList.remove("hidden");
    return;
  }

  elements.composerTitle.textContent = "Thêm công việc";
  elements.composerHint.textContent = "Tạo nhanh một việc mới và bấm lưu là xong.";
  elements.submitButton.textContent = "Lưu việc";
  elements.cancelEditButton.classList.add("hidden");
}

function renderControls(visibleCount) {
  elements.resultCount.textContent = `${visibleCount} công việc`;
  const shouldHideToggle = state.activeView === "completed";
  elements.toggleCompletedButton.classList.toggle("hidden", shouldHideToggle);
  elements.toggleCompletedButton.textContent = state.showCompleted
    ? "Ẩn việc đã xong"
    : "Hiện việc đã xong";
}

function renderList(tasks) {
  if (!tasks.length) {
    elements.taskList.innerHTML = "";
    return;
  }

  elements.taskList.innerHTML = tasks.map(renderTaskRow).join("");
}

function renderTaskRow(task) {
  const dueMeta = getDueMeta(task);
  const notesHtml = task.notes ? `<p class="task-notes">${escapeHtml(task.notes)}</p>` : "";
  const projectLabel = task.project || "Inbox";

  return `
    <article class="task-row ${task.completed ? "is-completed" : ""}">
      <div class="task-row__main">
        <label class="task-check" aria-label="Đánh dấu hoàn thành">
          <input type="checkbox" data-task-toggle="${task.id}" ${task.completed ? "checked" : ""} />
          <span></span>
        </label>

        <div class="task-body">
          <div class="task-row__head">
            <h3 class="task-title">${escapeHtml(task.title)}</h3>
            <span class="priority-chip priority-${task.priority}">
              ${escapeHtml(PRIORITY_LABEL[task.priority])}
            </span>
          </div>

          ${notesHtml}

          <div class="task-row__meta">
            <span class="meta-chip">${escapeHtml(projectLabel)}</span>
            ${dueMeta ? `<span class="meta-chip ${dueMeta.className}">${escapeHtml(dueMeta.label)}</span>` : ""}
          </div>
        </div>
      </div>

      <div class="task-actions">
        <button class="task-action" type="button" data-action="edit" data-task-id="${task.id}">
          Sửa
        </button>
        <button class="task-action delete" type="button" data-action="delete" data-task-id="${task.id}">
          Xóa
        </button>
      </div>
    </article>
  `;
}

function renderEmptyState(tasks) {
  elements.emptyState.classList.toggle("hidden", tasks.length > 0);
  if (tasks.length > 0) {
    return;
  }

  if (!state.tasks.length) {
    elements.emptyTitle.textContent = "Chưa có công việc nào";
    elements.emptyMessage.textContent = "Thêm việc đầu tiên để bắt đầu danh sách của bạn.";
    return;
  }

  if (state.search || state.priorityFilter !== "all") {
    elements.emptyTitle.textContent = "Không tìm thấy kết quả";
    elements.emptyMessage.textContent = "Hãy thử đổi từ khóa tìm kiếm hoặc bộ lọc ưu tiên.";
    return;
  }

  elements.emptyTitle.textContent = "Không có việc trong mục này";
  elements.emptyMessage.textContent = "Hãy chọn mục khác ở sidebar hoặc thêm một công việc mới.";
}

function getVisibleTasks() {
  return sortTasks(
    state.tasks.filter(
      (task) =>
        matchesCurrentView(task) &&
        matchesSearch(task) &&
        matchesPriority(task) &&
        matchesCompletedFilter(task),
    ),
  );
}

function matchesCurrentView(task) {
  if (state.activeView === "today") {
    return isDueToday(task.dueDate) || isOverdue(task);
  }

  if (state.activeView === "upcoming") {
    return isUpcoming(task.dueDate);
  }

  if (state.activeView === "completed") {
    return task.completed;
  }

  if (state.activeView === "project") {
    return normalizeProject(task.project) === normalizeProject(state.activeProject);
  }

  return true;
}

function matchesSearch(task) {
  if (!state.search) {
    return true;
  }

  const haystack = [task.title, task.notes, task.project].join(" ").toLowerCase();
  return haystack.includes(state.search.toLowerCase());
}

function matchesPriority(task) {
  return state.priorityFilter === "all" || task.priority === state.priorityFilter;
}

function matchesCompletedFilter(task) {
  if (state.activeView === "completed") {
    return task.completed;
  }

  return state.showCompleted ? true : !task.completed;
}

function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    if (left.completed !== right.completed) {
      return Number(left.completed) - Number(right.completed);
    }

    if (left.completed && right.completed) {
      return dateValue(right.completedAt || right.updatedAt) - dateValue(left.completedAt || left.updatedAt);
    }

    if (isOverdue(left) !== isOverdue(right)) {
      return Number(isOverdue(right)) - Number(isOverdue(left));
    }

    if (dueSortValue(left) !== dueSortValue(right)) {
      return dueSortValue(left) - dueSortValue(right);
    }

    if (PRIORITY_ORDER[left.priority] !== PRIORITY_ORDER[right.priority]) {
      return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    }

    return dateValue(right.createdAt) - dateValue(left.createdAt);
  });
}

function getCounts() {
  return {
    inbox: state.tasks.filter((task) => !task.completed).length,
    today: state.tasks.filter((task) => !task.completed && (isDueToday(task.dueDate) || isOverdue(task))).length,
    upcoming: state.tasks.filter((task) => !task.completed && isUpcoming(task.dueDate)).length,
    completed: state.tasks.filter((task) => task.completed).length,
  };
}

function getProjectCounts() {
  const counts = new Map();

  state.tasks.forEach((task) => {
    if (task.completed) {
      return;
    }

    const name = normalizeProject(task.project);
    if (!name) {
      return;
    }

    counts.set(name, (counts.get(name) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));
}

function getDueMeta(task) {
  if (!task.dueDate) {
    return null;
  }

  if (task.completed) {
    return {
      label: task.completedAt ? `Xong ${formatShortDate(task.completedAt)}` : formatShortDate(task.dueDate),
      className: "",
    };
  }

  if (isOverdue(task)) {
    return {
      label: `Quá hạn ${formatShortDate(task.dueDate)}`,
      className: "is-overdue",
    };
  }

  if (isDueToday(task.dueDate)) {
    return {
      label: "Hôm nay",
      className: "is-today",
    };
  }

  if (isTomorrow(task.dueDate)) {
    return {
      label: "Ngày mai",
      className: "",
    };
  }

  return {
    label: formatShortDate(task.dueDate),
    className: "",
  };
}

function startEditing(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  state.editingTaskId = task.id;
  elements.taskTitle.value = task.title;
  elements.taskNotes.value = task.notes;
  elements.taskProject.value = task.project;
  elements.taskPriority.value = task.priority;
  elements.taskDueDate.value = task.dueDate;
  renderFormState();
  focusComposer();
}

function resetForm(keepFocus = false) {
  state.editingTaskId = null;
  elements.taskForm.reset();
  elements.taskPriority.value = "medium";
  applyViewContextToForm();
  renderFormState();
  if (keepFocus) {
    focusComposer();
  }
}

function applyViewContextToForm() {
  if (state.editingTaskId) {
    return;
  }

  if (state.activeView === "project" && state.activeProject) {
    elements.taskProject.value = state.activeProject;
  }
}

function focusComposer() {
  elements.taskTitle.focus();
  elements.taskTitle.select();
}

function toggleTask(taskId, completed) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  task.completed = completed;
  task.updatedAt = new Date().toISOString();
  task.completedAt = completed ? new Date().toISOString() : "";
  persistTasks();
  render();
  showToast(completed ? "Đã hoàn thành công việc." : "Đã mở lại công việc.");
}

function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  if (!window.confirm(`Xóa "${task.title}"?`)) {
    return;
  }

  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  if (state.editingTaskId === taskId) {
    resetForm(false);
  }
  persistTasks();
  render();
  showToast("Đã xóa công việc.");
}

function clearCompletedTasks() {
  const count = state.tasks.filter((task) => task.completed).length;
  if (!count) {
    showToast("Chưa có việc đã xong để xóa.");
    return;
  }

  if (!window.confirm(`Xóa ${count} công việc đã hoàn thành?`)) {
    return;
  }

  state.tasks = state.tasks.filter((task) => !task.completed);
  if (state.activeView === "completed") {
    state.activeView = "inbox";
    state.showCompleted = false;
  }
  persistTasks();
  render();
  showToast("Đã xóa các việc đã xong.");
}

function loadTasks() {
  try {
    const raw = state.storage.read();
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeTask).filter(Boolean) : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function persistTasks() {
  const result = state.storage.write(JSON.stringify(state.tasks));
  if (!result.persisted) {
    showToast("Đã lưu tạm trong phiên hiện tại.");
  }
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== "object" || !raw.title) {
    return null;
  }

  const createdAt = isValidDate(raw.createdAt) ? raw.createdAt : new Date().toISOString();
  const updatedAt = isValidDate(raw.updatedAt) ? raw.updatedAt : createdAt;

  return {
    id: raw.id || createId(),
    title: String(raw.title).trim(),
    notes: String(raw.notes || "").trim(),
    project: normalizeProject(raw.project),
    priority: PRIORITY_ORDER[raw.priority] !== undefined ? raw.priority : "medium",
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate : "",
    completed: Boolean(raw.completed),
    createdAt,
    updatedAt,
    completedAt: isValidDate(raw.completedAt) ? raw.completedAt : "",
  };
}

function createTask(payload) {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: payload.title,
    notes: payload.notes,
    project: normalizeProject(payload.project),
    priority: PRIORITY_ORDER[payload.priority] !== undefined ? payload.priority : "medium",
    dueDate: payload.dueDate || "",
    completed: false,
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };
}

function createStorageBridge() {
  let mode = "memory";
  let memoryCache = "[]";

  try {
    const probeKey = `${STORAGE_KEY}-probe`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    mode = "localStorage";
  } catch (error) {
    try {
      const current = window.name;
      window.name = current;
      mode = "windowName";
    } catch (windowNameError) {
      mode = "memory";
    }
  }

  return {
    get mode() {
      return mode;
    },
    read() {
      if (mode === "localStorage") {
        try {
          const value = window.localStorage.getItem(STORAGE_KEY);
          if (value) {
            return value;
          }
        } catch (error) {
          mode = "windowName";
        }
      }

      if (mode === "windowName") {
        const value = readFromWindowName();
        if (value) {
          memoryCache = value;
          return value;
        }
      }

      return memoryCache;
    },
    write(value) {
      memoryCache = value;

      if (mode === "localStorage") {
        try {
          window.localStorage.setItem(STORAGE_KEY, value);
          return { persisted: true };
        } catch (error) {
          mode = "windowName";
        }
      }

      if (mode === "windowName") {
        try {
          writeToWindowName(value);
          return { persisted: true };
        } catch (error) {
          mode = "memory";
        }
      }

      return { persisted: false };
    },
  };
}

function readFromWindowName() {
  if (typeof window.name !== "string" || !window.name.startsWith(WINDOW_NAME_PREFIX)) {
    return "";
  }

  return window.name.slice(WINDOW_NAME_PREFIX.length);
}

function writeToWindowName(value) {
  window.name = `${WINDOW_NAME_PREFIX}${value}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2200);
}

function getPresetDate(preset) {
  if (preset === "today") {
    return todayString();
  }

  if (preset === "tomorrow") {
    return shiftDate(1);
  }

  if (preset === "next-week") {
    return shiftDate(7);
  }

  return "";
}

function normalizeProject(value) {
  return String(value || "").trim();
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shiftDate(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatInputDate(date);
}

function todayString() {
  return shiftDate(0);
}

function startOfDay(value) {
  if (!value) {
    return null;
  }

  if (value.includes("T")) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isDueToday(dueDate) {
  return Boolean(dueDate) && dueDate === todayString();
}

function isTomorrow(dueDate) {
  return Boolean(dueDate) && dueDate === shiftDate(1);
}

function isUpcoming(dueDate) {
  return Boolean(dueDate) && startOfDay(dueDate) > startOfDay(todayString());
}

function isOverdue(task) {
  return Boolean(task.dueDate) && !task.completed && startOfDay(task.dueDate) < startOfDay(todayString());
}

function dueSortValue(task) {
  if (!task.dueDate) {
    return Number.POSITIVE_INFINITY;
  }

  return startOfDay(task.dueDate).getTime();
}

function dateValue(value) {
  return new Date(value).getTime();
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(startOfDay(value));
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
