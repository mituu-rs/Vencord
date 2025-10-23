/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";
import { findByPropsLazy } from "@webpack";

import { completeActivityQuest, completeGameQuest, completeStreamQuest, completeVideoQuest } from "./completers";
import { settings } from "./settings";
import type { Quest, QuestCompletionState } from "./types";
import { debug, findActiveQuest, getQuestTaskType, logger, notify } from "./utils";

// Discord stores accessed via webpack
const QuestsStore = findByPropsLazy("quests", "getQuest");

let currentQuestState: QuestCompletionState | null = null;

/**
 * Complete a quest based on its type
 */
async function completeQuest(quest: Quest): Promise<void> {
    const taskName = getQuestTaskType(quest);

    if (!taskName) {
        logger.error("Could not determine task type for quest:", quest.id);
        notify("error", "Error", "Could not determine quest task type");
        return;
    }

    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;

    if (!taskConfig) {
        logger.error("Task config is missing for quest:", quest.id);
        notify("error", "Error", "Quest configuration is invalid");
        return;
    }

    const secondsNeeded = taskConfig.tasks[taskName].target;
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

        debug(`currentQuestState?.quest.id: ${currentQuestState?.quest.id}, quest.id: ${quest.id}`);
        // Don't start if already completing this quest
        if (currentQuestState?.quest.id === quest.id) {
            debug("Quest already in progress, skipping");
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
    description: "Automatically completes Discord quests. You can disable 'Auto Start' in settings to manually trigger with the Vencord Toolbox button.",
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
                    notify("warning", "No Active Quests", "Accept a quest in Discover → Quests first!");
                }
            } catch (error) {
                logger.error("Failed to complete quest:", error);
                const message = error instanceof Error ? error.message : String(error);
                notify("error", "Error", message);
            }
        }
    },

    flux: {
        QUESTS_FETCH_CURRENT_QUESTS_SUCCESS() {
            if (settings.store.autoStart) {
                debug("Quests loaded - checking for active quests...");
                setTimeout(() => tryCompleteActiveQuest(), 1000);
            }
        },
        QUESTS_ENROLL_SUCCESS() {
            if (settings.store.autoStart) {
                debug("Quest enrolled - starting auto-complete...");
                setTimeout(() => tryCompleteActiveQuest(), 500);
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
