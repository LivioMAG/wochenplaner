# Repo-Hinweise für Agents

## Technologie-Stack

- Dieses Repository ist eine klassische Web-App mit **HTML**, **CSS** und **Vanilla JavaScript**.
- Es werden **keine Frontend-Frameworks** wie React, Vue, Angular, Svelte oder Next.js verwendet.
- Externe Browser-Bibliotheken werden direkt über CDN eingebunden, z. B. Supabase JS, jsPDF und jsPDF AutoTable.
- Die Persistenz und Authentifizierung laufen über Supabase; Datenbankänderungen liegen als SQL-Dateien im Repository.

## Aktueller Projektzuschnitt

Die App enthält derzeit mehrere Bereiche in einer statischen Oberfläche:

- Login und Authentifizierung.
- Wochenrapport-Übersicht mit PDF-Export.
- Ferien- und Absenz-Verwaltung.
- Projekt-/Auftragsverwaltung.
- Dispo-/Planungsansichten.
- Einstellungen und administrative Stammdaten.
- Supabase-Schema als konsolidiertes Stamm-SQL.

## Zielstruktur für eine saubere Weiterentwicklung

Die aktuelle App kann weiterhin ohne Framework betrieben werden. Für bessere Wartbarkeit sollte sie langfristig in diese Struktur überführt werden:

```text
/
├── index.html                         # Einstiegspunkt der Haupt-App
├── README.md                          # Projektübersicht, Setup und Deployment
├── AGENTS.md                          # Hinweise für Agents und Mitwirkende
├── package.json                       # Optionale Scripts für Linting/Formatierung/Checks
├── assets/
│   ├── icons/                         # SVG-/PNG-Icons
│   ├── images/                        # Statische Bilder und UI-Grafiken
│   └── fonts/                         # Lokale Fonts, falls CDN ersetzt wird
├── config/
│   ├── supabase-config.example.json   # Beispielkonfiguration ohne Secrets
│   ├── supabase-config.json           # Lokale/produktive Supabase-Konfiguration
│   ├── app-settings.json              # App-weite UI-/Business-Konfiguration
│   └── navigation.json                # Seiten, Labels, Rollen und Menüeinträge
├── src/
│   ├── app.js                         # App-Bootstrap und globale Initialisierung
│   ├── state.js                       # Zentraler Client-State
│   ├── constants.js                   # Rollen, Labels, Statuswerte und Defaults
│   ├── services/
│   │   ├── supabase-client.js         # Supabase-Client und Konfigurationsladung
│   │   ├── auth-service.js            # Login, Logout, Session-Handling
│   │   ├── reports-service.js         # Wochenrapport-Datenzugriff
│   │   ├── absences-service.js        # Ferien-/Absenz-Datenzugriff
│   │   ├── projects-service.js        # Projekt-/Auftrags-Datenzugriff
│   │   └── dispo-service.js           # Dispo-Datenzugriff
│   ├── modules/
│   │   ├── login/                     # Login-Screen und Login-Events
│   │   ├── reports/                   # Wochenrapport-UI, Filter, Export
│   │   ├── absences/                  # Ferien-/Absenz-UI
│   │   ├── projects/                  # Projektliste, Projektformular, Projektaktionen
│   │   ├── dispo/                     # Dispo-Planer und Dispo-Modale
│   │   └── settings/                  # Benutzer, Feiertage, Schulferien, Admin-Screens
│   ├── ui/
│   │   ├── modals.js                  # Wiederverwendbare Modal-Helfer
│   │   ├── tables.js                  # Tabellen-/Pagination-Helfer
│   │   ├── alerts.js                  # Alert- und Statusmeldungen
│   │   └── navigation.js              # Seitenwechsel und aktive Navigation
│   └── utils/
│       ├── date-utils.js              # Kalenderwochen, Datumsformatierung, Arbeitszeit
│       ├── format-utils.js            # Währung, Stunden, Textformatierung
│       ├── pdf-utils.js               # Gemeinsame PDF-Helfer
│       └── dom-utils.js               # DOM-, Escape- und Event-Helfer
├── styles/
│   ├── base.css                       # Reset, Variablen, Typografie
│   ├── layout.css                     # App-Shell, Sidebar, Content-Flächen
│   ├── components.css                 # Buttons, Badges, Panels, Modale, Tabellen
│   ├── pages/
│   │   ├── login.css
│   │   ├── reports.css
│   │   ├── projects.css
│   │   ├── dispo.css
│   │   └── settings.css
├── supabase/
│   └── schema.sql                     # Vollständiges konsolidiertes Stamm-SQL
└── docs/
    ├── architecture.md                # Architekturentscheidungen und Modulgrenzen
    ├── deployment.md                  # Hosting, Supabase-Setup und Umgebungen
    └── data-model.md                  # Tabellen, Beziehungen und RLS-Notizen
```

## Strukturregeln

- Neue UI-Logik soll nach Möglichkeit in passende Module unter `src/modules/` statt in eine große Sammeldatei verschoben werden.
- Wiederverwendbare DOM-, Formatierungs-, Datums- und PDF-Helfer gehören nach `src/utils/` oder `src/ui/`.
- Supabase-Zugriffe sollen in `src/services/` gekapselt werden, damit UI-Code nicht direkt überall Queries enthält.
- Konfigurierbare Werte sollen bevorzugt in JSON-Dateien unter `config/` liegen.
- Statische Bilder, Icons und Fonts gehören nach `assets/`.
- CSS soll schrittweise aus großen Einzeldateien in `styles/base.css`, `styles/layout.css`, `styles/components.css` und seitenbezogene Dateien unter `styles/pages/` aufgeteilt werden.
- Datenbankschema-Änderungen gehören in das konsolidierte Stamm-SQL `supabase/schema.sql`.

## Entwicklungsleitlinien

- Keine Framework-Abhängigkeiten einführen, solange nicht ausdrücklich gewünscht.
- Keine Secrets oder produktiven Zugangsdaten committen.
- Bestehende Vanilla-JS-Patterns respektieren und kleine, nachvollziehbare Funktionen bevorzugen.
- Vor Änderungen prüfen, ob eine Funktion bereits in `script.js` oder `supabase/schema.sql` existiert.
- Änderungen an sichtbarer UI sollten nach Möglichkeit manuell im Browser geprüft werden.
