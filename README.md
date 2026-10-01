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

Daten bleiben im Browser (`localStorage`) erhalten.
