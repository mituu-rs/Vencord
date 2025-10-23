/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { findByPropsLazy } from "@webpack";
import { RestAPI } from "@webpack/common";

import { settings } from "../settings";
import type { QuestCompletionState } from "../types";
import { calculateProgress, debug, formatTime, logger, notify } from "../utils";

const ChannelStore = findByPropsLazy("getAllThreadsForParent", "getSortedPrivateChannels");
const GuildChannelStore = findByPropsLazy("getSFWDefaultChannel", "getAllGuilds");

/**
 * Complete an activity quest via heartbeat requests
 */
export async function completeActivityQuest(state: QuestCompletionState): Promise<void> {
    const { quest, secondsNeeded, questName } = state;

    notify("start", questName, `Starting activity quest (${formatTime(secondsNeeded)} needed)`);

    try {
        const privateChannels = ChannelStore.getSortedPrivateChannels();
        const guilds = Object.values(GuildChannelStore.getAllGuilds());
        const channelId =
            privateChannels[0]?.id ??
            guilds.find((x: any) => x != null && (x as any).VOCAL && (x as any).VOCAL.length > 0)?.[("VOCAL" as any)][0]?.channel?.id;

        if (!channelId) {
            throw new Error("Could not find a suitable channel for activity quest");
        }

        const streamKey = `call:${channelId}:1`;

        debug("Completing activity quest:", questName);

        while (true) {
            const res = await RestAPI.post({
                url: `/quests/${quest.id}/heartbeat`,
                body: { stream_key: streamKey, terminal: false },
            });

            const progress = res.body.progress.PLAY_ACTIVITY.value;
            const percentage = calculateProgress(progress, secondsNeeded);
            debug(`Activity quest progress: ${progress}/${secondsNeeded} (${percentage}%)`);

            if (settings.store.notifyOnProgress && progress % 60 === 0) {
                notify("progress", questName, `Progress: ${progress}/${secondsNeeded} (${percentage}%)`);
            }

            await new Promise(resolve => setTimeout(resolve, 20 * 1000));

            if (progress >= secondsNeeded) {
                await RestAPI.post({
                    url: `/quests/${quest.id}/heartbeat`,
                    body: { stream_key: streamKey, terminal: true },
                });
                break;
            }
        }

        notify("complete", questName, "Quest completed successfully!");
        logger.info("Activity quest completed:", questName);
    } catch (error) {
        logger.error("Failed to complete activity quest:", error);
        const message = error instanceof Error ? error.message : String(error);
        showNotification({
            title: "[Quest] Error",
            body: `Failed to complete ${questName}: ${message}`,
            color: "var(--status-danger)"
        });
        throw error;
    }
}

