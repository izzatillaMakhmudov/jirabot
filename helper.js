const nodemailer = require('nodemailer');
const dotenv = require("dotenv");
dotenv.config();

// admin check
const ADMIN_IDS = process.env.ADMIN_IDS

// Telegram connection
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
    console.log('Missing TELEGRAM TOKEN in .env')
    process.exit(1);
}
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

const sendMessage = async (chatId, text, options = {}) => {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            ...options
        })
    });
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

const sendLongMessage = async (chatId, message, chunkSize = 4000) => {
    for (let i = 0; i < message.length; i += chunkSize) {
        await sendMessage(chatId, message.substring(i, i + chunkSize));
    }
};



module.exports = [
    sendMessage,
    isValidEmail,
    sendVerificationCode,
    isAdmin,
    sendLongMessage
];