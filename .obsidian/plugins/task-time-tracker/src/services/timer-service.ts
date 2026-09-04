import { App, Notice } from "obsidian";
import { ActiveTimer, PluginSettings, TaskItem } from "../types";

export class TimerService {
	private app: App;
	private getSettings: () => PluginSettings;
	private saveSettings: () => Promise<void>;
	private intervalId: number | null = null;
	private listeners: (() => void)[] = [];
	private statusBarEl: HTMLElement | null = null;

	constructor(
		app: App,
		getSettings: () => PluginSettings,
		saveSettings: () => Promise<void>,
		statusBarEl?: HTMLElement
	) {
		this.app = app;
		this.getSettings = getSettings;
		this.saveSettings = saveSettings;
		if (statusBarEl) {
			this.statusBarEl = statusBarEl;
		}

		// If a timer was already running in settings, resume it
		const current = this.getSettings().activeTimer;
		if (current && current.running) {
			this.startInterval();
		}
		this.updateStatusBar();
	}

	public setStatusBarElement(el: HTMLElement) {
		this.statusBarEl = el;
		this.updateStatusBar();
	}

	public onTick(callback: () => void): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter(cb => cb !== callback);
		};
	}

	private notifyTick() {
		this.updateStatusBar();
		for (const cb of this.listeners) {
			try {
				cb();
			} catch (err) {
				console.error("Timer tick error:", err);
			}
		}
	}

	public getTimer(): ActiveTimer | null {
		return this.getSettings().activeTimer;
	}

	public isRunning(): boolean {
		const timer = this.getTimer();
		return Boolean(timer && timer.running);
	}

	public async startTimer(task: TaskItem): Promise<void> {
		const settings = this.getSettings();

		// If another timer is running, stop it first or warn
		if (settings.activeTimer) {
			if (settings.activeTimer.taskId === task.id) {
				// Already running for this task
				return;
			}
		}

		settings.activeTimer = {
			taskId: task.id,
			taskTitle: task.title,
			startTime: Date.now(),
			accumulatedSeconds: 0,
			running: true,
		};

		await this.saveSettings();
		this.startInterval();
		this.notifyTick();
		new Notice(`Timer gestartet für: ${task.title}`);
	}

	public async pauseTimer(): Promise<void> {
		const settings = this.getSettings();
		if (!settings.activeTimer || !settings.activeTimer.running) return;

		const elapsedNow = Math.floor((Date.now() - settings.activeTimer.startTime) / 1000);
		settings.activeTimer.accumulatedSeconds += elapsedNow;
		settings.activeTimer.running = false;

		await this.saveSettings();
		this.stopInterval();
		this.notifyTick();
	}

	public async resumeTimer(): Promise<void> {
		const settings = this.getSettings();
		if (!settings.activeTimer || settings.activeTimer.running) return;

		settings.activeTimer.startTime = Date.now();
		settings.activeTimer.running = true;

		await this.saveSettings();
		this.startInterval();
		this.notifyTick();
	}

	public async stopTimer(): Promise<{ taskId: string; taskTitle: string; hours: number } | null> {
		const settings = this.getSettings();
		if (!settings.activeTimer) return null;

		const totalSeconds = this.getElapsedSeconds();
		const taskId = settings.activeTimer.taskId;
		const taskTitle = settings.activeTimer.taskTitle;
		const hours = Math.round((totalSeconds / 3600) * 100) / 100;

		settings.activeTimer = null;
		await this.saveSettings();
		this.stopInterval();
		this.notifyTick();

		return { taskId, taskTitle, hours };
	}

	public async cancelTimer(): Promise<void> {
		const settings = this.getSettings();
		settings.activeTimer = null;
		await this.saveSettings();
		this.stopInterval();
		this.notifyTick();
		new Notice("Timer verworfen.");
	}

	public getElapsedSeconds(): number {
		const timer = this.getTimer();
		if (!timer) return 0;
		if (!timer.running) return timer.accumulatedSeconds;
		const currentSession = Math.floor((Date.now() - timer.startTime) / 1000);
		return timer.accumulatedSeconds + currentSession;
	}

	public formatSeconds(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}

	private startInterval() {
		this.stopInterval();
		this.intervalId = window.setInterval(() => {
			this.notifyTick();
		}, 1000);
	}

	private stopInterval() {
		if (this.intervalId !== null) {
			window.clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	private updateStatusBar() {
		if (!this.statusBarEl) return;
		const timer = this.getTimer();
		if (!timer) {
			this.statusBarEl.empty();
			this.statusBarEl.hide();
			return;
		}

		this.statusBarEl.show();
		this.statusBarEl.empty();
		const sec = this.getElapsedSeconds();
		const formatted = this.formatSeconds(sec);
		const icon = timer.running ? "⏱️" : "⏸️";

		const titleShort = timer.taskTitle.length > 20 
			? timer.taskTitle.substring(0, 18) + "…" 
			: timer.taskTitle;

		this.statusBarEl.createEl("span", {
			text: `${icon} ${formatted} (${titleShort})`,
			cls: "ttt-status-bar-timer",
			title: `Task Time Tracker: ${timer.taskTitle}`
		});
	}

	public destroy() {
		this.stopInterval();
	}
}
