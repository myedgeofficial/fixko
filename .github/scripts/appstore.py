"""Priprava oddaje v App Store prek App Store Connect API. AKCIJA: stanje | vpisi | slike | oddaj"""
import os, re, json, textwrap, time, sys, hashlib, glob
import jwt, requests

API = "https://api.appstoreconnect.apple.com/v1"
raw = os.environ["KEY_P8"].replace("\\n", "\n")
body = re.sub(r"[^A-Za-z0-9+/=]", "", re.sub(r"-----(BEGIN|END)[A-Z ]*-----", "", raw))
pem = "-----BEGIN PRIVATE KEY-----\n" + "\n".join(textwrap.wrap(body, 64)) + "\n-----END PRIVATE KEY-----\n"
tok = jwt.encode({"iss": os.environ["ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
                 pem, algorithm="ES256", headers={"kid": os.environ["KEY_ID"], "typ": "JWT"})
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
AKCIJA = os.environ.get("AKCIJA", "stanje")
napaka = False


def get(pot, **params):
    r = requests.get(pot if pot.startswith("http") else API + pot, headers=H, params=params, timeout=60)
    if r.status_code >= 400:
        print(f"::warning::GET {pot}: {r.status_code} {' '.join(r.text.split())[:400]}")
        return {"data": []}
    return r.json()


def poslji(metoda, pot, data):
    global napaka
    r = requests.request(metoda, API + pot, headers=H, json={"data": data}, timeout=60)
    ok = r.status_code < 400
    napaka |= not ok
    print(("::notice::" if ok else "::error::") + f"{metoda} {pot}: {r.status_code} {'' if ok else ' '.join(r.text.split())[:800]}")
    return r.json() if ok and r.text else {}


app = get("/apps", **{"filter[bundleId]": os.environ["BUNDLE_ID"]})["data"][0]
AID = app["id"]
print("APP", json.dumps(app["attributes"], ensure_ascii=False))

infos = get(f"/apps/{AID}/appInfos")["data"]
info = next((i for i in infos if (i["attributes"].get("appStoreState") or i["attributes"].get("state")) not in ("READY_FOR_SALE", "READY_FOR_DISTRIBUTION")), infos[0])
verzije = get(f"/apps/{AID}/appStoreVersions", **{"filter[platform]": "IOS"})["data"]
ver = next((v for v in verzije if v["attributes"]["appStoreState"] in ("PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED")), None)

if AKCIJA == "stanje":
    for i in infos:
        print("APPINFO", i["id"], json.dumps(i["attributes"]))
        for l in get(f"/appInfos/{i['id']}/appInfoLocalizations")["data"]:
            print("  INFOLOC", json.dumps(l["attributes"], ensure_ascii=False))
        print("  KAT", json.dumps(get(f"/appInfos/{i['id']}/primaryCategory").get("data")))
        print("  AGE", json.dumps(get(f"/appInfos/{i['id']}/ageRatingDeclaration").get("data", {}).get("attributes")))
    for v in verzije:
        print("VERZIJA", v["id"], json.dumps(v["attributes"]))
        for l in get(f"/appStoreVersions/{v['id']}/appStoreVersionLocalizations")["data"]:
            print("  VERLOC", l["id"], json.dumps(l["attributes"], ensure_ascii=False)[:300])
        print("  BUILD", json.dumps(get(f"/appStoreVersions/{v['id']}/build").get("data")))
        print("  REVIEW", json.dumps(get(f"/appStoreVersions/{v['id']}/appStoreReviewDetail").get("data")))
    for b in get("/builds", **{"filter[app]": AID, "sort": "-uploadedDate", "limit": 5})["data"]:
        print("BUILDS", b["id"], b["attributes"]["version"], b["attributes"]["processingState"], b["attributes"].get("expired"))
    print("CENA", json.dumps(get(f"/apps/{AID}/appPriceSchedule").get("data")))
    print("SUBMISSIONS", json.dumps([s["attributes"] for s in get("/reviewSubmissions", **{"filter[app]": AID})["data"]]))
    print("SUBGROUPS", json.dumps([g["attributes"] for g in get(f"/apps/{AID}/subscriptionGroups")["data"]]))

sys.exit(1 if napaka else 0)
