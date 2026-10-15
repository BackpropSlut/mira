# Mira: бот и бэкенд диалога

Telegram-бот Mira и ядро диалога, которое потом же обслужит веб-чат `/chat` (он же Telegram Mini App).
Без зависимостей: только Node 22.

```bash
cd bot
cp .env.example .env   # заполнить
npm test               # тесты, без сети
npm run chat           # поговорить с Mira в терминале (по умолчанию заглушка)
npm start              # запустить Telegram-бота
```

## Как устроено

```
Telegram ──► telegram.js ─┐
/chat    ──► http.js ─────┴─► mira.js ─┬─► crisis.js: острый риск ──► заготовленный ответ (112, МЧС), модель не зовём
                                       └─► llm/ (stub | gigachat | openai) ──► ответ; [[HELP]] или отказ фильтра ──► + контакты помощи
```

- `src/prompt.js`: системный промпт Mira (КПТ, тон, границы, безопасность). Один для всех каналов и моделей.
- `src/texts.js`: всё, что бот говорит сам: приветствие, согласие, кризисный ответ, номера. Вычитывает команда.
- `src/crisis.js`: кризисный фильтр. Явная угроза (мысли о смерти, самоповреждение, насилие): модель не вызывается, сразу номера. Сильный дистресс (паника, «мне очень плохо»): модель отвечает сама и получает подсказку оценить риск.
- Карточка помощи включается только при реальной угрозе (`risk: acute`): по фразе-триггеру или когда модель по смыслу разговора ставит метку `[[HELP]]`. Грусть и стресс её не включают. Номера модель не пишет никогда: она может их перепутать.
- `src/sessions.js`: текущий разговор в памяти. Telegram ID хэшируется с солью.
- `src/store.js`: SQLite-файл (`DB_PATH`) на нашем сервере в РФ: согласие, тариф, коды тестеров, история премиума. Переписку бесплатного тарифа на диск не пишем.
- Тарифы и лимиты: [API.md §6](API.md). Кризис не лимитируется никогда.

## Коды для тестировщиков

```bash
npm run codes -- issue 20 30 "пилот"   # 20 кодов на 30 дней премиума
npm run codes -- list                    # кто активировал
npm run codes -- revoke MIRA-TEST-ABC123 # отозвать, премиум по коду заканчивается
```
Человек вводит код в боте (`/code MIRA-TEST-ABC123`) или в меню /chat. В Docker: `docker exec mira-bot node src/codes.js issue 20 30`.

## Смена модели

Одна строка в `.env`:

| Что | `LLM_PROVIDER` | `LLM_MODEL` |
|---|---|---|
| Заглушка, без сети | `stub` | любое |
| GigaChat Lite | `gigachat` | `GigaChat-2` |
| GigaChat Pro / Max | `gigachat` | `GigaChat-2-Pro` / `GigaChat-2-Max` |
| OpenAI-совместимый API (YandexGPT, Qwen и др.) | `openai` | имя модели у провайдера, плюс `OPENAI_BASE_URL` |

## GigaChat: как получить ключ

1. Зайти на [developers.sber.ru](https://developers.sber.ru/studio/workspaces) через Сбер ID, создать проект GigaChat API (тариф Freemium для физлиц).
2. В настройках проекта нажать «Получить ключ» и скопировать **ключ авторизации** (длинная строка base64) в `GIGACHAT_AUTH_KEY`. Он показывается один раз.
3. Скачать корневой сертификат НУЦ Минцифры и указать путь в `NODE_EXTRA_CA_CERTS`, иначе будет ошибка TLS:
   ```bash
   mkdir -p certs && curl -o certs/russian_trusted_root_ca.pem https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
   ```
   В Docker-образе это уже сделано.

## Где запускать

Бот работает через long polling: ему не нужен домен, HTTPS и открытые порты, только исходящий интернет. Подойдёт любой VPS в РФ с Docker:

```bash
docker build -t mira-bot bot
docker run -d --restart=unless-stopped --env-file bot/.env -v mira-data:/app/data -p 8080:8080 --name mira-bot mira-bot
```

## Mini App и веб-чат

В том же процессе работает HTTP API для страницы `/chat` (порт `PORT`, по умолчанию 8080). Контракт: [API.md](API.md). Вход из Telegram проверяется по подписи `initData`, вход с сайта получает анонимный токен. Память общая: согласие и разговор из бота видны в Mini App.

Чтобы бот показывал кнопку Mini App, задай `WEBAPP_URL` (адрес страницы `/chat`, только https): бот поставит её в меню и покажет после согласия.

Для API серверу уже нужен домен с HTTPS (например `api.mira-calm.ru` через Caddy или nginx перед контейнером): браузер не пустит страницу с https на http.
