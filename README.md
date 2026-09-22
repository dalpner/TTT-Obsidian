# TTT-Obsidian — Task & Time Tracker

*[English version below](#english)*

## Deutsch

**Task & Time Tracker** ist ein Obsidian-Plugin zur Verwaltung von Aufgaben und Zeiterfassung direkt in deinem Vault. Aufgaben werden als normale Markdown-Notizen mit Frontmatter gespeichert — kein externes Format, keine Datenbank, alles bleibt in deinen eigenen Dateien.

Der Code wurde größtenteils mit Antigravity generiert, aber von Menschen getestet und überprüft.

### Funktionen

- **Cockpit-Ansicht**: Schnellübersicht mit KPIs (heute/diese Woche gebuchte Stunden), Aufgabenliste mit Filter nach Status und Tags, Suche
- **Aufgabenverwaltung**: Neue Aufgaben mit Titel, Status, Priorität, Typ, Kostenstelle, Tags, Start-/Fälligkeitsdatum und geschätztem Aufwand anlegen
- **Zeiterfassung**: Zeiten manuell buchen oder über einen Live-Timer (Start/Pause/Fortsetzen/Stoppen) direkt aus der Statusleiste
- **Kalender-Ansicht**: Aufgaben und Zeitbuchungen im Monatsüberblick
- **Historie-Ansicht**: Auswertung gebuchter Zeiten über frei wählbare Zeiträume
- **Super-Productivity-Import**: Kompletten Export/Backup aus [Super Productivity](https://super-productivity.com/) importieren — inkl. Vorschau vor dem Import, Konsolidierung wiederkehrender Aufgaben, Umgang mit Teilaufgaben, Duplikat-Erkennung sowie automatischer Zuordnung von Projekt → Typ und Tags → Kostenstelle/Priorität
- Befehle in der Command Palette für alle zentralen Aktionen (Cockpit öffnen, Aufgabe anlegen, Zeit buchen, Timer umschalten, Import starten)

### Installation

**Über BRAT (empfohlen für Beta-Nutzer):**
1. Das Community-Plugin **BRAT** in Obsidian installieren
2. In BRAT über „Add Beta Plugin“ das Repository `dalpner/TTT-Obsidian` eintragen
3. Das Plugin wird installiert und bei neuen Releases automatisch aktualisiert

**Manuell:**
1. Die Dateien `main.js`, `manifest.json` und `styles.css` aus dem [neuesten Release](https://github.com/dalpner/TTT-Obsidian/releases) herunterladen
2. In `<dein-Vault>/.obsidian/plugins/task-time-tracker/` ablegen
3. In Obsidian unter „Einstellungen → Community Plugins“ neu laden und aktivieren

### Einstellungen

- Zielordner für Aufgaben-Notizen
- Standard-geschätzter Aufwand und Standard-Priorität für neue Aufgaben
- Liste konfigurierbarer Kostenstellen und Aufgabentypen

### Entwicklung

```bash
cd .obsidian/plugins/task-time-tracker
npm install
npm run build
```

---

## English

**Task & Time Tracker** is an Obsidian plugin for managing tasks and tracking time directly inside your vault. Tasks are stored as plain Markdown notes with frontmatter — no external format, no database, everything stays in your own files.

The code was mostly generated with Antigravity, but tested and reviewed by humans.

### Features

- **Cockpit view**: quick overview with KPIs (hours logged today/this week), task list with status and tag filters, search
- **Task management**: create tasks with title, status, priority, type, cost center, tags, start/due date, and estimated effort
- **Time tracking**: log time manually or via a live timer (start/pause/resume/stop) right from the status bar
- **Calendar view**: monthly overview of tasks and time entries
- **History view**: analyze logged time over freely selectable date ranges
- **Super Productivity import**: import a full export/backup from [Super Productivity](https://super-productivity.com/) — including a preview before importing, consolidation of recurring tasks, subtask handling, duplicate detection, and automatic mapping of project → type and tags → cost center/priority
- Command palette entries for all key actions (open cockpit, create task, log time, toggle timer, start import)

### Installation

**Via BRAT (recommended for beta users):**
1. Install the **BRAT** community plugin in Obsidian
2. In BRAT, use "Add Beta Plugin" and enter the repository `dalpner/TTT-Obsidian`
3. The plugin will be installed and automatically updated on new releases

**Manual:**
1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/dalpner/TTT-Obsidian/releases)
2. Place them in `<your-vault>/.obsidian/plugins/task-time-tracker/`
3. In Obsidian, go to "Settings → Community Plugins", reload, and enable the plugin

### Settings

- Target folder for task notes
- Default estimated effort and default priority for new tasks
- Configurable list of cost centers and task types

### Development

```bash
cd .obsidian/plugins/task-time-tracker
npm install
npm run build
```
