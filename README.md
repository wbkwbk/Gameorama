# Gameorama Wartungstool

Webanwendung zur Wartung der Geräte in der Spielhalle. Die Übersicht gruppiert Geräte und färbt sie nach dem nächsten Termin: grün für die nächste Wartung, gelb wenn sie innerhalb einer Woche fällig ist, rot wenn sie überfällig ist.

## Start

```bash
npm install
npm run dev
```

Die App läuft dann auf [http://localhost:5173](http://localhost:5173).

## Rollen

| Benutzer | Passwort | Rechte |
| --- | --- | --- |
| `anna` | `wartung` | Standard Benutzer: Wartungen als durchgeführt markieren |
| `admin` | `super` | Super Benutzer: Geräte, Gruppen, Wartungen und Benutzer verwalten |

Nach «Durchgeführt» wird die Wartung auf erledigt gesetzt. «Durchgeführt durch» enthält den angemeldeten Benutzer, das Fälligkeitsdatum bleibt stehen. Der Dokumentationsbereich listet die Wartungen des Geräts, die neueste zuerst. Ältere Dokumentationseinträge bleiben lesbar.

Super Benutzer öffnen die Benutzerverwaltung über das Menü in der Kopfzeile. Dort lassen sich Benutzer anlegen, in allen Feldern ändern und löschen. Ein leeres Passwortfeld beim Bearbeiten behält das bisherige Passwort. Der letzte Super Benutzer kann nicht gelöscht oder zum Standard Benutzer gemacht werden.

Geräte, Wartungen, Dokumentation und Benutzer liegen in der SQLite-Datei `data/gameorama.sqlite`. Passwörter stehen dort nur als scrypt-Hash. `npm run dev` startet die API auf Port 3001 und die Oberfläche auf Port 5173. Die Anmeldung gilt nur für den offenen Browser-Tab.

Benutzer anlegen oder ändern:

```bash
npm run user -- list
npm run user -- add lea geheim --name "Lea Frei" --role standard --comment "Schicht Abend"
npm run user -- passwd lea neues-geheim
npm run user -- comment lea "Schicht Morgen"
```

Zum Ansehen der Datei eignet sich [DB Browser for SQLite](https://sqlitebrowser.org/). Kommentar, Name und Rolle lassen sich dort direkt ändern. Das Passwort setzt du mit `npm run user`, nicht als Klartext in der Spalte `password_hash`.
