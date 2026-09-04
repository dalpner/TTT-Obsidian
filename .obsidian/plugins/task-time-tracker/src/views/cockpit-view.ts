import { App, Notice, TFile } from "obsidian";
import { TaskService } from "../services/task-service";
import { TimerService } from "../services/timer-service";
import { TaskItem, TaskStatus, PluginSettings, ViewTab } from "../types";
import { CreateTaskModal } from "../modals/create-task-modal";
import { LogTimeModal } from "../modals/log-time-modal";
import { ManageTaskEntriesModal } from "../modals/manage-task-entries-modal";

export class CockpitView {
	private app: App;
	private taskService: TaskService;
	private timerService: TimerService;
	private getSettings: () => PluginSettings;
	private onNavigateTab: (tab: ViewTab) => void;
	private containerEl: HTMLElement;

	private searchQuery: string = "";
	private selectedTag: string = "ALL";
	private selectedStatus: string = "ACTIVE"; // ACTIVE, ALL, DONE

	private isRendering = false;
	private pendingRender = false;

	constructor(
		app: App,
		taskService: TaskService,
		timerService: TimerService,
		getSettings: () => PluginSettings,
		onNavigateTab: (tab: ViewTab) => void,
		containerEl: HTMLElement
	) {
		this.app = app;
		this.taskService = taskService;
		this.timerService = timerService;
		this.getSettings = getSettings;
		this.onNavigateTab = onNavigateTab;
		this.containerEl = containerEl;
	}

	public async render(): Promise<void> {
		if (this.isRendering) {
			this.pendingRender = true;
			return;
		}
		this.isRendering = true;

		try {
			const tasks = await this.taskService.getAllTasks();
			const allTags = this.taskService.getAllTags(tasks);
			const todayHours = this.taskService.getTodayHours(tasks);
			const weekHours = this.taskService.getWeekHours(tasks);
			const activeTimer = this.timerService.getTimer();

			this.containerEl.empty();
			this.containerEl.addClass("ttt-cockpit-container");

			// Top Quick Action Bar
			const actionHeader = this.containerEl.createDiv({ cls: "ttt-action-header" });
			const actionTitleGroup = actionHeader.createDiv({ cls: "ttt-header-title" });
			actionTitleGroup.createEl("h1", { text: "Task & Time Cockpit" });
			actionTitleGroup.createEl("p", { text: "Schnellübersicht, Aufgabenverwaltung & Direkterfassung", cls: "ttt-subtitle" });

			const buttonGroup = actionHeader.createDiv({ cls: "ttt-action-buttons" });

			const newTaskBtn = buttonGroup.createEl("button", {
				text: "+ Neuer Task",
				cls: "mod-cta ttt-btn-primary"
			});
			newTaskBtn.addEventListener("click", () => {
				new CreateTaskModal(this.app, this.taskService, this.getSettings, undefined, () => this.render()).open();
			});

			const logTimeBtn = buttonGroup.createEl("button", {
				text: "+ Zeit buchen",
				cls: "ttt-btn-secondary"
			});
			logTimeBtn.addEventListener("click", () => {
				new LogTimeModal(this.app, this.taskService, undefined, undefined, undefined, undefined, () => this.render()).open();
			});

			const calBtn = buttonGroup.createEl("button", { text: "📅 Kalender", cls: "ttt-btn-nav" });
			calBtn.addEventListener("click", () => this.onNavigateTab("calendar"));

			const histBtn = buttonGroup.createEl("button", { text: "📊 Historie", cls: "ttt-btn-nav" });
			histBtn.addEventListener("click", () => this.onNavigateTab("history"));

			// KPI Cards
			const kpiRow = this.containerEl.createDiv({ cls: "ttt-kpi-row" });

			// Card 1: Today Hours
			const kpiToday = kpiRow.createDiv({ cls: "ttt-kpi-card" });
			kpiToday.createDiv({ text: "Heute gebucht", cls: "ttt-kpi-label" });
			kpiToday.createDiv({ text: `${todayHours.toFixed(1)} Std.`, cls: "ttt-kpi-value ttt-kpi-highlight" });

			// Card 2: Week Hours
			const kpiWeek = kpiRow.createDiv({ cls: "ttt-kpi-card" });
			kpiWeek.createDiv({ text: "Diese Woche", cls: "ttt-kpi-label" });
			kpiWeek.createDiv({ text: `${weekHours.toFixed(1)} Std.`, cls: "ttt-kpi-value" });

			// Card 3: Active Tasks Count
			const openTasksCount = tasks.filter(t => t.status === "in_progress" || t.status === "todo").length;
			const kpiTasks = kpiRow.createDiv({ cls: "ttt-kpi-card" });
			kpiTasks.createDiv({ text: "Offene Aufgaben", cls: "ttt-kpi-label" });
			kpiTasks.createDiv({ text: `${openTasksCount}`, cls: "ttt-kpi-value" });

			// Card 4: Live Timer
			const kpiTimer = kpiRow.createDiv({ cls: `ttt-kpi-card ttt-kpi-timer ${activeTimer ? "active" : ""}` });
			kpiTimer.createDiv({ text: "Live-Stoppuhr", cls: "ttt-kpi-label" });
			if (activeTimer) {
				const elapsedSec = this.timerService.getElapsedSeconds();
				const timeStr = this.timerService.formatSeconds(elapsedSec);
				kpiTimer.createDiv({ text: `⏱ ${timeStr}`, cls: "ttt-kpi-value ttt-timer-active" });

				const taskShort = activeTimer.taskTitle.length > 25
					? activeTimer.taskTitle.substring(0, 23) + "…"
					: activeTimer.taskTitle;
				kpiTimer.createDiv({ text: taskShort, cls: "ttt-kpi-subtext" });

				const timerActions = kpiTimer.createDiv({ cls: "ttt-timer-card-actions" });

				if (activeTimer.running) {
					const pauseBtn = timerActions.createEl("button", { text: "Pause", cls: "ttt-btn-small" });
					pauseBtn.addEventListener("click", async () => {
						await this.timerService.pauseTimer();
					});
				} else {
					const resumeBtn = timerActions.createEl("button", { text: "Weiter", cls: "ttt-btn-small" });
					resumeBtn.addEventListener("click", async () => {
						await this.timerService.resumeTimer();
					});
				}

				const stopBtn = timerActions.createEl("button", { text: "Stoppen & Buchen", cls: "ttt-btn-small mod-cta" });
				stopBtn.addEventListener("click", async () => {
					const stopped = await this.timerService.stopTimer();
					if (stopped) {
						new LogTimeModal(
							this.app,
							this.taskService,
							stopped.taskId,
							new Date().toISOString().slice(0, 10),
							stopped.hours > 0 ? stopped.hours : 0.25,
							"Timer-Erfassung",
							() => this.render()
						).open();
					}
				});

				const cancelBtn = timerActions.createEl("button", { text: "Abbrechen", cls: "ttt-btn-small ttt-btn-danger" });
				cancelBtn.addEventListener("click", async () => {
					await this.timerService.cancelTimer();
				});
			} else {
				kpiTimer.createDiv({ text: "--:--:--", cls: "ttt-kpi-value ttt-dimmed" });
				const startQuickTimerBtn = kpiTimer.createEl("button", { text: "▶ Timer starten", cls: "ttt-btn-small" });
				startQuickTimerBtn.addEventListener("click", () => {
					if (tasks.length === 0) {
						new Notice("Keine Aufgaben zum Starten eines Timers vorhanden.");
						return;
					}
					const firstActive = tasks.find(t => t.status === "in_progress") || tasks[0];
					this.timerService.startTimer(firstActive);
				});
			}

			// Filter and Search Toolbar
			const filterBar = this.containerEl.createDiv({ cls: "ttt-filter-bar" });

			// Search Input
			const searchBox = filterBar.createEl("input", {
				type: "text",
				cls: "ttt-search-input",
				placeholder: "Aufgaben durchsuchen…"
			});
			searchBox.value = this.searchQuery;
			searchBox.addEventListener("input", (e) => {
				this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
				this.updateTaskList(taskListContainer, tasks);
			});

			// Status Filter
			const statusFilter = filterBar.createEl("select", { cls: "ttt-select" });
			statusFilter.createEl("option", { value: "ACTIVE", text: "Filter: Aktive Aufgaben" });
			statusFilter.createEl("option", { value: "ALL", text: "Filter: Alle Aufgaben" });
			statusFilter.createEl("option", { value: "DONE", text: "Filter: Nur Erledigte" });
			statusFilter.value = this.selectedStatus;
			statusFilter.addEventListener("change", (e) => {
				this.selectedStatus = (e.target as HTMLSelectElement).value;
				this.updateTaskList(taskListContainer, tasks);
			});

			// Tag Filter
			const tagFilter = filterBar.createEl("select", { cls: "ttt-select" });
			tagFilter.createEl("option", { value: "ALL", text: "Alle Tags" });
			for (const t of allTags) {
				tagFilter.createEl("option", { value: t, text: `#${t}` });
			}
			tagFilter.value = this.selectedTag;
			tagFilter.addEventListener("change", (e) => {
				this.selectedTag = (e.target as HTMLSelectElement).value;
				this.updateTaskList(taskListContainer, tasks);
			});

			// Task List Container
			const taskListContainer = this.containerEl.createDiv({ cls: "ttt-task-list" });
			this.updateTaskList(taskListContainer, tasks);
		} finally {
			this.isRendering = false;
			if (this.pendingRender) {
				this.pendingRender = false;
				this.render();
			}
		}
	}

	private updateTaskList(container: HTMLElement, allTasks: TaskItem[]) {
		container.empty();

		const filtered = allTasks.filter(t => {
			if (this.selectedStatus === "ACTIVE" && t.status === "done") return false;
			if (this.selectedStatus === "DONE" && t.status !== "done") return false;
			if (this.selectedTag !== "ALL" && !t.tags.includes(this.selectedTag)) return false;

			if (this.searchQuery) {
				const query = this.searchQuery.toLowerCase();
				const matchTitle = t.title.toLowerCase().includes(query);
				const matchTags = t.tags.some(tag => tag.toLowerCase().includes(query));
				const matchCostCenter = t.kostenstelle.toLowerCase().includes(query);
				const matchType = t.typ.toLowerCase().includes(query);
				if (!matchTitle && !matchTags && !matchCostCenter && !matchType) return false;
			}

			return true;
		});

		if (filtered.length === 0) {
			const emptyMsg = container.createDiv({ cls: "ttt-empty-state" });
			emptyMsg.createEl("p", { text: "Keine Aufgaben gefunden, die den Kriterien entsprechen." });
			const createBtn = emptyMsg.createEl("button", { text: "+ Neue Aufgabe anlegen", cls: "mod-cta" });
			createBtn.addEventListener("click", () => {
				new CreateTaskModal(this.app, this.taskService, this.getSettings, undefined, () => this.render()).open();
			});
			return;
		}

		for (const task of filtered) {
			this.renderTaskCard(container, task);
		}
	}

	private renderTaskCard(container: HTMLElement, task: TaskItem) {
		const card = container.createDiv({
			cls: `ttt-task-card status-${task.status} ${task.wichtig ? "is-important" : ""}`
		});

		// Header Row: Star, Checkbox, Title, Tags
		const headerRow = card.createDiv({ cls: "ttt-task-header-row" });

		const checkBtn = headerRow.createEl("input", {
			type: "checkbox",
			cls: "ttt-task-checkbox"
		});
		checkBtn.checked = task.status === "done";
		checkBtn.title = task.status === "done" ? "Als offen markieren" : "Als erledigt markieren";
		checkBtn.addEventListener("change", async () => {
			const nextStatus = checkBtn.checked ? "done" : "in_progress";
			await this.taskService.updateTaskStatus(task.id, nextStatus);
		});

		const titleEl = headerRow.createDiv({ cls: "ttt-task-title-wrap" });
		const titleLink = titleEl.createEl("a", {
			text: task.title,
			cls: `ttt-task-title ${task.status === "done" ? "is-done" : ""}`
		});
		titleLink.addEventListener("click", (e) => {
			e.preventDefault();
			this.app.workspace.getLeaf(false).openFile(task.file);
		});

		if (task.wichtig) {
			headerRow.createSpan({ text: "⭐", cls: "ttt-star-badge", title: "Wichtig" });
		}

		// Badges Row
		const badgesRow = card.createDiv({ cls: "ttt-task-badges-row" });
		badgesRow.createSpan({ text: task.typ, cls: `ttt-badge ttt-badge-type` });

		if (task.kostenstelle) {
			badgesRow.createSpan({ text: `KST: ${task.kostenstelle}`, cls: `ttt-badge ttt-badge-kst` });
		}

		const statusLabels: Record<TaskStatus, string> = {
			todo: "Offen",
			in_progress: "In Bearbeitung",
			paused: "Pausiert",
			done: "Erledigt"
		};
		badgesRow.createSpan({ text: statusLabels[task.status] || task.status, cls: `ttt-badge ttt-badge-status status-${task.status}` });

		if (task.start_date || task.due_date) {
			const dateSpanText = `📅 ${task.start_date || "?"} bis ${task.due_date || "?"}`;
			badgesRow.createSpan({ text: dateSpanText, cls: "ttt-badge ttt-badge-dates" });
		}

		for (const tag of task.tags) {
			badgesRow.createSpan({ text: `#${tag}`, cls: "ttt-badge ttt-badge-tag" });
		}

		// Progress / Hours Bar
		const progressRow = card.createDiv({ cls: "ttt-progress-row" });
		const hoursInfo = progressRow.createDiv({ cls: "ttt-hours-info" });
		const estimated = task.estimated_hours || 0;
		const booked = task.total_hours;
		const pct = estimated > 0 ? Math.min(100, Math.round((booked / estimated) * 100)) : 0;

		hoursInfo.createSpan({
			text: estimated > 0
				? `${booked.toFixed(1)} / ${estimated.toFixed(1)} Std. (${pct}%)`
				: `${booked.toFixed(1)} Std. gebucht`
		});

		if (estimated > 0) {
			const barTrack = progressRow.createDiv({ cls: "ttt-bar-track" });
			const barFill = barTrack.createDiv({ cls: `ttt-bar-fill ${pct >= 100 ? "is-overflow" : ""}` });
			barFill.style.width = `${pct}%`;
		}

		// Direct Action Buttons
		const actionRow = card.createDiv({ cls: "ttt-card-actions" });

		// Quick +0.5h
		const btnPlusHalf = actionRow.createEl("button", {
			text: "+0.5h",
			cls: "ttt-btn-quick",
			title: "Heute 30 Minuten buchen"
		});
		btnPlusHalf.addEventListener("click", async () => {
			await this.taskService.quickLogHours(task.id, 0.5);
			new Notice(`+0.5 Std. auf "${task.title}" gebucht!`);
		});

		// Quick +1.0h
		const btnPlusOne = actionRow.createEl("button", {
			text: "+1.0h",
			cls: "ttt-btn-quick",
			title: "Heute 1 Stunde buchen"
		});
		btnPlusOne.addEventListener("click", async () => {
			await this.taskService.quickLogHours(task.id, 1.0);
			new Notice(`+1.0 Std. auf "${task.title}" gebucht!`);
		});

		// Manage Bookings Button (view, edit, delete)
		const btnManage = actionRow.createEl("button", {
			text: `Buchungen (${task.time_entries.length})`,
			cls: "ttt-btn-quick",
			title: "Alle Zeiteinträge ansehen, bearbeiten oder löschen"
		});
		btnManage.addEventListener("click", () => {
			new ManageTaskEntriesModal(this.app, this.taskService, task, () => this.render()).open();
		});

		// Log Time Modal Button
		const btnLogModal = actionRow.createEl("button", {
			text: "Zeit erfassen…",
			cls: "ttt-btn-quick",
			title: "Detaillierte Zeiterfassung mit Datum und Notiz"
		});
		btnLogModal.addEventListener("click", () => {
			new LogTimeModal(
				this.app,
				this.taskService,
				task.id,
				undefined,
				undefined,
				undefined,
				() => this.render()
			).open();
		});

		// Timer Start/Stop Button
		const activeTimer = this.timerService.getTimer();
		const isThisTimerRunning = activeTimer && activeTimer.taskId === task.id;

		const timerBtn = actionRow.createEl("button", {
			text: isThisTimerRunning ? "⏱️ Timer läuft" : "▶ Timer",
			cls: `ttt-btn-quick ${isThisTimerRunning ? "ttt-btn-active-timer" : ""}`
		});
		timerBtn.addEventListener("click", async () => {
			if (isThisTimerRunning) {
				const stopped = await this.timerService.stopTimer();
				if (stopped) {
					new LogTimeModal(
						this.app,
						this.taskService,
						task.id,
						new Date().toISOString().slice(0, 10),
						stopped.hours > 0 ? stopped.hours : 0.25,
						"Timer-Erfassung",
						() => this.render()
					).open();
				}
			} else {
				await this.timerService.startTimer(task);
			}
		});

		// Open Note Button
		const openNoteBtn = actionRow.createEl("button", {
			text: "Notiz ↗",
			cls: "ttt-btn-quick",
			title: "Markdown-Notiz im Editor öffnen"
		});
		openNoteBtn.addEventListener("click", () => {
			this.app.workspace.getLeaf(false).openFile(task.file);
		});
	}
}
