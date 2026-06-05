import { useCallback } from "react";
import { useApp } from "../store/app";

const EN: Record<string, string> = {
  // ── Nav groups ──
  "Основное": "General",
  "Приложение": "Application",
  "Агент": "Agent",
  "Сервер": "Server",
  "Другое": "Other",

  // ── Nav items ──
  "Основные": "General",
  "Кастомизация": "Customization",
  "Уведомления": "Notifications",
  "Хоткеи": "Hotkeys",
  "Настройки агента": "Agent Settings",
  "Разрешения": "Permissions",
  "Провайдеры": "Providers",
  "Модели": "Models",
  "О приложении": "About",

  // ── General section ──
  "Основные параметры приложения.": "General application settings.",
  "Язык интерфейса": "Interface Language",
  "Язык отображения интерфейса и ответов агента.": "Language for the interface and agent responses.",

  // ── Customization ──
  "Тема интерфейса и визуальные настройки.": "Interface theme and visual settings.",
  "Тема": "Theme",
  "Цветовая схема интерфейса.": "Interface color scheme.",
  "Тёмная": "Dark",
  "Светлая": "Light",
  "Системная": "System",

  // ── Notifications ──
  "Звуковые и системные уведомления.": "Sound and system notifications.",
  "Звук при завершении": "Completion Sound",
  "Проигрывать звуковой сигнал когда агент завершит выполнение задачи.": "Play a sound when the agent finishes a task.",

  // ── Agent ──
  "Параметры поведения AI-агента.": "AI agent behavior settings.",
  "Компактные ответы": "Compact Responses",
  "Агент отвечает короче и по делу, без развёрнутых пояснений. Экономит токены.": "Agent responds briefly without detailed explanations. Saves tokens.",
  "Показывать размышления": "Show Thinking",
  "Отображать процесс мышления модели (reasoning tokens) приглушённым текстом. Если выключено — просто индикатор «Думаю…».": "Display the model\u2019s thinking process (reasoning tokens) in muted text. When off \u2014 just a \u201cThinking\u2026\u201d indicator.",

  // ── Permissions ──
  "Контроль над тем, что агент может делать без подтверждения.": "Control what the agent can do without confirmation.",
  "Авто-применение изменений": "Auto-apply Changes",
  "Агент записывает файлы и выполняет команды без запроса разрешения. Опасно — включайте только если доверяете модели.": "Agent writes files and runs commands without permission. Dangerous \u2014 enable only if you trust the model.",

  // ── Hotkeys ──
  "Горячие клавиши приложения.": "Application keyboard shortcuts.",
  "Отправить сообщение": "Send message",
  "Перенос строки": "New line",
  "Закрыть настройки / выпадающий список": "Close settings / dropdown",
  "Настраиваемые сочетания появятся в следующих версиях.": "Customizable shortcuts coming in future versions.",

  // ── Providers ──
  "Подключённые провайдеры": "Connected Providers",
  "Выберите провайдера для подключения.": "Choose a provider to connect.",
  "API ключ": "API key",
  "Пользовательский": "Custom",
  "Отключить": "Disconnect",
  "Отмена": "Cancel",
  "Подключить": "Connect",
  "Подключение…": "Connecting\u2026",
  "Название (как показывать)": "Display name",
  "Название в интерфейсе (необязательно)": "Display name (optional)",

  // ── Models ──
  "Доступные для выбора в чате модели.": "Models available for selection in chat.",
  "Подключённые модели": "Connected Models",
  "Добавить": "Add",
  "Моделей нет — нажмите «загрузить модели» у провайдера или добавьте вручную.": "No models \u2014 click \u2018load models\u2019 on a provider or add manually.",
  "Новая модель": "New Model",
  "Добавить модель": "Add Model",
  "Удалить": "Delete",
  "провайдер удалён": "provider removed",

  // ── About ──
  "Версия": "Version",
  "Сессий": "Sessions",
  "Провайдеров": "Providers",
  "Моделей": "Models",
  "Очистить все данные": "Clear All Data",
  "Удалить все сессии, провайдеров, модели и настройки. Это действие необратимо.": "Delete all sessions, providers, models, and settings. This action is irreversible.",
  "Удалить всё": "Delete All",
  "Да, удалить": "Yes, Delete",

  // ── Header ──
  "Настройки": "Settings",
  "Переименовать": "Rename",
  "Экспорт .md": "Export .md",
  "Удалить чат": "Delete Chat",
  "Название чата": "Chat Name",

  // ── Composer ──
  "Спросите что угодно...": "Ask anything...",

  // ── Thinking ──
  "Думаю": "Thinking",
  "Размышления": "Thinking",

  // ── Tool steps ──
  "Чтение": "Read",
  "Список": "List",
  "Структура проекта": "Project Tree",
  "Поиск": "Search",
  "Запись": "Write",
  "Правка": "Edit",
  "Удаление": "Delete",
  "Команда": "Command",
  "Поиск (regex)": "Search (regex)",
  "Применить изменение?": "Apply change?",
  "Отклонить": "Reject",
  "Применить": "Apply",

  // ── File mentions ──
  "Файлы проекта": "Project Files",

  // ── Slash commands ──
  "Очистить чат": "Clear chat",
  "Сжать контекст": "Compact context",
  "Сменить модель": "Switch model",
  "Показать команды": "Show commands",
  "Отменить изменение": "Undo change",

  // ── Reasoning options (Composer) ──
  "Минимум": "Minimal",
  "Низкая": "Low",
  "Средняя": "Medium",
  "Высокая": "High",
};

export function useT(): (text: string) => string {
  const lang = useApp((s) => s.language);
  return useCallback(
    (text: string) => (lang === "en" ? EN[text] ?? text : text),
    [lang],
  );
}
