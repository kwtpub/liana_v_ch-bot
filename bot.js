const TelegramBot = require('node-telegram-bot-api');

// Токен вашего бота
const TOKEN = '7818601616:AAEXkZi0rNL8IGxheghMq8UX9PCUPtyE858';

// Создаем экземпляр бота
const bot = new TelegramBot(TOKEN, { polling: true });

module.exports = bot; 