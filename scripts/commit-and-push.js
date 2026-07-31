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

const message = process.argv.slice(2).join(" ").trim() || "Update site";

runGit(["rev-parse", "--show-toplevel"], { capture: true });

const changes = runGit(["status", "--porcelain"], { capture: true });
if (changes) {
  runGit(["add", "--all"]);

  const stagedChanges = runGit(["diff", "--cached", "--name-only"], { capture: true });
  if (stagedChanges) {
    console.log("コミット対象:");
    console.log(stagedChanges);
    runGit(["commit", "-m", message]);
  } else {
    console.log("コミット対象の変更はありません。");
  }
} else {
  console.log("コミットする変更はありません。未送信のコミットがあればプッシュします。");
}

const branch = runGit(["branch", "--show-current"], { capture: true });
if (!branch) {
  console.error("現在のブランチを取得できませんでした。");
  process.exit(1);
}

const remote = runGit(["remote", "get-url", "origin"], { capture: true });
console.log(`${remote} の ${branch} にプッシュします。`);
runGit(["push", "--set-upstream", "origin", branch]);
