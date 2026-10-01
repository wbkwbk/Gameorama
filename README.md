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
| `admin` | `super` | Super Benutzer: Geräte, Gruppen und Wartungen hinzufügen und löschen |

Nach «Durchgeführt» entsteht ein Eintrag im Dokumentationsbereich (Datum, Wartungsnummer, Benutzername). Der nächste Termin liegt um das hinterlegte Intervall in Wochen nach dem Durchführungstag.

Geräte, Wartungen, Dokumentation und Benutzer liegen in der SQLite-Datei `data/gameorama.sqlite`. Passwörter stehen dort nur als scrypt-Hash. `npm run dev` startet die API auf Port 3001 und die Oberfläche auf Port 5173. Die Anmeldung gilt nur für den offenen Browser-Tab.

Benutzer anlegen oder ändern:

```bash
npm run user -- list
npm run user -- add lea geheim --name "Lea Frei" --role standard --comment "Schicht Abend"
npm run user -- passwd lea neues-geheim
npm run user -- comment lea "Schicht Morgen"
```

Zum Ansehen der Datei eignet sich [DB Browser for SQLite](https://sqlitebrowser.org/). Kommentar, Name und Rolle lassen sich dort direkt ändern. Das Passwort setzt du mit `npm run user`, nicht als Klartext in der Spalte `password_hash`.
