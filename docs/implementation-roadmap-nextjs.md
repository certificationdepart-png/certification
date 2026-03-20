# Дорожня карта реалізації Next.js-платформи (multi-school)

## 1) Цілі та принципи реалізації

### Бізнес-цілі
- Перенести поточну логіку з Google Apps Script + Google Sheets у керований Next.js застосунок.
- Підтримати мультишкільну модель з ізоляцією даних (`school_id`) та окремими Telegram-ботами.
- Зберегти звичний формат роботи менеджерів через синхронізацію заявок у Google Spreadsheet кожної школи.
- Побудувати масштабовану платформу для додавання нових шкіл, курсів, шаблонів повідомлень і статусних процесів.

### Технічні принципи
- Єдине джерело правди: **БД (PostgreSQL + Prisma)**.
- Інтеграції працюють через модулі/сервіси з повторними спробами та журналюванням помилок.
- Всі операції, критичні до дублювання (Telegram update/message, sync), мають ідемпотентність.
- Адмін-панель і API розвиваються паралельно: кожна функція в UI має підтриманий backend contract.
- Продукт деплоїться на **Vercel**, з підготовленим **Vercel template / Deploy Button**, щоб клієнт міг розгорнути інстанс платформи у свій Vercel-акаунт в один клік.
- **Кожен клієнт має власну БД** (окремий інстанс, напр. Supabase), яку він підключає як `DATABASE_URL` зі свого Vercel-проєкту.

---

## 2) Загальний план етапів

1. **Stage 0 — Discovery та технічне проєктування**
2. **Stage 1 — Foundation: репозиторій, інфраструктура, база, auth**
3. **Stage 2 — Multi-school core та довідники (школи/курси/шаблони)**
4. **Stage 3 — Telegram webhook engine і state machine (питання 1–11)**
5. **Stage 4 — Заявки в адмін-панелі: Table/Kanban + менеджерська обробка**
6. **Stage 5 — Інтеграції: Nova Poshta + Google Sheets 1:1 sync**
7. **Stage 6 — Надійність, безпека, обсервабіліті, QA**
8. **Stage 7 — Go-live, міграція шкіл, гіперкер**

---

## 3) Деталізований roadmap по етапах

## Stage 0 — Discovery та технічне проєктування

### Ціль
Сформувати однозначний технічний baseline, щоб команда розробляла без двозначностей у домені, даних та інтеграціях.

### Основні задачі
- Зафіксувати domain glossary: школа, курс, заявка, статус, шаблон, сесія діалогу, sync job.
- Підготувати детальну ERD та data contracts:
  - `schools`, `courses`, `applications`, `application_screenshots`, `application_courses`,
  - `message_templates`, `user_sessions`, `sync_jobs`, `sync_errors`, `telegram_updates_log`.
- Описати state machine діалогу Telegram (кроки 1–11, переходи, валідації, edge-cases).
- Узгодити матрицю статусів заявки і переходів для менеджера.
- Погодити інтеграційні контракти:
  - Telegram webhook/update/outgoing message;
  - Nova Poshta city/branch lookup;
  - Google Sheets row mapping (`external_row_id` policy).

### Артефакти
- `Architecture Decision Records` (мін. 5: ORM, auth, sync strategy, idempotency, retry policy).
- ERD + sequence diagrams (webhook flow, sync flow, manager confirmation flow).
- Backlog з оцінкою по епіках/сторі.

### Критерії готовності (Exit Criteria)
- Погоджені всі таблиці й ключові індекси.
- Погоджені сценарії помилок і retry.
- Погоджена стратегія деплою середовищ (dev/stage/prod).

---

## Stage 1 — Foundation: репозиторій, інфраструктура (Vercel + Supabase), база, auth

### Ціль
Підняти production-ready каркас застосунку з базовою безпекою, авторизацією, CI та базовою інтеграцією з Vercel і Supabase (як референс-БД).

### Основні задачі
- Ініціалізувати Next.js 14+ (App Router), Bun, TypeScript, Tailwind, shadcn/ui.
- Налаштувати Prisma + PostgreSQL (Supabase як референс-провайдер):
  - міграції;
  - seed-механізм;
  - базові індекси (`school_id`, `status`, `created_at`, `telegram_user_id`).
- Впровадити `better-auth` (email/password), базові ролі (наразі `user`), сесії, protected routes.
- Створити конфігурацію env/secrets та валідацію на старті.
- Підготувати базову конфігурацію деплою на Vercel:
  - `vercel.json`/налаштування build & output;
  - змінні середовища (ключі ботів, Nova Poshta, Google service account, `DATABASE_URL` для Supabase/аналогічної БД).
- Налаштувати CI:
  - lint;
  - typecheck;
  - тести;
  - prisma migration check.
- Підготувати observability baseline:
  - structured logging;
  - error tracking hooks;
  - health-check endpoint.

### Артефакти
- Базова структура monolith-проєкту з модулями: `api`, `services`, `db`, `ui`, `lib`.
- Перші міграції та `seed` даних для demo-школи.
- Документація запуску локально та в stage.
- Первинний Vercel-проєкт (owner-інстанс) з підключеною Supabase-БД (або еквівалентом) і робочим деплоєм.

### Критерії готовності (Exit Criteria)
- Розробник піднімає проєкт однією інструкцією.
- Є робочий login/logout і guard адмін-секції.
- CI блокує merge при lint/type/test failure.
- Є мінімум один стабільний деплой на Vercel (stage/production-like).

---

## Stage 1.5 — Vercel template & one-click deploy для клієнтів

### Ціль
Надати школам можливість самостійно розгорнути інстанс платформи у власному Vercel-акаунті через один клік (Deploy Button / Template) **з власною БД (Supabase)**.

### Основні задачі
- Підготувати Vercel Template репозиторій/конфігурацію:
  - мінімальний набір обов’язкових env (Telegram, Nova Poshta, Google Sheets, auth secrets, database);
  - опис у README, які значення потрібні та де їх взяти;
  - дефолтні значення/placeholder-и для не-критичних змінних.
- Додати **Vercel Deploy Button** у README:
  - сценарій: клієнт тисне кнопку → форкається/копіюється template → Vercel просить заповнити env → деплой.
- Продумати базову модель БД для шаблону:
  - кожен клієнт підключає власну Supabase (або іншу Postgres-сумісну) БД через `DATABASE_URL`;
  - Prisma schema однакова для всіх, міграції запускаються в контексті БД клієнта.
- Додати initial onboarding flow після деплою:
  - кроки в адмінці для створення першої школи, курсів, ключів інтеграцій;
  - чекліст того, що потрібно налаштувати, щоб бот запрацював.

### Артефакти
- Vercel Template, доступний через Deploy Button.
- Оновлений README з інструкцією self-host деплою для школи.

### Критерії готовності (Exit Criteria)
- Нова школа/клієнт може виконати 1-click деплой через Vercel і дійти до робочої адмін-панелі без втручання розробника (за умови наявності всіх ключів).

---

## Stage 2 — Multi-school core та довідники (школи/курси/шаблони)

### Ціль
Реалізувати домен мультишкільності та керування конфігураціями, які потрібні Telegram flow.

### Основні задачі
- CRUD для `schools`:
  - slug, school_key;
  - telegram chat ID;
  - bot token;
  - Nova Poshta API key;
  - Google Sheet ID/URL.
- CRUD для `courses` (пер-школа):
  - `certificate_type`, `days_to_send`, `review_link`, `requirements_text`.
- CRUD для `message_templates`:
  - коди шаблонів для всіх етапів діалогу;
  - дефолтне заповнення з `docs/work-scope.md`.
- Ізоляція доступу по `school_id` у всіх запитах.
- Валідації й обмеження:
  - унікальність slug/school_key;
  - унікальність `template code` в межах школи;
  - перевірка обов’язкових інтеграційних реквізитів.

### Артефакти
- Сторінки адмін-панелі: Schools, Courses, Message Templates.
- API контракти й серверні сервіси для довідників.
- Seed/initializer для стартового набору шаблонів.

### Критерії готовності (Exit Criteria)
- Можна повністю налаштувати нову школу без редагування коду.
- Для школи можна створити курси та шаблони, які одразу читаються сервісним шаром.

---

## Stage 3 — Telegram webhook engine і state machine (питання 1–11)

### Ціль
Запустити стабільний бот-движок для кількох ботів через єдиний webhook.

### Основні задачі
- Реалізувати `/api/telegram/webhook`:
  - маршрутизація апдейта до школи через bot-token контекст;
  - валідація payload;
  - журнал вхідних апдейтів.
- Ідемпотентність:
  - облік `update_id` + bot scope;
  - safe return при повторній доставці.
- State machine:
  - керування `user_sessions`;
  - проходження кроків 1–11;
  - підтримка multi-course в межах однієї взаємодії.
- Збереження даних:
  - `applications` (+ `application_courses`);
  - `application_screenshots` тільки через Telegram `file_id`.
- Надсилання повідомлень:
  - користувачу (підтвердження, інформування);
  - в чат школи (`telegram_chat_id`) з payload заявки.
- Retry/backoff для тимчасових помилок зовнішніх сервісів.

### Артефакти
- Production webhook flow для мінімум 2 шкіл (2 боти) у stage.
- Інтеграційні тести сценаріїв:
  - happy path;
  - skipped review;
  - physical certificate (UA/abroad);
  - duplicate update replay.

### Критерії готовності (Exit Criteria)
- Кроки 1–11 працюють end-to-end.
- Немає дублювання заявок при retry Telegram.
- Повідомлення в school chat стабільно відправляються після створення заявки.

---

## Stage 4 — Заявки в адмін-панелі: Table/Kanban + менеджерська обробка

### Ціль
Дати менеджерам повний операційний інтерфейс для роботи із заявками.

### Основні задачі
- Реалізувати сторінку `Applications`:
  - Table view (DiceUI Data Table): пошук, фільтри, сортування, пагінація;
  - Kanban view (DiceUI Kanban): колонки за статусами, drag/drop статусів.
- Детальна картка заявки:
  - всі поля заявки;
  - скріни (`file_id`-посилання через Telegram API);
  - історія статусів/змін.
- Операції менеджера:
  - `approved` + `managerCheckedAt` (підтвердження менеджера);
  - зміна статусу;
  - масові дії (опційно).
- Автонотифікації при підтвердженні:
  - `after_confirmation`;
  - `nova_poshta_warning`.

### Артефакти
- Стабільний UX для обробки заявок у двох представленнях.
- API для операцій зі статусами й підтвердженням.
- Аудит-лог змін менеджера.

### Критерії готовності (Exit Criteria)
- Менеджер закриває повний цикл заявки з адмін-панелі без сторонніх інструментів.
- Після підтвердження автоматично йдуть потрібні Telegram-повідомлення за шаблоном.

---

## Stage 5 — Інтеграції: Nova Poshta + Google Sheets 1:1 sync

### Ціль
Впровадити двосторонню операційну сумісність із зовнішніми системами.

### Основні задачі
- Nova Poshta wrapper:
  - пошук міста/відділення;
  - нормалізація й кешування відповідей;
  - обробка rate-limit/error сценаріїв.
- Google Sheets sync engine:
  - upsert заявки у відповідний шкільний sheet;
  - стабільний зв’язок `application_id <-> external_row_id`;
  - черга sync jobs, retry, dead-letter/error log.
- Політика 1:1 синхронізації:
  - зміни з БД -> таблиця;
  - (за погодженням) зміни з таблиці -> БД через controlled importer/webhook/poller.
- Адмін-інструменти:
  - перегляд статусу синхронізації;
  - ручний retry;
  - re-sync вибраної заявки/школи.

### Артефакти
- Сервіс інтеграції з Nova Poshta.
- Сервіс синхронізації з Google Sheets і сторінка моніторингу sync.
- E2E тести мапінгу полів заявки в лист «Заявки».

### Критерії готовності (Exit Criteria)
- Нова заявка гарантовано відображається в Google Sheets школи.
- Зміни статусів/полів у БД відображаються в рядку таблиці без ручного втручання.
- Збої синку не гублять дані, а переходять у retry/лог.

---

## Stage 6 — Надійність, безпека, обсервабіліті, QA

### Ціль
Підготувати систему до стабільної експлуатації під навантаженням.

### Основні задачі
- Security hardening:
  - шифрування чутливих ключів (bot tokens, API keys);
  - RBAC/policy checks;
  - rate limits для публічних API.
- Надійність:
  - транзакційність критичних операцій;
  - outbox/inbox patterns (за потреби);
  - захист від race conditions у session/update processing.
- Observability:
  - дашборди (webhook latency, sync queue depth, error rate);
  - алерти на деградацію.
- QA:
  - інтеграційні й e2e сценарії;
  - regression pack на бот-діалог;
  - UAT з 1-2 пілотними школами.

### Артефакти
- Non-functional test report.
- Security checklist + remediation log.
- Runbook для підтримки інцидентів.

### Критерії готовності (Exit Criteria)
- SLA/SLO метрики досягнуті на stage.
- Відсутні blocker/critical дефекти перед релізом.

---

## Stage 7 — Go-live, міграція шкіл, гіперкер

### Ціль
Безпечно вивести платформу в production та перевести школи зі старого контуру.

### Основні задачі
- Підготувати cutover plan:
  - черговість підключення шкіл;
  - вікна змін;
  - rollback сценарій.
- Провести міграцію конфігурацій:
  - курси;
  - шаблони;
  - ключі інтеграцій;
  - Google sheet bindings.
- Запустити pilot (1 школа), далі waves rollout.
- Організувати hypercare 2-4 тижні:
  - швидке реагування на інциденти;
  - щоденний sync health review;
  - збір покращень у backlog.

### Артефакти
- Production deployment checklist.
- Міграційний лог по школах.
- Post-launch report (результати, проблеми, next improvements).

### Критерії готовності (Exit Criteria)
- Усі заплановані школи переведені на нову платформу.
- Критичні процеси (бот, заявки, синк, менеджерські статуси) стабільні.

---

## 4) Орієнтовний таймлайн (за умови 1 core-команди)

- **Sprint 1-2**: Stage 0-1
- **Sprint 3-4**: Stage 2
- **Sprint 5-7**: Stage 3
- **Sprint 8-9**: Stage 4
- **Sprint 10-11**: Stage 5
- **Sprint 12**: Stage 6
- **Sprint 13**: Stage 7 + hypercare старт

> Примітка: терміни залежать від глибини 2-way sync з Google Sheets та кількості одночасно онбордованих шкіл.

---

## 5) Залежності та ризики

### Критичні залежності
- Наявність валідних доступів: Telegram bots, Nova Poshta API, Google service account.
- Фіналізовані тексти шаблонів для всіх кроків діалогу.
- Визначені правила редагування даних у Google Sheets (чи дозволено зворотнє редагування).

### Основні ризики
- **R1: Дублювання подій Telegram** -> пом’якшення: strict idempotency ключі + update log.
- **R2: Розсинхронізація БД/Sheets** -> пом’якшення: queue, retries, reconciler job, row mapping.
- **R3: Нестабільність зовнішніх API** -> пом’якшення: backoff, circuit-like fallback, alerting.
- **R4: Помилки даних при міграції шкіл** -> пом’якшення: pilot wave, dry-run scripts, rollback plan.

---

## 6) KPI успіху впровадження

- `>= 99%` webhook updates обробляються без ручного втручання.
- `>= 99%` sync jobs завершуються успішно в межах SLA.
- `< 1%` дубльованих/конфліктних заявок.
- Час обробки менеджером однієї заявки знижується (цільовий benchmark визначити на Stage 0).
- Час онбордингу нової школи: від 1-2 днів після передачі доступів і шаблонів.

---

## 7) Definition of Done (рівень програми)

Ініціатива вважається завершеною, коли:
- Усі обов’язкові фічі з `docs/work-scope-nextjs.md` реалізовані та прийняті в UAT.
- Працює мультишкільний режим з ізоляцією даних і окремими ботами.
- Заявки створюються через Telegram flow 1–11, відображаються в адмінці та синхронізуються в Google Sheets.
- Менеджерські підтвердження запускають правильні шаблонні нотифікації в Telegram.
- Є технічна документація, runbook, і процес підтримки після релізу.

---

## 8) Чекліст для клієнта (Vercel + Supabase one-click deploy)

**Що потрібно від школи перед деплоєм:**
- **Vercel акаунт** (Free/Pro).
- **Supabase проєкт** (Postgres) + доступ до `DATABASE_URL`.
- **Telegram бот** (BotFather): `BOT_TOKEN`, `bot_username`.
- **Nova Poshta API key** (якщо використовується доставка по Україні).
- **Google акаунт** з доступом до шкільної Google Spreadsheet для заявок.

**Кроки деплою:**
1. Перейти за кнопкою **"Deploy to Vercel"** у README.
2. Авторизуватися у Vercel і обрати/створити організацію/проект.
3. На екрані налаштування змінних середовища заповнити:
   - `DATABASE_URL` — рядок підключення до Supabase;
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`;
   - `NOVA_POSHTA_API_KEY` (за потреби);
   - `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SHEETS_*` (згідно інструкції);
   - auth-секрети (`AUTH_SECRET`, тощо).
4. Натиснути **Deploy** та дочекатися завершення збірки.
5. Відкрити задеплоєний домен, виконати первинний вхід в адмін-панель.
6. Пройти onboarding-майстер в адмінці:
   - створити школу;
   - додати курси;
   - вказати Google Spreadsheet;
   - прив’язати Telegram-бота та чат.

Після завершення цих кроків бот буде готовий до тестового запуску з боку школи.
