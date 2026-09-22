import { App, TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import { TaskItem, TaskFrontmatter, TimeEntry, TaskStatus, TaskPriority, PluginSettings } from "../types";
import { ConvertedTask, SPImportOptions } from "./super-productivity-importer";

export class TaskService {
	private app: App;
	private getSettings: () => PluginSettings;
	private listeners: (() => void)[] = [];
	private notifyTimeout: number | null = null;
	public isInternalUpdating: boolean = false;

	constructor(app: App, getSettings: () => PluginSettings) {
		this.app = app;
		this.getSettings = getSettings;
	}

	public onDataChanged(callback: () => void): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter(cb => cb !== callback);
		};
	}

	public notifyChange() {
		if (this.notifyTimeout !== null) {
			window.clearTimeout(this.notifyTimeout);
		}
		this.notifyTimeout = window.setTimeout(() => {
			this.notifyTimeout = null;
			for (const cb of this.listeners) {
				try {
					cb();
				} catch (err) {
					console.error("Error in TaskService listener:", err);
				}
			}
		}, 50);
	}

	public async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalized);
		if (!folder) {
			await this.app.vault.createFolder(normalized);
		}
	}

	private async parseFileFrontmatter(file: TFile): Promise<TaskFrontmatter> {
		try {
			const content = await this.app.vault.read(file);
			const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
			if (match && match[1]) {
				const parsed = parseYaml(match[1]);
				if (parsed && typeof parsed === "object") {
					return parsed as TaskFrontmatter;
				}
			}
		} catch (err) {
			console.warn("Failed to read frontmatter directly from file, falling back to cache:", err);
		}

		const cache = this.app.metadataCache.getFileCache(file);
		return (cache?.frontmatter || {}) as TaskFrontmatter;
	}

	public async getAllTasks(): Promise<TaskItem[]> {
		const folderPath = normalizePath(this.getSettings().tasksFolder);
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const files: TFile[] = [];
		const collectFiles = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === "md") {
					files.push(child);
				} else if (child instanceof TFolder) {
					collectFiles(child);
				}
			}
		};
		collectFiles(folder);

		const tasks: TaskItem[] = [];

		for (const file of files) {
			const fm = await this.parseFileFrontmatter(file);

			const id = fm.id || `task-${file.basename.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
			const title = fm.title || file.basename;
			const status = (fm.status as TaskStatus) || "todo";
			const priority = (fm.priority as TaskPriority) || "medium";
			const wichtig = Boolean(fm.wichtig);
			const typ = String(fm.typ || "Feature");
			const kostenstelle = String(fm.kostenstelle || "Allgemein");

			let tags: string[] = [];
			if (Array.isArray(fm.tags)) {
				tags = fm.tags.map(t => String(t).replace(/^#/, ""));
			} else if (typeof fm.tags === "string") {
				tags = fm.tags.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
			}

			const rawEntries: TimeEntry[] = [];
			if (Array.isArray(fm.time_entries)) {
				for (const item of fm.time_entries) {
					if (item && typeof item === "object") {
						rawEntries.push({
							id: item.id || `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
							date: String(item.date || ""),
							hours: Number(item.hours) || 0,
							start_time: item.start_time ? String(item.start_time) : undefined,
							end_time: item.end_time ? String(item.end_time) : undefined,
							comment: item.comment ? String(item.comment) : undefined,
						});
					}
				}
			}

			// Clean/consolidate entries for display
			const { consolidated } = this.consolidateEntries(rawEntries);
			const total_hours = consolidated.reduce((sum, e) => sum + (e.hours || 0), 0);

			tasks.push({
				file,
				id,
				title,
				status,
				priority,
				wichtig,
				typ,
				kostenstelle,
				tags,
				start_date: fm.start_date ? String(fm.start_date) : undefined,
				due_date: fm.due_date ? String(fm.due_date) : undefined,
				estimated_hours: fm.estimated_hours ? Number(fm.estimated_hours) : undefined,
				time_entries: consolidated,
				total_hours: Math.round(total_hours * 100) / 100,
			});
		}

		// Sort: wichtig first, then status (in_progress, todo, paused, done), then due_date/title
		const statusWeight: Record<TaskStatus, number> = {
			in_progress: 1,
			todo: 2,
			paused: 3,
			done: 4
		};

		return tasks.sort((a, b) => {
			if (a.status !== b.status) {
				return (statusWeight[a.status] || 99) - (statusWeight[b.status] || 99);
			}
			if (a.wichtig !== b.wichtig) {
				return a.wichtig ? -1 : 1;
			}
			return a.title.localeCompare(b.title);
		});
	}

	private consolidateEntries(entries: TimeEntry[]): { consolidated: TimeEntry[]; changed: boolean } {
		const result: TimeEntry[] = [];
		const quickByDate = new Map<string, TimeEntry>();
		let changed = false;

		for (const e of entries) {
			const isQuick = !e.start_time && !e.end_time && (!e.comment || e.comment.toLowerCase().includes("schnellbuchung"));
			if (isQuick) {
				const existing = quickByDate.get(e.date);
				if (existing) {
					existing.hours = Math.round((existing.hours + e.hours) * 100) / 100;
					existing.comment = `Schnellbuchung (${existing.hours}h)`;
					changed = true;
				} else {
					const clone: TimeEntry = { ...e };
					if (!clone.comment || clone.comment.toLowerCase().includes("schnellbuchung")) {
						clone.comment = `Schnellbuchung (${clone.hours}h)`;
					}
					quickByDate.set(e.date, clone);
					result.push(clone);
				}
			} else {
				result.push(e);
			}
		}

		return { consolidated: result, changed };
	}

	public async getTaskById(taskId: string): Promise<TaskItem | null> {
		const tasks = await this.getAllTasks();
		return tasks.find(t => t.id === taskId || t.file.path === taskId) || null;
	}

	public async createTask(params: {
		title: string;
		typ: string;
		kostenstelle: string;
		tags: string[];
		wichtig: boolean;
		status: TaskStatus;
		priority: TaskPriority;
		start_date?: string;
		due_date?: string;
		estimated_hours?: number;
		notes?: string;
	}): Promise<TFile> {
		await this.ensureFolder(this.getSettings().tasksFolder);

		const now = new Date();
		const taskId = `task-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
		
		const sanitizedTitle = params.title.replace(/[\\/:*?"<>|]/g, "-").trim();
		let filename = `${sanitizedTitle}.md`;
		let fullPath = normalizePath(`${this.getSettings().tasksFolder}/${filename}`);

		// Handle duplicate filename
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(fullPath)) {
			filename = `${sanitizedTitle} (${counter}).md`;
			fullPath = normalizePath(`${this.getSettings().tasksFolder}/${filename}`);
			counter++;
		}

		const tagsYaml = params.tags.length > 0 
			? `\n  - ${params.tags.join("\n  - ")}`
			: " []";

		const content = `---
id: "${taskId}"
title: "${params.title.replace(/"/g, '\\"')}"
status: "${params.status}"
priority: "${params.priority}"
wichtig: ${params.wichtig}
typ: "${params.typ}"
kostenstelle: "${params.kostenstelle}"
tags:${tagsYaml}
${params.start_date ? `start_date: "${params.start_date}"\n` : ""}${params.due_date ? `due_date: "${params.due_date}"\n` : ""}${params.estimated_hours ? `estimated_hours: ${params.estimated_hours}\n` : ""}time_entries: []
---

# ${params.title}

${params.notes ? params.notes : "## Notizen\n- "}
`;

		this.isInternalUpdating = true;
		try {
			const createdFile = await this.app.vault.create(fullPath, content);
			this.notifyChange();
			return createdFile;
		} finally {
			setTimeout(() => { this.isInternalUpdating = false; }, 200);
		}
	}

	public async logTime(taskId: string, entryData: Omit<TimeEntry, "id">): Promise<void> {
		const task = await this.getTaskById(taskId);
		if (!task) {
			throw new Error(`Aufgabe mit ID ${taskId} nicht gefunden.`);
		}

		const targetDate = entryData.date || new Date().toISOString().slice(0, 10);
		const hours = Math.round(Number(entryData.hours) * 100) / 100;
		const comment = entryData.comment ? entryData.comment.trim() : undefined;

		this.isInternalUpdating = true;
		try {
			await this.app.fileManager.processFrontMatter(task.file, (fm: TaskFrontmatter) => {
				if (!Array.isArray(fm.time_entries)) {
					fm.time_entries = [];
				}

				const shouldMerge = !entryData.start_time && !entryData.end_time && !comment;
				let existing: any = null;

				if (shouldMerge) {
					existing = fm.time_entries.find(e => 
						e.date === targetDate && 
						!e.start_time && 
						!e.end_time && 
						(!e.comment || e.comment.toLowerCase().includes("schnellbuchung"))
					);
				}

				if (existing) {
					existing.hours = Math.round((Number(existing.hours || 0) + hours) * 100) / 100;
				} else {
					const newEntry: TimeEntry = {
						id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
						date: targetDate,
						hours: hours,
						start_time: entryData.start_time || undefined,
						end_time: entryData.end_time || undefined,
						comment: comment,
					};
					fm.time_entries.push(newEntry);
				}

				if (fm.status === "todo") {
					fm.status = "in_progress";
				}
			});
			this.notifyChange();
		} finally {
			setTimeout(() => { this.isInternalUpdating = false; }, 200);
		}
	}

	public async quickLogHours(taskId: string, hours: number): Promise<void> {
		const task = await this.getTaskById(taskId);
		if (!task) {
			throw new Error(`Aufgabe mit ID ${taskId} nicht gefunden.`);
		}

		const today = new Date().toISOString().slice(0, 10);
		const addHours = Math.round(Number(hours) * 100) / 100;

		this.isInternalUpdating = true;
		try {
			await this.app.fileManager.processFrontMatter(task.file, (fm: TaskFrontmatter) => {
				if (!Array.isArray(fm.time_entries)) {
					fm.time_entries = [];
				}

				const existing = fm.time_entries.find(e =>
					e.date === today &&
					!e.start_time &&
					!e.end_time &&
					(!e.comment || e.comment.toLowerCase().includes("schnellbuchung"))
				);

				if (existing) {
					existing.hours = Math.round((Number(existing.hours || 0) + addHours) * 100) / 100;
					existing.comment = `Schnellbuchung (${existing.hours}h)`;
				} else {
					fm.time_entries.push({
						id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
						date: today,
						hours: addHours,
						comment: `Schnellbuchung (${addHours}h)`
					});
				}

				if (fm.status === "todo") {
					fm.status = "in_progress";
				}
			});
			this.notifyChange();
		} finally {
			setTimeout(() => { this.isInternalUpdating = false; }, 200);
		}
	}

	public async updateTimeEntry(taskId: string, entryId: string, updated: Partial<TimeEntry>): Promise<void> {
		const task = await this.getTaskById(taskId);
		if (!task) return;

		this.isInternalUpdating = true;
		try {
			await this.app.fileManager.processFrontMatter(task.file, (fm: TaskFrontmatter) => {
				if (Array.isArray(fm.time_entries)) {
					const entry = fm.time_entries.find(e => e.id === entryId);
					if (entry) {
						if (updated.date !== undefined) entry.date = updated.date;
						if (updated.hours !== undefined) entry.hours = Math.round(Number(updated.hours) * 100) / 100;
						if (updated.start_time !== undefined) entry.start_time = updated.start_time || undefined;
						if (updated.end_time !== undefined) entry.end_time = updated.end_time || undefined;
						if (updated.comment !== undefined) entry.comment = updated.comment.trim() || undefined;
					}
				}
			});
			this.notifyChange();
		} finally {
			setTimeout(() => { this.isInternalUpdating = false; }, 200);
		}
	}

	public async deleteTimeEntry(taskId: string, entryId: string): Promise<void> {
		const task = await this.getTaskById(taskId);
		if (!task) return;

		this.isInternalUpdating = true;
		try {
			await this.app.fileManager.processFrontMatter(task.file, (fm: TaskFrontmatter) => {
				if (Array.isArray(fm.time_entries)) {
					fm.time_entries = fm.time_entries.filter(e => e.id !== entryId);
				}
			});
			this.notifyChange();
		} finally {
			setTimeout(() => { this.isInternalUpdating = false; }, 200);
		}
	}

	public async updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<void> {
		const task = await this.getTaskById(taskId);
		if (!task) return;

		this.isInternalUpdating = true;
		try {
			await this.app.fileManager.processFrontMatter(task.file, (fm: TaskFrontmatter) => {
				fm.status = newStatus;
			});
			this.notifyChange();
		} finally {
			setTimeout(() => { this.isInternalUpdating = false; }, 200);
		}
	}

	public getAllTags(tasks: TaskItem[]): string[] {
		const tagSet = new Set<string>();
		for (const t of tasks) {
			for (const tag of t.tags) {
				tagSet.add(tag);
			}
		}
		return Array.from(tagSet).sort();
	}

	public getAllCostCenters(tasks: TaskItem[]): string[] {
		const set = new Set<string>(this.getSettings().costCenters);
		for (const t of tasks) {
			if (t.kostenstelle) set.add(t.kostenstelle);
		}
		return Array.from(set).sort();
	}

	public getAllTypes(tasks: TaskItem[]): string[] {
		const set = new Set<string>(this.getSettings().taskTypes);
		for (const t of tasks) {
			if (t.typ) set.add(t.typ);
		}
		return Array.from(set).sort();
	}

	public getTodayHours(tasks: TaskItem[]): number {
		const today = new Date().toISOString().slice(0, 10);
		let total = 0;
		for (const t of tasks) {
			for (const e of t.time_entries) {
				if (e.date === today) {
					total += e.hours || 0;
				}
			}
		}
		return Math.round(total * 100) / 100;
	}

	public getWeekHours(tasks: TaskItem[]): number {
		const now = new Date();
		const currentDay = (now.getDay() + 6) % 7; // Monday = 0
		const monday = new Date(now);
		monday.setDate(now.getDate() - currentDay);
		monday.setHours(0, 0, 0, 0);

		const sunday = new Date(monday);
		sunday.setDate(monday.getDate() + 6);
		sunday.setHours(23, 59, 59, 999);

		const mondayStr = monday.toISOString().slice(0, 10);
		const sundayStr = sunday.toISOString().slice(0, 10);

		let total = 0;
		for (const t of tasks) {
			for (const e of t.time_entries) {
				if (e.date >= mondayStr && e.date <= sundayStr) {
					total += e.hours || 0;
				}
			}
		}
		return Math.round(total * 100) / 100;
	}

	public async saveImportedTasks(
		tasks: ConvertedTask[],
		options: Partial<SPImportOptions>
	): Promise<{ created: number; merged: number; skipped: number }> {
		const folder = normalizePath(options.targetFolder || this.getSettings().tasksFolder);
		await this.ensureFolder(folder);

		this.isInternalUpdating = true;
		let created = 0, merged = 0, skipped = 0;

		try {
			for (const task of tasks) {
				const sanitized = task.title.replace(/[\\/:*?"<>|]/g, "-").trim();
				const fullPath = normalizePath(`${folder}/${sanitized}.md`);
				const existing = this.app.vault.getAbstractFileByPath(fullPath);

				if (existing instanceof TFile && options.duplicateHandling === "skip") {
					skipped++;
					continue;
				}

				if (existing instanceof TFile && options.duplicateHandling === "merge_times") {
					await this.app.fileManager.processFrontMatter(existing, (fm: TaskFrontmatter) => {
						if (!Array.isArray(fm.time_entries)) fm.time_entries = [];
						for (const entry of task.time_entries) {
							const dup = fm.time_entries.find(
								(e: TimeEntry) => e.date === entry.date && Math.abs((e.hours || 0) - entry.hours) < 0.01
							);
							if (!dup) fm.time_entries.push(entry);
						}
					});
					merged++;
					continue;
				}

				// Build YAML content
				const tagsYaml =
					task.tags.length > 0 ? `\n  - ${task.tags.join("\n  - ")}` : " []";
				const entriesYaml =
					task.time_entries.length > 0
						? task.time_entries
								.map(
									(e) =>
										`  - id: "${e.id}"\n    date: "${e.date}"\n    hours: ${e.hours}${
											e.comment ? `\n    comment: "${e.comment.replace(/"/g, '\\"')}"` : ""
										}`
								)
								.join("\n")
						: "";

				const uniqueId = `imported-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
				const content =
					`---\n` +
					`id: "${uniqueId}"\n` +
					`title: "${task.title.replace(/"/g, '\\"')}"\n` +
					`status: "${task.status}"\n` +
					`priority: "${task.priority}"\n` +
					`wichtig: ${task.wichtig}\n` +
					`typ: "${task.typ}"\n` +
					`kostenstelle: "${task.kostenstelle}"\n` +
					`tags:${tagsYaml}\n` +
					(task.start_date ? `start_date: "${task.start_date}"\n` : "") +
					(task.due_date ? `due_date: "${task.due_date}"\n` : "") +
					(task.estimated_hours ? `estimated_hours: ${task.estimated_hours}\n` : "") +
					`time_entries:\n${entriesYaml}\n` +
					`---\n\n` +
					`# ${task.title}\n\n` +
					(task.notes ? `${task.notes}\n` : `## Notizen\n- \n`);

				if (existing instanceof TFile) {
					await this.app.vault.modify(existing, content);
				} else {
					await this.app.vault.create(fullPath, content);
				}
				created++;
			}

			this.notifyChange();
			return { created, merged, skipped };
		} finally {
			setTimeout(() => {
				this.isInternalUpdating = false;
			}, 300);
		}
	}
}
