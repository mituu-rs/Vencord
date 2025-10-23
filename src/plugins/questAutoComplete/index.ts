/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, RestAPI } from "@webpack/common";

import { settings } from "./settings";
import type { Quest, QuestCompletionState } from "./types";
import { calculateProgress, debug, findActiveQuest, formatTime, getQuestTaskType, isDesktopApp, isQuestTypeEnabled, logger, notify } from "./utils";

// Discord stores accessed via webpack
const ApplicationStreamingStore = findByPropsLazy("getStreamerActiveStreamMetadata");
const RunningGameStore = findByPropsLazy("getRunningGames", "getGameForPID");
const QuestsStore = findByPropsLazy("quests", "getQuest");
const ChannelStore = findByPropsLazy("getAllThreadsForParent", "getSortedPrivateChannels");
const GuildChannelStore = findByPropsLazy("getSFWDefaultChannel", "getAllGuilds");

let currentQuestState: QuestCompletionState | null = null;

/**
 * Complete a video quest by spoofing progress
 */
async function completeVideoQuest(state: QuestCompletionState): Promise<void> {
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

/**
 * Complete a desktop game quest by spoofing running game
 */
async function completeGameQuest(state: QuestCompletionState): Promise<void> {
    const { quest, secondsNeeded, secondsDone, applicationId, applicationName, questName } = state;

    if (!isDesktopApp()) {
        const message = "Desktop game quests require the Discord desktop app";
        logger.warn(message);
        showNotification({
            title: "[Quest] Desktop App Required",
            body: `${questName}: ${message}`,
            color: "var(--status-warning)"
        });
        return;
    }

    notify("start", questName, `Starting game quest (${formatTime(secondsNeeded - secondsDone)} remaining)`);

    try {
        const res = await RestAPI.get({
            url: `/applications/public?application_ids=${applicationId}`,
        });

        const appData = res.body[0];
        const exeInfo = appData.executables.find((x: any) => x.os === "win32");

        if (!exeInfo) {
            throw new Error("No Windows executable found for this game");
        }

        const exeName = exeInfo.name.replace(">", "");
        const pid = Math.floor(Math.random() * 30000) + 1000;

        const fakeGame = {
            cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
            exeName,
            exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: applicationId,
            name: appData.name,
            pid: pid,
            pidPath: [pid],
            processName: appData.name,
            start: Date.now(),
        };

        const realGames = RunningGameStore.getRunningGames();
        const fakeGames = [fakeGame];
        const realGetRunningGames = RunningGameStore.getRunningGames;
        const realGetGameForPID = RunningGameStore.getGameForPID;

        RunningGameStore.getRunningGames = () => fakeGames;
        RunningGameStore.getGameForPID = (pid: any) => fakeGames.find(x => x.pid === pid);
        FluxDispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            removed: realGames,
            added: [fakeGame],
            games: fakeGames,
        });

        const cleanup = () => {
            RunningGameStore.getRunningGames = realGetRunningGames;
            RunningGameStore.getGameForPID = realGetGameForPID;
            FluxDispatcher.dispatch({
                type: "RUNNING_GAMES_CHANGE",
                removed: [fakeGame],
                added: [],
                games: [],
            });
            debug("Cleaned up game spoof for:", applicationName);
        };

        const heartbeatHandler = (data: any) => {
            const progress = quest.config.configVersion === 1
                ? data.userStatus.streamProgressSeconds
                : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);

            const percentage = calculateProgress(progress, secondsNeeded);
            debug(`Game quest progress: ${progress}/${secondsNeeded} (${percentage}%)`);

            if (settings.store.notifyOnProgress) {
                notify("progress", questName, `Progress: ${progress}/${secondsNeeded} (${percentage}%)`);
            }

            if (progress >= secondsNeeded) {
                notify("complete", questName, "Quest completed successfully!");
                logger.info("Game quest completed:", questName);
                cleanup();
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
            }
        };

        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);

        state.cleanupFunctions.push(() => {
            cleanup();
            FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", heartbeatHandler);
        });

        logger.info(`Spoofed game to ${applicationName}. Wait for ${formatTime(secondsNeeded - secondsDone)}.`);
    } catch (error) {
        logger.error("Failed to complete game quest:", error);
        const message = error instanceof Error ? error.message : String(error);
        showNotification({
            title: "[Quest] Error",
            body: `Failed to complete ${questName}: ${message}`,
            color: "var(--status-danger)"
        });
        throw error;
    }
}

/**
 * Complete a stream quest by spoofing active stream
 */
async function completeStreamQuest(state: QuestCompletionState): Promise<void> {
    const { quest, secondsNeeded, secondsDone, applicationId, applicationName, questName } = state;

    if (!isDesktopApp()) {
        const message = "Stream quests require the Discord desktop app";
        logger.warn(message);
        showNotification({
            title: "[Quest] Desktop App Required",
            body: `${questName}: ${message}`,
            color: "var(--status-warning)"
        });
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
        showNotification({
            title: "[Quest] Error",
            body: `Failed to complete ${questName}: ${message}`,
            color: "var(--status-danger)"
        });
        throw error;
    }
}

/**
 * Complete an activity quest via heartbeat requests
 */
async function completeActivityQuest(state: QuestCompletionState): Promise<void> {
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

/**
 * Complete a quest based on its type
 */
async function completeQuest(quest: Quest): Promise<void> {
    const taskName = getQuestTaskType(quest);

    if (!taskName) {
        logger.error("Could not determine task type for quest:", quest.id);
        showNotification({
            title: "[Quest] Error",
            body: "Could not determine quest task type",
            color: "var(--status-danger)"
        });
        return;
    }

    if (!isQuestTypeEnabled(taskName)) {
        debug(`Quest type ${taskName} is disabled in settings, skipping`);
        return;
    }

    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const secondsNeeded = taskConfig!.tasks[taskName].target;
    const secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

    const state: QuestCompletionState = {
        quest,
        taskName,
        secondsNeeded,
        secondsDone,
        applicationId: quest.config.application.id,
        applicationName: quest.config.application.name,
        questName: quest.config.messages.questName,
        cleanupFunctions: []
    };

    currentQuestState = state;

    try {
        switch (taskName) {
            case "WATCH_VIDEO":
            case "WATCH_VIDEO_ON_MOBILE":
                await completeVideoQuest(state);
                break;
            case "PLAY_ON_DESKTOP":
                await completeGameQuest(state);
                break;
            case "STREAM_ON_DESKTOP":
                await completeStreamQuest(state);
                break;
            case "PLAY_ACTIVITY":
                await completeActivityQuest(state);
                break;
        }
    } catch (error) {
        logger.error("Quest completion failed:", error);
    } finally {
        currentQuestState = null;
    }
}

/**
 * Attempt to complete an active quest
 */
function tryCompleteActiveQuest(): void {
    try {
        if (!QuestsStore?.quests) {
            debug("QuestsStore not available yet");
            return;
        }

        const quest = findActiveQuest(QuestsStore.quests);

        if (!quest) {
            debug("No active quests found");
            return;
        }

        logger.info("Found active quest:", quest.config.messages.questName);
        completeQuest(quest);
    } catch (error) {
        logger.error("Error while trying to complete quest:", error);
    }
}

/**
 * Clean up any active quest state
 */
function cleanupCurrentQuest(): void {
    if (currentQuestState) {
        logger.info("Cleaning up quest:", currentQuestState.questName);
        currentQuestState.cleanupFunctions.forEach(cleanup => cleanup());
        currentQuestState = null;
    }
}

export default definePlugin({
    name: "QuestCompleter",
    description: "Automatically completes Discord quests. Enable 'Auto Start' in settings or use the Vencord Toolbox button to manually trigger. ⚠️ Use at your own risk - may violate Discord ToS.",
    authors: [Devs.mituu],
    dependencies: ["VencordToolbox"],
    settings,

    toolboxActions: {
        "Complete Active Quest": () => {
            try {
                const quest = findActiveQuest(QuestsStore.quests);
                if (quest) {
                    logger.info("Manually triggered quest completion");
                    completeQuest(quest);
                } else {
                    showNotification({
                        title: "[Quest] No Active Quests",
                        body: "Accept a quest in Discover → Quests first!",
                        color: "var(--status-warning)"
                    });
                }
            } catch (error) {
                logger.error("Failed to complete quest:", error);
                const message = error instanceof Error ? error.message : String(error);
                showNotification({
                    title: "[Quest] Error",
                    body: message,
                    color: "var(--status-danger)"
                });
            }
        }
    },

    flux: {
        // Automatically detect when a quest is accepted or updated
        QUESTS_FETCH_SUCCESS() {
            if (settings.store.autoStart) {
                debug("Quest data updated, checking for active quests...");
                setTimeout(() => tryCompleteActiveQuest(), 1000);
            }
        }
    },

    start() {
        logger.info("Quest Completer started");

        if (settings.store.autoStart) {
            // Delay to ensure all stores are loaded
            setTimeout(() => {
                debug("Auto-start enabled, checking for quests...");
                tryCompleteActiveQuest();
            }, 3000);
        } else {
            logger.info("Auto-start disabled. Use 'Complete Active Quest' from Vencord Toolbox (top-right icon) to manually complete quests.");
        }
    },

    stop() {
        logger.info("Quest Completer stopped");
        cleanupCurrentQuest();
    }
});
