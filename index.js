const TelegramBot = require("node-telegram-bot-api");
const config = require("./config/config");


const bot = new TelegramBot(config.TOKENT, { polling: true })

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

})

bot.setMyCommands([
    { command: '/start', description: 'boshlash' },
    { command: '/id', description: 'id raqam' },
    { command: '/help', description: 'yordam olish' },
])

