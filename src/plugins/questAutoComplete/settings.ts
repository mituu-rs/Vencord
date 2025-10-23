/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically complete quests when accepted. If disabled, use Vencord Toolbox (top-right) → 'Complete Active Quest'",
        default: false,
        restartNeeded: false
    },
    notifyOnStart: {
        type: OptionType.BOOLEAN,
        description: "Show notification when quest completion starts",
        default: true
    },
    notifyOnProgress: {
        type: OptionType.BOOLEAN,
        description: "Show notification on quest progress updates (for debug purposes, notifies every minute)",
        default: false
    },
    notifyOnComplete: {
        type: OptionType.BOOLEAN,
        description: "Show notification when quest is completed",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable verbose logging for troubleshooting",
        default: false
    }
});

