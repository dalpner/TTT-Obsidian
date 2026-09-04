import { App, Modal, Setting, Notice } from "obsidian";
import { TaskService } from "../services/task-service";
import { TaskStatus, TaskPriority, PluginSettings } from "../types";

export class CreateTaskModal extends Modal {
	private taskService: TaskService;
	private getSettings: () => PluginSettings;
	private onCreated?: () => void;

	private title = "";
	private typ = "Feature";
	private kostenstelle = "Allgemein";
	private tags = "";
	private wichtig = false;
	private status: TaskStatus = "todo";
	private priority: TaskPriority = "medium";
	private startDate = "";
	private dueDate = "";
	private estimatedHours = 4;
	private notes = "";

	constructor(
		app: App,
		taskService: TaskService,
		getSettings: () => PluginSettings,
		initialDate?: string,
		onCreated?: () => void
	) {
		super(app);
		this.taskService = taskService;
		this.getSettings = getSettings;
		this.onCreated = onCreated;

		if (initialDate) {
			this.startDate = initialDate;
			this.dueDate = initialDate;
		} else {
			const today = new Date().toISOString().slice(0, 10);
			this.startDate = today;
		}

		this.estimatedHours = this.getSettings().defaultEstimatedHours;
		this.priority = this.getSettings().defaultPriority;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ttt-modal");

		contentEl.createEl("h2", { text: "Neue Aufgabe erstellen" });

		// Title
		new Setting(contentEl)
			.setName("Titel")
			.setDesc("Bezeichnung der Aufgabe")
			.addText(text => {
				text.setPlaceholder("z. B. Mandanten-API Endpunkte")
					.setValue(this.title)
					.onChange(val => { this.title = val; });
				setTimeout(() => text.inputEl.focus(), 50);
			});

		// Typ
		const typeSetting = new Setting(contentEl)
			.setName("Aufgabentyp")
			.setDesc("Art der Arbeit (z. B. Feature, Bug, Meeting)")
			.addDropdown(drop => {
				for (const t of this.getSettings().taskTypes) {
					drop.addOption(t, t);
				}
				drop.setValue(this.typ);
				drop.onChange(val => { this.typ = val; });
			});

		// Kostenstelle
		new Setting(contentEl)
			.setName("Kostenstelle")
			.setDesc("Zuordnung für Budget & Abrechnung")
			.addDropdown(drop => {
				for (const k of this.getSettings().costCenters) {
					drop.addOption(k, k);
				}
				drop.setValue(this.kostenstelle);
				drop.onChange(val => { this.kostenstelle = val; });
			});

		// Wichtig Flag
		new Setting(contentEl)
			.setName("Wichtig / Favorit ⭐")
			.setDesc("Aufgabe im Cockpit hervorheben und priorisieren")
			.addToggle(toggle => {
				toggle.setValue(this.wichtig)
					.onChange(val => { this.wichtig = val; });
			});

		// Tags
		new Setting(contentEl)
			.setName("Tags")
			.setDesc("Kommagetrennte Schlagwörter (z. B. backend, sprint-1, kunde-a)")
			.addText(text => {
				text.setPlaceholder("backend, kunde-a")
					.setValue(this.tags)
					.onChange(val => { this.tags = val; });
			});

		// Status & Priorität
		new Setting(contentEl)
			.setName("Status")
			.addDropdown(drop => {
				drop.addOption("todo", "Offen (To Do)");
				drop.addOption("in_progress", "In Bearbeitung");
				drop.addOption("paused", "Pausiert");
				drop.addOption("done", "Erledigt");
				drop.setValue(this.status);
				drop.onChange(val => { this.status = val as TaskStatus; });
			});

		new Setting(contentEl)
			.setName("Priorität")
			.addDropdown(drop => {
				drop.addOption("low", "Niedrig");
				drop.addOption("medium", "Mittel");
				drop.addOption("high", "Hoch");
				drop.setValue(this.priority);
				drop.onChange(val => { this.priority = val as TaskPriority; });
			});

		// Mehrtages Datumsbereich
		new Setting(contentEl)
			.setName("Startdatum")
			.setDesc("Beginn der Aufgabe (YYYY-MM-DD)")
			.addText(text => {
				text.inputEl.type = "date";
				text.setValue(this.startDate)
					.onChange(val => { this.startDate = val; });
			});

		new Setting(contentEl)
			.setName("Fälligkeitsdatum / Enddatum")
			.setDesc("Geplantes Abschlussdatum für Mehrtages-Spannen")
			.addText(text => {
				text.inputEl.type = "date";
				text.setValue(this.dueDate)
					.onChange(val => { this.dueDate = val; });
			});

		// Geschätzte Stunden
		new Setting(contentEl)
			.setName("Geplante Stunden (Budget)")
			.setDesc("Geschätzter Aufwand in Stunden")
			.addText(text => {
				text.inputEl.type = "number";
				text.inputEl.step = "0.5";
				text.setValue(String(this.estimatedHours))
					.onChange(val => {
						const num = parseFloat(val);
						if (!isNaN(num)) this.estimatedHours = num;
					});
			});

		// Initial Notes
		new Setting(contentEl)
			.setName("Notizen / Beschreibung")
			.setDesc("Optionale Spezifikation im Notiztext")
			.addTextArea(area => {
				area.setPlaceholder("Ziele, Checklisten, Anforderungen...")
					.setValue(this.notes)
					.onChange(val => { this.notes = val; });
				area.inputEl.rows = 3;
			});

		// Action Buttons
		const buttonContainer = contentEl.createDiv({ cls: "ttt-modal-buttons" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Abbrechen" });
		cancelBtn.addEventListener("click", () => this.close());

		const submitBtn = buttonContainer.createEl("button", {
			text: "Aufgabe anlegen",
			cls: "mod-cta"
		});

		submitBtn.addEventListener("click", async () => {
			if (!this.title.trim()) {
				new Notice("Bitte geben Sie einen Titel für die Aufgabe ein.");
				return;
			}

			const parsedTags = this.tags
				.split(/[, ]+/)
				.map(t => t.trim().replace(/^#/, ""))
				.filter(Boolean);

			try {
				await this.taskService.createTask({
					title: this.title.trim(),
					typ: this.typ,
					kostenstelle: this.kostenstelle,
					tags: parsedTags,
					wichtig: this.wichtig,
					status: this.status,
					priority: this.priority,
					start_date: this.startDate || undefined,
					due_date: this.dueDate || undefined,
					estimated_hours: this.estimatedHours,
					notes: this.notes.trim() ? `## Beschreibung\n${this.notes.trim()}\n` : undefined
				});

				new Notice(`Aufgabe "${this.title}" erfolgreich erstellt!`);
				this.close();
				if (this.onCreated) this.onCreated();
			} catch (err: any) {
				console.error(err);
				new Notice(`Fehler beim Erstellen der Aufgabe: ${err?.message || err}`);
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
