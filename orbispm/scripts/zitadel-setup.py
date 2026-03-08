#!/usr/bin/env python3
"""
Zitadel setup script for OrbisPM.
Creates a service user PAT and OIDC application for the backend.
Run once after 'docker compose up' with Zitadel healthy.

Reads configuration from .env file or environment variables.

Usage: python3 scripts/zitadel-setup.py
"""

import hashlib
import base64
import json
import os
import re
import secrets
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from http.cookiejar import CookieJar


def load_dotenv(path=None):
    """Load .env file into os.environ (simple parser, no dependencies)."""
    if path is None:
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.isfile(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key not in os.environ:  # Don't override explicit env vars
                os.environ[key] = value


load_dotenv()

ZITADEL_DOMAIN = os.environ.get("ZITADEL_EXTERNAL_DOMAIN", "localhost")
ZITADEL_PORT = os.environ.get("ZITADEL_MAPPED_PORT", "8081")
ZITADEL_URL = os.environ.get("ZITADEL_URL", f"http://{ZITADEL_DOMAIN}:{ZITADEL_PORT}")
ADMIN_USER = os.environ.get("ZITADEL_ADMIN_USER", "admin@orbispm.local")
ADMIN_PASS = os.environ.get("ZITADEL_ADMIN_PASSWORD", "Admin123!")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
REDIRECT_URI = f"{FRONTEND_URL}/auth/callback"

cookiejar = CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cookiejar),
    urllib.request.HTTPRedirectHandler(),
)

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Don't follow redirects

no_redirect_opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cookiejar),
    NoRedirectHandler(),
)

def api_call(method, path, data=None, token=None, content_type="application/json"):
    url = f"{ZITADEL_URL}{path}"
    if content_type == "application/json" and data:
        body = json.dumps(data).encode()
    elif data and isinstance(data, str):
        body = data.encode()
    elif data and isinstance(data, bytes):
        body = data
    else:
        body = None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", content_type)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with opener.open(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  API error {e.code}: {body[:300]}")
        return None

def wait_for_zitadel():
    print("Waiting for Zitadel...")
    for _ in range(30):
        try:
            req = urllib.request.Request(f"{ZITADEL_URL}/debug/healthz")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.read().decode().strip() == "ok":
                    print("  Zitadel is ready!")
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False

def get_init_pat_from_logs():
    """
    Extract the machine user PAT generated during Zitadel's first-instance
    initialization from Docker container logs.

    Zitadel v2 prints the PAT token as a raw line to stdout during the
    '03_default_instance' migration step. It is NOT wrapped in key=value format.
    Pattern: a standalone line of 60-100 base64url characters (A-Za-z0-9, -, _).
    """
    import subprocess
    print("Trying to extract init PAT from Zitadel container logs...")
    try:
        result = subprocess.run(
            ["docker", "logs", "orbispm-zitadel-api-1"],
            capture_output=True, text=True, timeout=10
        )
        combined = result.stdout + result.stderr

        # The PAT appears as a raw token after the 03_default_instance migration.
        # It may appear inline within a log line or on its own line.
        # Match any long base64url token (60–120 chars, only A-Za-z0-9, -, _)
        # that is preceded/followed by whitespace or line boundaries.
        pat_re = re.compile(r'(?:^|\s)([A-Za-z0-9_\-]{60,120})(?:\s|$)', re.MULTILINE)
        for m in pat_re.finditer(combined):
            candidate = m.group(1)
            # Filter out log fields that look like file paths or timestamps
            if '/' in candidate or ':' in candidate or '.' in candidate:
                continue
            # Must have mixed case and digits — PATs are not all-lowercase names
            if not re.search(r'[A-Z]', candidate) or not re.search(r'[0-9]', candidate):
                continue
            print(f"  Found candidate PAT from logs (len={len(candidate)})")
            return candidate

        # Fallback: look for structured log formats
        for pattern in [r'token="([A-Za-z0-9_\-]{40,})"', r'"token"\s*:\s*"([A-Za-z0-9_\-]{40,})"']:
            m = re.search(pattern, combined)
            if m and len(m.group(1)) > 30:
                print(f"  Found PAT from structured log (len={len(m.group(1))})")
                return m.group(1)

    except Exception as e:
        print(f"  Could not read Docker logs: {e}")
    print("  No PAT found in logs")
    return None


def get_admin_token_via_oidc():
    """
    Get an admin token by using the OIDC Authorization Code flow with PKCE
    via the Console client (Zitadel v2 login UI paths).
    """
    print("Getting admin token via OIDC...")

    # Step 1: Get Console environment to find client_id
    try:
        req = urllib.request.Request(f"{ZITADEL_URL}/ui/console/assets/environment.json")
        with opener.open(req) as resp:
            env = json.loads(resp.read().decode())
            console_client_id = env.get("clientid") or env.get("clientId", "")
            print(f"  Console client_id: {console_client_id}")
    except Exception as e:
        print(f"  Could not get console client_id: {e}")
        return None

    if not console_client_id:
        print("  No Console client_id found")
        return None

    # Step 2: PKCE code verifier + challenge
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()

    state = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(16)

    # Step 3: Start OIDC Authorization, follow initial redirect
    auth_params = urllib.parse.urlencode({
        "client_id": console_client_id,
        "redirect_uri": f"{ZITADEL_URL}/ui/console/auth/callback",
        "response_type": "code",
        "scope": "openid profile email urn:zitadel:iam:org:project:id:zitadel:aud offline_access",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "nonce": nonce,
        "prompt": "login",
    })
    auth_url = f"{ZITADEL_URL}/oauth/v2/authorize?{auth_params}"

    login_url = ""
    try:
        req = urllib.request.Request(auth_url)
        with no_redirect_opener.open(req) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (302, 303):
            login_url = e.headers.get("Location", "")
            print(f"  Login redirect: {login_url[:100]}...")
        else:
            print(f"  Auth request error: {e.code}")
            return None

    # Step 4: Parse the auth request ID from the login URL
    auth_request_match = re.search(r'authRequestID=([^&]+)', login_url)
    if not auth_request_match:
        print("  Could not find authRequestID in login redirect")
        return None

    auth_request_id = auth_request_match.group(1)
    print(f"  Auth request: {auth_request_id}")

    # Step 5: Submit loginname form — Zitadel v2 path is /ui/login/loginname
    login_data = urllib.parse.urlencode({
        "authRequestID": auth_request_id,
        "loginName": ADMIN_USER,
    })
    loginname_redirect = ""
    try:
        req = urllib.request.Request(
            f"{ZITADEL_URL}/ui/login/loginname",
            data=login_data.encode(),
            method="POST",
        )
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with no_redirect_opener.open(req) as resp:
            # Some Zitadel versions return 200 with next URL in body or meta refresh
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  Login name returned 200, checking body for next step...")
            meta = re.search(r'<meta[^>]+http-equiv=["\']refresh["\'][^>]+url=([^\s"\'>;]+)', body, re.IGNORECASE)
            if meta:
                loginname_redirect = meta.group(1)
            elif '/ui/login/password' in body or 'password' in body.lower():
                loginname_redirect = f"/ui/login/password"
                print(f"  Password page detected in body")
    except urllib.error.HTTPError as e:
        if e.code in (302, 303):
            loginname_redirect = e.headers.get("Location", "")
            print(f"  Login name submitted (302), redirect: {loginname_redirect[:80]}")
        else:
            body = e.read().decode()
            print(f"  Login name error: {e.code}: {body[:200]}")
            return None

    # Step 6: Submit password — Zitadel v2 path is /ui/login/password
    pwd_data = urllib.parse.urlencode({
        "authRequestID": auth_request_id,
        "password": ADMIN_PASS,
    })
    callback_url = ""
    try:
        req = urllib.request.Request(
            f"{ZITADEL_URL}/ui/login/password",
            data=pwd_data.encode(),
            method="POST",
        )
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with no_redirect_opener.open(req) as resp:
            # Some Zitadel versions return 200 with meta redirect or code in body
            body = resp.read().decode("utf-8", errors="replace")
            print(f"  Password returned 200, scanning body for authcode...")
            code_m = re.search(r'[?&]code=([A-Za-z0-9%_\-\.]+)', body)
            if code_m:
                callback_url = f"?code={code_m.group(1)}"
            else:
                url_m = re.search(r'https?://[^\s"\'<>]+code=[^\s"\'<>]+', body)
                if url_m:
                    callback_url = url_m.group(0)
    except urllib.error.HTTPError as e:
        if e.code in (302, 303):
            callback_url = e.headers.get("Location", "")
            print(f"  Password accepted (302), callback: {callback_url[:100]}...")
        else:
            body = e.read().decode()
            print(f"  Password error: {e.code}: {body[:200]}")
            return None

    # Step 7: Follow redirects to get the auth code
    if not callback_url:
        print("  Could not get callback URL from password step")
        return None

    max_redirects = 10
    current_url = callback_url
    code = None

    for _ in range(max_redirects):
        if "code=" in current_url:
            code_match = re.search(r'code=([^&]+)', current_url)
            if code_match:
                code = code_match.group(1)
                break

        try:
            if current_url.startswith("/"):
                current_url = f"{ZITADEL_URL}{current_url}"
            req = urllib.request.Request(current_url)
            with no_redirect_opener.open(req) as resp:
                break
        except urllib.error.HTTPError as e:
            if e.code in (302, 303):
                current_url = e.headers.get("Location", "")
            else:
                break

    if not code:
        print("  Could not extract authorization code from redirect chain")
        return None

    print(f"  Got authorization code")

    # Step 8: Exchange code for tokens
    token_data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": f"{ZITADEL_URL}/ui/console/auth/callback",
        "client_id": console_client_id,
        "code_verifier": code_verifier,
    })

    try:
        req = urllib.request.Request(
            f"{ZITADEL_URL}/oauth/v2/token",
            data=token_data.encode(),
            method="POST",
        )
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with opener.open(req) as resp:
            token_resp = json.loads(resp.read().decode())
            access_token = token_resp.get("access_token")
            if access_token:
                print(f"  Got admin access token!")
                return access_token
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  Token exchange error: {e.code}: {body[:300]}")

    return None

def create_machine_user(token):
    print("Creating/finding machine user 'orbispm-backend'...")
    # First search for existing user
    search = api_call("POST", "/management/v1/users/_search", {
        "queries": [{"userNameQuery": {"userName": "orbispm-backend", "method": "TEXT_QUERY_METHOD_EQUALS"}}]
    }, token)
    if search and search.get("result"):
        user_id = search["result"][0]["id"]
        print(f"  Found existing machine user: {user_id}")
        return user_id

    # Check the backend-service user created by init
    search = api_call("POST", "/management/v1/users/_search", {
        "queries": [{"userNameQuery": {"userName": "backend-service", "method": "TEXT_QUERY_METHOD_EQUALS"}}]
    }, token)
    if search and search.get("result"):
        user_id = search["result"][0]["id"]
        print(f"  Found init machine user 'backend-service': {user_id}")
        return user_id

    # Create new
    data = {
        "userName": "orbispm-backend",
        "name": "OrbisPM Backend Service",
        "description": "Service account for OrbisPM backend",
    }
    result = api_call("POST", "/management/v1/users/machine", data, token)
    if not result:
        return None
    user_id = result.get("userId")
    print(f"  Machine user created: {user_id}")
    return user_id

def grant_iam_owner(token, user_id):
    print("Granting IAM_OWNER role to machine user...")
    data = {"userId": user_id, "roles": ["IAM_OWNER"]}
    result = api_call("POST", "/admin/v1/members", data, token)
    if not result:
        print("  Role grant issue (may already exist)")
    else:
        print("  IAM_OWNER role granted")

def create_pat(token, user_id):
    print("Creating PAT for machine user...")
    result = api_call("POST", f"/management/v1/users/{user_id}/pats", {
        "expirationDate": "2030-01-01T00:00:00Z",
    }, token)
    if not result:
        return None
    pat_token = result.get("token")
    print(f"  PAT created!")
    return pat_token

def create_project(token):
    print("Creating project 'OrbisPM'...")
    # Check existing
    search = api_call("POST", "/management/v1/projects/_search", {}, token)
    if search and search.get("result"):
        for p in search["result"]:
            if p.get("name") == "OrbisPM":
                print(f"  Found existing project: {p['id']}")
                return p["id"]

    result = api_call("POST", "/management/v1/projects", {
        "name": "OrbisPM",
        "projectRoleAssertion": False,
        "projectRoleCheck": False,
        "hasProjectCheck": False,
    }, token)
    if not result:
        return None
    print(f"  Project created: {result['id']}")
    return result["id"]

def create_oidc_app(token, project_id):
    print("Creating OIDC application 'OrbisPM Web'...")
    # Check existing
    search = api_call("GET", f"/management/v1/projects/{project_id}/apps/_search", None, token)
    if not search:
        search = api_call("POST", f"/management/v1/projects/{project_id}/apps/_search", {}, token)
    if search and search.get("result"):
        for a in search["result"]:
            if a.get("name") == "OrbisPM Web":
                client_id = a.get("oidcConfig", {}).get("clientId", "")
                print(f"  Found existing app, client_id: {client_id}")
                return client_id

    result = api_call("POST", f"/management/v1/projects/{project_id}/apps/oidc", {
        "name": "OrbisPM Web",
        "redirectUris": [REDIRECT_URI, f"{FRONTEND_URL}/login"],
        "postLogoutRedirectUris": [f"{FRONTEND_URL}/login"],
        "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
        "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE", "OIDC_GRANT_TYPE_REFRESH_TOKEN"],
        "appType": "OIDC_APP_TYPE_USER_AGENT",
        "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
        "devMode": True,
        "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
        "idTokenRoleAssertion": True,
        "idTokenUserinfoAssertion": True,
    }, token)
    if not result:
        return None
    client_id = result.get("clientId")
    print(f"  OIDC app created, client_id: {client_id}")
    return client_id

def main():
    if not wait_for_zitadel():
        sys.exit(1)
    time.sleep(5)  # Extra delay for Zitadel to finish projection setup

    # Strategy 1: get the init-generated machine user PAT from Docker logs.
    # Zitadel creates this PAT for ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE
    # and the token value appears in startup logs.
    # If we get it, use it directly as the service token (skip admin OIDC flow).
    init_pat = get_init_pat_from_logs()

    if init_pat:
        print("Using machine user PAT from init logs as service token...")
        # Verify it works against the management API
        test = api_call("POST", "/management/v1/users/_search", {
            "queries": [{"userNameQuery": {"userName": "backend-service", "method": "TEXT_QUERY_METHOD_EQUALS"}}]
        }, init_pat)
        if test is not None:
            print("  PAT validated against management API!")
            machine_user_id = test["result"][0]["id"] if test.get("result") else None
        else:
            print("  Init PAT did not work against management API, falling back to OIDC...")
            init_pat = None

    # Strategy 2: OIDC login as human admin
    if init_pat:
        admin_token = init_pat
        pat = init_pat  # The init PAT IS the service token
        user_id = machine_user_id
        # Still need to create the OIDC app — need admin token for that
        # The init PAT should have ORG_OWNER rights for this
    else:
        # Get admin token via OIDC flow
        admin_token = get_admin_token_via_oidc()
        if not admin_token:
            print("\nERROR: Could not get admin token")
            sys.exit(1)

        # Find/create machine user
        user_id = create_machine_user(admin_token)
        if not user_id:
            print("ERROR: Could not create/find machine user")
            sys.exit(1)

        # Grant IAM_OWNER
        grant_iam_owner(admin_token, user_id)

        # Create PAT
        pat = create_pat(admin_token, user_id)
        if not pat:
            print("ERROR: Could not create PAT")
            sys.exit(1)

    # Create project
    project_id = create_project(admin_token)
    if not project_id:
        print("ERROR: Could not create project")
        sys.exit(1)

    # Create OIDC app
    client_id = create_oidc_app(admin_token, project_id)
    if not client_id:
        print("ERROR: Could not create OIDC app")
        sys.exit(1)

    # Output configuration
    config = {
        "ZITADEL_SERVICE_TOKEN": pat,
        "ZITADEL_CLIENT_ID": client_id,
        "ZITADEL_PROJECT_ID": project_id,
    }

    print("\n" + "=" * 60)
    print("ZITADEL SETUP COMPLETE!")
    print("=" * 60)
    print()
    for key, value in config.items():
        print(f"  {key}={value}")
    print()
    print(f"  NEXT_PUBLIC_ZITADEL_CLIENT_ID={client_id}")
    print(f"  NEXT_PUBLIC_ZITADEL_ISSUER={ZITADEL_URL}")
    print()

    # Update .env file with Zitadel tokens
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.isfile(env_path):
        with open(env_path, "r") as f:
            content = f.read()
        for key in ("ZITADEL_SERVICE_TOKEN", "ZITADEL_CLIENT_ID"):
            val = config[key]
            # Replace existing line (even if empty value)
            import re as _re
            content = _re.sub(
                rf"^{key}=.*$",
                f"{key}={val}",
                content,
                flags=_re.MULTILINE,
            )
        with open(env_path, "w") as f:
            f.write(content)
        print(f"Updated {env_path} with ZITADEL_SERVICE_TOKEN and ZITADEL_CLIENT_ID")
    else:
        print(f"WARNING: {env_path} not found — create it from .env.example")

    # Also write frontend .env.local if it exists
    frontend_env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", ".env.local")
    frontend_dir = os.path.dirname(frontend_env)
    if os.path.isdir(frontend_dir):
        lines = []
        if os.path.isfile(frontend_env):
            with open(frontend_env) as f:
                lines = f.readlines()
        # Update or append NEXT_PUBLIC vars
        for key, val in [
            ("NEXT_PUBLIC_ZITADEL_CLIENT_ID", client_id),
            ("NEXT_PUBLIC_ZITADEL_ISSUER", ZITADEL_URL),
        ]:
            found = False
            for i, line in enumerate(lines):
                if line.startswith(f"{key}="):
                    lines[i] = f"{key}={val}\n"
                    found = True
                    break
            if not found:
                lines.append(f"{key}={val}\n")
        with open(frontend_env, "w") as f:
            f.writelines(lines)
        print(f"Updated {frontend_env}")

if __name__ == "__main__":
    main()
