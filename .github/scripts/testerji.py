"""Doda e-pošte kot interne testerje Fixka na TestFlightu (skupina "Ekipa", vsi buildi)."""
import os, re, sys, textwrap, time
import jwt, requests

API = "https://api.appstoreconnect.apple.com/v1"
raw = os.environ["KEY_P8"].replace("\\n", "\n")
body = re.sub(r"[^A-Za-z0-9+/=]", "", re.sub(r"-----(BEGIN|END)[A-Z ]*-----", "", raw))
pem = "-----BEGIN PRIVATE KEY-----\n" + "\n".join(textwrap.wrap(body, 64)) + "\n-----END PRIVATE KEY-----\n"
tok = jwt.encode({"iss": os.environ["ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
                 pem, algorithm="ES256", headers={"kid": os.environ["KEY_ID"], "typ": "JWT"})
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

def call(method, path, **kw):
    r = requests.request(method, API + path, headers=H, timeout=60, **kw)
    if r.status_code >= 400:
        print(f"::warning::{method} {path} -> {r.status_code} {' '.join(r.text.split())[:900]}")
    return r

app = call("GET", "/apps", params={"filter[bundleId]": os.environ["BUNDLE_ID"]}).json()["data"][0]
print(f"::notice::Aplikacija {app['attributes']['name']} ({app['id']})")

for b in call("GET", "/builds", params={"filter[app]": app["id"], "limit": 5, "sort": "-uploadedDate"}).json()["data"]:
    a = b["attributes"]
    print(f"::notice::Build {a['version']}: {a['processingState']}")

grupe = call("GET", f"/apps/{app['id']}/betaGroups").json()["data"]
for g in grupe:
    a = g["attributes"]
    print(f"::notice::Skupina {a['name']}: internal={a.get('isInternalGroup')} vsi buildi={a.get('hasAccessToAllBuilds')}")
grupa = next((g for g in grupe if g["attributes"].get("isInternalGroup")), None)
if not grupa:
    grupa = call("POST", "/betaGroups", json={"data": {"type": "betaGroups",
        "attributes": {"name": "Ekipa", "isInternalGroup": True, "hasAccessToAllBuilds": True},
        "relationships": {"app": {"data": {"type": "apps", "id": app["id"]}}}}}).json()["data"]
print(f"::notice::Interna skupina {grupa['attributes']['name']} ({grupa['id']})")

for u in call("GET", "/users", params={"limit": 50}).json().get("data", []):
    a = u["attributes"]
    print(f"::notice::Uporabnik {a.get('username')} {a.get('roles')} vse_aplikacije={a.get('allAppsVisible')}")

for email in [e.strip() for e in os.environ["EMAILS"].split(",") if e.strip()]:
    obst = call("GET", "/betaTesters", params={"filter[email]": email}).json()["data"]
    if obst:
        r = call("POST", "/betaTesters", json={"data": {"type": "betaTesters", "attributes": {"email": email},
                 "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": grupa["id"]}]}}}})
        print(f"::notice::POST betaTesters -> {r.status_code}")
        if r.status_code < 300:
            print("::notice::Dodan " + email); continue
        print(f"::notice::Tester obstaja: {obst[0]['attributes']}")
        r = call("POST", f"/betaGroups/{grupa['id']}/relationships/betaTesters",
                 json={"data": [{"type": "betaTesters", "id": obst[0]["id"]}]})
    else:
        r = call("POST", "/betaTesters", json={"data": {"type": "betaTesters", "attributes": {"email": email},
                 "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": grupa["id"]}]}}}})
    print(("::notice::Dodan " if r.status_code < 300 else "::error::Ni dodan ") + email)
    if r.status_code >= 300:
        sys.exit(1)
