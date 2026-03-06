#!/usr/bin/env python3
"""
Zitadel setup script for OrbisPM.
Creates a service user PAT and OIDC application for the backend.
Run once after 'docker compose up' with Zitadel healthy.

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

ZITADEL_URL = "http://localhost:8081"
ADMIN_USER = "admin@orbispm.local"
ADMIN_PASS = "Admin123!"
REDIRECT_URI = "http://localhost:3000/auth/callback"

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

def get_admin_token_via_oidc():
    """
    Get an admin token by using the OIDC Authorization Code flow with PKCE
    via the Console client.
    """
    # Step 1: Find the Console client_id via the well-known endpoint
    print("Getting admin token via OIDC...")

    # Get Console environment to find client_id
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

    # Step 3: Start OIDC Authorization
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

    # Step 5: Submit login form via Zitadel's internal login API
    # First: loginname step
    login_data = urllib.parse.urlencode({
        "authRequestID": auth_request_id,
        "loginName": ADMIN_USER,
    })
    try:
        req = urllib.request.Request(
            f"{ZITADEL_URL}/loginname",
            data=login_data.encode(),
            method="POST",
        )
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with no_redirect_opener.open(req) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (302, 303):
            print(f"  Login name submitted")
        else:
            print(f"  Login name error: {e.code}: {e.read().decode()[:200]}")
            return None

    # Step 6: Submit password
    pwd_data = urllib.parse.urlencode({
        "authRequestID": auth_request_id,
        "password": ADMIN_PASS,
    })
    try:
        req = urllib.request.Request(
            f"{ZITADEL_URL}/login/password",
            data=pwd_data.encode(),
            method="POST",
        )
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with no_redirect_opener.open(req) as resp:
            pass
    except urllib.error.HTTPError as e:
        if e.code in (302, 303):
            callback_url = e.headers.get("Location", "")
            print(f"  Password accepted, callback: {callback_url[:100]}...")
        else:
            print(f"  Password error: {e.code}: {e.read().decode()[:200]}")
            return None

    # Step 7: Follow redirects to get the auth code
    # The callback URL might go through several redirects
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
                break  # No more redirects
        except urllib.error.HTTPError as e:
            if e.code in (302, 303):
                current_url = e.headers.get("Location", "")
            else:
                break

    if not code:
        print("  Could not extract authorization code")
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
        "redirectUris": [REDIRECT_URI, "http://localhost:3000/login"],
        "postLogoutRedirectUris": ["http://localhost:3000/login"],
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
    time.sleep(3)

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
    print("\nAdd these to docker-compose.yml api service environment:")
    print()
    for key, value in config.items():
        print(f'      {key}: "{value}"')
    print()
    print(f"Frontend NEXT_PUBLIC_ZITADEL_CLIENT_ID: {client_id}")
    print(f"Frontend NEXT_PUBLIC_ZITADEL_ISSUER: {ZITADEL_URL}")
    print()

    # Write .env.zitadel
    env_path = os.path.join(os.path.dirname(__file__), ".env.zitadel")
    with open(env_path, "w") as f:
        f.write(f"ZITADEL_SERVICE_TOKEN={pat}\n")
        f.write(f"ZITADEL_CLIENT_ID={client_id}\n")
        f.write(f"ZITADEL_PROJECT_ID={project_id}\n")
        f.write(f"NEXT_PUBLIC_ZITADEL_CLIENT_ID={client_id}\n")
        f.write(f"NEXT_PUBLIC_ZITADEL_ISSUER={ZITADEL_URL}\n")
    print(f"Config saved to {env_path}")

if __name__ == "__main__":
    main()
