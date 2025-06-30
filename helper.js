const nodemailer = require('nodemailer');
const TelegramBot = require('node-telegram-bot-api');
const pool = require('./db')
const dotenv = require("dotenv");
dotenv.config();

const BOT_URL = process.env.BOT_URL;


// admin check
const ADMIN_IDS = process.env.ADMIN_IDS

// Telegram connection
const TELEGRAM_TOKEN1 = process.env.TELEGRAM_TOKEN_1;
const TELEGRAM_TOKEN2 = process.env.TELEGRAM_TOKEN_2;

if (!TELEGRAM_TOKEN1) {
    console.log('Missing TELEGRAM TOKEN in .env')
    process.exit(1);
}
if (!TELEGRAM_TOKEN2) {
    console.log('Missing TELEGRAM TOKEN in .env')
    process.exit(1);
}



// Load tokens from .env
const bot1 = new TelegramBot(TELEGRAM_TOKEN1, { polling: false });
const bot2 = new TelegramBot(TELEGRAM_TOKEN2, { polling: false });
bot1.setWebHook(`${BOT_URL}/webhook`);
bot2.setWebHook(`${BOT_URL}/jirabotapi`);

const sendMessageBot1 = async (chatId, text, options = {}) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN1}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            ...options
        })
    });
};

const sendMessageBot2 = async (chatId, text, options = {}) => {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN2}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            ...options
        })
    });
};


const sendLongMessagebot1 = async (chatId, message, chunkSize = 4000) => {
    for (let i = 0; i < message.length; i += chunkSize) {
        await sendMessageBot1(chatId, message.substring(i, i + chunkSize));
    }
};

const sendLongMessagebot2 = async (chatId, message, chunkSize = 4000) => {
    for (let i = 0; i < message.length; i += chunkSize) {
        await sendMessageBot2(chatId, message.substring(i, i + chunkSize));
    }
};


// email validation

const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// configure mailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

const sendVerificationCode = async (email, code) => {
    const mailOptions = {
        from: `"Jira Bot" <${process.env.MAIL_USER}>`,
        to: email,
        subject: '✅ Your Jira Bot Verification Code',
        html: `
            <div style="font-family: Arial, sans-serif; font-size: 16px;">
                <p>Dear User,</p>
                <p>Your verification code is:</p>
                <h2 style="color: #2e6c80;">${code}</h2>
                <p>This code will expire in 5 minutes.</p>
                <br/>
                <p>Best regards,<br/>Jira Bot Team 🤖</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Verification code sent to: ${email}`);
    } catch (err) {
        console.error("❌ Failed to send email:", err);
        throw err;
    }
};

// admin check
const isAdmin = async (chatId) => {
    if (!chatId) return false;

    // Check hardcoded admin list first
    if (ADMIN_IDS.includes(chatId)) {
        return true;
    }

    // Then check from database
    try {
        const result = await pool.query(
            "SELECT is_admin FROM jira_users WHERE telegram_id = $1",
            [chatId]
        );
        return result.rows.length > 0 && result.rows[0].is_admin === true;
    } catch (err) {
        console.error("Error checking admin status:", err);
        return false;
    }
};






module.exports = {
    isValidEmail,
    sendVerificationCode,
    isAdmin,
    bot1,
    bot2,
    sendMessageBot1,
    sendMessageBot2,
    sendLongMessagebot1,
    sendLongMessagebot2
};
