import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	Notice,
	TFile,
	TAbstractFile
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	PluginSettings,
	ViewTab
} from "./types";
import { TaskService } from "./services/task-service";
import { TimerService } from "./services/timer-service";
import { TrackerView, VIEW_TYPE_TASK_TRACKER } from "./views/tracker-view";
import { CockpitView } from "./views/cockpit-view";
import { CalendarView } from "./views/calendar-view";
import { HistoryView } from "./views/history-view";
import { CreateTaskModal } from "./modals/create-task-modal";
import { LogTimeModal } from "./modals/log-time-modal";

export default class TaskTimeTrackerPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	taskService: TaskService;
	timerService: TimerService;

	async onload() {
		await this.loadSettings();

		// Initialize services
		this.taskService = new TaskService(this.app, () => this.settings);

		const statusBarEl = this.addStatusBarItem();
		this.timerService = new TimerService(
			this.app,
			() => this.settings,
			() => this.saveSettings(),
			statusBarEl
		);

		// Register View
		this.registerView(
			VIEW_TYPE_TASK_TRACKER,
			(leaf) => new TrackerView(leaf, this.taskService, this.timerService, () => this.settings)
		);

		// Ribbon Icon
		this.addRibbonIcon("clock", "Task & Time Tracker öffnen", () => {
			this.activateView();
		});

		// Commands
		this.addCommand({
			id: "open-tracker-view",
			name: "Tracker-Cockpit öffnen",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "create-new-task",
			name: "Neue Aufgabe erstellen",
			callback: () => {
				new CreateTaskModal(this.app, this.taskService, () => this.settings).open();
			},
		});

		this.addCommand({
			id: "log-time",
			name: "Zeit auf Aufgabe buchen",
			callback: () => {
				new LogTimeModal(this.app, this.taskService).open();
			},
		});

		this.addCommand({
			id: "toggle-timer",
			name: "Live-Timer umschalten (Start / Pause / Stopp)",
			callback: async () => {
				const active = this.timerService.getTimer();
				if (!active) {
					const tasks = await this.taskService.getAllTasks();
					const first = tasks.find(t => t.status === "in_progress") || tasks[0];
					if (first) {
						await this.timerService.startTimer(first);
					} else {
						new Notice("Keine Aufgaben zum Starten des Timers vorhanden.");
					}
				} else if (active.running) {
					await this.timerService.pauseTimer();
					new Notice("Timer pausiert.");
				} else {
					await this.timerService.resumeTimer();
					new Notice("Timer fortgesetzt.");
				}
			},
		});

		// Markdown Codeblock Processor: ```task-tracker
		this.registerMarkdownCodeBlockProcessor("task-tracker", (source, el, ctx) => {
			const lines = source.split("\n");
			let viewType: ViewTab = "cockpit";

			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed.startsWith("view:")) {
					const val = trimmed.replace("view:", "").trim().toLowerCase();
					if (val === "calendar" || val === "history" || val === "cockpit") {
						viewType = val as ViewTab;
					}
				}
			}

			el.empty();
			el.addClass("ttt-codeblock-wrapper");

			let isInitial = true;
			const renderCurrent = () => {
				if (!isInitial && !el.closest("body")) return;
				isInitial = false;
				el.empty();
				if (viewType === "cockpit") {
					const cockpit = new CockpitView(
						this.app,
						this.taskService,
						this.timerService,
						() => this.settings,
						(tab) => this.activateView(tab),
						el
					);
					cockpit.render();
				} else if (viewType === "calendar") {
					const calendar = new CalendarView(
						this.app,
						this.taskService,
						() => this.settings,
						(tab) => this.activateView(tab),
						el
					);
					calendar.render();
				} else if (viewType === "history") {
					const history = new HistoryView(
						this.app,
						this.taskService,
						() => this.settings,
						(tab) => this.activateView(tab),
						el
					);
					history.render();
				}
			};

			renderCurrent();

			const unsubscribeData = this.taskService.onDataChanged(() => {
				if (el.closest("body")) {
					renderCurrent();
				}
			});

			const unsubscribeTimer = this.timerService.onTick(() => {
				if (el.closest("body") && viewType === "cockpit") {
					renderCurrent();
				}
			});
		});

		// Listen to Vault changes to notify TaskService
		this.registerEvent(
			this.app.vault.on("modify", (file: TAbstractFile) => {
				if (!this.taskService.isInternalUpdating && file instanceof TFile && file.path.startsWith(this.settings.tasksFolder)) {
					this.taskService.notifyChange();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file: TAbstractFile) => {
				if (file instanceof TFile && file.path.startsWith(this.settings.tasksFolder)) {
					this.taskService.notifyChange();
				}
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file: TAbstractFile) => {
				if (file instanceof TFile && file.path.startsWith(this.settings.tasksFolder)) {
					this.taskService.notifyChange();
				}
			})
		);

		// Settings Tab
		this.addSettingTab(new TaskTimeTrackerSettingTab(this.app, this));
	}

	onunload() {
		if (this.timerService) {
			this.timerService.destroy();
		}
	}

	async activateView(tab?: ViewTab) {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getLeaf("tab");
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_TASK_TRACKER, active: true });
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
			if (tab && leaf.view instanceof TrackerView) {
				leaf.view.setTab(tab);
			}
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TaskTimeTrackerSettingTab extends PluginSettingTab {
	plugin: TaskTimeTrackerPlugin;

	constructor(app: App, plugin: TaskTimeTrackerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Einstellungen: Task & Time Tracker" });

		new Setting(containerEl)
			.setName("Aufgaben-Ordner (Tasks Folder)")
			.setDesc("Der Ordner im Vault, in dem alle Aufgaben als Markdown-Dateien gespeichert werden.")
			.addText(text => {
				text.setValue(this.plugin.settings.tasksFolder)
					.onChange(async (val) => {
						this.plugin.settings.tasksFolder = val.trim() || "Tasks";
						await this.plugin.saveSettings();
						this.plugin.taskService.notifyChange();
					});
			});

		new Setting(containerEl)
			.setName("Standard-Budget (Stunden)")
			.setDesc("Voreingestellte geschätzte Stundenzahl für neue Aufgaben.")
			.addText(text => {
				text.inputEl.type = "number";
				text.setValue(String(this.plugin.settings.defaultEstimatedHours))
					.onChange(async (val) => {
						const num = parseFloat(val);
						if (!isNaN(num)) {
							this.plugin.settings.defaultEstimatedHours = num;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Kostenstellen (Auswahlliste)")
			.setDesc("Kommagetrennte Liste der verfügbaren Kostenstellen.")
			.addTextArea(text => {
				text.setValue(this.plugin.settings.costCenters.join(", "))
					.onChange(async (val) => {
						this.plugin.settings.costCenters = val.split(",").map(k => k.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 2;
			});

		new Setting(containerEl)
			.setName("Aufgabentypen (Auswahlliste)")
			.setDesc("Kommagetrennte Liste der verfügbaren Aufgabentypen.")
			.addTextArea(text => {
				text.setValue(this.plugin.settings.taskTypes.join(", "))
					.onChange(async (val) => {
						this.plugin.settings.taskTypes = val.split(",").map(t => t.trim()).filter(Boolean);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 2;
			});
	}
}
