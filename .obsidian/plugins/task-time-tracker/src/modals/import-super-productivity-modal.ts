import { App, Modal, Notice, normalizePath, requestUrl } from "obsidian";
import { TaskService } from "../services/task-service";
import { SuperProductivityImporter, SPImportOptions, SPImportPreview, DEFAULT_IMPORT_OPTIONS } from "../services/super-productivity-importer";
import { PluginSettings } from "../types";

export class ImportSuperProductivityModal extends Modal {
	private taskService: TaskService;
	private getSettings: () => PluginSettings;
	private onImportDone?: () => void;

	private preview: SPImportPreview | null = null;
	private options: SPImportOptions;
	private rawContent: string | null = null;
	private fileName: string = "";
	private parseError: string | null = null;

	constructor(
		app: App,
		taskService: TaskService,
		getSettings: () => PluginSettings,
		onImportDone?: () => void
	) {
		super(app);
		this.taskService = taskService;
		this.getSettings = getSettings;
		this.onImportDone = onImportDone;
		this.options = { ...DEFAULT_IMPORT_OPTIONS, targetFolder: getSettings().tasksFolder };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("ttt-import-modal");
		this.render();
	}

	onClose() {
		this.contentEl.empty();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "📥 Super Productivity Importieren" });
		contentEl.createEl("p", {
			text: "Importiere Aufgaben und Zeitbuchungen aus einem Super Productivity Backup (JSON).",
			cls: "ttt-import-desc"
		});

		// File selection section
		const fileSection = contentEl.createDiv({ cls: "ttt-import-section" });
		fileSection.createEl("h3", { text: "1. Backup-Datei wählen" });

		const fileRow = fileSection.createDiv({ cls: "ttt-import-file-row" });

		const fileInput = fileRow.createEl("input", { type: "file" } as any) as HTMLInputElement;
		(fileInput as any).accept = ".json";
		(fileInput as any).style.display = "none";

		const chooseBtn = fileRow.createEl("button", {
			text: "📂 Datei wählen…",
			cls: "ttt-btn-secondary"
		});

		const fileLabel = fileRow.createEl("span", {
			text: "Keine Datei gewählt",
			cls: "ttt-import-file-label"
		});

		chooseBtn.addEventListener("click", () => fileInput.click());

		fileInput.addEventListener("change", async () => {
			const file = fileInput.files?.[0];
			if (!file) return;
			this.fileName = file.name;
			fileLabel.setText(file.name);
			try {
				this.rawContent = await file.text();
				await this.parseAndPreview();
			} catch (e: any) {
				new Notice(`Fehler beim Lesen der Datei: ${e?.message || e}`);
			}
		});

		// Auto-detect button
		const autoRow = fileSection.createDiv({ cls: "ttt-import-auto-row" });
		autoRow.createEl("span", { text: "oder:", cls: "ttt-import-or" });
		const autoBtn = autoRow.createEl("button", {
			text: "🔍 Neuestes Backup automatisch erkennen",
			cls: "ttt-btn-nav"
		});
		autoBtn.addEventListener("click", () => this.autoDetectBackup(fileLabel));

		// Preview section (hidden initially)
		if (this.parseError) {
			const errorBanner = contentEl.createDiv({ cls: "ttt-import-error-banner" });
			errorBanner.createEl("strong", { text: "⚠️ Import nicht möglich: " });
			errorBanner.createEl("span", { text: this.parseError });
		}

		const previewSection = contentEl.createDiv({ cls: "ttt-import-section ttt-import-preview" });
		previewSection.id = "ttt-import-preview-section";
		if (!this.preview) previewSection.style.display = "none";
		else this.renderPreview(previewSection);

		// Options section
		const optionsSection = contentEl.createDiv({ cls: "ttt-import-section" });
		optionsSection.createEl("h3", { text: "2. Import-Optionen" });
		this.renderOptions(optionsSection);

		// Action buttons
		const btnRow = contentEl.createDiv({ cls: "ttt-modal-buttons-split" });
		const cancelBtn = btnRow.createEl("button", { text: "Abbrechen", cls: "ttt-btn-secondary" });
		cancelBtn.addEventListener("click", () => this.close());

		const importBtn = btnRow.createEl("button", {
			text: this.preview ? `✅ ${this.preview.totalResultTasks} Aufgaben importieren` : "Importieren",
			cls: "mod-cta ttt-btn-primary"
		});
		importBtn.disabled = !this.preview;
		importBtn.addEventListener("click", () => this.executeImport(importBtn));
	}

	private renderPreview(container: HTMLElement) {
		if (!this.preview) return;
		container.empty();
		container.style.display = "";
		container.createEl("h3", { text: "📊 Vorschau" });

		const kpiRow = container.createDiv({ cls: "ttt-kpi-row" });

		const addKpi = (label: string, value: string, cls?: string) => {
			const card = kpiRow.createDiv({ cls: "ttt-kpi-card" });
			card.createDiv({ text: label, cls: "ttt-kpi-label" });
			card.createDiv({ text: value, cls: `ttt-kpi-value${cls ? " " + cls : ""}` });
		};

		addKpi("Rohe Aufgaben", String(this.preview.totalRawTasks));
		addKpi("Nach Konsolidierung", String(this.preview.totalResultTasks), "ttt-kpi-highlight");
		addKpi("Mit Zeitbuchungen", String(this.preview.tasksWithTime));
		addKpi("Gesamtstunden", `${this.preview.totalHours.toFixed(1)} h`);

		if (this.preview.earliestDate || this.preview.latestDate) {
			const dateDiv = container.createDiv({ cls: "ttt-import-dates" });
			dateDiv.setText(
				`Zeitraum: ${this.preview.earliestDate || "?"} – ${this.preview.latestDate || "?"}`
			);
		}

		if (this.preview.projects.length > 0) {
			const pDiv = container.createDiv({ cls: "ttt-import-tags-row" });
			pDiv.createEl("strong", { text: "Projekte → typ: " });
			pDiv.createEl("span", { text: this.preview.projects.join(", ") });
		}

		if (this.preview.tags.length > 0) {
			const tDiv = container.createDiv({ cls: "ttt-import-tags-row" });
			tDiv.createEl("strong", { text: "Tags: " });
			tDiv.createEl("span", { text: this.preview.tags.slice(0, 15).join(", ") + (this.preview.tags.length > 15 ? " …" : "") });
		}
	}

	private renderOptions(container: HTMLElement) {
		const settings = this.getSettings();

		// Target folder
		const folderRow = container.createDiv({ cls: "ttt-import-option-row" });
		folderRow.createEl("label", { text: "Ziel-Ordner:" });
		const folderInput = folderRow.createEl("input", { type: "text" } as any) as HTMLInputElement;
		(folderInput as any).value = this.options.targetFolder || settings.tasksFolder;
		folderInput.addClass("ttt-input");
		folderInput.addEventListener("change", () => {
			this.options.targetFolder = folderInput.value.trim() || settings.tasksFolder;
		});

		// Duplicate handling
		const dupRow = container.createDiv({ cls: "ttt-import-option-row" });
		dupRow.createEl("label", { text: "Duplikate:" });
		const dupSelect = dupRow.createEl("select", { cls: "ttt-select" }) as HTMLSelectElement;
		const dupOptions: [string, string][] = [
			["merge_times", "Zeiten zusammenführen (empfohlen)"],
			["skip", "Vorhandene überspringen"],
			["overwrite", "Überschreiben"]
		];
		for (const [val, label] of dupOptions) {
			const opt = dupSelect.createEl("option", { text: label }) as HTMLOptionElement;
			opt.value = val;
			if (val === this.options.duplicateHandling) opt.selected = true;
		}
		dupSelect.addEventListener("change", () => {
			this.options.duplicateHandling = dupSelect.value as any;
		});

		// Subtask strategy
		const subRow = container.createDiv({ cls: "ttt-import-option-row" });
		subRow.createEl("label", { text: "Teilaufgaben:" });
		const subSelect = subRow.createEl("select", { cls: "ttt-select" }) as HTMLSelectElement;
		const subOptions: [string, string][] = [
			["merge_into_parent", "In Hauptaufgabe einrechnen (empfohlen)"],
			["separate_tasks", "Als eigene Aufgaben anlegen"]
		];
		for (const [val, label] of subOptions) {
			const opt = subSelect.createEl("option", { text: label }) as HTMLOptionElement;
			opt.value = val;
			if (val === this.options.subtaskStrategy) opt.selected = true;
		}
		subSelect.addEventListener("change", () => {
			this.options.subtaskStrategy = subSelect.value as any;
		});

		// Checkboxes
		const checkOptions: Array<[keyof SPImportOptions, string]> = [
			["consolidateDuplicates", "Gleichnamige Aufgaben konsolidieren"],
			["includeArchived", "Archivierte Aufgaben einschließen"],
			["projectAsType", "Projektname als 'Typ' übernehmen"],
			["recognizeCostCenter", "Kostenstelle aus Tags erkennen (z.B. CCC)"],
			["recognizeImportant", "Wichtig-Flag aus Tags erkennen"]
		];
		for (const [key, label] of checkOptions) {
			const row = container.createDiv({ cls: "ttt-import-check-row" });
			const cb = row.createEl("input", { type: "checkbox" } as any) as HTMLInputElement;
			(cb as any).checked = !!this.options[key];
			row.createEl("label", { text: label });
			cb.addEventListener("change", () => {
				(this.options as any)[key] = cb.checked;
				if (key === "consolidateDuplicates" || key === "subtaskStrategy" || key === "includeArchived") {
					this.tryReparse();
				}
			});
		}

		// Min hours filter
		const minHoursRow = container.createDiv({ cls: "ttt-import-option-row" });
		minHoursRow.createEl("label", { text: "Mindest-Stunden (Aufgaben ohne Zeiten filtern):" });
		const minHoursInput = minHoursRow.createEl("input", { type: "number" } as any) as HTMLInputElement;
		(minHoursInput as any).value = String(this.options.minHoursFilter || 0);
		(minHoursInput as any).min = "0";
		(minHoursInput as any).step = "0.5";
		minHoursInput.addClass("ttt-input");
		minHoursInput.addEventListener("change", () => {
			this.options.minHoursFilter = parseFloat(minHoursInput.value) || 0;
		});
	}

	private async tryReparse() {
		if (!this.rawContent) return;
		await this.parseAndPreview();
	}

	private async parseAndPreview() {
		if (!this.rawContent) return;
		try {
			this.preview = SuperProductivityImporter.parse(this.rawContent, this.options);
			this.parseError = null;
		} catch (e: any) {
			const message = e?.message || String(e);
			new Notice(`Fehler beim Parsen: ${message}`);
			this.preview = null;
			this.parseError = message;
		}
		this.render();
	}

	private async autoDetectBackup(fileLabel: HTMLElement) {
		const backupDir = normalizePath(
			"~/.var/app/com.super_productivity.SuperProductivity/config/superProductivity/backups"
		);

		// Try to read via adapter (only works if inside vault — usually won't)
		// Instead, we inform the user about the path and suggest drag-drop
		const expandedPath =
			"/home/" +
			(typeof process !== "undefined" ? process.env.USER || "user" : "user") +
			"/.var/app/com.super_productivity.SuperProductivity/config/superProductivity/backups";

		new Notice(`Backup-Ordner: ${expandedPath}\nBitte neuste Datei manuell wählen.`, 8000);

		// Try to load via adapter if the path is inside vault
		// (This path is outside vault, so we use the fs adapter via adapter.read if available)
		try {
			const adapter = this.app.vault.adapter as any;
			if (adapter && typeof adapter.list === "function") {
				const result = await adapter.list(expandedPath);
				if (result && result.files && result.files.length > 0) {
					const sorted = result.files.sort().reverse();
					const latest = sorted[0];
					const content = await adapter.read(latest);
					this.rawContent = content;
					this.fileName = latest.split("/").pop() || latest;
					fileLabel.setText(this.fileName);
					await this.parseAndPreview();
					new Notice(`✅ Backup geladen: ${this.fileName}`);
				}
			}
		} catch (e) {
			// Silently fail — user can still use file picker
		}
	}

	private async executeImport(importBtn: HTMLButtonElement) {
		if (!this.preview || !this.rawContent) {
			new Notice("Bitte zuerst eine Backup-Datei wählen.");
			return;
		}

		let tasks = this.preview.convertedTasks;

		// Apply min hours filter
		if (this.options.minHoursFilter > 0) {
			tasks = tasks.filter((t) => {
				const total = t.time_entries.reduce((s, e) => s + e.hours, 0);
				return total >= this.options.minHoursFilter;
			});
		}

		importBtn.disabled = true;
		importBtn.setText("⏳ Importiere…");

		try {
			const result = await this.taskService.saveImportedTasks(tasks, this.options);
			new Notice(
				`✅ Import abgeschlossen!\n` +
				`Erstellt: ${result.created} | Zusammengeführt: ${result.merged} | Übersprungen: ${result.skipped}`,
				10000
			);
			this.onImportDone?.();
			this.close();
		} catch (e: any) {
			new Notice(`❌ Fehler beim Import: ${e?.message || e}`);
			importBtn.disabled = false;
			importBtn.setText("Importieren (erneut versuchen)");
		}
	}
}
