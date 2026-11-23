// Recovery must work without loading the application bundles or private conversation data.
const messages = {
  en: [
    "Reconnect",
    "Let’s get you reconnected.",
    "Check your connection and make sure Daycrew is running on your computer. Your saved drafts will be here when you return.",
    "Try again",
  ],
  de: [
    "Erneut verbinden",
    "Stellen wir die Verbindung wieder her.",
    "Prüfe deine Verbindung und stelle sicher, dass Daycrew auf deinem Computer läuft. Deine gespeicherten Entwürfe warten hier auf dich.",
    "Erneut versuchen",
  ],
  es: [
    "Reconectar",
    "Vamos a reconectarte.",
    "Revisa tu conexión y asegúrate de que Daycrew esté funcionando en tu computadora. Tus borradores guardados estarán aquí cuando vuelvas.",
    "Reintentar",
  ],
  fr: [
    "Se reconnecter",
    "Rétablissons la connexion.",
    "Vérifiez votre connexion et assurez-vous que Daycrew fonctionne sur votre ordinateur. Vos brouillons enregistrés vous attendront à votre retour.",
    "Réessayer",
  ],
  ja: [
    "再接続",
    "もう一度接続しましょう。",
    "接続を確認し、パソコンで Daycrew が起動していることを確かめてください。保存した下書きは、戻ったときに引き続き使えます。",
    "再試行",
  ],
  ko: [
    "다시 연결",
    "다시 연결해 볼까요?",
    "인터넷 연결을 확인하고 컴퓨터에서 Daycrew가 실행 중인지 확인하세요. 저장한 초안은 돌아오면 그대로 사용할 수 있습니다.",
    "다시 시도",
  ],
  pt: [
    "Reconectar",
    "Vamos restabelecer a conexão.",
    "Verifique sua conexão e se o Daycrew está em execução no computador. Seus rascunhos salvos estarão aqui quando você voltar.",
    "Tentar novamente",
  ],
  ru: [
    "Повторное подключение",
    "Давайте восстановим соединение.",
    "Проверьте подключение и убедитесь, что Daycrew запущен на вашем компьютере. Сохранённые черновики будут ждать вашего возвращения.",
    "Попробовать снова",
  ],
  sv: [
    "Återanslut",
    "Vi hjälper dig att ansluta igen.",
    "Kontrollera anslutningen och att Daycrew körs på datorn. Dina sparade utkast finns kvar när du kommer tillbaka.",
    "Försök igen",
  ],
  zh: [
    "重新连接",
    "让我们重新连接。",
    "请检查网络连接，并确认电脑上的 Daycrew 正在运行。返回后，你仍可继续使用已保存的草稿。",
    "重试",
  ],
};
const locale =
  (navigator.languages ?? [navigator.language])
    .map((language) => language.toLowerCase().split("-")[0])
    .find((language) => Object.hasOwn(messages, language)) ?? "en";
const [title, heading, description, retry] = messages[locale];
document.documentElement.lang = locale === "pt" ? "pt-BR" : locale;
document.title = `${title} · Daycrew`;
for (const [id, value] of [
  ["offline-heading", heading],
  ["offline-description", description],
  ["retry", retry],
]) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}
document.getElementById("retry")?.addEventListener("click", () => location.reload());
window.addEventListener("online", () => location.reload(), { once: true });
