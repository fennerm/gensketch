/**
 * Svelte store which contains the user's configuration.
 */
import { writable } from "svelte/store";

import type { UserConfig } from "@lib/bindings";
import { getUserConfig, listenForUserConfigUpdated } from "@lib/backend";

export const USER_CONFIG_STORE = writable<UserConfig | null>(null);

getUserConfig().then((config) => USER_CONFIG_STORE.set(config));

listenForUserConfigUpdated((event) => USER_CONFIG_STORE.set(event.payload));
