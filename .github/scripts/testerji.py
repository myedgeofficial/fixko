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


ZUNANJI = os.environ.get("ZUNANJI") == "1"
grupe = call("GET", f"/apps/{app['id']}/betaGroups").json()["data"]

if not ZUNANJI:
    grupa = next((g for g in grupe if g["attributes"].get("isInternalGroup")), None)
    if not grupa:
        grupa = call("POST", "/betaGroups", json={"data": {"type": "betaGroups",
            "attributes": {"name": "Ekipa", "isInternalGroup": True, "hasAccessToAllBuilds": True},
            "relationships": {"app": {"data": {"type": "apps", "id": app["id"]}}}}}).json()["data"]
else:
    # Zunanji testerji: podatki za Applov pregled beta verzije (kopija od Nakupka), opis, skupina z javno povezavo,
    # zadnji build v skupino in oddaja v pregled. Povabila odidejo, ko Apple build odobri.
    nak = call("GET", "/apps", params={"filter[bundleId]": "si.nakupko.app"}).json()["data"]
    kontakt = {}
    if nak:
        d = call("GET", f"/apps/{nak[0]['id']}/betaAppReviewDetail").json().get("data", {})
        kontakt = {k: v for k, v in d.get("attributes", {}).items() if k.startswith("contact") and v}
    det = call("GET", f"/apps/{app['id']}/betaAppReviewDetail").json()["data"]
    call("PATCH", f"/betaAppReviewDetails/{det['id']}", json={"data": {"type": "betaAppReviewDetails", "id": det["id"], "attributes": {
        **kontakt, "demoAccountRequired": False,
        "notes": "Fixko connects people who need home repairs with local tradespeople. Customer: tap 'Rabim mojstra', take a photo or describe the job, send. Tradesperson: tap 'Sem mojster', fill in the profile, tap 'Začni preizkus' (free trial), take a job and pick a time. No login needed."}}})
    print(f"::notice::Kontakt za pregled: {', '.join(kontakt) or 'MANJKA'}")
    feedback = kontakt.get("contactEmail", "")
    opis = {"en-US": "Fixko connects people who need help at home with nearby tradespeople. Try it: post a job as a customer or take one as a tradesperson.",
            "sl-SI": "Fixko poveže ljudi, ki doma rabijo pomoč, z mojstri v bližini. Preizkusi: pošlji delo kot stranka ali ga prevzemi kot mojster.",
}
    lok = call("GET", f"/apps/{app['id']}/betaAppLocalizations").json()["data"]
    imam = {l["attributes"]["locale"]: l["id"] for l in lok}
    for loc, txt in opis.items():
        at = {"description": txt, "feedbackEmail": feedback, "privacyPolicyUrl": os.environ.get("ZASEBNOST_URL") or None}
        at = {k: v for k, v in at.items() if v}
        if loc in imam:
            call("PATCH", f"/betaAppLocalizations/{imam[loc]}", json={"data": {"type": "betaAppLocalizations", "id": imam[loc], "attributes": at}})
        else:
            r = call("POST", "/betaAppLocalizations", json={"data": {"type": "betaAppLocalizations", "attributes": {"locale": loc, **at},
                 "relationships": {"app": {"data": {"type": "apps", "id": app["id"]}}}}})
            print(f"::notice::Opis {loc}: {r.status_code}")
    grupa = next((g for g in grupe if not g["attributes"].get("isInternalGroup")), None)
    if not grupa:
        grupa = call("POST", "/betaGroups", json={"data": {"type": "betaGroups",
            "attributes": {"name": "Testerji", "publicLinkEnabled": True, "publicLinkLimitEnabled": True, "publicLinkLimit": 100, "feedbackEnabled": True},
            "relationships": {"app": {"data": {"type": "apps", "id": app["id"]}}}}}).json()["data"]
    build = call("GET", "/builds", params={"filter[app]": app["id"], "filter[processingState]": "VALID", "limit": 1, "sort": "-uploadedDate"}).json()["data"][0]
    call("POST", f"/betaGroups/{grupa['id']}/relationships/builds", json={"data": [{"type": "builds", "id": build["id"]}]})
    r = call("POST", "/betaAppReviewSubmissions", json={"data": {"type": "betaAppReviewSubmissions",
             "relationships": {"build": {"data": {"type": "builds", "id": build["id"]}}}}})
    print(f"::notice::Build {build['attributes']['version']} oddan v Applov pregled: {r.status_code}")
    g = call("GET", f"/betaGroups/{grupa['id']}").json()["data"]["attributes"]
    print(f"::notice::Javna povezava: {g.get('publicLink')}")
print(f"::notice::Skupina {grupa['attributes']['name']} ({grupa['id']})")

for email in [e.strip() for e in os.environ["EMAILS"].split(",") if e.strip()]:
    r = call("POST", "/betaTesters", json={"data": {"type": "betaTesters", "attributes": {"email": email},
             "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": grupa["id"]}]}}}})
    if r.status_code >= 300:
        obst = call("GET", "/betaTesters", params={"filter[email]": email}).json()["data"]
        if obst:
            r = call("POST", f"/betaGroups/{grupa['id']}/relationships/betaTesters", json={"data": [{"type": "betaTesters", "id": obst[0]["id"]}]})
    print(("::notice::Dodan " if r.status_code < 300 else "::error::Ni dodan ") + email)
    if r.status_code >= 300:
        sys.exit(1)
