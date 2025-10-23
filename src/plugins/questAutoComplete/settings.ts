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
        description: "Show notification on quest progress updates",
        default: false
    },
    notifyOnComplete: {
        type: OptionType.BOOLEAN,
        description: "Show notification when quest is completed",
        default: true
    },
    enableVideoQuests: {
        type: OptionType.BOOLEAN,
        description: "Auto-complete video quests",
        default: true
    },
    enableGameQuests: {
        type: OptionType.BOOLEAN,
        description: "Auto-complete desktop game quests",
        default: true
    },
    enableStreamQuests: {
        type: OptionType.BOOLEAN,
        description: "Auto-complete stream quests",
        default: true
    },
    enableActivityQuests: {
        type: OptionType.BOOLEAN,
        description: "Auto-complete activity quests",
        default: true
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description: "Enable verbose logging for troubleshooting",
        default: false
    }
});

