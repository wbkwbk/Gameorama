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

## Start unter Unix mit systemd

Für den Dauerbetrieb unter Unix dient eine systemd-Unit. Nötig ist Node.js 22 oder neuer. Im Installationsverzeichnis zuerst `npm run build` ausführen, damit `dist/index.html` existiert. Gestartet wird `node server/index.js`, derselbe Prozess wie `npm start`. Er hört auf `127.0.0.1` und den Port aus `PORT`, sonst `3001`.

Beispiel für `/etc/systemd/system/gameorama.service`. Der Block mit `[Unit]`, `[Service]` und `[Install]` ist der Inhalt dieser Datei, keine Folge von Shell-Befehlen. Der Installationspfad im Beispiel ist `/opt/gameorama`, Node im Beispiel `/usr/bin/node` (Node.js 22 oder neuer). Die Befehle laufen als root:

```ini
[Unit]
Description=Gameorama Wartungstool
After=network.target

[Service]
WorkingDirectory=/opt/gameorama
Environment=PORT=3001
ExecStart=/usr/bin/node server/index.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Zuerst prüfen, ob die Unit schon existiert:

```bash
systemctl cat gameorama
```

Gibt `systemctl cat` die Unit aus, muss die Datei nicht erneut angelegt werden. Zum Ansehen genügt `systemctl status gameorama`.

Fehlt der Dienst, die Datei einmal anlegen und den ganzen Block auf einmal einfügen:

```bash
cat >/etc/systemd/system/gameorama.service <<'EOF'
[Unit]
Description=Gameorama Wartungstool
After=network.target

[Service]
WorkingDirectory=/opt/gameorama
Environment=PORT=3001
ExecStart=/usr/bin/node server/index.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now gameorama
```

```bash
systemctl daemon-reload
systemctl enable --now gameorama
```

```bash
systemctl start gameorama
systemctl stop gameorama
systemctl restart gameorama
systemctl status gameorama
```

## Datenbank leeren

Zuerst den Dienst stoppen, damit SQLite nicht gesperrt ist. Dann im Installationsverzeichnis `node scripts/neue-datenbank.mjs --force` ausführen und den Dienst wieder starten. Im Beispiel liegt die Installation unter `/opt/gameorama`:

```bash
systemctl stop gameorama
cd /opt/gameorama
node scripts/neue-datenbank.mjs --force
systemctl start gameorama
```

`--force` ersetzt `data/gameorama.sqlite` einschließlich der Geräte, der Wartungen und der Benutzer, und entfernt vorhandene Begleitdateien `-wal`, `-shm` und `-journal`. `data/uploads` wird nicht gelöscht. Ohne `--force` bleibt eine vorhandene Datenbank unverändert. Das Skript legt die Datei danach neu an.

## Erste Benutzer in der Shell anlegen

Im Installationsverzeichnis:

```bash
node scripts/neue-datenbank.mjs
```

Das Skript legt diese Benutzer an:

- `superuser`, Rolle `super` (Super Benutzer), Passwort `superuser`
- `user`, Rolle `standard` (Standard Benutzer), Passwort `user`

Ist `data/gameorama.sqlite` schon vorhanden, bleibt sie ohne `--force` unverändert.

`npm start` legt auf einer neuen, leeren Datenbank die Beispielgruppen, Geräte und Wartungen an und, solange noch kein Benutzer existiert, zusätzlich `anna` (Rolle `standard`, Passwort `wartung`) und `admin` (Rolle `super`, Passwort `super`). `node scripts/neue-datenbank.mjs` schreibt dieselben Beispieldaten, überspringt `anna` und `admin` und speichert nur `superuser` und `user`.

## Rollen

Benutzer  Standard Benutzer: Wartungen als durchgeführt markieren |
Super Benutzer: Geräte, Gruppen, Wartungen und Benutzer verwalten |

Nach «Durchgeführt» wird die Aufgabe auf erledigt gesetzt. «Durchgeführt durch» enthält den angemeldeten Benutzer, das Fälligkeitsdatum bleibt stehen. Eine Wartung legt danach die nächste offene Wartung an: die neue Fälligkeit ist das bisherige Fälligkeitsdatum plus das Intervall in Wochen. Eine Reparatur Aufgabe ist einmalig, hat kein Intervall und erzeugt keine neue offene Aufgabe. Erledigte Wartungen und Reparatur Aufgaben stehen unter Durchgeführte Wartungen. Der Dokumentationsbereich am Gerät listet die erledigten Einträge, die neueste zuerst. Ältere Dokumentationseinträge bleiben lesbar.

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
