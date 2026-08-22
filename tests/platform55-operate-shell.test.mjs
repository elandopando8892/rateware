import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pages = Object.freeze([
  Object.freeze({
    file: "upload-center.html",
    key: "upload-center",
    script: "src/upload-center.js",
    ids: ["auth-form", "file-input", "upload-form", "status-message"]
  }),
  Object.freeze({
    file: "upload-history.html",
    key: "upload-history",
    script: "src/upload-history.js",
    ids: ["auth-form", "history-body", "refresh-button", "status-filter"]
  }),
  Object.freeze({
    file: "staging-review.html",
    key: "staging-review",
    script: "src/staging-review.js",
    ids: ["auth-form", "staging-body", "bulk-approve-button", "staging-status-filter"]
  }),
  Object.freeze({
    file: "rateware.html",
    key: "rateware",
    script: "src/rateware.js",
    ids: ["auth-form", "rateware-body", "rateware-search", "export-filtered-button"]
  })
]);

assert.equal(pages.length, 4, "The Operate adoption contract must stay limited to four routes");

for (const page of pages) {
  const html = readFileSync(page.file, "utf8");
  const source = readFileSync(page.script, "utf8");

  assert.equal(
    (html.match(/data-platform55-shell="tenant"/g) || []).length,
    1,
    `${page.file} must adopt the tenant shell exactly once`
  );
  assert.equal(
    (html.match(new RegExp(`data-platform55-page="${page.key}"`, "g")) || []).length,
    1,
    `${page.file} must publish its canonical route key exactly once`
  );
  assert.equal(
    (html.match(/platform55-shell\.css/g) || []).length,
    1,
    `${page.file} must include the shared shell module exactly once`
  );
  assert.equal(
    (html.match(/platform55-operate\.css/g) || []).length,
    1,
    `${page.file} must include the Operate composition module exactly once`
  );
  assert.equal((html.match(/<main\b/g) || []).length, 1, `${page.file} must expose one main landmark`);
  assert.equal((html.match(/data-platform55-app(?:\s|>)/g) || []).length, 1, `${page.file} must expose one shell app host`);
  assert.equal((html.match(/data-platform55-sidebar(?:\s|>)/g) || []).length, 1, `${page.file} must expose one shell sidebar host`);
  assert.equal((html.match(/data-platform55-topbar(?:\s|>)/g) || []).length, 1, `${page.file} must expose one shell topbar host`);
  assert.equal((html.match(/data-platform55-page-content(?:\s|>)/g) || []).length, 1, `${page.file} must expose one page-content slot`);

  assert.doesNotMatch(html, /class="[^"]*\b(?:shell-layout|side-nav|mobile-topbar|nav-groups)\b/);
  assert.doesNotMatch(html, /<nav[^>]+aria-label="Rateware modules"/i);
  const escapedScript = page.script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(html, new RegExp(`<script[^>]+src="\\./${escapedScript}"`));
  assert.match(source, /import\s*\{[^}]*initAuthControls[^}]*\}\s*from\s*["']\.\/auth\.js["']/s);
  assert.match(source, /initAuthControls\s*\(/);

  for (const id of page.ids) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, `${page.file} must preserve #${id}`);
  }
}

const uploadCenterSource = `${readFileSync("upload-center.html", "utf8")}\n${readFileSync("src/upload-center.js", "utf8")}`;
const stagingReviewSource = `${readFileSync("staging-review.html", "utf8")}\n${readFileSync("src/staging-review.js", "utf8")}`;
const ratewareSource = `${readFileSync("rateware.html", "utf8")}\n${readFileSync("src/rateware.js", "utf8")}`;

assert.match(stagingReviewSource, /pending_review/i);
assert.doesNotMatch(stagingReviewSource, /auto(?:matic)?[_-]?approve/i);
assert.match(uploadCenterSource, /source_file|source_filename/i);
assert.match(ratewareSource, /approved/i);

console.log("Platform55 Operate shell contract passed.");
