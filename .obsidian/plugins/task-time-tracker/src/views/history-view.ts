import { App, Notice } from "obsidian";
import { TaskService } from "../services/task-service";
import { TaskItem, TimeEntry, ViewTab, PluginSettings } from "../types";
import { EditTimeModal } from "../modals/edit-time-modal";

type GroupingMode = "by_day" | "by_task" | "by_tag" | "by_cost_center";
type DatePreset = "today" | "this_week" | "this_month" | "last_month" | "all" | "custom";

interface FlattenedEntry {
	task: TaskItem;
	entry: TimeEntry;
}

export class HistoryView {
	private app: App;
	private taskService: TaskService;
	private getSettings: () => PluginSettings;
	private onNavigateTab: (tab: ViewTab) => void;
	private containerEl: HTMLElement;

	private groupingMode: GroupingMode = "by_day";
	private datePreset: DatePreset = "this_month";
	private filterStartDate: string = "";
	private filterEndDate: string = "";
	private filterTag: string = "ALL";
	private filterCostCenter: string = "ALL";
	private filterType: string = "ALL";

	constructor(
		app: App,
		taskService: TaskService,
		getSettings: () => PluginSettings,
		onNavigateTab: (tab: ViewTab) => void,
		containerEl: HTMLElement
	) {
		this.app = app;
		this.taskService = taskService;
		this.getSettings = getSettings;
		this.onNavigateTab = onNavigateTab;
		this.containerEl = containerEl;

		this.applyPreset(this.datePreset);
	}

	public async render(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass("ttt-history-container");

		const allTasks = await this.taskService.getAllTasks();
		const allTags = this.taskService.getAllTags(allTasks);
		const allCostCenters = this.taskService.getAllCostCenters(allTasks);
		const allTypes = this.taskService.getAllTypes(allTasks);

		// Header
		const header = this.containerEl.createDiv({ cls: "ttt-history-header" });
		const titleGroup = header.createDiv({ cls: "ttt-header-title" });
		titleGroup.createEl("h1", { text: "Historie & Zeitauswertung" });
		titleGroup.createEl("p", { text: "Detaillierte Übersicht aller gebuchten Stunden, Auswertungen nach Tag, Aufgabe und Tags", cls: "ttt-subtitle" });

		// Filter Toolbar
		const filterBar = this.containerEl.createDiv({ cls: "ttt-history-filter-bar" });

		// Date Presets
		const presetGroup = filterBar.createDiv({ cls: "ttt-filter-group" });
		presetGroup.createEl("label", { text: "Zeitraum:" });
		const presetSelect = presetGroup.createEl("select", { cls: "ttt-select" });
		presetSelect.createEl("option", { value: "today", text: "Heute" });
		presetSelect.createEl("option", { value: "this_week", text: "Diese Woche" });
		presetSelect.createEl("option", { value: "this_month", text: "Dieser Monat" });
		presetSelect.createEl("option", { value: "last_month", text: "Letzter Monat" });
		presetSelect.createEl("option", { value: "all", text: "Gesamter Zeitraum" });
		presetSelect.createEl("option", { value: "custom", text: "Benutzerdefiniert" });
		presetSelect.value = this.datePreset;
		presetSelect.addEventListener("change", (e) => {
			this.datePreset = (e.target as HTMLSelectElement).value as DatePreset;
			this.applyPreset(this.datePreset);
			this.render();
		});

		// Date Range Inputs (visible or editable)
		const dateRangeGroup = filterBar.createDiv({ cls: "ttt-filter-group" });
		dateRangeGroup.createEl("label", { text: "Von:" });
		const startInput = dateRangeGroup.createEl("input", { type: "date", cls: "ttt-date-input" });
		startInput.value = this.filterStartDate;
		startInput.addEventListener("change", (e) => {
			this.filterStartDate = (e.target as HTMLInputElement).value;
			this.datePreset = "custom";
			presetSelect.value = "custom";
			this.renderContent(contentContainer, allTasks);
		});

		dateRangeGroup.createEl("label", { text: "Bis:" });
		const endInput = dateRangeGroup.createEl("input", { type: "date", cls: "ttt-date-input" });
		endInput.value = this.filterEndDate;
		endInput.addEventListener("change", (e) => {
			this.filterEndDate = (e.target as HTMLInputElement).value;
			this.datePreset = "custom";
			presetSelect.value = "custom";
			this.renderContent(contentContainer, allTasks);
		});

		// Tag Filter
		const tagGroup = filterBar.createDiv({ cls: "ttt-filter-group" });
		tagGroup.createEl("label", { text: "Tag:" });
		const tagSelect = tagGroup.createEl("select", { cls: "ttt-select" });
		tagSelect.createEl("option", { value: "ALL", text: "Alle Tags" });
		for (const t of allTags) {
			tagSelect.createEl("option", { value: t, text: `#${t}` });
		}
		tagSelect.value = this.filterTag;
		tagSelect.addEventListener("change", (e) => {
			this.filterTag = (e.target as HTMLSelectElement).value;
			this.renderContent(contentContainer, allTasks);
		});

		// Cost Center Filter
		const kstGroup = filterBar.createDiv({ cls: "ttt-filter-group" });
		kstGroup.createEl("label", { text: "Kostenstelle:" });
		const kstSelect = kstGroup.createEl("select", { cls: "ttt-select" });
		kstSelect.createEl("option", { value: "ALL", text: "Alle Kostenstellen" });
		for (const k of allCostCenters) {
			kstSelect.createEl("option", { value: k, text: k });
		}
		kstSelect.value = this.filterCostCenter;
		kstSelect.addEventListener("change", (e) => {
			this.filterCostCenter = (e.target as HTMLSelectElement).value;
			this.renderContent(contentContainer, allTasks);
		});

		// Type Filter
		const typeGroup = filterBar.createDiv({ cls: "ttt-filter-group" });
		typeGroup.createEl("label", { text: "Typ:" });
		const typeSelect = typeGroup.createEl("select", { cls: "ttt-select" });
		typeSelect.createEl("option", { value: "ALL", text: "Alle Typen" });
		for (const tp of allTypes) {
			typeSelect.createEl("option", { value: tp, text: tp });
		}
		typeSelect.value = this.filterType;
		typeSelect.addEventListener("change", (e) => {
			this.filterType = (e.target as HTMLSelectElement).value;
			this.renderContent(contentContainer, allTasks);
		});

		// Second Row: Grouping Tabs & Export Buttons
		const controlRow = this.containerEl.createDiv({ cls: "ttt-history-control-row" });

		const groupingGroup = controlRow.createDiv({ cls: "ttt-mode-toggle" });

		const btnByDay = groupingGroup.createEl("button", {
			text: "📅 Nach Tag",
			cls: `ttt-btn-toggle ${this.groupingMode === "by_day" ? "is-active" : ""}`
		});
		btnByDay.addEventListener("click", () => {
			this.groupingMode = "by_day";
			this.render();
		});

		const btnByTask = groupingGroup.createEl("button", {
			text: "📋 Nach Aufgabe",
			cls: `ttt-btn-toggle ${this.groupingMode === "by_task" ? "is-active" : ""}`
		});
		btnByTask.addEventListener("click", () => {
			this.groupingMode = "by_task";
			this.render();
		});

		const btnByTag = groupingGroup.createEl("button", {
			text: "🏷️ Nach Tag",
			cls: `ttt-btn-toggle ${this.groupingMode === "by_tag" ? "is-active" : ""}`
		});
		btnByTag.addEventListener("click", () => {
			this.groupingMode = "by_tag";
			this.render();
		});

		const btnByKst = groupingGroup.createEl("button", {
			text: "💼 Nach Kostenstelle",
			cls: `ttt-btn-toggle ${this.groupingMode === "by_cost_center" ? "is-active" : ""}`
		});
		btnByKst.addEventListener("click", () => {
			this.groupingMode = "by_cost_center";
			this.render();
		});

		// Export buttons
		const exportGroup = controlRow.createDiv({ cls: "ttt-export-group" });

		const copyMdBtn = exportGroup.createEl("button", {
			text: "📋 Als Markdown kopieren",
			cls: "ttt-btn-small"
		});
		copyMdBtn.addEventListener("click", () => {
			this.exportMarkdown(allTasks);
		});

		const exportCsvBtn = exportGroup.createEl("button", {
			text: "💾 CSV herunterladen",
			cls: "ttt-btn-small"
		});
		exportCsvBtn.addEventListener("click", () => {
			this.exportCsv(allTasks);
		});

		// Content Container
		const contentContainer = this.containerEl.createDiv({ cls: "ttt-history-content" });
		this.renderContent(contentContainer, allTasks);
	}

	private applyPreset(preset: DatePreset) {
		const now = new Date();
		if (preset === "today") {
			const today = now.toISOString().slice(0, 10);
			this.filterStartDate = today;
			this.filterEndDate = today;
		} else if (preset === "this_week") {
			const day = (now.getDay() + 6) % 7;
			const monday = new Date(now);
			monday.setDate(now.getDate() - day);
			const sunday = new Date(monday);
			sunday.setDate(monday.getDate() + 6);
			this.filterStartDate = monday.toISOString().slice(0, 10);
			this.filterEndDate = sunday.toISOString().slice(0, 10);
		} else if (preset === "this_month") {
			const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
			const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			this.filterStartDate = firstDay.toISOString().slice(0, 10);
			this.filterEndDate = lastDay.toISOString().slice(0, 10);
		} else if (preset === "last_month") {
			const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
			this.filterStartDate = firstDay.toISOString().slice(0, 10);
			this.filterEndDate = lastDay.toISOString().slice(0, 10);
		} else if (preset === "all") {
			this.filterStartDate = "";
			this.filterEndDate = "";
		}
	}

	private getFilteredEntries(tasks: TaskItem[]): FlattenedEntry[] {
		const result: FlattenedEntry[] = [];

		for (const task of tasks) {
			// Tag filter
			if (this.filterTag !== "ALL" && !task.tags.includes(this.filterTag)) {
				continue;
			}
			// Cost center filter
			if (this.filterCostCenter !== "ALL" && task.kostenstelle !== this.filterCostCenter) {
				continue;
			}
			// Type filter
			if (this.filterType !== "ALL" && task.typ !== this.filterType) {
				continue;
			}

			for (const entry of task.time_entries) {
				if (this.filterStartDate && entry.date < this.filterStartDate) {
					continue;
				}
				if (this.filterEndDate && entry.date > this.filterEndDate) {
					continue;
				}
				result.push({ task, entry });
			}
		}

		// Sort by date descending
		return result.sort((a, b) => b.entry.date.localeCompare(a.entry.date));
	}

	private renderContent(container: HTMLElement, allTasks: TaskItem[]) {
		container.empty();

		const entries = this.getFilteredEntries(allTasks);
		const totalHours = entries.reduce((sum, e) => sum + (e.entry.hours || 0), 0);

		// KPI Bar
		const kpiBar = container.createDiv({ cls: "ttt-history-kpi-bar" });
		kpiBar.createDiv({
			text: `Gesamtstunden: ${totalHours.toFixed(1)} Std.`,
			cls: "ttt-kpi-badge is-highlight"
		});
		kpiBar.createDiv({
			text: `Buchungen: ${entries.length}`,
			cls: "ttt-kpi-badge"
		});

		const uniqueDays = new Set(entries.map(e => e.entry.date)).size;
		kpiBar.createDiv({
			text: `Aktive Arbeitstage: ${uniqueDays}`,
			cls: "ttt-kpi-badge"
		});

		if (entries.length === 0) {
			const empty = container.createDiv({ cls: "ttt-empty-state" });
			empty.createEl("p", { text: "Keine Buchungen im ausgewählten Zeitraum oder Filterkriterien gefunden." });
			return;
		}

		if (this.groupingMode === "by_day") {
			this.renderGroupedByDay(container, entries);
		} else if (this.groupingMode === "by_task") {
			this.renderGroupedByTask(container, entries);
		} else if (this.groupingMode === "by_tag") {
			this.renderGroupedByTag(container, entries);
		} else if (this.groupingMode === "by_cost_center") {
			this.renderGroupedByCostCenter(container, entries);
		}
	}

	private renderGroupedByDay(container: HTMLElement, entries: FlattenedEntry[]) {
		// Group by date
		const dayGroups = new Map<string, FlattenedEntry[]>();
		for (const item of entries) {
			const list = dayGroups.get(item.entry.date) || [];
			list.push(item);
			dayGroups.set(item.entry.date, list);
		}

		for (const [date, dayEntries] of dayGroups.entries()) {
			const dayTotal = dayEntries.reduce((sum, e) => sum + e.entry.hours, 0);

			const groupCard = container.createDiv({ cls: "ttt-history-group-card" });
			const groupHeader = groupCard.createDiv({ cls: "ttt-history-group-header" });
			groupHeader.createEl("h3", { text: `📅 ${this.formatGermanDate(date)}` });
			groupHeader.createSpan({ text: `Gesamt: ${dayTotal.toFixed(1)} Std.`, cls: "ttt-badge ttt-badge-highlight" });

			const table = groupCard.createEl("table", { cls: "ttt-table" });
			const thead = table.createEl("thead");
			const hrow = thead.createEl("tr");
			hrow.createEl("th", { text: "Aufgabe" });
			hrow.createEl("th", { text: "Typ" });
			hrow.createEl("th", { text: "Kostenstelle" });
			hrow.createEl("th", { text: "Tags" });
			hrow.createEl("th", { text: "Uhrzeit" });
			hrow.createEl("th", { text: "Dauer" });
			hrow.createEl("th", { text: "Kommentar" });
			hrow.createEl("th", { text: "Aktionen" });

			const tbody = table.createEl("tbody");
			for (const item of dayEntries) {
				const row = tbody.createEl("tr");

				const tdTask = row.createEl("td");
				const taskLink = tdTask.createEl("a", { text: item.task.title, cls: "ttt-table-link" });
				taskLink.addEventListener("click", () => this.app.workspace.getLeaf(false).openFile(item.task.file));
				if (item.task.wichtig) tdTask.createSpan({ text: " ⭐" });

				row.createEl("td", { text: item.task.typ });
				row.createEl("td", { text: item.task.kostenstelle || "-" });

				const tdTags = row.createEl("td");
				for (const tag of item.task.tags) {
					tdTags.createSpan({ text: `#${tag} `, cls: "ttt-tag-text" });
				}

				const timeSpan = (item.entry.start_time && item.entry.end_time)
					? `${item.entry.start_time} - ${item.entry.end_time}`
					: "-";
				row.createEl("td", { text: timeSpan });

				row.createEl("td", { text: `${item.entry.hours.toFixed(1)} Std.`, cls: "ttt-table-bold" });
				row.createEl("td", { text: item.entry.comment || "-" });

				const tdAct = row.createEl("td", { cls: "ttt-table-actions" });
				const editBtn = tdAct.createEl("button", { text: "✏️", cls: "ttt-btn-icon-small", title: "Eintrag bearbeiten" });
				editBtn.addEventListener("click", () => {
					new EditTimeModal(this.app, this.taskService, item.task, item.entry, () => this.render(), () => this.render()).open();
				});

				const delBtn = tdAct.createEl("button", { text: "🗑️", cls: "ttt-btn-icon-small ttt-btn-danger", title: "Eintrag löschen" });
				delBtn.addEventListener("click", async () => {
					if (confirm(`Zeiteintrag (${item.entry.hours}h am ${item.entry.date}) wirklich löschen?`)) {
						await this.taskService.deleteTimeEntry(item.task.id, item.entry.id);
						new Notice("Zeiteintrag gelöscht.");
						this.render();
					}
				});
			}
		}
	}

	private renderGroupedByTask(container: HTMLElement, entries: FlattenedEntry[]) {
		const taskGroups = new Map<string, FlattenedEntry[]>();
		for (const item of entries) {
			const list = taskGroups.get(item.task.id) || [];
			list.push(item);
			taskGroups.set(item.task.id, list);
		}

		for (const [taskId, taskEntries] of taskGroups.entries()) {
			const task = taskEntries[0].task;
			const taskTotal = taskEntries.reduce((sum, e) => sum + e.entry.hours, 0);

			const groupCard = container.createDiv({ cls: "ttt-history-group-card" });
			const groupHeader = groupCard.createDiv({ cls: "ttt-history-group-header" });

			const titleRow = groupHeader.createDiv({ cls: "ttt-group-title-row" });
			const link = titleRow.createEl("a", { text: task.title, cls: "ttt-table-link-large" });
			link.addEventListener("click", () => this.app.workspace.getLeaf(false).openFile(task.file));

			if (task.wichtig) titleRow.createSpan({ text: " ⭐" });
			titleRow.createSpan({ text: ` [${task.typ}]`, cls: "ttt-dimmed" });

			groupHeader.createSpan({
				text: `Gebucht im Zeitraum: ${taskTotal.toFixed(1)} Std. (Gesamt: ${task.total_hours.toFixed(1)} Std.)`,
				cls: "ttt-badge ttt-badge-highlight"
			});

			const table = groupCard.createEl("table", { cls: "ttt-table" });
			const thead = table.createEl("thead");
			const hrow = thead.createEl("tr");
			hrow.createEl("th", { text: "Datum" });
			hrow.createEl("th", { text: "Uhrzeit" });
			hrow.createEl("th", { text: "Dauer" });
			hrow.createEl("th", { text: "Kommentar" });
			hrow.createEl("th", { text: "Aktionen" });

			const tbody = table.createEl("tbody");
			for (const item of taskEntries) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: this.formatGermanDate(item.entry.date) });
				const timeSpan = (item.entry.start_time && item.entry.end_time)
					? `${item.entry.start_time} - ${item.entry.end_time}`
					: "-";
				row.createEl("td", { text: timeSpan });
				row.createEl("td", { text: `${item.entry.hours.toFixed(1)} Std.`, cls: "ttt-table-bold" });
				row.createEl("td", { text: item.entry.comment || "-" });

				const tdAct = row.createEl("td", { cls: "ttt-table-actions" });
				const editBtn = tdAct.createEl("button", { text: "✏️", cls: "ttt-btn-icon-small", title: "Eintrag bearbeiten" });
				editBtn.addEventListener("click", () => {
					new EditTimeModal(this.app, this.taskService, item.task, item.entry, () => this.render(), () => this.render()).open();
				});

				const delBtn = tdAct.createEl("button", { text: "🗑️", cls: "ttt-btn-icon-small ttt-btn-danger", title: "Eintrag löschen" });
				delBtn.addEventListener("click", async () => {
					if (confirm(`Zeiteintrag (${item.entry.hours}h am ${item.entry.date}) wirklich löschen?`)) {
						await this.taskService.deleteTimeEntry(item.task.id, item.entry.id);
						new Notice("Zeiteintrag gelöscht.");
						this.render();
					}
				});
			}
		}
	}

	private renderGroupedByTag(container: HTMLElement, entries: FlattenedEntry[]) {
		const tagHours = new Map<string, number>();
		let total = 0;

		for (const item of entries) {
			const tags = item.task.tags.length > 0 ? item.task.tags : ["(Kein Tag)"];
			const h = item.entry.hours;
			total += h;
			for (const tag of tags) {
				tagHours.set(tag, (tagHours.get(tag) || 0) + h);
			}
		}

		const sortedTags = Array.from(tagHours.entries()).sort((a, b) => b[1] - a[1]);

		const card = container.createDiv({ cls: "ttt-history-group-card" });
		const table = card.createEl("table", { cls: "ttt-table" });
		const thead = table.createEl("thead");
		const hrow = thead.createEl("tr");
		hrow.createEl("th", { text: "Tag" });
		hrow.createEl("th", { text: "Gebuchte Stunden" });
		hrow.createEl("th", { text: "Anteil an Gesamt" });

		const tbody = table.createEl("tbody");
		for (const [tag, hours] of sortedTags) {
			const pct = total > 0 ? Math.round((hours / total) * 100) : 0;
			const row = tbody.createEl("tr");
			row.createEl("td", { text: tag === "(Kein Tag)" ? tag : `#${tag}`, cls: "ttt-table-bold" });
			row.createEl("td", { text: `${hours.toFixed(1)} Std.` });

			const tdPct = row.createEl("td");
			tdPct.createSpan({ text: `${pct}% ` });
			const track = tdPct.createDiv({ cls: "ttt-bar-track-mini" });
			const fill = track.createDiv({ cls: "ttt-bar-fill" });
			fill.style.width = `${pct}%`;
		}
	}

	private renderGroupedByCostCenter(container: HTMLElement, entries: FlattenedEntry[]) {
		const kstHours = new Map<string, number>();
		let total = 0;

		for (const item of entries) {
			const kst = item.task.kostenstelle || "Allgemein";
			const h = item.entry.hours;
			total += h;
			kstHours.set(kst, (kstHours.get(kst) || 0) + h);
		}

		const sorted = Array.from(kstHours.entries()).sort((a, b) => b[1] - a[1]);

		const card = container.createDiv({ cls: "ttt-history-group-card" });
		const table = card.createEl("table", { cls: "ttt-table" });
		const thead = table.createEl("thead");
		const hrow = thead.createEl("tr");
		hrow.createEl("th", { text: "Kostenstelle" });
		hrow.createEl("th", { text: "Gebuchte Stunden" });
		hrow.createEl("th", { text: "Anteil an Gesamt" });

		const tbody = table.createEl("tbody");
		for (const [kst, hours] of sorted) {
			const pct = total > 0 ? Math.round((hours / total) * 100) : 0;
			const row = tbody.createEl("tr");
			row.createEl("td", { text: kst, cls: "ttt-table-bold" });
			row.createEl("td", { text: `${hours.toFixed(1)} Std.` });

			const tdPct = row.createEl("td");
			tdPct.createSpan({ text: `${pct}% ` });
			const track = tdPct.createDiv({ cls: "ttt-bar-track-mini" });
			const fill = track.createDiv({ cls: "ttt-bar-fill" });
			fill.style.width = `${pct}%`;
		}
	}

	private exportMarkdown(tasks: TaskItem[]) {
		const entries = this.getFilteredEntries(tasks);
		if (entries.length === 0) {
			new Notice("Keine Daten zum Exportieren vorhanden.");
			return;
		}

		let md = `| Datum | Aufgabe | Typ | Kostenstelle | Tags | Stunden | Kommentar |\n`;
		md += `| :--- | :--- | :--- | :--- | :--- | :---: | :--- |\n`;

		for (const item of entries) {
			const tagsStr = item.task.tags.map(t => `#${t}`).join(" ");
			const commentStr = (item.entry.comment || "").replace(/\|/g, "/");
			md += `| ${item.entry.date} | ${item.task.title} | ${item.task.typ} | ${item.task.kostenstelle} | ${tagsStr} | ${item.entry.hours.toFixed(1)} | ${commentStr} |\n`;
		}

		const total = entries.reduce((s, e) => s + e.entry.hours, 0);
		md += `| **Gesamt** | | | | | **${total.toFixed(1)}** | |\n`;

		navigator.clipboard.writeText(md);
		new Notice("Markdown-Tabelle in die Zwischenablage kopiert!");
	}

	private exportCsv(tasks: TaskItem[]) {
		const entries = this.getFilteredEntries(tasks);
		if (entries.length === 0) {
			new Notice("Keine Daten zum Exportieren vorhanden.");
			return;
		}

		let csv = "Datum;Aufgabe;Typ;Kostenstelle;Tags;Stunden;Startzeit;Endzeit;Kommentar\n";
		for (const item of entries) {
			const safe = (val?: string) => `"${(val || "").replace(/"/g, '""')}"`;
			csv += `${item.entry.date};${safe(item.task.title)};${safe(item.task.typ)};${safe(item.task.kostenstelle)};${safe(item.task.tags.join(","))};${item.entry.hours};${safe(item.entry.start_time)};${safe(item.entry.end_time)};${safe(item.entry.comment)}\n`;
		}

		const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `zeitbuchungen_${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
		new Notice("CSV-Datei erfolgreich exportiert!");
	}

	private formatGermanDate(isoStr: string): string {
		if (!isoStr) return "";
		const parts = isoStr.split("-");
		if (parts.length === 3) {
			return `${parts[2]}.${parts[1]}.${parts[0]}`;
		}
		return isoStr;
	}
}
