/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface QuestTaskConfig {
    tasks: Record<string, { target: number; }>;
}

export interface QuestConfig {
    application: {
        id: string;
        name: string;
    };
    messages: {
        questName: string;
    };
    expiresAt: string;
    taskConfig?: QuestTaskConfig;
    taskConfigV2?: QuestTaskConfig;
    configVersion?: number;
}

export interface QuestUserStatus {
    enrolledAt: string;
    completedAt?: string;
    progress?: Record<string, { value: number; }>;
    streamProgressSeconds?: number;
}

export interface Quest {
    id: string;
    config: QuestConfig;
    userStatus: QuestUserStatus;
}

export type QuestTaskType =
    | "WATCH_VIDEO"
    | "PLAY_ON_DESKTOP"
    | "STREAM_ON_DESKTOP"
    | "PLAY_ACTIVITY"
    | "WATCH_VIDEO_ON_MOBILE";

export interface QuestCompletionState {
    quest: Quest;
    taskName: QuestTaskType;
    secondsNeeded: number;
    secondsDone: number;
    applicationId: string;
    applicationName: string;
    questName: string;
    cleanupFunctions: Array<() => void>;
}

