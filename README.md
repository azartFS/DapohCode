# DapohCode

Desktop AI coding assistant (аналог opencode / Claude Code) с собственным GUI.
Подключаешь любой OpenAI-совместимый провайдер (API key + base URL), добавляешь
модели вручную (id модели + название), и общаешься в чате со стримингом ответа.

## Стек
- **Rust + Tauri 2** — бэкенд: стриминг к LLM (SSE), отмена генерации.
- **React 19 + TypeScript + Vite + Tailwind v4 + Zustand** — UI (тёмная тема).
- **Протокол:** OpenAI-совместимый `POST {baseUrl}/chat/completions` со `stream: true`.

## Возможности (фазы 0–1)
- Провайдеры с пресетами (NVIDIA, OpenAI, OpenRouter, Groq, DeepSeek, Mistral,
  xAI, Together, Fireworks, Perplexity, Cerebras, Gemini, Azure, Ollama/LM
  Studio/vLLM локально, Custom). Модели добавляются вручную.
- Чат со стримингом токенов, рендер код-блоков с кнопкой «копировать».
- Системный промпт и temperature.
- Отмена генерации (кнопка «стоп»).
- Настройки сохраняются между запусками (`localStorage`); ключи API хранятся
  локально в конфиге приложения.

## Запуск (dev)
```bash
npm install
npm run tauri dev
```

## Сборка
```bash
npm run tauri build
```

## Дальше (план)
- **Фаза 2:** открыть рабочую папку, дерево файлов, добавление файлов в контекст.
- **Фаза 3:** агент с tool-calling (read/write/edit файлов, grep, выполнение
  команд) с разрешениями и предпросмотром diff.
- **Фаза 4:** сессии/история, счётчик токенов, хоткеи, темы.

> ⚠️ Ключи API сейчас хранятся в `localStorage`. В будущем — перенос в OS keychain.
