#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function runGit(args, { capture = false } = {}) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return capture ? result.stdout.trim() : "";
}

function createCommitMessage(fileList) {
  const rules = [
    ["event data", (file) => file.startsWith("data/")],
    ["frontend", (file) => ["app.js", "index.html", "styles.css", "favicon.svg"].includes(file)],
    ["tests", (file) => file.startsWith("tests/")],
    ["automation", (file) => file.startsWith(".github/")],
    ["documentation", (file) => file.endsWith(".md")],
    ["tooling", (file) => file.startsWith("scripts/")],
    ["application code", (file) => file.startsWith("lib/") || file === "server.js"],
    [
      "project configuration",
      (file) => file === ".gitignore" || file === "package.json" || file === "package-lock.json",
    ],
  ];
  const categories = new Set();

  fileList.split("\n").forEach((file) => {
    const matchedRule = rules.find(([, matches]) => matches(file));
    categories.add(matchedRule?.[0] || "project files");
  });

  const summary = new Intl.ListFormat("en", {
    style: "long",
    type: "conjunction",
  }).format([...categories]);
  return `Update ${summary}`;
}

const requestedMessage = process.argv.slice(2).join(" ").trim();

runGit(["rev-parse", "--show-toplevel"], { capture: true });

const branch = runGit(["branch", "--show-current"], { capture: true });
if (!branch) {
  console.error("現在のブランチを取得できませんでした。");
  process.exit(1);
}

const remote = runGit(["remote", "get-url", "origin"], { capture: true });
console.log(`${remote} の ${branch} から最新の変更を取り込みます。`);
runGit(["pull", "--rebase", "--autostash", "origin", branch]);

const changes = runGit(["status", "--porcelain"], { capture: true });
if (changes) {
  runGit(["add", "--all"]);

  const stagedChanges = runGit(["diff", "--cached", "--name-only"], { capture: true });
  if (stagedChanges) {
    const message = requestedMessage || createCommitMessage(stagedChanges);
    console.log("コミット対象:");
    console.log(stagedChanges);
    console.log(`コミットメッセージ: ${message}`);
    runGit(["commit", "-m", message]);
  } else {
    console.log("コミット対象の変更はありません。");
  }
} else {
  console.log("コミットする変更はありません。未送信のコミットがあればプッシュします。");
}

console.log("プッシュ直前の変更を確認します。");
runGit(["pull", "--rebase", "origin", branch]);
console.log(`${remote} の ${branch} にプッシュします。`);
runGit(["push", "--set-upstream", "origin", branch]);
