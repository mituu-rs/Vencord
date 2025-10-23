/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, RestAPI } from "@webpack/common";

import { settings } from "../settings";
import type { QuestCompletionState } from "../types";
import { calculateProgress, debug, formatTime, isDesktopApp, logger, notify } from "../utils";

const RunningGameStore = findByPropsLazy("getRunningGames", "getGameForPID");

/**
 * Complete a desktop game quest by spoofing running game
 */
export async function completeGameQuest(state: QuestCompletionState): Promise<void> {
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

