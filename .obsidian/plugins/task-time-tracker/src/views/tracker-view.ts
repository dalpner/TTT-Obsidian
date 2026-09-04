import { ItemView, WorkspaceLeaf, App } from "obsidian";
import { TaskService } from "../services/task-service";
import { TimerService } from "../services/timer-service";
import { PluginSettings, ViewTab } from "../types";
import { CockpitView } from "./cockpit-view";
import { CalendarView } from "./calendar-view";
import { HistoryView } from "./history-view";

export const VIEW_TYPE_TASK_TRACKER = "task-time-tracker-view";

export class TrackerView extends ItemView {
	private taskService: TaskService;
	private timerService: TimerService;
	private getSettings: () => PluginSettings;

	private currentTab: ViewTab = "cockpit";
	private cockpitRenderer: CockpitView | null = null;
	private calendarRenderer: CalendarView | null = null;
	private historyRenderer: HistoryView | null = null;

	private unsubscribeData: (() => void) | null = null;
	private unsubscribeTimer: (() => void) | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		taskService: TaskService,
		timerService: TimerService,
		getSettings: () => PluginSettings
	) {
		super(leaf);
		this.taskService = taskService;
		this.timerService = timerService;
		this.getSettings = getSettings;
	}

	getViewType(): string {
		return VIEW_TYPE_TASK_TRACKER;
	}

	getDisplayText(): string {
		return "Task & Time Tracker";
	}

	getIcon(): string {
		return "clock";
	}

	async onOpen() {
		this.unsubscribeData = this.taskService.onDataChanged(() => {
			this.refreshCurrentTab();
		});

		this.unsubscribeTimer = this.timerService.onTick(() => {
			// Only update if cockpit is active or timer changed
			if (this.currentTab === "cockpit") {
				// Lightweight tick or full refresh
				this.refreshCurrentTab();
			}
		});

		await this.render();
	}

	async onClose() {
		if (this.unsubscribeData) this.unsubscribeData();
		if (this.unsubscribeTimer) this.unsubscribeTimer();
	}

	public setTab(tab: ViewTab) {
		this.currentTab = tab;
		this.render();
	}

	public async render(): Promise<void> {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("ttt-main-view");

		// Top Navigation Tabs
		const tabHeader = container.createDiv({ cls: "ttt-tab-nav" });

		const btnCockpit = tabHeader.createEl("button", {
			text: "🏠 Cockpit",
			cls: `ttt-tab-button ${this.currentTab === "cockpit" ? "is-active" : ""}`
		});
		btnCockpit.addEventListener("click", () => this.setTab("cockpit"));

		const btnCalendar = tabHeader.createEl("button", {
			text: "📅 Kalender",
			cls: `ttt-tab-button ${this.currentTab === "calendar" ? "is-active" : ""}`
		});
		btnCalendar.addEventListener("click", () => this.setTab("calendar"));

		const btnHistory = tabHeader.createEl("button", {
			text: "📊 Historie",
			cls: `ttt-tab-button ${this.currentTab === "history" ? "is-active" : ""}`
		});
		btnHistory.addEventListener("click", () => this.setTab("history"));

		// Tab Content Area
		const tabContent = container.createDiv({ cls: "ttt-tab-content" });

		if (this.currentTab === "cockpit") {
			this.cockpitRenderer = new CockpitView(
				this.app,
				this.taskService,
				this.timerService,
				this.getSettings,
				(tab) => this.setTab(tab),
				tabContent
			);
			await this.cockpitRenderer.render();
		} else if (this.currentTab === "calendar") {
			this.calendarRenderer = new CalendarView(
				this.app,
				this.taskService,
				this.getSettings,
				(tab) => this.setTab(tab),
				tabContent
			);
			await this.calendarRenderer.render();
		} else if (this.currentTab === "history") {
			this.historyRenderer = new HistoryView(
				this.app,
				this.taskService,
				this.getSettings,
				(tab) => this.setTab(tab),
				tabContent
			);
			await this.historyRenderer.render();
		}
	}

	private refreshCurrentTab() {
		if (this.currentTab === "cockpit" && this.cockpitRenderer) {
			this.cockpitRenderer.render();
		} else if (this.currentTab === "calendar" && this.calendarRenderer) {
			this.calendarRenderer.render();
		} else if (this.currentTab === "history" && this.historyRenderer) {
			this.historyRenderer.render();
		}
	}
}
