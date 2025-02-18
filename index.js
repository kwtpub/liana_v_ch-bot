const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Токен вашего бота
const TOKEN = '7818601616:AAEXkZi0rNL8IGxheghMq8UX9PCUPtyE858';

const CHANNEL_ID = -1002397816296;

// ID админ-чата (например, 123456789)
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
    subscriptions.push({ userId, expiresAt });
    saveSubscriptions(subscriptions);
}

// Проверяем подписку
function checkSubscription(userId) {
    const subscriptions = loadSubscriptions();
    const userSubscription = subscriptions.find(sub => sub.userId === userId);
    return userSubscription && new Date(userSubscription.expiresAt) > new Date();
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

        // Если до окончания подписки осталось 3 дня или меньше
        if (timeLeft <= 3 * 24 * 60 * 60 * 1000 && timeLeft > 0) {
            // Отправляем уведомление пользователю
            bot.sendMessage(sub.userId, `Ваша подписка заканчивается через ${Math.ceil(timeLeft / (24 * 60 * 60 * 1000))} дней. Продлите подписку, чтобы сохранить доступ к каналу.`);
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
    const firstName = msg.from.first_name;
    console.log(msg);

    // Проверяем, есть ли у пользователя активная подписка
    if (checkSubscription(msg.from.id)) {

        bot.sendMessage(chatId, `Привет, ${firstName}! У вас уже есть активная подписка.`,  {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Зайти', callback_data: 'sendLink' },
                    ]
                ]
            }
        });
    } else {
        // Отправляем инструкцию для оплаты
        bot.sendMessage(chatId, `Привет, ${firstName}! Для доступа к каналу оплатите подписку. Стоимость: 10 USD. Переведите деньги на карту 1234 5678 9012 3456 и отправьте скриншот перевода.`);
    }
});

// Обработчик сообщений с подтверждением оплаты (скриншот)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const firstName = msg.from.first_name;
    console.log(msg);

    // Проверяем, содержит ли сообщение фото (скриншот перевода)
    if (msg.photo) {
        // Пересылаем фото в админ-чат
        const photoId = msg.photo[msg.photo.length - 1].file_id; // Берем самое большое фото
        const caption = `Пользователь ${firstName} (ID: ${userId}) отправил скриншот оплаты. Подтвердите оплату.`;

        // Отправляем фото в админ-чат с кнопками "Подтвердить" и "Отклонить"
        bot.sendPhoto(ADMIN_CHAT_ID, photoId, {
            caption: caption,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Подтвердить', callback_data: `approve_${userId}` },
                        { text: '❌ Отклонить', callback_data: `reject_${userId}` }
                    ]
                ]
            }
        });

        // Сообщаем пользователю, что оплата проверяется
        bot.sendMessage(chatId, 'Спасибо! Ваш платеж отправлен на проверку. Ожидайте подтверждения.');
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

// Обработчик callback_query (кнопки "Подтвердить" и "Отклонить")
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = parseInt(query.data.split('_')[1]); // Извлекаем ID пользователя
    const action = query.data.split('_')[0]; // Извлекаем действие (approve или reject)
    console.log(query)
    if(query.data == 'sendLink') {
        const inviteLink = await bot.createChatInviteLink(CHANNEL_ID, { 
            member_limit: 1, // Ограничение по количеству использований
        });
        bot.sendMessage(chatId, inviteLink.invite_link);
    }
    if (action === 'approve') {
        // Проверяем, является ли пользователь уже участником канала
        const isMember = await isUserInChannel(userId);
        if (isMember) {
            // Если пользователь уже в канале, просто активируем подписку
            const expiresAt = new Date();
            expiresAt.setMonth(expiresAt.getMonth() + 1); // Подписка на 1 месяц
            addSubscription(userId, expiresAt.toISOString());

            bot.sendMessage(userId, 'Вы уже находитесь в канале! Подписка продлена');
        } else {
            // Если пользователь не в канале, одобряем заявку
            try {
                const inviteLink = await bot.createChatInviteLink(CHANNEL_ID, { 
                    member_limit: 1, // Ограничение по количеству использований
                });
                bot.sendMessage(userId, inviteLink.invite_link);
                const expiresAt = new Date();
                expiresAt.setMonth(expiresAt.getMonth() + 1); // Подписка на 1 месяц
                addSubscription(userId, expiresAt.toISOString());

                bot.sendMessage(userId, 'Ваша подписка активирована! Теперь вы можете войти в канал.');
            } catch (error) {
                console.error('Ошибка при одобрении заявки:', error);
                bot.sendMessage(userId, 'Произошла ошибка. Пожалуйста, свяжитесь с поддержкой.');
            }
        }

        // Удаляем сообщение с фото из админ-чата
        bot.deleteMessage(chatId, query.message.message_id);
    } else if (action === 'reject') {
        // Отклоняем оплату
        bot.sendMessage(userId, 'Ваш платеж отклонен. Пожалуйста, свяжитесь с поддержкой.');

        // Удаляем сообщение с фото из админ-чата
        bot.deleteMessage(chatId, query.message.message_id);
    }

    // Подтверждаем обработку callback_query
    bot.answerCallbackQuery(query.id);
});

// Обработчик ошибок
bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

bot.on('group_chat_created', (msg) => {
    console.log(msg);
});

bot.on('channel_chat_created', (msg) => {
    console.log(msg);
});

bot.on('chat_join_request', (msg) => {
    console.log(msg);
});

// Периодическая проверка подписок (раз в день)
setInterval(checkSubscriptions, 24 * 60 * 60 * 1000);

// Запуск проверки подписок при старте бота
checkSubscriptions();