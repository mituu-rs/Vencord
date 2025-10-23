/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { RestAPI } from "@webpack/common";

import type { QuestCompletionState } from "../types";
import { calculateProgress, debug, formatTime, logger, notify } from "../utils";

/**
 * Complete a video quest by spoofing progress
 */
export async function completeVideoQuest(state: QuestCompletionState): Promise<void> {
    const { quest, secondsNeeded, questName } = state;
    let { secondsDone } = state;

    const maxFuture = 10;
    const speed = 7;
    const interval = 1;
    const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
    let completed = false;

    notify("start", questName, `Starting video quest (${formatTime(secondsNeeded - secondsDone)} remaining)`);
    debug("Spoofing video progress for quest:", questName);

    try {
        while (true) {
            const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
            const diff = maxAllowed - secondsDone;
            const timestamp = secondsDone + speed;

            if (diff >= speed) {
                const res = await RestAPI.post({
                    url: `/quests/${quest.id}/video-progress`,
                    body: {
                        timestamp: Math.min(secondsNeeded, timestamp + Math.random()),
                    },
                });
                completed = res.body.completed_at != null;
                secondsDone = Math.min(secondsNeeded, timestamp);

                const progress = calculateProgress(secondsDone, secondsNeeded);
                debug(`Video quest progress: ${secondsDone}/${secondsNeeded} (${progress}%)`);
            }

            if (timestamp >= secondsNeeded) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, interval * 1000));
        }

        if (!completed) {
            await RestAPI.post({
                url: `/quests/${quest.id}/video-progress`,
                body: { timestamp: secondsNeeded },
            });
        }

        notify("complete", questName, "Quest completed successfully!");
        logger.info("Video quest completed:", questName);
    } catch (error) {
        logger.error("Failed to complete video quest:", error);
        const message = error instanceof Error ? error.message : String(error);
        showNotification({
            title: "[Quest] Error",
            body: `Failed to complete ${questName}: ${message}`,
            color: "var(--status-danger)"
        });
        throw error;
    }
}

