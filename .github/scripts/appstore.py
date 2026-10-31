"""Priprava oddaje v App Store prek App Store Connect API. AKCIJA: stanje | vpisi | slike | oddaj | drzave
vpisi: besedila iz appstore/besedila.json za vse jezike (sl Popravko, drugje Fixko). drzave: aplikacija na voljo v vseh državah."""
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
IZPIS = []
_print = print
def print(*a):
    t = " ".join(str(x) for x in a)
    _print(t)
    if not t.startswith("::"): IZPIS.append(t[:600])


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
    print(("" if ok else "::error::") + f"{metoda} {pot}: {r.status_code} {'' if ok else ' '.join(r.text.split())[:800]}")
    return r.json() if ok and r.text else {}


# Nova aplikacija (Fixko): registriraj bundle ID z obvestili; aplikacijo v App Store Connect potem ustvari človek.
if AKCIJA == "bundle":
    obst = [x for x in get("/bundleIds", **{"filter[identifier]": os.environ["BUNDLE_ID"]})["data"] if x["attributes"]["identifier"] == os.environ["BUNDLE_ID"]]
    bid = obst[0]["id"] if obst else poslji("POST", "/bundleIds", {"type": "bundleIds", "attributes": {"identifier": os.environ["BUNDLE_ID"], "name": os.environ.get("IME", "Fixko"), "platform": "IOS"}}).get("data", {}).get("id")
    print("BUNDLE", os.environ["BUNDLE_ID"], bid)
    if bid and "PUSH_NOTIFICATIONS" not in [c["attributes"]["capabilityType"] for c in get(f"/bundleIds/{bid}/bundleIdCapabilities")["data"]]:
        poslji("POST", "/bundleIdCapabilities", {"type": "bundleIdCapabilities", "attributes": {"capabilityType": "PUSH_NOTIFICATIONS"}, "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bid}}}})
    print("APPS", [a["attributes"]["name"] for a in get("/apps", **{"filter[bundleId]": os.environ["BUNDLE_ID"]})["data"]])
    sys.exit(1 if napaka else 0)

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
        print("  BUILD", ((get(f"/appStoreVersions/{v['id']}/build").get("data") or {}).get("attributes") or {}).get("version"))
        print("  REVIEW", json.dumps(get(f"/appStoreVersions/{v['id']}/appStoreReviewDetail").get("data")))
    for b in get("/builds", **{"filter[app]": AID, "sort": "-uploadedDate", "limit": 5})["data"]:
        print("BUILDS", b["id"], b["attributes"]["version"], b["attributes"]["processingState"], b["attributes"].get("expired"))
    print("CENA", len(get(f"/apps/{AID}/appPriceSchedule/manualPrices")["data"]))
    print("SUBMISSIONS", json.dumps([s["attributes"] for s in get("/reviewSubmissions", **{"filter[app]": AID})["data"]]))
    print("SUBGROUPS", json.dumps([g["attributes"] for g in get(f"/apps/{AID}/subscriptionGroups")["data"]]))

def json_poslji(metoda, pot, telo):
    global napaka
    r = requests.request(metoda, (pot if pot.startswith("http") else API + pot), headers=H, json=telo, timeout=60)
    ok = r.status_code < 400
    napaka |= not ok
    print(("" if ok else "::error::") + f"{metoda} {pot}: {r.status_code} {'' if ok else ' '.join(r.text.split())[:800]}")
    return r.json() if ok and r.text else {}


# Besedila: Popravko (appstore/besedila.json, samo slovensko) ali Fixko (appstore/fixko.json, tuji jeziki).
B = json.load(open(os.path.join(os.path.dirname(__file__), "../../appstore/" + ("fixko.json" if os.environ.get("APLIKACIJA") == "fixko" else "besedila.json"))))
# Nova verzija (npr. 1.2), če še ni nobene v pripravi in je objavljena starejša.
if ver is None and AKCIJA == "vpisi" and B.get("verzija") and B["verzija"] not in [v["attributes"]["versionString"] for v in verzije]:
    ver = poslji("POST", "/appStoreVersions", {"type": "appStoreVersions", "attributes": {"platform": "IOS", "versionString": B["verzija"]},
        "relationships": {"app": {"data": {"type": "apps", "id": AID}}}}).get("data")
    if ver: verzije = verzije + [ver]
# Podatki o aplikaciji (ime, podnaslov) se urejajo na appInfo, ki pripada verziji v pripravi (nastane z njo).
infos = get(f"/apps/{AID}/appInfos")["data"]
info = next((i for i in infos if (i["attributes"].get("appStoreState") or i["attributes"].get("state")) not in ("READY_FOR_SALE", "READY_FOR_DISTRIBUTION")), infos[0])
if ver is None and AKCIJA not in ("stanje", "drzave"):
    print("::error::Ni verzije v pripravi"); sys.exit(1)

if AKCIJA == "vpisi":
    CENA_OK = requests.get(f"{API}/apps/{AID}/appPriceSchedule/manualPrices", headers=H, timeout=60).json().get("data")
    # Ime in podnaslov po jezikih: obstoječe posodobimo, manjkajoče ustvarimo. Če je ime zasedeno, poskusimo rezervno.
    obst = {l["attributes"]["locale"]: l for l in get(f"/appInfos/{info['id']}/appInfoLocalizations")["data"]}
    for loc, l in obst.items():
        if loc not in B["jeziki"] and loc != app["attributes"].get("primaryLocale"):
            r = requests.delete(f"{API}/appInfoLocalizations/{l['id']}", headers=H, timeout=60); print("ODSTRANI INFOLOC", loc, r.status_code)
    for loc, L in B["jeziki"].items():
        for ime in [L["ime"]] + ([L["ime_rezerva"]] if L.get("ime_rezerva") else []):
            atr = {"name": ime, "subtitle": L["podnaslov"], "privacyPolicyUrl": L["zasebnost"]}
            r = (requests.patch(f"{API}/appInfoLocalizations/{obst[loc]['id']}", headers=H, timeout=60, json={"data": {"type": "appInfoLocalizations", "id": obst[loc]["id"], "attributes": atr}})
                 if loc in obst else requests.post(f"{API}/appInfoLocalizations", headers=H, timeout=60, json={"data": {"type": "appInfoLocalizations", "attributes": {"locale": loc, **atr},
                     "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info["id"]}}}}}))
            print(f"INFOLOC {loc} {ime}: {r.status_code} {'' if r.ok else ' '.join(r.text.split())[:300]}")
            if r.ok: break
        else:
            napaka = True
    poslji("PATCH", f"/appInfos/{info['id']}", {"type": "appInfos", "id": info["id"], "relationships": {
        "primaryCategory": {"data": {"type": "appCategories", "id": "LIFESTYLE"}},
        "secondaryCategory": {"data": {"type": "appCategories", "id": "UTILITIES"}}}})
    age = get(f"/appInfos/{info['id']}/ageRatingDeclaration").get("data")
    if age:
        a = {k: ("NONE" if k not in ("advertising", "gambling", "healthOrWellnessTopics", "lootBox", "messagingAndChat", "parentalControls", "ageAssurance", "unrestrictedWebAccess", "userGeneratedContent", "socialMedia", "socialMediaAgeRestricted") else False)
             for k in age["attributes"] if not k.startswith(("ageRatingOverride", "korea", "kidsAge", "gracRating", "developerAge"))}
        a["userGeneratedContent"] = True
        a["advertising"] = True  # aplikacija kaže reklame AdMob
        poslji("PATCH", f"/ageRatingDeclarations/{age['id']}", {"type": "ageRatingDeclarations", "id": age["id"], "attributes": a})
    poslji("PATCH", f"/apps/{AID}", {"type": "apps", "id": AID, "attributes": {"contentRightsDeclaration": "DOES_NOT_USE_THIRD_PARTY_CONTENT"}})
    poslji("PATCH", f"/appStoreVersions/{ver['id']}", {"type": "appStoreVersions", "id": ver["id"], "attributes": {"copyright": B["copyright"], "releaseType": "AFTER_APPROVAL"}})
    # Opis, ključne besede, promocija in novosti po jezikih (prva verzija novosti nima).
    prva = not any(v["attributes"]["appStoreState"] == "READY_FOR_SALE" for v in verzije)
    vl = {l["attributes"]["locale"]: l for l in get(f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")["data"]}
    for loc, l in vl.items():
        if loc not in B["jeziki"] and loc != app["attributes"].get("primaryLocale"):
            r = requests.delete(f"{API}/appStoreVersionLocalizations/{l['id']}", headers=H, timeout=60); print("ODSTRANI VERLOC", loc, r.status_code)
    for loc, L in B["jeziki"].items():
        atr = {"description": L["opis"], "keywords": L["kljucne"], "supportUrl": B["podpora"], "marketingUrl": B["podpora"], "promotionalText": L["promo"], **({} if prva else {"whatsNew": L["novo"]})}
        if loc in vl:
            poslji("PATCH", f"/appStoreVersionLocalizations/{vl[loc]['id']}", {"type": "appStoreVersionLocalizations", "id": vl[loc]["id"], "attributes": atr})
        else:
            poslji("POST", "/appStoreVersionLocalizations", {"type": "appStoreVersionLocalizations", "attributes": {"locale": loc, **atr},
                "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver["id"]}}}})
    # kontakt za pregled: isti kot pri Nakupku
    tel = ""
    nk = get("/apps", **{"filter[bundleId]": "si.nakupko.app"})["data"]
    if nk:
        for v in get(f"/apps/{nk[0]['id']}/appStoreVersions")["data"]:
            rd = get(f"/appStoreVersions/{v['id']}/appStoreReviewDetail").get("data")
            if rd and rd["attributes"].get("contactPhone"):
                tel = rd["attributes"]["contactPhone"]; ime = rd["attributes"]; break
    rev = {"contactFirstName": "Urška", "contactLastName": "Repušič", "contactEmail": "support@remako.si", "contactPhone": tel,
           "demoAccountRequired": False, "notes": B["opombe"]}
    if tel: rev.update({k: ime[k] for k in ("contactFirstName", "contactLastName") if ime.get(k)})  # e-pošta ostane support@remako.si
    print("KONTAKT", rev["contactFirstName"], rev["contactLastName"], rev["contactEmail"], "tel:", "da" if tel else "NI")
    rd = get(f"/appStoreVersions/{ver['id']}/appStoreReviewDetail").get("data")
    if rd:
        poslji("PATCH", f"/appStoreReviewDetails/{rd['id']}", {"type": "appStoreReviewDetails", "id": rd["id"], "attributes": rev})
    else:
        poslji("POST", "/appStoreReviewDetails", {"type": "appStoreReviewDetails", "attributes": rev, "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver["id"]}}}})
    # cena: brezplačno
    if not CENA_OK:
        pp = get(f"/apps/{AID}/appPricePoints", **{"filter[territory]": "SVN", "limit": 5})["data"]
        nic = next(p for p in pp if float(p["attributes"]["customerPrice"]) == 0)
        json_poslji("POST", "/appPriceSchedules", {"data": {"type": "appPriceSchedules", "relationships": {
            "app": {"data": {"type": "apps", "id": AID}}, "baseTerritory": {"data": {"type": "territories", "id": "SVN"}},
            "manualPrices": {"data": [{"type": "appPrices", "id": "${p0}"}]}}},
            "included": [{"type": "appPrices", "id": "${p0}", "attributes": {"startDate": None}, "relationships": {"appPricePoint": {"data": {"type": "appPricePoints", "id": nic["id"]}}}}]})
    else:
        print("cena že nastavljena")
    # dostopnost: Slovenija
    r = requests.get(f"{API}/apps/{AID}/appAvailabilityV2", headers=H, timeout=60)
    print("DOSTOPNOST", r.status_code, " ".join(r.text.split())[:300])
    if r.status_code == 404 or not r.json().get("data"):
        ter = [t["id"] for t in get("/territories", limit=200)["data"]]
        json_poslji("POST", "https://api.appstoreconnect.apple.com/v2/appAvailabilities", {"data": {"type": "appAvailabilities", "attributes": {"availableInNewTerritories": B.get("drzave") == "razen:SVN"},
            "relationships": {"app": {"data": {"type": "apps", "id": AID}}, "territoryAvailabilities": {"data": [{"type": "territoryAvailabilities", "id": "${" + t + "}"} for t in ter]}}},
            "included": [{"type": "territoryAvailabilities", "id": "${" + t + "}", "attributes": {"available": (t != "SVN") if B.get("drzave") == "razen:SVN" else (t == "SVN")}, "relationships": {"territory": {"data": {"type": "territories", "id": t}}}} for t in ter]})
    # zadnji veljaven build
    bl = [b for b in get("/builds", **{"filter[app]": AID, "sort": "-uploadedDate", "limit": 5})["data"] if b["attributes"]["processingState"] == "VALID" and not b["attributes"].get("expired")]
    if bl:
        print("BUILD", bl[0]["attributes"]["version"])
        json_poslji("PATCH", f"/appStoreVersions/{ver['id']}/relationships/build", {"data": {"type": "builds", "id": bl[0]["id"]}})

# Vse države (ročni zagon, šele ko Apple odobri mednarodno verzijo).
if AKCIJA == "drzave":
    r = requests.get(f"{API}/apps/{AID}/appAvailabilityV2", headers=H, timeout=60)
    av = r.json().get("data") if r.ok else None
    if not av:
        print("::error::Dostopnost še ni nastavljena"); napaka = True
    else:
        url = f"https://api.appstoreconnect.apple.com/v2/appAvailabilities/{av['id']}/territoryAvailabilities?limit=200"
        vse = []
        while url:
            j = requests.get(url, headers=H, timeout=60).json()
            vse += j.get("data", []); url = j.get("links", {}).get("next")
        for t in vse:
            if not t["attributes"].get("available"):
                poslji("PATCH", f"/territoryAvailabilities/{t['id']}", {"type": "territoryAvailabilities", "id": t["id"], "attributes": {"available": True}})
        print("DRZAV", len(vse), "vklopljenih na novo", sum(1 for t in vse if not t["attributes"].get("available")))

if AKCIJA == "slike":
    mapa = os.path.join(os.path.dirname(__file__), "../../appstore/" + ("fixko/slike" if os.environ.get("APLIKACIJA") == "fixko" else "slike"))
    datoteke = sorted(glob.glob(mapa + "/*.png"))
    for l in get(f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations")["data"]:
        sets = get(f"/appStoreVersionLocalizations/{l['id']}/appScreenshotSets")["data"]
        s = next((x for x in sets if x["attributes"]["screenshotDisplayType"] == "APP_IPHONE_67"), None)
        if not s:
            s = poslji("POST", "/appScreenshotSets", {"type": "appScreenshotSets", "attributes": {"screenshotDisplayType": "APP_IPHONE_67"},
                "relationships": {"appStoreVersionLocalization": {"data": {"type": "appStoreVersionLocalizations", "id": l["id"]}}}})["data"]
        for star in get(f"/appScreenshotSets/{s['id']}/appScreenshots")["data"]:
            requests.delete(f"{API}/appScreenshots/{star['id']}", headers=H, timeout=60)
        for f in datoteke:
            podatki = open(f, "rb").read()
            sc = poslji("POST", "/appScreenshots", {"type": "appScreenshots", "attributes": {"fileName": os.path.basename(f), "fileSize": len(podatki)},
                "relationships": {"appScreenshotSet": {"data": {"type": "appScreenshotSets", "id": s["id"]}}}})["data"]
            for op in sc["attributes"]["uploadOperations"]:
                kos = podatki[op["offset"]:op["offset"] + op["length"]]
                requests.request(op["method"], op["url"], data=kos, headers={h["name"]: h["value"] for h in op["requestHeaders"]}, timeout=120).raise_for_status()
            poslji("PATCH", f"/appScreenshots/{sc['id']}", {"type": "appScreenshots", "id": sc["id"], "attributes": {"uploaded": True, "sourceFileChecksum": hashlib.md5(podatki).hexdigest()}})
        time.sleep(10)
        for x in get(f"/appScreenshotSets/{s['id']}/appScreenshots")["data"]:
            print("SLIKA", x["attributes"]["fileName"], json.dumps(x["attributes"].get("assetDeliveryState")))

if AKCIJA == "oddaj":
    # odprto (prazno) oddajo iz prejšnjega poskusa uporabimo znova
    odprte = [x for x in get(f"/apps/{AID}/reviewSubmissions", **{"filter[platform]": "IOS"})["data"] if x["attributes"].get("state") == "READY_FOR_REVIEW"]
    sub = {"data": odprte[0]} if odprte else json_poslji("POST", "/reviewSubmissions", {"data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"}, "relationships": {"app": {"data": {"type": "apps", "id": AID}}}}})
    if sub:
        sid = sub["data"]["id"]
        poslji("POST", "/reviewSubmissionItems", {"type": "reviewSubmissionItems", "relationships": {"reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sid}}, "appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver["id"]}}}})
        if not napaka:
            poslji("PATCH", f"/reviewSubmissions/{sid}", {"type": "reviewSubmissions", "id": sid, "attributes": {"submitted": True}})

for i in range(0, len(IZPIS), 6):
    _print("::notice title=izpis%d::" % i + "%0A".join(x.replace("%", "%25") for x in IZPIS[i:i + 6]))
sys.exit(1 if napaka else 0)
