/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { Logger } from "@utils/Logger";

import { settings } from "./settings";
import type { Quest, QuestTaskType } from "./types";

export const logger = new Logger("QuestComplete");

/**
 * Find an active, uncompleted quest
 */
export function findActiveQuest(questsMap: Map<string, Quest>): Quest | null {
    const quests = [...questsMap.values()].filter(
        quest =>
            quest.id !== "1412491570820812933" && // Excluded quest ID
            quest.userStatus?.enrolledAt &&
            !quest.userStatus?.completedAt &&
            new Date(quest.config.expiresAt).getTime() > Date.now()
    );

    if (quests.length === 0) return null;

    // Sort by expiration date (earliest first)
    quests.sort((a, b) =>
        new Date(a.config.expiresAt).getTime() - new Date(b.config.expiresAt).getTime()
    );

    return quests[0];
}

/**
 * Determine the task type for a quest
 */
export function getQuestTaskType(quest: Quest): QuestTaskType | null {
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    if (!taskConfig) return null;

    const taskTypes: QuestTaskType[] = [
        "WATCH_VIDEO",
        "PLAY_ON_DESKTOP",
        "STREAM_ON_DESKTOP",
        "PLAY_ACTIVITY",
        "WATCH_VIDEO_ON_MOBILE"
    ];

    return taskTypes.find(type => taskConfig.tasks[type] != null) || null;
}

/**
 * Check if a quest type is enabled in settings
 */
export function isQuestTypeEnabled(taskType: QuestTaskType): boolean {
    const { store } = settings;

    switch (taskType) {
        case "WATCH_VIDEO":
        case "WATCH_VIDEO_ON_MOBILE":
            return store.enableVideoQuests;
        case "PLAY_ON_DESKTOP":
            return store.enableGameQuests;
        case "STREAM_ON_DESKTOP":
            return store.enableStreamQuests;
        case "PLAY_ACTIVITY":
            return store.enableActivityQuests;
        default:
            return false;
    }
}

/**
 * Show a notification if enabled in settings
 */
export function notify(type: "start" | "progress" | "complete", title: string, body: string) {
    const { store } = settings;

    let shouldNotify = false;
    switch (type) {
        case "start":
            shouldNotify = store.notifyOnStart;
            break;
        case "progress":
            shouldNotify = store.notifyOnProgress;
            break;
        case "complete":
            shouldNotify = store.notifyOnComplete;
            break;
    }

    if (!shouldNotify) return;

    showNotification({
        title: `[Quest] ${title}`,
        body,
        noPersist: type === "progress",
        permanent: type === "progress"
    });
}

/**
 * Log with debug mode check
 */
export function debug(...args: any[]) {
    if (settings.store.debugMode) {
        logger.info(...args);
    }
}

/**
 * Check if running in Discord desktop app
 */
export function isDesktopApp(): boolean {
    return typeof (window as any).DiscordNative !== "undefined";
}

/**
 * Calculate quest progress percentage
 */
export function calculateProgress(current: number, total: number): number {
    return Math.round((current / total) * 100);
}

/**
 * Format seconds into human-readable time
 */
export function formatTime(seconds: number): string {
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""}`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
    return `${hours} hour${hours !== 1 ? "s" : ""} ${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`;
}

