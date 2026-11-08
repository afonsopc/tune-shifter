// Língua: português para pt-*, inglês para o resto.
const LANG = (navigator.language || "en").toLowerCase().startsWith("pt") ? "pt" : "en";
document.documentElement.lang = LANG === "pt" ? "pt-PT" : "en";
for (const el of document.querySelectorAll("[data-pt]")) {
    // Os textos vêm deste ficheiro (sem conteúdo externo), por isso innerHTML é seguro.
    el.innerHTML = el.dataset[LANG];
}

// Chamado pelo ViewController.swift: show('ios') ou show('mac', ligada?, ...).
function show(platform, enabled) {
    document.body.classList.add(`platform-${platform}`);
    if (typeof enabled === "boolean") {
        document.body.classList.toggle("state-on", enabled);
        document.body.classList.toggle("state-off", !enabled);
    }
}

document.querySelector("button.open-preferences").addEventListener("click", () => {
    webkit.messageHandlers.controller.postMessage("open-preferences");
});
