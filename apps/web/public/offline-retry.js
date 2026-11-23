document.getElementById("retry")?.addEventListener("click", () => location.reload());
window.addEventListener("online", () => location.reload(), { once: true });
