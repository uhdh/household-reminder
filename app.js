import { ITEMS, CATEGORIES } from "./data.js";
import { todayISO, computeStatus } from "./reminder.js";
import { getLastDone, setLastDone, ensureInitialized } from "./storage.js";

const store = window.localStorage;
let pendingItemId = null;

function renderBoard() {
  const today = todayISO();
  ensureInitialized(store, ITEMS, today);

  const board = document.getElementById("board");
  board.innerHTML = "";

  for (const category of CATEGORIES) {
    const column = document.createElement("section");
    column.className = "column";
    column.dataset.category = category.id;

    const header = document.createElement("h2");
    header.className = "column-header";
    header.textContent = category.label;
    column.appendChild(header);

    const list = document.createElement("div");
    list.className = "card-list";

    for (const item of ITEMS.filter((i) => i.category === category.id)) {
      list.appendChild(renderCard(item, today));
    }

    column.appendChild(list);
    board.appendChild(column);
  }
}

function renderCard(item, today) {
  const lastDone = getLastDone(store, item.id);
  const status = computeStatus(lastDone, item.cycleDays, today);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.id = item.id;
  card.title = status.dueDate
    ? `마지막 교체일: ${lastDone}\n${
        status.daysRemaining >= 0
          ? `D-${status.daysRemaining}`
          : `${-status.daysRemaining}일 초과`
      }`
    : `마지막 교체일: ${lastDone}`;

  const icon = document.createElement("span");
  icon.className = "card-icon";
  icon.textContent = item.icon;

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name;

  card.appendChild(icon);
  card.appendChild(name);

  if (status.percent !== null) {
    const track = document.createElement("span");
    track.className = "card-progress";

    const fill = document.createElement("span");
    fill.className = "card-progress-fill";
    fill.style.width = `${status.percent}%`;
    fill.style.background = progressColor(status.percent, status.overdue);

    track.appendChild(fill);
    card.appendChild(track);
  }

  if (status.overdue) {
    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.textContent = "!";
    card.appendChild(badge);
  }

  return card;
}

function progressColor(percent, overdue) {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function findItem(id) {
  return ITEMS.find((i) => i.id === id);
}

function showToast(item) {
  pendingItemId = item.id;
  const today = todayISO();
  document.getElementById("toast-message").textContent =
    `${item.name} 교체(관리) 완료로 표시할까요?`;
  const dateInput = document.getElementById("toast-date");
  dateInput.max = today;
  dateInput.value = today;
  document.getElementById("toast").hidden = false;
}

function hideToast() {
  pendingItemId = null;
  document.getElementById("toast").hidden = true;
}

function confirmReset() {
  if (!pendingItemId) return;
  const dateInput = document.getElementById("toast-date");
  const chosenDate = dateInput.value || todayISO();
  setLastDone(store, pendingItemId, chosenDate);
  hideToast();
  renderBoard();
}

document.getElementById("board").addEventListener("click", (event) => {
  const card = event.target.closest(".card");
  if (!card) return;
  const item = findItem(card.dataset.id);
  if (item) showToast(item);
});

document.getElementById("toast-confirm").addEventListener("click", confirmReset);
document.getElementById("toast-cancel").addEventListener("click", hideToast);

renderBoard();
