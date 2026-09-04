import { App, Modal, Notice } from "obsidian";
import { TaskService } from "../services/task-service";
import { TaskItem, TimeEntry } from "../types";
import { EditTimeModal } from "./edit-time-modal";
import { LogTimeModal } from "./log-time-modal";

export class ManageTaskEntriesModal extends Modal {
	private taskService: TaskService;
	private task: TaskItem;
	private onUpdated?: () => void;

	constructor(
		app: App,
		taskService: TaskService,
		task: TaskItem,
		onUpdated?: () => void
	) {
		super(app);
		this.taskService = taskService;
		this.task = task;
		this.onUpdated = onUpdated;
	}

	async onOpen() {
		await this.refreshContent();
	}

	async refreshContent() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ttt-modal");

		// Fetch latest version of task
		const currentTask = await this.taskService.getTaskById(this.task.id);
		if (!currentTask) {
			contentEl.createEl("p", { text: "Aufgabe nicht gefunden." });
			return;
		}
		this.task = currentTask;

		contentEl.createEl("h2", { text: `Zeiten für "${this.task.title}"` });
		contentEl.createEl("p", {
			text: `Gesamt gebucht: ${this.task.total_hours.toFixed(1)} Std. ${this.task.estimated_hours ? `/ Budget: ${this.task.estimated_hours} Std.` : ""}`,
			cls: "ttt-subtitle"
		});

		// Add new time button
		const topBar = contentEl.createDiv({ cls: "ttt-manage-top-bar" });
		const addBtn = topBar.createEl("button", {
			text: "+ Neue Zeit auf diese Aufgabe buchen",
			cls: "ttt-btn-primary"
		});
		addBtn.addEventListener("click", () => {
			new LogTimeModal(
				this.app,
				this.taskService,
				this.task.id,
				undefined,
				undefined,
				undefined,
				async () => {
					await this.refreshContent();
					if (this.onUpdated) this.onUpdated();
				}
			).open();
		});

		if (this.task.time_entries.length === 0) {
			contentEl.createEl("p", {
				text: "Bisher wurden keine Zeiten auf diese Aufgabe gebucht.",
				cls: "ttt-dimmed"
			});
		} else {
			const table = contentEl.createEl("table", { cls: "ttt-table" });
			const thead = table.createEl("thead");
			const hrow = thead.createEl("tr");
			hrow.createEl("th", { text: "Datum" });
			hrow.createEl("th", { text: "Dauer" });
			hrow.createEl("th", { text: "Uhrzeit" });
			hrow.createEl("th", { text: "Kommentar" });
			hrow.createEl("th", { text: "Aktionen" });

			const tbody = table.createEl("tbody");

			// Sort by date descending
			const sorted = [...this.task.time_entries].sort((a, b) => b.date.localeCompare(a.date));

			for (const entry of sorted) {
				const row = tbody.createEl("tr");
				row.createEl("td", { text: entry.date });
				row.createEl("td", { text: `${entry.hours.toFixed(1)} Std.`, cls: "ttt-table-bold" });
				const timeStr = (entry.start_time && entry.end_time)
					? `${entry.start_time} - ${entry.end_time}`
					: "-";
				row.createEl("td", { text: timeStr });
				row.createEl("td", { text: entry.comment || "-" });

				const actionTd = row.createEl("td", { cls: "ttt-table-actions" });

				const editBtn = actionTd.createEl("button", {
					text: "✏️ Bearbeiten",
					cls: "ttt-btn-small",
					title: "Eintrag bearbeiten"
				});
				editBtn.addEventListener("click", () => {
					new EditTimeModal(
						this.app,
						this.taskService,
						this.task,
						entry,
						async () => {
							await this.refreshContent();
							if (this.onUpdated) this.onUpdated();
						},
						async () => {
							await this.refreshContent();
							if (this.onUpdated) this.onUpdated();
						}
					).open();
				});

				const delBtn = actionTd.createEl("button", {
					text: "🗑️",
					cls: "ttt-btn-small ttt-btn-danger",
					title: "Eintrag löschen"
				});
				delBtn.addEventListener("click", async () => {
					if (confirm(`Zeiteintrag (${entry.hours}h am ${entry.date}) wirklich löschen?`)) {
						await this.taskService.deleteTimeEntry(this.task.id, entry.id);
						new Notice("Eintrag gelöscht.");
						await this.refreshContent();
						if (this.onUpdated) this.onUpdated();
					}
				});
			}
		}

		// Close button
		const btnContainer = contentEl.createDiv({ cls: "ttt-modal-buttons" });
		const closeBtn = btnContainer.createEl("button", { text: "Schließen", cls: "mod-cta" });
		closeBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
