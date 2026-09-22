import { App, Notice } from "obsidian";
import { TaskService } from "../services/task-service";
import { TaskItem, TimeEntry, ViewTab, PluginSettings } from "../types";
import { CreateTaskModal } from "../modals/create-task-modal";
import { LogTimeModal } from "../modals/log-time-modal";

export class CalendarView {
	private app: App;
	private taskService: TaskService;
	private getSettings: () => PluginSettings;
	private onNavigateTab: (tab: ViewTab) => void;
	private containerEl: HTMLElement;

	private currentYear: number;
	private currentMonth: number; // 0-indexed (0 = Jan)
	private currentWeekDate: Date; // reference date for week view
	private calendarMode: "month" | "week" = "month";

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

		const today = new Date();
		this.currentYear = today.getFullYear();
		this.currentMonth = today.getMonth();
		this.currentWeekDate = new Date(today);
	}

	public async render(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass("ttt-calendar-container");

		const tasks = await this.taskService.getAllTasks();

		// Header & Navigation Toolbar
		const header = this.containerEl.createDiv({ cls: "ttt-calendar-header" });

		const navGroup = header.createDiv({ cls: "ttt-calendar-nav" });

		const prevBtn = navGroup.createEl("button", { text: "◀", cls: "ttt-btn-icon" });
		prevBtn.addEventListener("click", () => {
			if (this.calendarMode === "month") {
				this.currentMonth--;
				if (this.currentMonth < 0) {
					this.currentMonth = 11;
					this.currentYear--;
				}
			} else {
				this.currentWeekDate.setDate(this.currentWeekDate.getDate() - 7);
			}
			this.render();
		});

		const todayBtn = navGroup.createEl("button", { text: "Heute", cls: "ttt-btn-small" });
		todayBtn.addEventListener("click", () => {
			const now = new Date();
			this.currentYear = now.getFullYear();
			this.currentMonth = now.getMonth();
			this.currentWeekDate = new Date(now);
			this.render();
		});

		const nextBtn = navGroup.createEl("button", { text: "▶", cls: "ttt-btn-icon" });
		nextBtn.addEventListener("click", () => {
			if (this.calendarMode === "month") {
				this.currentMonth++;
				if (this.currentMonth > 11) {
					this.currentMonth = 0;
					this.currentYear++;
				}
			} else {
				this.currentWeekDate.setDate(this.currentWeekDate.getDate() + 7);
			}
			this.render();
		});

		// Title Label
		const titleEl = navGroup.createEl("h2", { cls: "ttt-calendar-title" });
		if (this.calendarMode === "month") {
			const monthNames = [
				"Januar", "Februar", "März", "April", "Mai", "Juni",
				"Juli", "August", "September", "Oktober", "November", "Dezember"
			];
			titleEl.setText(`${monthNames[this.currentMonth]} ${this.currentYear}`);
		} else {
			const weekStart = this.getStartOfWeek(this.currentWeekDate);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekStart.getDate() + 6);
			titleEl.setText(`Woche ${this.formatDateDM(weekStart)} – ${this.formatDateDM(weekEnd)} ${weekEnd.getFullYear()}`);
		}

		// Mode toggle & quick action buttons
		const rightActions = header.createDiv({ cls: "ttt-calendar-right-actions" });

		const modeToggleGroup = rightActions.createDiv({ cls: "ttt-mode-toggle" });
		const monthModeBtn = modeToggleGroup.createEl("button", {
			text: "Monat",
			cls: `ttt-btn-toggle ${this.calendarMode === "month" ? "is-active" : ""}`
		});
		monthModeBtn.addEventListener("click", () => {
			this.calendarMode = "month";
			this.render();
		});

		const weekModeBtn = modeToggleGroup.createEl("button", {
			text: "Woche",
			cls: `ttt-btn-toggle ${this.calendarMode === "week" ? "is-active" : ""}`
		});
		weekModeBtn.addEventListener("click", () => {
			this.calendarMode = "week";
			this.render();
		});

		const newBtn = rightActions.createEl("button", { text: "+ Neuer Task", cls: "ttt-btn-primary" });
		newBtn.addEventListener("click", () => {
			new CreateTaskModal(this.app, this.taskService, this.getSettings, undefined, () => this.render()).open();
		});

		const logBtn = rightActions.createEl("button", { text: "+ Zeit buchen", cls: "ttt-btn-secondary" });
		logBtn.addEventListener("click", () => {
			new LogTimeModal(this.app, this.taskService, undefined, undefined, undefined, undefined, () => this.render()).open();
		});

		// Render Grid
		if (this.calendarMode === "month") {
			this.renderMonthGrid(tasks);
		} else {
			this.renderWeekGrid(tasks);
		}
	}

	private renderMonthGrid(tasks: TaskItem[]) {
		const gridContainer = this.containerEl.createDiv({ cls: "ttt-month-grid" });

		// Weekday headers (Monday to Sunday)
		const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
		const headerRow = gridContainer.createDiv({ cls: "ttt-grid-weekdays" });
		for (const d of dayNames) {
			headerRow.createDiv({ text: d, cls: "ttt-weekday-header" });
		}

		const daysGrid = gridContainer.createDiv({ cls: "ttt-grid-cells" });

		// Calculate calendar days
		const firstDayOfMonth = new Date(this.currentYear, this.currentMonth, 1);
		const lastDayOfMonth = new Date(this.currentYear, this.currentMonth + 1, 0);

		// Monday = 0
		let startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

		const totalDays = lastDayOfMonth.getDate();
		const prevMonthLastDay = new Date(this.currentYear, this.currentMonth, 0).getDate();

		const todayStr = new Date().toISOString().slice(0, 10);

		// Previous month padding days
		for (let i = startDayOfWeek - 1; i >= 0; i--) {
			const dayNum = prevMonthLastDay - i;
			const cellDate = new Date(this.currentYear, this.currentMonth - 1, dayNum);
			this.renderDayCell(daysGrid, cellDate, true, tasks, todayStr);
		}

		// Current month days
		for (let day = 1; day <= totalDays; day++) {
			const cellDate = new Date(this.currentYear, this.currentMonth, day);
			this.renderDayCell(daysGrid, cellDate, false, tasks, todayStr);
		}

		// Next month padding days to complete grid (42 cells total for 6 weeks, or 35)
		const totalRendered = startDayOfWeek + totalDays;
		const nextPadding = (7 - (totalRendered % 7)) % 7;
		for (let day = 1; day <= nextPadding; day++) {
			const cellDate = new Date(this.currentYear, this.currentMonth + 1, day);
			this.renderDayCell(daysGrid, cellDate, true, tasks, todayStr);
		}
	}

	private renderDayCell(
		grid: HTMLElement,
		date: Date,
		isOtherMonth: boolean,
		tasks: TaskItem[],
		todayStr: string
	) {
		const dateStr = this.formatDateISO(date);
		const isToday = dateStr === todayStr;

		// Collect bookings on this date
		const bookings: { task: TaskItem; entry: TimeEntry }[] = [];
		let dayTotalHours = 0;

		for (const t of tasks) {
			for (const e of t.time_entries) {
				if (e.date === dateStr) {
					bookings.push({ task: t, entry: e });
					dayTotalHours += e.hours || 0;
				}
			}
		}

		// Collect multi-day tasks active on this day
		const multiDayTasks = tasks.filter(t => {
			if (!t.start_date || !t.due_date) return false;
			return dateStr >= t.start_date && dateStr <= t.due_date;
		});

		const cell = grid.createDiv({
			cls: `ttt-day-cell ${isOtherMonth ? "is-other-month" : ""} ${isToday ? "is-today" : ""} ${dayTotalHours > 0 ? "has-bookings" : ""}`
		});

		// Cell Top Bar: Date Number & Total Hours Badge
		const topBar = cell.createDiv({ cls: "ttt-cell-top" });
		topBar.createSpan({ text: String(date.getDate()), cls: "ttt-cell-date-num" });

		if (dayTotalHours > 0) {
			topBar.createSpan({
				text: `${dayTotalHours.toFixed(1)}h`,
				cls: "ttt-cell-total-badge",
				title: `${dayTotalHours.toFixed(1)} Stunden gebucht`
			});
		}

		// Quick + button on hover
		const addBtn = topBar.createEl("button", {
			text: "+",
			cls: "ttt-cell-add-btn",
			title: `Zeit für ${dateStr} buchen`
		});
		addBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			new LogTimeModal(this.app, this.taskService, undefined, dateStr, undefined, undefined, () => this.render()).open();
		});

		// Cell Content
		const content = cell.createDiv({ cls: "ttt-cell-content" });

		// Multi-day active spans (if no direct booking yet, show subtle schedule bar)
		for (const mTask of multiDayTasks) {
			// only show if not already booked or as a scheduled marker
			const hasBookingOnDay = bookings.some(b => b.task.id === mTask.id);
			if (!hasBookingOnDay) {
				const spanEl = content.createDiv({
					cls: "ttt-multi-day-indicator",
					title: `Geplant: ${mTask.title} (${mTask.start_date} bis ${mTask.due_date})`
				});
				spanEl.createSpan({ text: `↔ ${mTask.title}` });
				spanEl.addEventListener("click", (e) => {
					e.stopPropagation();
					this.app.workspace.getLeaf(false).openFile(mTask.file);
				});
			}
		}

		// Render Bookings Chips (grouped by task so each task has at most 1 chip per day)
		const taskGroupMap = new Map<string, { task: TaskItem; totalHours: number; comments: string[] }>();
		for (const b of bookings) {
			const existing = taskGroupMap.get(b.task.id);
			if (existing) {
				existing.totalHours += b.entry.hours || 0;
				if (b.entry.comment) existing.comments.push(b.entry.comment);
			} else {
				taskGroupMap.set(b.task.id, {
					task: b.task,
					totalHours: b.entry.hours || 0,
					comments: b.entry.comment ? [b.entry.comment] : []
				});
			}
		}

		for (const grp of taskGroupMap.values()) {
			const badge = content.createDiv({
				cls: `ttt-booking-chip ${grp.task.wichtig ? "is-wichtig" : ""}`,
				title: `${grp.task.title}: ${grp.totalHours.toFixed(1)}h\n${grp.comments.join("\n") || "Kein Kommentar"}`
			});
			const chipText = `${grp.task.title} (${grp.totalHours.toFixed(1)}h)`;
			badge.createSpan({ text: chipText, cls: "ttt-chip-label" });

			badge.addEventListener("click", (e) => {
				e.stopPropagation();
				this.app.workspace.getLeaf(false).openFile(grp.task.file);
			});
		}

		// Click empty space in cell to log time
		cell.addEventListener("click", () => {
			new LogTimeModal(this.app, this.taskService, undefined, dateStr, undefined, undefined, () => this.render()).open();
		});
	}

	private renderWeekGrid(tasks: TaskItem[]) {
		const weekContainer = this.containerEl.createDiv({ cls: "ttt-week-container" });
		const startOfWeek = this.getStartOfWeek(this.currentWeekDate);
		const todayStr = new Date().toISOString().slice(0, 10);

		const dayNames = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

		for (let i = 0; i < 7; i++) {
			const dayDate = new Date(startOfWeek);
			dayDate.setDate(startOfWeek.getDate() + i);
			const dateStr = this.formatDateISO(dayDate);
			const isToday = dateStr === todayStr;

			// Collect bookings
			const bookings: { task: TaskItem; entry: TimeEntry }[] = [];
			let dayTotal = 0;
			for (const t of tasks) {
				for (const e of t.time_entries) {
					if (e.date === dateStr) {
						bookings.push({ task: t, entry: e });
						dayTotal += e.hours || 0;
					}
				}
			}

			const col = weekContainer.createDiv({
				cls: `ttt-week-col ${isToday ? "is-today" : ""}`
			});

			const colHeader = col.createDiv({ cls: "ttt-week-col-header" });
			colHeader.createDiv({ text: dayNames[i], cls: "ttt-week-day-name" });
			colHeader.createDiv({ text: this.formatDateDM(dayDate), cls: "ttt-week-day-date" });
			if (dayTotal > 0) {
				colHeader.createDiv({ text: `${dayTotal.toFixed(1)} Std.`, cls: "ttt-week-col-total" });
			}

			const addBtn = colHeader.createEl("button", { text: "+ Buchen", cls: "ttt-btn-small" });
			addBtn.addEventListener("click", () => {
				new LogTimeModal(this.app, this.taskService, undefined, dateStr, undefined, undefined, () => this.render()).open();
			});

			const colBody = col.createDiv({ cls: "ttt-week-col-body" });

			if (bookings.length === 0) {
				colBody.createDiv({ text: "Keine Buchungen", cls: "ttt-week-empty" });
			} else {
				for (const b of bookings) {
					const entryCard = colBody.createDiv({ cls: "ttt-week-entry-card" });
					const titleRow = entryCard.createDiv({ cls: "ttt-week-entry-title" });
					titleRow.createEl("strong", { text: b.task.title });
					titleRow.createSpan({ text: `${b.entry.hours.toFixed(1)}h`, cls: "ttt-badge" });

					if (b.entry.start_time && b.entry.end_time) {
						entryCard.createDiv({ text: `⏱ ${b.entry.start_time} - ${b.entry.end_time}`, cls: "ttt-week-entry-time" });
					}
					if (b.entry.comment) {
						entryCard.createDiv({ text: b.entry.comment, cls: "ttt-week-entry-comment" });
					}

					entryCard.addEventListener("click", () => {
						this.app.workspace.getLeaf(false).openFile(b.task.file);
					});
				}
			}
		}
	}

	private getStartOfWeek(d: Date): Date {
		const date = new Date(d);
		const day = (date.getDay() + 6) % 7; // Monday = 0
		date.setDate(date.getDate() - day);
		date.setHours(0, 0, 0, 0);
		return date;
	}

	private formatDateISO(d: Date): string {
		const year = d.getFullYear();
		const month = String(d.getMonth() + 1).padStart(2, "0");
		const day = String(d.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}

	private formatDateDM(d: Date): string {
		return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
	}
}
