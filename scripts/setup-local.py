#!/usr/bin/env python3
"""
Cross-platform local setup for OrbisPM.

Works on Linux/macOS/Windows and performs:
1) Optional Docker image build
2) Start local profile services
3) Run Zitadel credential/bootstrap setup
4) Recreate app-facing services so refreshed env vars are applied
"""

from __future__ import annotations

import argparse
import platform
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def info(message: str) -> None:
    print(message, flush=True)


def run(cmd: list[str], cwd: Path) -> None:
    info(f"\n$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd), check=True)


def wait_for_http(url: str, timeout_seconds: int = 120) -> None:
    info(f"\nWaiting for {url} ...")
    deadline = time.time() + timeout_seconds
    last_error: str | None = None

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                status = response.getcode()
                if 200 <= status < 500:
                    info(f"Ready: {url} (HTTP {status})")
                    return
        except urllib.error.HTTPError as exc:
            if 200 <= exc.code < 500:
                info(f"Ready: {url} (HTTP {exc.code})")
                return
            last_error = f"HTTPError {exc.code}"
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)

        time.sleep(2)

    raise RuntimeError(f"Timed out waiting for {url}. Last error: {last_error}")


def ensure_command_available(name: str, install_hint: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Required command '{name}' is not available. {install_hint}")


def resolve_env_file(project_root: Path, env_file_arg: str) -> Path:
    env_path = Path(env_file_arg)
    if not env_path.is_absolute():
        env_path = project_root / env_path

    if env_path.exists():
        return env_path

    env_example = project_root / ".env.example"
    if env_example.exists():
        info(f"\n{env_path} not found. Creating it from {env_example}.")
        shutil.copy2(env_example, env_path)
        return env_path

    raise RuntimeError(f"Env file not found: {env_path}")


def load_env_values(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Set up OrbisPM local stack on any OS.")
    parser.add_argument(
        "--env-file",
        default=".env.local",
        help="Env file to use for docker compose (default: .env.local)",
    )
    parser.add_argument(
        "--profile",
        default="local",
        help="Compose profile to run (default: local)",
    )
    parser.add_argument(
        "--compose-file",
        default="docker-compose.yaml",
        help="Compose file path relative to project root (default: docker-compose.yaml)",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip docker compose build",
    )
    parser.add_argument(
        "--skip-zitadel-setup",
        action="store_true",
        help="Skip running scripts/zitadel-setup.py",
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=180,
        help="Max seconds to wait for Kong endpoint readiness (default: 180)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]

    info("=" * 62)
    info("OrbisPM Cross-Platform Local Setup")
    info("=" * 62)
    info(f"OS: {platform.system()} {platform.release()}")
    info(f"Project root: {project_root}")

    try:
        ensure_command_available("docker", "Install Docker Desktop / Docker Engine and retry.")

        run(["docker", "version"], cwd=project_root)
        run(["docker", "compose", "version"], cwd=project_root)

        env_path = resolve_env_file(project_root, args.env_file)
        compose_file = args.compose_file

        compose_base = [
            "docker",
            "compose",
            "--env-file",
            str(env_path),
            "-f",
            compose_file,
            "--profile",
            args.profile,
        ]

        if not args.skip_build:
            run(compose_base + ["build"], cwd=project_root)

        run(compose_base + ["up", "-d"], cwd=project_root)

        if not args.skip_zitadel_setup:
            run(
                [
                    sys.executable,
                    str(project_root / "scripts" / "zitadel-setup.py"),
                    str(env_path),
                ],
                cwd=project_root,
            )

            # Recreate services that read Zitadel/env config at startup.
            run(
                compose_base
                + [
                    "up",
                    "-d",
                    "--force-recreate",
                    "api",
                    "messaging-service",
                    "frontend",
                    "kong",
                ],
                cwd=project_root,
            )

        env_values = load_env_values(env_path)
        kong_port = env_values.get("KONG_PROXY_PORT", "8000")

        wait_for_http(f"http://localhost:{kong_port}/api/v1/auth/idps", args.wait_seconds)
        run(compose_base + ["ps"], cwd=project_root)

        info("\nSetup complete.")
        info(f"Frontend: http://localhost:3000")
        info(f"API Gateway (Kong): http://localhost:{kong_port}")
        info("Zitadel: http://localhost:8081")
        return 0
    except subprocess.CalledProcessError as exc:
        info(f"\nCommand failed with exit code {exc.returncode}.")
        info("If this was a port conflict (for example :8000), stop the conflicting process/container and rerun.")
        return exc.returncode
    except Exception as exc:  # noqa: BLE001
        info(f"\nSetup failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
