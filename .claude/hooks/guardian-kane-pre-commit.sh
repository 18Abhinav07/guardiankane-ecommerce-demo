#!/usr/bin/env bash
# Git invokes this as .git/hooks/pre-commit (a symlink to this file), with
# $0 set to that symlink path and cwd at the repo root — so `dirname "$0"`
# resolves to .git/hooks, not this file's real directory. Reference the JS
# file by its fixed, repo-root-relative path instead of deriving it from $0.
exec node .claude/hooks/guardian-kane-pre-commit.js
