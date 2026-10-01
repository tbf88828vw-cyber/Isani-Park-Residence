# Isani Park Residence — сайт корпуса E

Статический сайт на трёх языках (/ka/, /en/, /ru/) + одна серверная функция для заявок. Без фреймворков и зависимостей.

## Структура
- `src/i18n/{ka,en,ru}.json` — все тексты сайта
- `src/data/apartments.source.json` — 219 квартир (номер, этаж, комнаты, площади) из поэтажных планов
- `src/data/media.json`, `src/data/logo.json` — сведения о медиа и векторах логотипа (генерируются)
- `public/assets/` — CSS, JS, изображения, видео, планы, логотипы
- `build.mjs` — генератор страниц → `dist/`
- `api/lead.js` — приём заявок (Vercel Function)
- `src/data/floormap.json` — зоны квартир на планах этажей, полосы этажей на фасаде и соответствие квартир 3D-визуализациям (генерирует `tools/floormap.py`)
- `tools/media.py` — подготовка медиа из папки застройщика; `tools/logo.py` — надпись Isani Park Residence и паттерн; `tools/logo_final.py` — утверждённый знак Mono Capitals (вариант R2); `tools/logo_concepts*.py` — все рассмотренные варианты
- `tools/dev-server.mjs`, `tools/qa.mjs`, `tools/qa-picker.mjs`, `tools/test-api.mjs` — локальный сервер и проверки
- `docs/` — таблица фактов, отчёт о проверках, чек-лист запуска; `docs/logo-concepts/` — все рассмотренные варианты логотипа (не публикуются на сайте)

## Команды
```bash
node build.mjs                      # production-сборка в dist/
SITE_URL=https://example.ge node build.mjs   # с canonical/hreflang/sitemap
node build.mjs --preview --out dist-preview  # облегчённая сборка для предпросмотра
node tools/dev-server.mjs           # http://localhost:8787 (dist/)
node tools/test-api.mjs             # тесты серверной функции
node tools/qa.mjs                   # браузерные проверки (нужен Playwright и два dev-сервера, см. файл)
python3 tools/media.py "<папка застройщика>"   # пересобрать медиа (ffmpeg, poppler, Pillow)
python3 tools/floormap.py "<папка застройщика>" # 3D-визуализации квартир и зоны на планах этажей
```

## Как загрузить на GitHub

Папка уже является git-репозиторием с первым коммитом. В ней больше 800 файлов, а веб-интерфейс GitHub принимает не больше 100 файлов за раз, поэтому проще всего через **GitHub Desktop**:

1. Установите GitHub Desktop (desktop.github.com) и войдите в свой аккаунт GitHub.
2. File → **Add Local Repository…** → выберите эту папку → **Add repository**.
3. Нажмите **Publish repository**. Оставьте галочку **Keep this code private** — репозиторий должен быть закрытым.

Через терминал (сначала создайте на github.com пустой приватный репозиторий без README):
```bash
cd isani-park-residence
git remote add origin https://github.com/<аккаунт>/isani-park-residence.git
git push -u origin main
```

Секретов в репозитории нет: токены для заявок задаются только в настройках хостинга (список имён — в `.env.example`). Файлы `.env` в git не попадают.

## Деплой
Vercel: Add New → Project → импортировать репозиторий; сборка и выходная папка берутся из `vercel.json`, менять ничего не нужно. Переменные окружения — в `.env.example` и `docs/LAUNCH-CHECKLIST.md`. Перед публикацией пройдите чек-лист запуска.
