#!/usr/bin/env python3
"""Fetch a small daily selection from the public GitHub REST API."""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
API = "https://api.github.com"
RATE_LIMIT_MESSAGE = ""


class RateLimitError(Exception):
    pass


def request_json(url: str) -> dict | list:
    global RATE_LIMIT_MESSAGE
    if RATE_LIMIT_MESSAGE:
        raise RateLimitError(RATE_LIMIT_MESSAGE)
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "github-project-tracker/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN", "")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    try:
        with urlopen(req, timeout=20) as response:
            return json.load(response)
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(body).get("message", "")
        except json.JSONDecodeError:
            message = ""
        remaining = exc.headers.get("X-RateLimit-Remaining")
        if exc.code == 429 or (exc.code == 403 and (remaining == "0" or "rate limit" in message.lower())):
            retry_after = exc.headers.get("Retry-After") or exc.headers.get("X-RateLimit-Reset")
            RATE_LIMIT_MESSAGE = f"GitHub API 限流：{message or exc.code}；Retry-After/重置时间：{retry_after or '未提供'}。本轮已停止请求。"
            raise RateLimitError(RATE_LIMIT_MESSAGE) from exc
        raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/projects.json")
    args = parser.parse_args()
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    entries: dict[str, dict] = {}
    errors: list[str] = []
    incomplete = False

    def normalize_repo(repo: dict, category: str, reason: str = "", fetch_release: bool = False) -> None:
        nonlocal incomplete
        try:
            if repo.get("archived") or repo.get("fork"):
                return
            repo_id = str(repo["id"])
            if repo_id in entries:
                return
            item = {
                "id": repo["id"],
                "full_name": repo["full_name"],
                "name": repo["name"],
                "owner": repo["owner"]["login"],
                "description": repo.get("description") or "暂无项目简介",
                "html_url": repo["html_url"],
                "homepage": repo.get("homepage") or "",
                "language": repo.get("language") or "未标注",
                "license": (repo.get("license") or {}).get("spdx_id") or "未标注",
                "stars": repo.get("stargazers_count", 0),
                "forks": repo.get("forks_count", 0),
                "open_issues": repo.get("open_issues_count", 0),
                "updated_at": repo.get("updated_at"),
                "pushed_at": repo.get("pushed_at"),
                "archived": repo.get("archived", False),
                "default_branch": repo.get("default_branch", "main"),
                "category": category,
                "reason": reason,
                "access_status": "待核实",
                "license_status": "待核实" if not repo.get("license") else "已检测到许可证，需核对适用条件",
                "release": None,
            }
            if fetch_release:
                try:
                    releases = request_json(f"{API}/repos/{repo['full_name']}/releases?per_page=10")
                    stable = next((r for r in releases if not r.get("draft") and not r.get("prerelease")), None)
                    if stable:
                        item["release"] = {
                            "tag": stable.get("tag_name", ""),
                            "name": stable.get("name") or stable.get("tag_name", ""),
                            "published_at": stable.get("published_at"),
                            "url": stable.get("html_url"),
                        }
                except (HTTPError, URLError, TimeoutError, ValueError) as exc:
                    item["release_error"] = str(exc)[:160]
                    incomplete = True
            entries[repo_id] = item
        except (KeyError, TypeError) as exc:
            errors.append(f"{repo.get('full_name', 'unknown')}: invalid API response ({exc})")
            incomplete = True

    def add_seed(full_name: str, category: str, reason: str = "") -> None:
        nonlocal incomplete
        try:
            repo = request_json(f"{API}/repos/{full_name}")
            normalize_repo(repo, category, reason, fetch_release=True)
        except HTTPError as exc:
            errors.append(f"{full_name}: GitHub API HTTP {exc.code}")
            incomplete = True
        except (URLError, TimeoutError, KeyError, ValueError, RateLimitError) as exc:
            errors.append(f"{full_name}: {exc}")
            incomplete = True

    for seed in config["seed_repositories"]:
        add_seed(seed["full_name"], seed["category"], seed.get("reason", ""))
        if RATE_LIMIT_MESSAGE:
            break

    searches = config.get("searches", [])[: config.get("max_search_requests", 6)]
    for index, search in enumerate(searches):
        if RATE_LIMIT_MESSAGE:
            break
        if index:
            time.sleep(7)
        params = urlencode({"q": search["q"], "sort": "updated", "order": "desc", "per_page": config.get("per_page", 20)})
        try:
            result = request_json(f"{API}/search/repositories?{params}")
            incomplete = incomplete or bool(result.get("incomplete_results"))
            for repo in result.get("items", []):
                # Search payloads contain the display fields; avoid a second API call per result.
                normalize_repo(repo, search["category"])
        except HTTPError as exc:
            errors.append(f"搜索 {search['category']}: GitHub API HTTP {exc.code}")
            incomplete = True
        except (URLError, TimeoutError, ValueError, RateLimitError) as exc:
            errors.append(f"搜索 {search['category']}: {exc}")
            incomplete = True

    projects = sorted(entries.values(), key=lambda p: (p["stars"], p["updated_at"] or ""), reverse=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": "部分更新" if incomplete else "更新完成",
        "warning": "GitHub 搜索可能不完整；免费条件仍需逐项核实。" if incomplete else "免费条件仍需逐项核实；目录仓库的许可证不代表其外链资源免费。",
        "errors": errors,
        "projects": projects,
    }
    output = Path(args.output)
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(projects)} projects to {output}")
    return 0 if projects else 1


if __name__ == "__main__":
    sys.exit(main())

