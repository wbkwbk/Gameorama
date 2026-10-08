# Gameorama Wartungstool

Webanwendung zur Wartung der Geräte in der Spielhalle. Die Übersicht gruppiert Geräte und färbt sie nach dem nächsten Termin: grün für die nächste Wartung, gelb wenn sie innerhalb einer Woche fällig ist, rot wenn sie überfällig ist.

## Start

```bash
npm install
npm run dev
```

Die App läuft dann auf [http://localhost:5173](http://localhost:5173).

## Produktion

Für den Betrieb ohne den Vite-Entwicklungsserver braucht es Node.js 22 oder neuer. Ein Prozess liefert die gebaute Oberfläche und die API.

```bash
npm install
npm run build
npm start
```

Die Anwendung läuft dann auf [http://127.0.0.1:3001](http://127.0.0.1:3001). Der Port kommt aus der Umgebungsvariable `PORT`, sonst `3001`.

Der Cloudflare-Ursprung für die Produktions-App ist `http://127.0.0.1:3001`. Der Ursprung `http://127.0.0.1:5173` gilt nur für `npm run dev`.

`npm run build` schreibt nach `dist/` und lässt die Daten stehen. Die SQLite-Datei liegt in `data/gameorama.sqlite`, hochgeladene Dokumente in `data/uploads/`.

## Installation unter Windows

Das Paket `Gameorama-Wartungstool.zip` enthält die Quellen zum Installieren, ohne `node_modules`, `dist` und ohne die Datenbank. Neu erzeugen mit `node scripts/make-zip.mjs`.

1. Die ZIP-Datei entpacken.
2. `install.cmd` ausführen. Dafür ist Node.js 22 oder neuer nötig. Fehlt Node.js oder ist es älter, nennt das Skript den Download unter https://nodejs.org/ .
3. `start.cmd` ausführen.
4. Die Anwendung im Browser öffnen: http://127.0.0.1:3001

Eine schon vorhandene Datei `data\gameorama.sqlite` bleibt beim Installieren unverändert.

Nach der Bereitstellung `neue-datenbank.cmd` ausführen. Das legt `data/gameorama.sqlite` mit den Benutzern `superuser` und `user` an. Ist diese Datei schon vorhanden, bleibt sie unverändert. `neue-datenbank.cmd --force` ersetzt die Datenbankdatei; `data\uploads` bleibt erhalten.

## Rollen

Benutzer  Standard Benutzer: Wartungen als durchgeführt markieren |
Super Benutzer: Geräte, Gruppen, Wartungen und Benutzer verwalten |

Nach «Durchgeführt» wird die Wartung auf erledigt gesetzt. «Durchgeführt durch» enthält den angemeldeten Benutzer, das Fälligkeitsdatum bleibt stehen. Der Dokumentationsbereich listet die Wartungen des Geräts, die neueste zuerst. Ältere Dokumentationseinträge bleiben lesbar.

Das Menü in der Kopfzeile zeigt allen Benutzern die Wartungsübersicht. Super Benutzer öffnen dort zusätzlich die Benutzerverwaltung. Dort lassen sich Benutzer anlegen, in allen Feldern ändern und löschen. Ein leeres Passwortfeld beim Bearbeiten behält das bisherige Passwort. Der letzte Super Benutzer kann nicht gelöscht oder zum Standard Benutzer gemacht werden.

Geräte, Wartungen, Dokumentation und Benutzer liegen in der SQLite-Datei `data/gameorama.sqlite`. Passwörter stehen dort nur als scrypt-Hash. `npm run dev` startet die API auf Port 3001 und die Oberfläche auf Port 5173. Die Anmeldung gilt nur für den offenen Browser-Tab.

Benutzer anlegen oder ändern:

```bash
npm run user -- list
npm run user -- add lea geheim --name "Lea Frei" --role standard --comment "Schicht Abend"
npm run user -- passwd lea neues-geheim
npm run user -- comment lea "Schicht Morgen"
```

Zum Ansehen der Datei eignet sich [DB Browser for SQLite](https://sqlitebrowser.org/). Kommentar, Name und Rolle lassen sich dort direkt ändern. Das Passwort setzt du mit `npm run user`, nicht als Klartext in der Spalte `password_hash`.
