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
import http.cookiejar as http_cookiejar
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


_env_arg = sys.argv[1] if len(sys.argv) > 1 else None
if _env_arg:
    load_dotenv(_env_arg)
else:
    # Try .env.local first, then .env
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if os.path.isfile(os.path.join(_root, ".env.local")):
        load_dotenv(os.path.join(_root, ".env.local"))
    else:
        load_dotenv()

ZITADEL_DOMAIN = os.environ.get("ZITADEL_EXTERNAL_DOMAIN", "localhost")
ZITADEL_PORT = os.environ.get("ZITADEL_MAPPED_PORT", "8081")
_ext_secure = os.environ.get("ZITADEL_EXTERNAL_SECURE", "false").lower() == "true"
_ext_port = os.environ.get("ZITADEL_EXTERNAL_PORT", ZITADEL_PORT)
if not os.environ.get("ZITADEL_URL"):
    _scheme = "https" if _ext_secure else "http"
    _port_suffix = "" if (_scheme == "https" and str(_ext_port) == "443") or (_scheme == "http" and str(_ext_port) == "80") else f":{_ext_port}"
    ZITADEL_URL = f"{_scheme}://{ZITADEL_DOMAIN}{_port_suffix}"
else:
    ZITADEL_URL = os.environ["ZITADEL_URL"]
ADMIN_USER = os.environ.get("ZITADEL_ADMIN_USER", "admin@orbispm.local")
ADMIN_PASS = os.environ.get("ZITADEL_ADMIN_PASSWORD", "Admin123!")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")
REDIRECT_URI = f"{FRONTEND_URL}/auth/callback"

# Use a real browser User-Agent (Zitadel fingerprints UA and rejects mismatches)
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
# Full browser headers — Zitadel fingerprints the entire header set
BROWSER_HEADERS = [
    ("User-Agent", BROWSER_UA),
    ("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"),
    ("Accept-Language", "en-US,en;q=0.9"),
    ("Accept-Encoding", "identity"),
    ("Connection", "keep-alive"),
    ("Upgrade-Insecure-Requests", "1"),
]

# Override cookie policy to send Secure cookies over HTTP (for local dev)
_cookie_policy = http_cookiejar.DefaultCookiePolicy()
_cookie_policy.return_ok_secure = lambda cookie, request: True

cookiejar = CookieJar(policy=_cookie_policy)

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Don't follow redirects

# Rewrites https://ZITADEL_DOMAIN:PORT → http:// so redirects work over plain HTTP.
# Only applies when ZITADEL_URL itself is http:// (local dev). For external HTTPS, no rewrite.
class RewriteHTTPSRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not ZITADEL_URL.startswith("https://"):
            parsed = urllib.parse.urlparse(ZITADEL_URL)
            local_http_prefix = f"http://{parsed.netloc}"
            https_prefix = f"https://{parsed.netloc}"
            newurl = newurl.replace(https_prefix, local_http_prefix)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

# opener: follows redirects, rewriting external https → local http
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cookiejar),
    RewriteHTTPSRedirectHandler(),
)
opener.addheaders = BROWSER_HEADERS

no_redirect_opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cookiejar),
    NoRedirectHandler(),
)
no_redirect_opener.addheaders = BROWSER_HEADERS

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
            with opener.open(req, timeout=10) as resp:
                body = resp.read().decode().strip().strip('"')
                if body == "ok":
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
        # Try common container name patterns
        for container_name in ["orbispm-zitadel-1", "orbispm-zitadel-api-1", "zitadel"]:
            result = subprocess.run(
                ["docker", "logs", container_name],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0 and result.stdout:
                break
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


def _post_form(path_or_url, data):
    """POST a form to Zitadel without following redirects. Returns (status, body, location)."""
    url = path_or_url if path_or_url.startswith("http") else f"{ZITADEL_URL}{path_or_url}"
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with no_redirect_opener.open(req) as resp:
            return resp.getcode(), resp.read().decode("utf-8", errors="replace"), resp.headers.get("Location", "")
    except urllib.error.HTTPError as e:
        return e.code, "", e.headers.get("Location", "")


def _follow_to_page(url):
    """Follow redirects and return (body, final_url)."""
    # Only rewrite https→http when ZITADEL_URL is http (local dev)
    if not ZITADEL_URL.startswith("https://"):
        parsed = urllib.parse.urlparse(ZITADEL_URL)
        url = url.replace(f"https://{parsed.netloc}", f"http://{parsed.netloc}")
    if url.startswith("/"):
        url = f"{ZITADEL_URL}{url}"
    try:
        with opener.open(url) as resp:
            return resp.read().decode("utf-8", errors="replace"), resp.geturl()
    except Exception as e:
        return "", str(e)


def get_admin_token_via_oidc():
    """
    Get an admin token via OIDC Authorization Code flow with PKCE.
    Handles Zitadel's login UI: loginname → password → optional 2FA skip → code exchange.
    """
    print("Getting admin token via OIDC...")

    # Warm up: fetch the login page so Zitadel sets the UA session cookie
    try:
        opener.open(f"{ZITADEL_URL}/ui/login/")
    except Exception:
        pass

    # Step 1: Get Console environment
    try:
        with opener.open(f"{ZITADEL_URL}/ui/console/assets/environment.json") as resp:
            env = json.loads(resp.read().decode())
        console_client_id = env.get("clientid") or env.get("clientId", "")
        # console_base_url from environment.json uses the external https URL — used for redirect_uri
        console_base_url = env.get("api", ZITADEL_URL).rstrip("/")
        print(f"  Console client_id: {console_client_id}")
        print(f"  Redirect base URL: {console_base_url}")
    except Exception as e:
        print(f"  Could not get console environment: {e}")
        return None

    if not console_client_id:
        print("  No Console client_id found")
        return None

    # Step 2: PKCE
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(16)
    redirect_uri = f"{console_base_url}/ui/console/auth/callback"

    # Step 3: Start OIDC auth — opener follows redirects (https→http rewritten) to login page
    auth_params = urllib.parse.urlencode({
        "client_id": console_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid profile email urn:zitadel:iam:org:project:id:zitadel:aud offline_access",
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "nonce": nonce,
        "prompt": "login",
    })
    try:
        with opener.open(f"{ZITADEL_URL}/oauth/v2/authorize?{auth_params}") as resp:
            login_body = resp.read().decode()
            login_url = resp.geturl()
        print(f"  Login page: {login_url[:80]}")
    except Exception as e:
        print(f"  Auth start error: {e}")
        return None

    # Step 4: Extract authRequestID and CSRF
    aid_m = re.search(r'authRequestID=([^&"]+)', login_url) or \
            re.search(r'name="authRequestID"[^>]*value="([^"]+)"', login_body)
    if not aid_m:
        print("  Could not find authRequestID")
        return None
    auth_request_id = aid_m.group(1)

    def extract_csrf(html):
        m = re.search(r'name="gorilla\.csrf\.Token"[^>]*value="([^"]+)"', html)
        return m.group(1) if m else ""

    csrf = extract_csrf(login_body)
    print(f"  Auth request: {auth_request_id}, CSRF found: {bool(csrf)}")

    # Step 5: POST loginname
    sc, body, loc = _post_form("/ui/login/loginname", {
        "authRequestID": auth_request_id,
        "loginName": ADMIN_USER,
        "gorilla.csrf.Token": csrf,
    })
    print(f"  Loginname: {sc}")
    if sc == 200:
        new_csrf = extract_csrf(body)
        if new_csrf:
            csrf = new_csrf
    elif sc in (302, 303):
        # Follow to password page
        pwd_body, _ = _follow_to_page(loc)
        new_csrf = extract_csrf(pwd_body)
        if new_csrf:
            csrf = new_csrf
    else:
        print(f"  Loginname failed: {sc} {loc[:100]}")
        return None

    # Step 6: POST password
    sc, body, loc = _post_form("/ui/login/password", {
        "authRequestID": auth_request_id,
        "password": ADMIN_PASS,
        "gorilla.csrf.Token": csrf,
    })
    print(f"  Password: {sc} loc={loc[:100]}")

    if sc == 200:
        # Password page returned 200 — could be error or inline next step
        new_csrf = extract_csrf(body)
        if new_csrf:
            csrf = new_csrf
        code_m = re.search(r'[?&]code=([A-Za-z0-9%_\-\.]+)', body)
        if code_m:
            code = code_m.group(1)
            print(f"  Got code from password response body")
        elif "mfa" in body.lower() or "2-factor" in body.lower():
            # 2FA form is inline — skip it directly
            sc2, body2, loc2 = _post_form("/ui/login/mfa/prompt", {
                "authRequestID": auth_request_id,
                "gorilla.csrf.Token": csrf,
                "skip": "true",
            })
            print(f"  MFA skip: {sc2} loc={loc2[:100]}")
            loc = loc2
            sc = sc2
            code = None
            if "code=" in loc2:
                code = re.search(r'code=([^&]+)', loc2).group(1)
            elif sc2 in (302, 303):
                # Follow the redirect chain to the callback URL
                final_body, final_url = _follow_to_page(loc2)
                code_m = re.search(r'code=([^&]+)', final_url)
                if code_m:
                    code = code_m.group(1)
            if not code:
                print("  Could not get code after 2FA skip")
                return None
        else:
            print(f"  Unexpected 200 from password — body: {body[:300]}")
            return None
    elif sc in (302, 303):
        if "code=" in loc:
            code = re.search(r'code=([^&]+)', loc).group(1)
            print(f"  Got code directly from password redirect")
        else:
            # Follow the redirect to the next page (usually 2FA or callback)
            next_body, next_url = _follow_to_page(loc)
            code_m = re.search(r'code=([^&]+)', next_url)
            if code_m:
                code = code_m.group(1)
                print(f"  Got code from redirect chain after password")
            elif "mfa" in next_url.lower() or "2-factor" in next_body.lower():
                # Landed on 2FA page — submit skip
                print(f"  On 2FA page, submitting skip...")
                new_csrf = extract_csrf(next_body)
                if new_csrf:
                    csrf = new_csrf
                sc2, body2, loc2 = _post_form("/ui/login/mfa/prompt", {
                    "authRequestID": auth_request_id,
                    "gorilla.csrf.Token": csrf,
                    "skip": "true",
                })
                print(f"  MFA skip: {sc2} loc={loc2[:100]}")
                code = None
                if "code=" in loc2:
                    code = re.search(r'code=([^&]+)', loc2).group(1)
                elif sc2 in (302, 303):
                    final_body, final_url = _follow_to_page(loc2)
                    code_m = re.search(r'code=([^&]+)', final_url)
                    if code_m:
                        code = code_m.group(1)
                if not code:
                    print(f"  Could not get code after 2FA skip: loc2={loc2[:100]}, url={next_url[:100]}")
                    return None
            else:
                print(f"  Unexpected page after password redirect: {next_url[:100]}")
                return None
    else:
        body_err = body or loc
        print(f"  Password failed: {sc} {body_err[:200]}")
        return None

    print(f"  Got authorization code")

    # Step 7: Exchange code for tokens
    token_data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
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
            print(f"  Token response had no access_token: {token_resp}")
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

    # Strategy 0: use existing ZITADEL_SERVICE_TOKEN from env if it already works
    existing_token = os.environ.get("ZITADEL_SERVICE_TOKEN", "")
    init_pat = None
    machine_user_id = None
    if existing_token:
        print("Testing existing ZITADEL_SERVICE_TOKEN from env...")
        test = api_call("POST", "/management/v1/users/_search", {
            "queries": [{"userNameQuery": {"userName": "backend-service", "method": "TEXT_QUERY_METHOD_EQUALS"}}]
        }, existing_token)
        if test is not None:
            print("  Existing token is valid!")
            init_pat = existing_token
            machine_user_id = test["result"][0]["id"] if test.get("result") else None
        else:
            print("  Existing token invalid, will try to get a new one...")

    # Strategy 1: get the init-generated machine user PAT from Docker logs.
    # Zitadel creates this PAT for ZITADEL_FIRSTINSTANCE_ORG_MACHINE_PAT_EXPIRATIONDATE
    # and the token value appears in startup logs.
    # If we get it, use it directly as the service token (skip admin OIDC flow).
    if not init_pat:
        init_pat = get_init_pat_from_logs()

    if init_pat and init_pat != existing_token:
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
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if _env_arg and os.path.isfile(_env_arg):
        env_path = _env_arg
    elif os.path.isfile(os.path.join(_root, ".env.local")):
        env_path = os.path.join(_root, ".env.local")
    else:
        env_path = os.path.join(_root, ".env")
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
