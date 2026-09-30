import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Apparence choisie par l'utilisateur, gardée par appareil (comme le réglage de macOS). */
export type ThemePreference = "auto" | "light" | "dark";
export const THEME_KEY = "manuspace-theme";
const PREFERENCES: ThemePreference[] = ["auto", "light", "dark"];
const SYSTEM_DARK = "(prefers-color-scheme: dark)";

/** Préférence enregistrée ; « auto » si absente, inconnue ou stockage inaccessible. */
export function readPreference(storage?: Pick<Storage, "getItem">): ThemePreference {
	try {
		// Lu ici, dans le try : l'accès lui-même lève quand les données de site sont bloquées.
		const value = (storage ?? globalThis.localStorage)?.getItem(THEME_KEY);
		return PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : "auto";
	} catch {
		return "auto";
	}
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean) {
	if (preference === "auto") return systemDark ? "dark" : "light";
	return preference;
}

function applyTheme(resolved: "light" | "dark") {
	document.documentElement.classList.toggle("dark", resolved === "dark");
	document.documentElement.style.colorScheme = resolved;
}

/** Préférence partagée par tous les composants (Toaster, réglage de Mon compte). */
const listeners = new Set<() => void>();
let current: ThemePreference | null = null;

function getPreference() {
	current ??= readPreference();
	return current;
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Apparence courante ; suit le système en direct quand la préférence est « auto ». */
export function useTheme() {
	const preference = useSyncExternalStore(subscribe, getPreference);
	const [systemDark, setSystemDark] = useState(() => matchMedia(SYSTEM_DARK).matches);

	useEffect(() => {
		const media = matchMedia(SYSTEM_DARK);
		const onChange = () => setSystemDark(media.matches);
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, []);

	const resolved = resolveTheme(preference, systemDark);
	useEffect(() => applyTheme(resolved), [resolved]);

	const setPreference = useCallback((next: ThemePreference) => {
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			// Stockage indisponible : le choix vaut pour cette visite seulement.
		}
		current = next;
		for (const listener of listeners) listener();
	}, []);

	return { preference, resolved, setPreference };
}
