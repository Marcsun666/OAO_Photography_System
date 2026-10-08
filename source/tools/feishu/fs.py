"""Tiny Feishu Open API helper (stdlib only, Python 3.8+).

Reads credentials from environment variables -- never hard-code secrets here:
  FEISHU_APP_ID       e.g. cli_xxxxxxxx   (default: the OAO app id)
  FEISHU_APP_SECRET   required
  FEISHU_BASE_URL     optional, default https://open.feishu.cn/open-apis
                      (use https://open.larksuite.com/open-apis for Lark international)
"""
import os, json, sys, urllib.request, urllib.error

APP_ID = os.environ.get("FEISHU_APP_ID", "cli_aa4dacab62f81bef")
BASE = os.environ.get("FEISHU_BASE_URL", "https://open.feishu.cn/open-apis").rstrip("/")


def req(method, path, body=None, token=None):
    """JSON request; returns the parsed Feishu envelope ({code, msg, data})."""
    h = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        h["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None,
                               headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}")


def token():
    """tenant_access_token for the custom app (exits with the Feishu error code on failure)."""
    secret = os.environ.get("FEISHU_APP_SECRET")
    if not secret:
        print("FEISHU_APP_SECRET is not set"); sys.exit(1)
    j = req("POST", "/auth/v3/tenant_access_token/internal", {"app_id": APP_ID, "app_secret": secret})
    if j.get("code") != 0:
        print("token error:", j.get("code"), j.get("msg")); sys.exit(1)
    return j["tenant_access_token"]


def app_token(t):
    """BITABLE_APP_TOKEN from env, or resolved from WIKI_NODE_TOKEN (Base living inside a wiki)."""
    a = os.environ.get("BITABLE_APP_TOKEN")
    if a:
        return a
    node = os.environ.get("WIKI_NODE_TOKEN")
    if not node:
        print("Set BITABLE_APP_TOKEN (from a /base/<token> URL) or WIKI_NODE_TOKEN (from a /wiki/<token> URL)")
        sys.exit(1)
    j = req("GET", f"/wiki/v2/spaces/get_node?token={node}", None, t)
    if j.get("code") != 0:
        print("wiki get_node error:", j.get("code"), j.get("msg"), "(needs scope wiki:node:read)"); sys.exit(1)
    n = j["data"]["node"]
    if n.get("obj_type") != "bitable":
        print("wiki node is not a Base (obj_type=%s)" % n.get("obj_type")); sys.exit(1)
    return n["obj_token"]
