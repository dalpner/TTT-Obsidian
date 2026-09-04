import { TFile } from "obsidian";

export type TaskStatus = "todo" | "in_progress" | "done" | "paused";
export type TaskPriority = "low" | "medium" | "high";

export interface TimeEntry {
	id: string;
	date: string; // YYYY-MM-DD
	hours: number;
	start_time?: string; // HH:mm
	end_time?: string;   // HH:mm
	comment?: string;
}

export interface TaskFrontmatter {
	id?: string;
	title?: string;
	status?: TaskStatus;
	priority?: TaskPriority;
	wichtig?: boolean;
	typ?: string;
	kostenstelle?: string;
	tags?: string[] | string;
	start_date?: string; // YYYY-MM-DD
	due_date?: string;   // YYYY-MM-DD
	estimated_hours?: number;
	time_entries?: TimeEntry[];
	[key: string]: any;
}

export interface TaskItem {
	file: TFile;
	id: string;
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
	total_hours: number;
}

export interface ActiveTimer {
	taskId: string;
	taskTitle: string;
	startTime: number; // Unix timestamp ms
	accumulatedSeconds: number;
	running: boolean;
	comment?: string;
}

export interface PluginSettings {
	tasksFolder: string;
	defaultEstimatedHours: number;
	defaultPriority: TaskPriority;
	costCenters: string[];
	taskTypes: string[];
	activeTimer: ActiveTimer | null;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	tasksFolder: "Tasks",
	defaultEstimatedHours: 4,
	defaultPriority: "medium",
	costCenters: ["KST-1000", "KST-2000", "KST-3000", "KST-4020", "Allgemein"],
	taskTypes: ["Feature", "Bug", "Meeting", "Konzeption", "Wartung", "Dokumentation", "Support"],
	activeTimer: null,
};

export type ViewTab = "cockpit" | "calendar" | "history";
