import { TimeEntry, TaskStatus, TaskPriority } from "../types";

export interface SPImportOptions {
	targetFolder: string;
	consolidateDuplicates: boolean;
	subtaskStrategy: "merge_into_parent" | "separate_tasks";
	includeArchived: boolean;
	duplicateHandling: "merge_times" | "skip" | "overwrite";
	projectAsType: boolean;
	recognizeCostCenter: boolean;
	recognizeImportant: boolean;
	minHoursFilter: number;
}

export const DEFAULT_IMPORT_OPTIONS: SPImportOptions = {
	targetFolder: "Tasks",
	consolidateDuplicates: true,
	subtaskStrategy: "merge_into_parent",
	includeArchived: true,
	duplicateHandling: "merge_times",
	projectAsType: true,
	recognizeCostCenter: true,
	recognizeImportant: true,
	minHoursFilter: 0,
};

export interface ConvertedTask {
	title: string;
	status: TaskStatus;
	priority: TaskPriority;
	wichtig: boolean;
	typ: string;
	kostenstelle: string;
	tags: string[];
	start_date?: string;
	due_date?: string;
	estimated_hours?: number;
	time_entries: TimeEntry[];
	notes?: string;
	originalId?: string;
}

export interface SPImportPreview {
	totalRawTasks: number;
	totalResultTasks: number;
	tasksWithTime: number;
	totalHours: number;
	earliestDate?: string;
	latestDate?: string;
	projects: string[];
	tags: string[];
	convertedTasks: ConvertedTask[];
}

interface RawSPTask {
	id: string;
	title: string;
	isDone?: boolean;
	notes?: string;
	timeSpentOnDay?: Record<string, number>;
	timeSpent?: number;
	timeEstimate?: number;
	tagIds?: string[];
	projectId?: string;
	created?: number;
	dueDay?: string;
	subTaskIds?: string[];
	parentId?: string | null;
	repeatCfgId?: string | null;
	[key: string]: any;
}

export class SuperProductivityImporter {
	/**
	 * Parses Super Productivity JSON (full backup or task list) and creates converted tasks.
	 */
	public static parse(
		content: string | object,
		options: Partial<SPImportOptions> = {}
	): SPImportPreview {
		const opts: SPImportOptions = { ...DEFAULT_IMPORT_OPTIONS, ...options };

		let data: any;
		if (typeof content === "string") {
			try {
				data = JSON.parse(content);
			} catch (err: any) {
				throw new Error(`Ungültige JSON-Datei: ${err?.message || err}`);
			}
		} else {
			data = content;
		}

		// Unwrap full backup export format: { timestamp, lastUpdate, crossModelVersion, data: { task, project, ... } }
		if (
			data &&
			typeof data === "object" &&
			data.data &&
			typeof data.data === "object" &&
			!data.task &&
			!Array.isArray(data) &&
			!data.tasks &&
			(data.data.task || data.data.project || data.data.taskArchive)
		) {
			data = data.data;
		}

		// 1. Resolve Projects
		const projectMap = new Map<string, string>();
		if (data.project && data.project.entities) {
			for (const [id, p] of Object.entries(data.project.entities as Record<string, any>)) {
				if (p && p.title && id !== "INBOX_PROJECT") {
					projectMap.set(id, String(p.title).trim());
				}
			}
		}

		// 2. Resolve Tags
		const tagMap = new Map<string, string>();
		if (data.tag && data.tag.entities) {
			for (const [id, t] of Object.entries(data.tag.entities as Record<string, any>)) {
				if (t && t.title) {
					tagMap.set(id, String(t.title).trim());
				}
			}
		}

		// 3. Collect all tasks
		const rawTasksMap = new Map<string, RawSPTask>();

		const collectFromTaskState = (taskState: any) => {
			if (!taskState || !taskState.entities) return;
			const ids: string[] = taskState.ids || Object.keys(taskState.entities);
			for (const id of ids) {
				const t = taskState.entities[id];
				if (t && t.id && t.title) {
					rawTasksMap.set(t.id, t);
				}
			}
		};

		// Active tasks
		if (data.task) {
			collectFromTaskState(data.task);
		} else if (Array.isArray(data)) {
			// Direct array of tasks
			for (const t of data) {
				if (t && t.id && t.title) rawTasksMap.set(t.id, t);
			}
		} else if (data.tasks && Array.isArray(data.tasks)) {
			for (const t of data.tasks) {
				if (t && t.id && t.title) rawTasksMap.set(t.id, t);
			}
		}

		// Archived tasks
		if (opts.includeArchived) {
			if (data.taskArchive) collectFromTaskState(data.taskArchive);
			if (data.archiveYoung && data.archiveYoung.task) collectFromTaskState(data.archiveYoung.task);
			if (data.archiveOld && data.archiveOld.task) collectFromTaskState(data.archiveOld.task);
		}

		const totalRawTasks = rawTasksMap.size;
		if (totalRawTasks === 0) {
			throw new Error("Keine Aufgaben in der Super-Productivity-Datei gefunden.");
		}

		// 4. Group subtasks vs parent tasks
		const parentTasks: RawSPTask[] = [];
		const subtasksByParentId = new Map<string, RawSPTask[]>();
		const standaloneSubtasks: RawSPTask[] = [];

		for (const task of rawTasksMap.values()) {
			if (task.parentId) {
				const list = subtasksByParentId.get(task.parentId) || [];
				list.push(task);
				subtasksByParentId.set(task.parentId, list);
			} else {
				parentTasks.push(task);
			}
		}

		// Check if any subtask has missing parent
		for (const [parentId, subList] of subtasksByParentId.entries()) {
			if (!rawTasksMap.has(parentId)) {
				for (const s of subList) standaloneSubtasks.push(s);
			}
		}

		// 5. Convert tasks
		const intermediateList: ConvertedTask[] = [];

		for (const pTask of parentTasks) {
			const subtasks = subtasksByParentId.get(pTask.id) || [];
			const converted = this.convertSingleTask(pTask, subtasks, projectMap, tagMap, opts);
			if (converted) {
				intermediateList.push(converted);
			}

			// If subtask strategy is separate tasks, also convert each subtask
			if (opts.subtaskStrategy === "separate_tasks" && subtasks.length > 0) {
				for (const s of subtasks) {
					const sConverted = this.convertSingleTask(
						{ ...s, title: `${pTask.title} - ${s.title}` },
						[],
						projectMap,
						tagMap,
						opts
					);
					if (sConverted) intermediateList.push(sConverted);
				}
			}
		}

		// Standalone subtasks whose parent was not in the export
		for (const s of standaloneSubtasks) {
			const sConverted = this.convertSingleTask(s, [], projectMap, tagMap, opts);
			if (sConverted) intermediateList.push(sConverted);
		}

		// 6. Consolidate repeating / duplicate tasks if requested
		let finalList: ConvertedTask[] = [];
		if (opts.consolidateDuplicates) {
			finalList = this.consolidateTasks(intermediateList);
		} else {
			finalList = intermediateList;
		}

		// 7. Calculate preview metrics
		let tasksWithTime = 0;
		let totalHours = 0;
		let earliestDate: string | undefined;
		let latestDate: string | undefined;
		const projectSet = new Set<string>();
		const tagSet = new Set<string>();

		for (const t of finalList) {
			if (t.time_entries.length > 0) {
				tasksWithTime++;
				for (const entry of t.time_entries) {
					totalHours += entry.hours || 0;
					if (!earliestDate || entry.date < earliestDate) earliestDate = entry.date;
					if (!latestDate || entry.date > latestDate) latestDate = entry.date;
				}
			}
			if (t.typ && t.typ !== "Allgemein" && t.typ !== "Feature") {
				projectSet.add(t.typ);
			}
			for (const tag of t.tags) {
				tagSet.add(tag);
			}
		}

		return {
			totalRawTasks,
			totalResultTasks: finalList.length,
			tasksWithTime,
			totalHours: Math.round(totalHours * 100) / 100,
			earliestDate,
			latestDate,
			projects: Array.from(projectSet).sort(),
			tags: Array.from(tagSet).sort(),
			convertedTasks: finalList,
		};
	}

	private static convertSingleTask(
		task: RawSPTask,
		subtasks: RawSPTask[],
		projectMap: Map<string, string>,
		tagMap: Map<string, string>,
		opts: SPImportOptions
	): ConvertedTask | null {
		const title = this.sanitizeTaskTitle(task.title);
		if (!title) return null;

		// 1. Time entries from task's timeSpentOnDay
		const timeEntries: TimeEntry[] = [];
		let minDate: string | undefined = task.dueDay || undefined;
		let maxDate: string | undefined = task.dueDay || undefined;

		if (task.timeSpentOnDay && typeof task.timeSpentOnDay === "object") {
			for (const [dateStr, ms] of Object.entries(task.timeSpentOnDay)) {
				if (typeof ms === "number" && ms > 0) {
					const hours = Math.round((ms / 3600000) * 100) / 100;
					if (hours > 0) {
						timeEntries.push({
							id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
							date: dateStr,
							hours,
							comment: "Super-Productivity",
						});
						if (!minDate || dateStr < minDate) minDate = dateStr;
						if (!maxDate || dateStr > maxDate) maxDate = dateStr;
					}
				}
			}
		}

		// 2. Aggregate subtasks if merge_into_parent
		const subtaskNotes: string[] = [];
		if (opts.subtaskStrategy === "merge_into_parent" && subtasks.length > 0) {
			for (const s of subtasks) {
				const checkMark = s.isDone ? "[x]" : "[ ]";
				subtaskNotes.push(`- ${checkMark} ${s.title}`);

				if (s.timeSpentOnDay && typeof s.timeSpentOnDay === "object") {
					for (const [dateStr, ms] of Object.entries(s.timeSpentOnDay)) {
						if (typeof ms === "number" && ms > 0) {
							const hours = Math.round((ms / 3600000) * 100) / 100;
							if (hours > 0) {
								timeEntries.push({
									id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
									date: dateStr,
									hours,
									comment: s.title,
								});
								if (!minDate || dateStr < minDate) minDate = dateStr;
								if (!maxDate || dateStr > maxDate) maxDate = dateStr;
							}
						}
					}
				}
			}
		}

		// 3. Project mapping to typ (user confirmed: "Typ ist gut.")
		let typ = "Feature";
		if (opts.projectAsType && task.projectId && projectMap.has(task.projectId)) {
			typ = projectMap.get(task.projectId)!;
		}

		// 4. Tags and cost center detection
		const tags: string[] = [];
		let kostenstelle = "Allgemein";
		let wichtig = false;

		if (task.tagIds && Array.isArray(task.tagIds)) {
			for (const tagId of task.tagIds) {
				const tagName = tagMap.get(tagId) || tagId;
				const lower = tagName.toLowerCase();

				// Check important
				if (opts.recognizeImportant && (lower === "important" || lower === "em_important" || lower === "dringend")) {
					wichtig = true;
					continue;
				}

				// Check cost center: e.g. "50508700 CCC" or "CCC"
				if (opts.recognizeCostCenter && (lower.includes("ccc") || lower.startsWith("kst") || /^\d{4,}/.test(tagName))) {
					if (lower.includes("ccc")) {
						kostenstelle = "CCC";
					} else {
						kostenstelle = tagName;
					}
				}

				// Add as tag (sanitize tag: replace spaces/slashes with dashes)
				const sanitizedTag = tagName.replace(/[\\/:*?"<>|#]/g, "").trim().replace(/\s+/g, "-");
				if (sanitizedTag && !tags.includes(sanitizedTag)) {
					tags.push(sanitizedTag);
				}
			}
		}

		// If project exists, also add clean project name as tag
		if (task.projectId && projectMap.has(task.projectId)) {
			const pName = projectMap.get(task.projectId)!.replace(/[\\/:*?"<>|#]/g, "").trim().replace(/\s+/g, "-");
			if (pName && !tags.includes(pName)) {
				tags.push(pName);
			}
		}

		// 5. Estimated hours
		let estimated_hours: number | undefined;
		if (task.timeEstimate && task.timeEstimate > 0) {
			estimated_hours = Math.round((task.timeEstimate / 3600000) * 10) / 10;
		}

		// 6. Status
		let status: TaskStatus = "todo";
		if (task.isDone) {
			status = "done";
		} else if (timeEntries.length > 0 || (task.timeSpent && task.timeSpent > 0)) {
			status = "in_progress";
		}

		// 7. Dates
		let startDate = minDate;
		if (!startDate && task.created) {
			startDate = new Date(task.created).toISOString().slice(0, 10);
		}
		let dueDate = maxDate || task.dueDay || undefined;

		// 8. Notes
		let notes = task.notes ? task.notes.trim() : "";
		if (subtaskNotes.length > 0) {
			notes += `\n\n### Teilaufgaben (Super Productivity)\n${subtaskNotes.join("\n")}`;
		}

		return {
			title,
			status,
			priority: wichtig ? "high" : "medium",
			wichtig,
			typ,
			kostenstelle,
			tags,
			start_date: startDate,
			due_date: dueDate,
			estimated_hours,
			time_entries: timeEntries,
			notes: notes.trim() ? notes : undefined,
			originalId: task.id,
		};
	}

	/**
	 * Consolidates repeating tasks (e.g. 16 instances of "CCC Monday Power-Up")
	 * into a single task note with all time entries across the days.
	 */
	private static consolidateTasks(tasks: ConvertedTask[]): ConvertedTask[] {
		const groupMap = new Map<string, ConvertedTask>();

		for (const t of tasks) {
			const key = `${t.title.toLowerCase()}___${t.typ.toLowerCase()}`;
			const existing = groupMap.get(key);

			if (!existing) {
				groupMap.set(key, {
					...t,
					tags: [...t.tags],
					time_entries: [...t.time_entries],
				});
			} else {
				// Merge time entries
				for (const entry of t.time_entries) {
					// Check if entry on same date already exists
					const sameDate = existing.time_entries.find(e => e.date === entry.date);
					if (sameDate) {
						sameDate.hours = Math.round((sameDate.hours + entry.hours) * 100) / 100;
						if (entry.comment && !sameDate.comment?.includes(entry.comment)) {
							sameDate.comment = `${sameDate.comment || ""} / ${entry.comment}`.trim().replace(/^\/\s*/, "");
						}
					} else {
						existing.time_entries.push(entry);
					}
				}

				// Merge tags
				for (const tag of t.tags) {
					if (!existing.tags.includes(tag)) existing.tags.push(tag);
				}

				// Merge wichtig / priority
				if (t.wichtig) {
					existing.wichtig = true;
					existing.priority = "high";
				}

				// Merge cost center
				if (t.kostenstelle && t.kostenstelle !== "Allgemein") {
					existing.kostenstelle = t.kostenstelle;
				}

				// Merge estimated hours
				if (t.estimated_hours && (!existing.estimated_hours || t.estimated_hours > existing.estimated_hours)) {
					existing.estimated_hours = t.estimated_hours;
				}

				// Merge dates (earliest start, latest due)
				if (t.start_date && (!existing.start_date || t.start_date < existing.start_date)) {
					existing.start_date = t.start_date;
				}
				if (t.due_date && (!existing.due_date || t.due_date > existing.due_date)) {
					existing.due_date = t.due_date;
				}

				// Status: if any instance is in_progress or todo, keep it active
				if (t.status === "in_progress" || existing.status === "in_progress") {
					existing.status = "in_progress";
				} else if (t.status === "todo" && existing.status === "done") {
					existing.status = "todo";
				}

				// Merge notes
				if (t.notes && !existing.notes?.includes(t.notes)) {
					existing.notes = existing.notes ? `${existing.notes}\n\n---\n${t.notes}` : t.notes;
				}
			}
		}

		// Sort time_entries inside each task by date descending
		for (const t of groupMap.values()) {
			t.time_entries.sort((a, b) => b.date.localeCompare(a.date));
		}

		return Array.from(groupMap.values());
	}

	private static sanitizeTaskTitle(title: string): string {
		return title
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
	}
}
