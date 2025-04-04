const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Токен вашего бота
const TOKEN = '7818601616:AAEXkZi0rNL8IGxheghMq8UX9PCUPtyE858';

// ID канала
const CHANNEL_ID = -1002397816296;

// ID админ-чата
const ADMIN_CHAT_ID = -1002368236633;

// Путь к файлу с подписками
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'data', 'subscriptions.json');

// Создаем экземпляр бота
const bot = new TelegramBot(TOKEN, { polling: true });

// Загружаем данные о подписках
function loadSubscriptions() {
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify([]));
    }
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8'));
}

// Сохраняем данные о подписках
function saveSubscriptions(subscriptions) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subscriptions, null, 2));
}

// Добавляем подписку
function addSubscription(userId, expiresAt) {
    const subscriptions = loadSubscriptions();
    const existingSubscription = subscriptions.find(sub => sub.userId === userId);

    if (existingSubscription) {
        // Если подписка уже есть, обновляем её срок
        existingSubscription.expiresAt = expiresAt;
    } else {
        // Если подписки нет, добавляем новую
        subscriptions.push({ userId, expiresAt });
    }

    saveSubscriptions(subscriptions);
}

// Проверяем подписку
function checkSubscription(userId) {
    const subscriptions = loadSubscriptions();
    const userSubscription = subscriptions.find(sub => sub.userId === userId);
    return userSubscription && new Date(userSubscription.expiresAt) > new Date();
}

// Получаем дату окончания подписки
function getSubscriptionExpiresAt(userId) {
    const subscriptions = loadSubscriptions();
    const userSubscription = subscriptions.find(sub => sub.userId === userId);
    return userSubscription ? new Date(userSubscription.expiresAt) : null;
}

// Удаляем подписку
function removeSubscription(userId) {
    const subscriptions = loadSubscriptions();
    const updatedSubscriptions = subscriptions.filter(sub => sub.userId !== userId);
    saveSubscriptions(updatedSubscriptions);
}

// Удаляем пользователя из канала
async function removeUserFromChannel(userId) {
    try {
        await bot.banChatMember(CHANNEL_ID, userId);
        await bot.unbanChatMember(CHANNEL_ID, userId);
        console.log(`Пользователь ${userId} удален из канала.`);
    } catch (error) {
        console.error(`Ошибка при удалении пользователя ${userId}:`, error);
    }
}

// Проверяем подписки и отправляем уведомления
async function checkSubscriptions() {
    const subscriptions = loadSubscriptions();
    const now = new Date();

    for (const sub of subscriptions) {
        const expiresAt = new Date(sub.expiresAt);
        const timeLeft = expiresAt - now; // Время до окончания подписки в миллисекундах

        // Если до окончания подписки осталось 2 дня или меньше
        if (timeLeft <= 2 * 24 * 60 * 60 * 1000 && timeLeft > 0) {
            // Отправляем уведомление пользователю с предложением продлить подписку
            bot.sendMessage(sub.userId, `🔔 Внимание!

Ваша подписка заканчивается через ${Math.ceil(timeLeft / (24 * 60 * 60 * 1000))} дней.

Продлите её заранее, чтобы сохранить доступ к закрытому каналу! 🔥💫`, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔄 Продлить подписку', callback_data: 'renew_subscription' },
                        ]
                    ]
                }
            });
        }

        // Если подписка истекла
        if (timeLeft <= 0) {
            // Удаляем пользователя из канала
            await removeUserFromChannel(sub.userId);

            // Удаляем подписку из JSON
            removeSubscription(sub.userId);
        }
    }
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;

    if (checkSubscription(userId)) {
        const expiresAt = getSubscriptionExpiresAt(userId);
        const timeLeft = expiresAt - new Date();

        bot.sendMessage(chatId, `Привет, ${firstName}! 🎉

У вас уже есть активная подписка, и она будет действовать ещё ${Math.ceil(timeLeft / (24 * 60 * 60 * 1000))} дней. Наслаждайтесь контентом! 🔥💫`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Зайти', callback_data: 'sendLink' },
                        { text: '🔄 Продлить подписку', callback_data: 'renew_subscription' },
                    ]
                ]
            }
        });
    } else {
        // Предлагаем выбрать тип подписки
        bot.sendMessage(chatId, `Привет! 
Я твой бот-помощник и проведу тебя в секретный стильный клуб 🛍️

Произведи оплату на карту следуя инструкциям ниже 👇`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '1 месяц - 10 USD', callback_data: 'subscribe_1' },
                        { text: '6 месяцев - 50 USD', callback_data: 'subscribe_6' },
                    ],
                    [
                        { text: '1 год - 90 USD', callback_data: 'subscribe_12' },
                    ]
                ]
            }
        });
    }
});

// Обработчик callback_query (кнопки "Подтвердить", "Отклонить", выбор подписки и продление)
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    console.log(`Callback query received: ${data}`); // Логируем callback-запрос

    if (data === 'sendLink') {
        const inviteLink = await bot.createChatInviteLink(-1002397816296, {
            member_limit: 1, // Ограничение по количеству использований
        });
        bot.sendMessage(chatId, inviteLink.invite_link);
    } else if (data === 'renew_subscription') {
        // Предлагаем выбрать тип подписки для продления
        bot.sendMessage(chatId, `📌 Выберите тип подписки для продления:`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '1 месяц - 10 USD', callback_data: 'subscribe_1' },
                        { text: '6 месяцев - 50 USD', callback_data: 'subscribe_6' },
                    ],
                    [
                        { text: '1 год - 90 USD', callback_data: 'subscribe_12' },
                    ]
                ]
            }
        });
    } else if (data.startsWith('subscribe_')) {
        const period = parseInt(data.split('_')[1]);
        bot.sendMessage(chatId, `✨ Вы выбрали  подписку на ${period} месяцев✨

💳 Стоимость: 1999 ₽

📌 Оплата: Переведите сумму на карту 4729 7578 6687 6777

📸 После оплаты отправьте скрин в чат и ожидай подтверждения`);
    } else if (data.startsWith('approve_')) {
        const targetUserId = parseInt(data.split('_')[1]); // ID пользователя, которого нужно подтвердить
        const period = parseInt(data.split('_')[2]); // Период подписки

        const isMember = await isUserInChannel(targetUserId);

        if (isMember) {
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + period); // Подписка на выбранный период
            addSubscription(targetUserId, expiresAt.toISOString());
            bot.sendMessage(targetUserId, `🎉 Готово!

Вы уже в канале! Ваша подписка продлена на ${period} месяцев. Наслаждайтесь контентом! 🔥💫`);
        } else {
            try {
                const inviteLink = await bot.createChatInviteLink(CHANNEL_ID, {
                    member_limit: 1, // Ограничение по количеству использований
                });
                const expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + period); // Подписка на выбранный период
                addSubscription(targetUserId, expiresAt.toISOString());
                bot.sendMessage(targetUserId, `🔥 Оплата подтверждена! 🔥

Добро пожаловать в закрытый стильный клуб! 🛍️✨

${inviteLink.invite_link}

Если у тебя есть вопросы, всегда можешь написать сюда @liana_v_ch
`);
            } catch (error) {
                console.error('Ошибка при одобрении заявки:', error);
                bot.sendMessage(targetUserId, `⚠️ Что-то пошло не так…
Мы не смогли подтвердить оплату. Проверь:
✔️ Правильность реквизитов
✔️ Сумму перевода
✔️ Отправленный скрин чека

Если возникли вопросы, пиши сюда - @liana_v_ch`);
            }
        }

        // Удаляем сообщение с фото из админ-чата
        bot.deleteMessage(chatId, query.message.message_id);
    } else if (data.startsWith('reject_')) {
        const targetUserId = parseInt(data.split('_')[1]);
        bot.sendMessage(targetUserId, `⚠️ Что-то пошло не так…
Мы не смогли подтвердить оплату. Проверь:
✔️ Правильность реквизитов
✔️ Сумму перевода
✔️ Отправленный скрин чека

Если возникли вопросы, пиши сюда - @liana_v_ch`);
        bot.deleteMessage(chatId, query.message.message_id);
    }

    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(query.id);
});

// Обработчик сообщений с фото
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;

    // Проверяем, содержит ли сообщение фото (скриншот перевода)
    if (msg.photo) {
        // Пересылаем фото в админ-чат
        const photoId = msg.photo[msg.photo.length - 1].file_id; // Берем самое большое фото

        // Предлагаем админу выбрать период подписки
        bot.sendPhoto(ADMIN_CHAT_ID, photoId, {
            caption: `Пользователь ${firstName} (ID: ${userId}) отправил скриншот оплаты. Выберите период подписки:`,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '1 месяц', callback_data: `approve_${userId}_1` },
                        { text: '6 месяцев', callback_data: `approve_${userId}_6` },
                    ],
                    [
                        { text: '1 год', callback_data: `approve_${userId}_12` },
                        { text: '❌ Отклонить', callback_data: `reject_${userId}` },
                    ]
                ]
            }
        });

        // Сообщаем пользователю, что оплата проверяется
        bot.sendMessage(chatId, `💳 Спасибо!

Ваш платеж отправлен на проверку. Ожидайте подтверждения — скоро всё будет готово! ⏳✨`);
    }
});

// Функция для проверки, является ли пользователь участником канала
async function isUserInChannel(userId) {
    try {
        const chatMember = await bot.getChatMember(CHANNEL_ID, userId);
        return ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
        console.error('Ошибка при проверке участника канала:', error);
        return false;
    }
}

// Обработчик ошибок
bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

// Периодическая проверка подписок (раз в день)
setInterval(checkSubscriptions, 24 * 60 * 60 * 1000);

// Запуск проверки подписок при старте бота
checkSubscriptions();