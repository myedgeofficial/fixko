# Fixko

Aplikacija za iPhone, ki poveže ljudi, ki doma rabijo pomoč, z mojstri v okolici.

- **Stranka** poslika, kaj je treba narediti, izbere stroko, regijo in kdaj ji paše. Brezplačno.
- **Mojster** z naročnino dobi obvestilo s sliko, delo prevzame, izbere termin in stranko pokliče.
- Stranka takoj vidi, kdo pride in kdaj, ter telefon mojstra.

## Zgradba

| Mapa | Kaj je |
| --- | --- |
| `web/` | Zasloni aplikacije (HTML, CSS, JavaScript). `web/src/main.js` je celotna logika. |
| `app/` | Capacitor ovoj za iOS. `npm run sync` zgradi `app/www` iz `web/` in pripravi Xcode projekt. |
| `app/ios/App/App/FixkoPay.swift` | Naročnina za mojstre (StoreKit 2). |
| `firebase/` | Strežnik: Firestore (dela, mojstri), Storage (slike), funkcije (obvestila, prevzem, naročnina, brisanje). |

## Nastavitve (enkrat)

GitHub skrivnosti (Settings › Secrets and variables › Actions):

| Ime | Kaj |
| --- | --- |
| `APPLE_TEAM_ID`, `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_P8` | Ključ App Store Connect API (Admin) za nalaganje na TestFlight. |
| `APNS_KEY_P8`, `APNS_KEY_ID` | Ključ za obvestila (Apple Push Notifications). |
| `FIREBASE_SERVICE_ACCOUNT` | JSON servisnega računa Firebase projekta (vloga Owner). |

Spremenljivke: `FIREBASE_PROJECT` (privzeto `fixko-app`), `IOS_BUNDLE_ID` (privzeto `si.fixko.app`), `FIXKO_PREIZKUS` (`1` = mojstri lahko brezplačno preizkusijo 30 dni, dokler naročnina v App Store ni odprta; pred javno objavo nastavi na `0`).

App Store Connect: aplikacija z ID-jem paketa `si.fixko.app` in samodejno obnovljiva naročnina `si.fixko.app.mojster.mesecno` (9,99 €/mesec, po želji prvi mesec brezplačno kot uvodna ponudba).

## Gradnja

- Vsak push na `main` zgradi aplikacijo in jo naloži na TestFlight (`.github/workflows/ios.yml`).
- Spremembe v `firebase/` se objavijo samodejno (`.github/workflows/firebase.yml`).
- Lokalni preizkus s Firebase emulatorji: `cd firebase && npx firebase-tools emulators:start --project demo-fixko`, nato zgradi `app/www` z `FIXKO_FB_CONFIG='{"apiKey":"x","projectId":"demo-fixko","storageBucket":"demo-fixko.appspot.com","appId":"x","emulator":true}' node app/scripts/build-www.js`.
