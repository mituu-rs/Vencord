/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { settings } from "../settings";
import type { QuestCompletionState } from "../types";
import { calculateProgress, debug, formatTime, isDesktopApp, logger, notify } from "../utils";

const ApplicationStreamingStore = findByPropsLazy("getStreamerActiveStreamMetadata");

/**
 * Complete a stream quest by spoofing active stream
 */
export async function completeStreamQuest(state: QuestCompletionState): Promise<void> {
    const { quest, secondsNeeded, secondsDone, applicationId, applicationName, questName } = state;

    if (!isDesktopApp()) {
        const message = "Stream quests require the Discord desktop app";
        logger.warn(message);
        notify("warning", "Desktop App Required", `${questName}: ${message}`);
        return;
    }

    notify("start", questName, `Starting stream quest (${formatTime(secondsNeeded - secondsDone)} remaining). Start streaming in a VC!`);

    try {
        const pid = Math.floor(Math.random() * 30000) + 1000;
        const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;

        ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
            id: applicationId,
            pid,
            sourceName: null,
        });

        const cleanup = () => {
            ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
            debug("Cleaned up stream spoof for:", applicationName);
        };

        const heartbeatHandler = (data: any) => {
            const progress = quest.config.configVersion === 1
                ? data.userStatus.streamProgressSeconds
                : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);

            const percentage = calculateProgress(progress, secondsNeeded);
            debug(`Stream quest progress: ${progress}/${secondsNeeded} (${percentage}%)`);

            if (settings.store.notifyOnProgress) {
                notify("progress", questName, `Progress: ${progress}/${secondsNeeded} (${percentage}%)`);
            }

            if (progress >= secondsNeeded) {
                notify("complete", questName, "Quest completed successfully!");
                logger.info("Stream quest completed:", questName);
                cleanup();
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
            }
        };

        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);

        state.cleanupFunctions.push(() => {
            cleanup();
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
        });

        logger.info(`Spoofed stream to ${applicationName}. Stream in VC for ${formatTime(secondsNeeded - secondsDone)}.`);
        logger.info("Remember: You need at least 1 other person in the VC!");
    } catch (error) {
        logger.error("Failed to complete stream quest:", error);
        const message = error instanceof Error ? error.message : String(error);
        notify("error", "Error", `Failed to complete ${questName}: ${message}`);
        throw error;
    }
}

