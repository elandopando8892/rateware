import { humanizeError } from "./error-copy.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function stateBlock({
  tone = "neutral",
  eyebrow = "",
  title = "Nothing to show yet",
  detail = "There is no data in this view right now.",
  actionHref = "",
  actionLabel = "",
  actionButton = "",
  meta = ""
} = {}) {
  const action = actionHref && actionLabel
    ? `<a href="${escapeHtml(actionHref)}">${escapeHtml(actionLabel)}</a>`
    : actionButton || "";

  return `
    <div class="ui-state" data-tone="${escapeHtml(tone)}">
      ${eyebrow ? `<span>${escapeHtml(eyebrow)}</span>` : ""}
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
      ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      ${action ? `<div class="ui-state-actions">${action}</div>` : ""}
    </div>
  `;
}

export function tableState(colspan, options = {}) {
  return `<tr class="ui-state-row"><td colspan="${Number(colspan) || 1}">${stateBlock(options)}</td></tr>`;
}

export function loadingState({ title = "Loading workspace", detail = "Rateware is reading the latest data.", rows = 3 } = {}) {
  const skeletonRows = Array.from({ length: rows }, () => `
    <i>
      <b></b>
      <b></b>
      <b></b>
    </i>
  `).join("");

  return `
    <div class="ui-state ui-state-loading" data-tone="loading">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(detail)}</p>
      <div class="ui-skeleton-list" aria-hidden="true">${skeletonRows}</div>
    </div>
  `;
}

export function tableLoadingState(colspan, options = {}) {
  return `<tr class="ui-state-row"><td colspan="${Number(colspan) || 1}">${loadingState(options)}</td></tr>`;
}

export function errorState(error, {
  title = "This view could not load",
  actionLabel = "Retry",
  retryAction = "",
  actionHref = "",
  meta = ""
} = {}) {
  const detail = humanizeError(error);
  const actionButton = retryAction
    ? `<button class="secondary small-button" type="button" data-retry-action="${escapeHtml(retryAction)}">${escapeHtml(actionLabel)}</button>`
    : "";

  return stateBlock({
    tone: "danger",
    eyebrow: "Needs attention",
    title,
    detail,
    actionHref,
    actionLabel: actionHref ? actionLabel : "",
    actionButton,
    meta
  });
}

export function tableErrorState(colspan, error, options = {}) {
  return `<tr class="ui-state-row"><td colspan="${Number(colspan) || 1}">${errorState(error, options)}</td></tr>`;
}
