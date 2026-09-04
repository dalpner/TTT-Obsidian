import { App, Modal, Setting, Notice } from "obsidian";
import { TaskService } from "../services/task-service";
import { TaskItem } from "../types";

export class LogTimeModal extends Modal {
	private taskService: TaskService;
	private selectedTaskId: string = "";
	private date: string;
	private hours: number = 1.0;
	private startTime: string = "";
	private endTime: string = "";
	private comment: string = "";
	private onLogged?: () => void;
	private initialTaskId?: string;
	private tasks: TaskItem[] = [];

	constructor(
		app: App,
		taskService: TaskService,
		initialTaskId?: string,
		initialDate?: string,
		initialHours?: number,
		initialComment?: string,
		onLogged?: () => void
	) {
		super(app);
		this.taskService = taskService;
		this.initialTaskId = initialTaskId;
		this.date = initialDate || new Date().toISOString().slice(0, 10);
		if (initialHours !== undefined) {
			this.hours = initialHours;
		}
		if (initialComment !== undefined) {
			this.comment = initialComment;
		}
		this.onLogged = onLogged;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("ttt-modal");

		this.tasks = await this.taskService.getAllTasks();

		if (this.tasks.length === 0) {
			contentEl.createEl("h2", { text: "Keine Aufgaben vorhanden" });
			contentEl.createEl("p", { text: "Bitte erstellen Sie zuerst eine Aufgabe, bevor Sie Zeit buchen können." });
			const btn = contentEl.createEl("button", { text: "Schließen", cls: "mod-cta" });
			btn.addEventListener("click", () => this.close());
			return;
		}

		if (this.initialTaskId && this.tasks.some(t => t.id === this.initialTaskId)) {
			this.selectedTaskId = this.initialTaskId;
		} else {
			this.selectedTaskId = this.tasks[0].id;
		}

		contentEl.createEl("h2", { text: "Arbeitszeit auf Aufgabe buchen" });

		// Task selector
		new Setting(contentEl)
			.setName("Aufgabe auswählen")
			.setDesc("Auf welche Aufgabe soll die Zeit gebucht werden?")
			.addDropdown(drop => {
				for (const t of this.tasks) {
					const prefix = t.status === "done" ? "[✓] " : (t.wichtig ? "⭐ " : "");
					const label = `${prefix}${t.title} (${t.typ})`;
					drop.addOption(t.id, label);
				}
				drop.setValue(this.selectedTaskId);
				drop.onChange(val => { this.selectedTaskId = val; });
			});

		// Date
		new Setting(contentEl)
			.setName("Datum der Buchung")
			.setDesc("An welchem Tag wurde gearbeitet?")
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
			.setDesc("Berechnet bei Eingabe automatisch die Stundenzahl")
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
			.setName("Kommentar / Tätigkeitsbeschreibung")
			.setDesc("Was wurde in dieser Zeit erledigt?")
			.addText(text => {
				text.setPlaceholder("z. B. Konzept besprochen und Schnittstelle gebaut")
					.setValue(this.comment)
					.onChange(val => { this.comment = val; });
			});

		// Action Buttons
		const buttonContainer = contentEl.createDiv({ cls: "ttt-modal-buttons" });

		const cancelBtn = buttonContainer.createEl("button", { text: "Abbrechen" });
		cancelBtn.addEventListener("click", () => this.close());

		const submitBtn = buttonContainer.createEl("button", {
			text: "Zeit speichern",
			cls: "mod-cta"
		});

		submitBtn.addEventListener("click", async () => {
			if (!this.selectedTaskId) {
				new Notice("Bitte wählen Sie eine Aufgabe aus.");
				return;
			}
			if (isNaN(this.hours) || this.hours <= 0) {
				new Notice("Bitte geben Sie eine gültige Stundenzahl größer als 0 ein.");
				return;
			}

			try {
				await this.taskService.logTime(this.selectedTaskId, {
					date: this.date,
					hours: this.hours,
					start_time: this.startTime || undefined,
					end_time: this.endTime || undefined,
					comment: this.comment.trim() || undefined
				});

				new Notice(`${this.hours} Std. erfolgreich für ${this.date} verbucht!`);
				this.close();
				if (this.onLogged) this.onLogged();
			} catch (err: any) {
				console.error(err);
				new Notice(`Fehler beim Buchen der Zeit: ${err?.message || err}`);
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
