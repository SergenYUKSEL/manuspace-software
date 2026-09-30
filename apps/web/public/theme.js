// Applique l'apparence avant le premier rendu (évite un flash clair en mode sombre).
(() => {
	let preference = "auto";
	try {
		preference = localStorage.getItem("manuspace-theme") || "auto";
	} catch {}
	const dark =
		preference === "dark" ||
		(preference !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.classList.toggle("dark", dark);
	document.documentElement.style.colorScheme = dark ? "dark" : "light";
})();
