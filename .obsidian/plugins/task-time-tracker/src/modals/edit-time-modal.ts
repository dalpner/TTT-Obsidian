import { App, Modal, Setting, Notice } from "obsidian";
import { TaskService } from "../services/task-service";
import { TaskItem, TimeEntry } from "../types";

export class EditTimeModal extends Modal {
	private taskService: TaskService;
	private task: TaskItem;
	private entry: TimeEntry;
	private onSaved?: () => void;
	private onDeleted?: () => void;

	private date: string;
	private hours: number;
	private startTime: string;
	private endTime: string;
	private comment: string;

	constructor(
		app: App,
		taskService: TaskService,
		task: TaskItem,
		entry: TimeEntry,
		onSaved?: () => void,
		onDeleted?: () => void
	) {
		super(app);
		this.taskService = taskService;
		this.task = task;
		this.entry = entry;
		this.onSaved = onSaved;
		this.onDeleted = onDeleted;

		this.date = entry.date;
		this.hours = entry.hours;
		this.startTime = entry.start_time || "";
		this.endTime = entry.end_time || "";
		this.comment = entry.comment || "";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ttt-modal");

		contentEl.createEl("h2", { text: "Zeiteintrag bearbeiten" });
		contentEl.createEl("p", {
			text: `Aufgabe: ${this.task.title}`,
			cls: "ttt-subtitle"
		});

		// Date
		new Setting(contentEl)
			.setName("Datum")
			.setDesc("Datum der Arbeitsleistung")
			.addText(text => {
				text.inputEl.type = "date";
				text.setValue(this.date)
					.onChange(val => { this.date = val; });
			});

		// Duration & Hours
		let hoursInput: HTMLInputElement;
		new Setting(contentEl)
			.setName("Dauer in Stunden")
			.setDesc("Geleistete Arbeitszeit (z. B. 1.5 oder 2.25)")
			.addText(text => {
				text.inputEl.type = "number";
				text.inputEl.step = "0.25";
				text.inputEl.min = "0.05";
				text.setValue(String(this.hours));
				hoursInput = text.inputEl;
				text.onChange(val => {
					const num = parseFloat(val);
					if (!isNaN(num)) this.hours = num;
				});
			});

		// Optional Start & End time
		new Setting(contentEl)
			.setName("Optionale Uhrzeiten (Start / Ende)")
			.setDesc("Start- und Endzeitpunkt")
			.addText(text => {
				text.inputEl.type = "time";
				text.setPlaceholder("09:00");
				text.setValue(this.startTime);
				text.onChange(val => {
					this.startTime = val;
					this.recalculateFromTimes(hoursInput);
				});
			})
			.addText(text => {
				text.inputEl.type = "time";
				text.setPlaceholder("11:30");
				text.setValue(this.endTime);
				text.onChange(val => {
					this.endTime = val;
					this.recalculateFromTimes(hoursInput);
				});
			});

		// Comment
		new Setting(contentEl)
			.setName("Tätigkeit / Kommentar")
			.setDesc("Beschreibung der erledigten Arbeit")
			.addText(text => {
				text.setPlaceholder("z. B. API-Tests durchgeführt")
					.setValue(this.comment)
					.onChange(val => { this.comment = val; });
			});

		// Buttons: Delete on the left, Cancel and Save on the right
		const buttonContainer = contentEl.createDiv({ cls: "ttt-modal-buttons ttt-modal-buttons-split" });

		const deleteBtn = buttonContainer.createEl("button", {
			text: "🗑️ Eintrag löschen",
			cls: "ttt-btn-danger"
		});
		deleteBtn.addEventListener("click", async () => {
			if (confirm(`Möchten Sie diesen Zeiteintrag (${this.entry.hours}h am ${this.entry.date}) wirklich unwiderruflich löschen?`)) {
				try {
					await this.taskService.deleteTimeEntry(this.task.id, this.entry.id);
					new Notice("Zeiteintrag erfolgreich gelöscht.");
					this.close();
					if (this.onDeleted) this.onDeleted();
				} catch (err: any) {
					console.error(err);
					new Notice(`Fehler beim Löschen: ${err?.message || err}`);
				}
			}
		});

		const rightBtns = buttonContainer.createDiv({ cls: "ttt-modal-buttons-right" });

		const cancelBtn = rightBtns.createEl("button", { text: "Abbrechen" });
		cancelBtn.addEventListener("click", () => this.close());

		const saveBtn = rightBtns.createEl("button", {
			text: "Änderungen speichern",
			cls: "mod-cta"
		});
		saveBtn.addEventListener("click", async () => {
			if (isNaN(this.hours) || this.hours <= 0) {
				new Notice("Bitte geben Sie eine gültige Stundenzahl größer als 0 ein.");
				return;
			}

			try {
				await this.taskService.updateTimeEntry(this.task.id, this.entry.id, {
					date: this.date,
					hours: this.hours,
					start_time: this.startTime || undefined,
					end_time: this.endTime || undefined,
					comment: this.comment.trim() || undefined
				});

				new Notice("Zeiteintrag erfolgreich aktualisiert.");
				this.close();
				if (this.onSaved) this.onSaved();
			} catch (err: any) {
				console.error(err);
				new Notice(`Fehler beim Speichern: ${err?.message || err}`);
			}
		});
	}

	private recalculateFromTimes(hoursInputEl?: HTMLInputElement) {
		if (this.startTime && this.endTime) {
			const [sh, sm] = this.startTime.split(":").map(Number);
			const [eh, em] = this.endTime.split(":").map(Number);
			const startMinutes = sh * 60 + sm;
			const endMinutes = eh * 60 + em;
			if (endMinutes > startMinutes) {
				const diffHours = Math.round(((endMinutes - startMinutes) / 60) * 100) / 100;
				this.hours = diffHours;
				if (hoursInputEl) {
					hoursInputEl.value = String(diffHours);
				}
			}
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
