const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const pool = require("./db");
const bodyParser = require("body-parser");
const [sendMessage, isValidEmail, sendVerificationCode, isAdmin, sendLongMessage] = require('./helper')
const util = require('./utils/utils');

dotenv.config();

const app = express();
app.use(bodyParser.json())

const userStates = {};


// for test
app.get("/", async (req, res) => {
    console.log(req.body)
    res.send('✅ Bot and server are running.');
})


// for test
// Get users from db
app.get("/users", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM jira_users");
        res.json(result.rows);
    } catch (err) {
        console.error("DB error: ", err.message);
        res.status(500).send("Server error");
    }
});


// jira API 
/*
app.post("/webhook-jira", async (req, res) => {

    let eventStatus = ''

    const assigneName = req.body?.issue?.fields?.assignee?.displayName;
    const reporterName = req.body?.issue?.fields?.creator?.displayName
    const reporterEmail = req.body?.issue?.fields?.creator?.emailAddress
    const reporterUsername = req.body?.issue?.fields?.creator?.name
    const assigneUsername = req.body?.issue?.fields?.assignee?.name
    const assigneEmail = req.body?.issue?.fields?.assignee?.emailAddress
    const porjectName = req.body?.issue?.fields?.project?.name
    const issueTypeName = req.body?.issue?.fields?.issuetype?.name
    const issueTypeDescription = req.body?.issue?.fields?.issuetype?.description
    const issuePriority = req.body?.issue?.fields?.priority?.name
    const issueStatus = req.body?.issue?.fields?.status?.name
    const issueSummary = req.body?.issue?.fields?.summary
    const issueKey = req.body?.issue?.key
    const webhookEvent = req.body?.webhookEvent
    const issueComment = req.body?.comment?.body

    if (webhookEvent === "jira:issue_deleted") {
        eventStatus = 'deleted'
    } else if (webhookEvent === "jira:issue_created") {
        eventStatus = 'created'
    } else if (webhookEvent === "jira:issue_updated") {
        eventStatus = 'updated'
    } else if (webhookEvent === 'comment_created') {
        eventStatus = 'comment_created'
    }

    // assigne notification
    try {
        const result = await pool.query(`SELECT telegram_id FROM jira_users WHERE email = ($1)`, [assigneEmail])

        try {
            if (result.rows.length > 0) {
                const chatId = result.rows[0].telegram_id;
                sendMessage(chatId, `
<b>${util[`issue_status_${eventStatus}`]}</b>

<b>👤 Reporter:</b>
      • <b>Name:</b> ${reporterName}
      • <b>Username:</b> ${reporterEmail}

<b>👤 Assignee:</b>
      • <b>Name:</b> ${assigneName}
      • <b>Username:</b> ${assigneUsername}

<b>🗂 Project: </b> ${porjectName}
      • <b>🎫 Issue Key:</b> ${issueKey}
      • <b>📝 Issue Type:</b> ${issueTypeName}
      • <b>🚨 Priority:</b> ${issuePriority}
      • <b>📌 Status:</b> ${issueStatus}

<b>📝 Task Name:</b>
${issueSummary}
<b>🧾 Description:</b>
${issueTypeDescription}
<b>🧾 Comment: </b>
${issueComment}
                `, { parse_mode: "HTML" })
                
            } else {
                // No user found
                console.log('no user found')
            }

            res.json(result.rows);
        } catch (err) {
            console.log(err)
        }


    } catch (err) {
        console.log(err)
    }

    // reporter notification
    try {
        const result = await pool.query(`SELECT telegram_id FROM jira_users WHERE email = ($1)`, [reporterEmail])
        try {
            if (result.rows.length > 0) {
                const chatId = result.rows[0].telegram_id;
                sendMessage(chatId, `
<b>${util[`issue_status_${eventStatus}`]}</b>

<b>👤 Reporter:</b>
      • <b>Name:</b> ${reporterName}
      • <b>Username:</b> ${reporterEmail}

<b>👤 Assignee:</b>
      • <b>Name:</b> ${assigneName}
      • <b>Username:</b> ${assigneUsername}

<b>🗂 Project: </b> ${porjectName}
      • <b>🎫 Issue Key:</b> ${issueKey}
      • <b>📝 Issue Type:</b> ${issueTypeName}
      • <b>🚨 Priority:</b> ${issuePriority}
      • <b>📌 Status:</b> ${issueStatus}

<b>📝 Task Name:</b>
${issueSummary}
<b>🧾 Description:</b>
${issueTypeDescription}
<b>🧾 Comment: </b>
${issueComment}
                `, { parse_mode: "HTML" })
                
            } else {
                // No user found
                console.log('no user found')
            }

            res.json(result.rows);
        } catch (err) {
            console.log(err)
        }


    } catch (err) {
        console.log(err)
    }
})
*/


app.post("/webhook-jira", async (req, res) => {
    let eventStatus = '';

    const assigneName = req.body?.issue?.fields?.assignee?.displayName;
    const reporterName = req.body?.issue?.fields?.creator?.displayName;
    const reporterEmail = req.body?.issue?.fields?.creator?.emailAddress;
    const reporterUsername = req.body?.issue?.fields?.creator?.name;
    const assigneUsername = req.body?.issue?.fields?.assignee?.name;
    const assigneEmail = req.body?.issue?.fields?.assignee?.emailAddress;
    const projectName = req.body?.issue?.fields?.project?.name;
    const issueTypeName = req.body?.issue?.fields?.issuetype?.name;
    const issueTypeDescription = req.body?.issue?.fields?.issuetype?.description;
    const issuePriority = req.body?.issue?.fields?.priority?.name;
    const issueStatus = req.body?.issue?.fields?.status?.name;
    const issueSummary = req.body?.issue?.fields?.summary;
    const issueKey = req.body?.issue?.key;
    const webhookEvent = req.body?.webhookEvent;
    const issueComment = req.body?.comment?.body;

    if (webhookEvent === "jira:issue_deleted") {
        eventStatus = 'deleted';
    } else if (webhookEvent === "jira:issue_created") {
        eventStatus = 'created';
    } else if (webhookEvent === "jira:issue_updated") {
        eventStatus = 'updated';
    } else if (webhookEvent === 'comment_created') {
        eventStatus = 'comment_created';
    }

    const messageTemplate = `
<b>${util[`issue_status_${eventStatus}`] || "🔔 New update"}</b>

<b>👤 Reporter:</b>
• <b>Name:</b> ${reporterName}
• <b>Username:</b> ${reporterUsername}

<b>👤 Assignee:</b>
• <b>Name:</b> ${assigneName}
• <b>Username:</b> ${assigneUsername}

<b>🗂 Project:</b> ${projectName}
• <b>🎫 Issue Key:</b> ${issueKey}
• <b>📝 Issue Type:</b> ${issueTypeName}
• <b>🚨 Priority:</b> ${issuePriority}
• <b>📌 Status:</b> ${issueStatus}

<b>📝 Task Name:</b>
${issueSummary}
<b>🧾 Description:</b>
${issueTypeDescription || "No description."}
<b>💬 Comment:</b>
${issueComment || "No comments."}
`;

    try {
        // Notify assignee
        const assigneeResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [assigneEmail]
        );
        if (assigneeResult.rows.length > 0) {
            const chatId = assigneeResult.rows[0].telegram_id;
            await sendMessage(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        // Notify reporter
        const reporterResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [reporterEmail]
        );
        if (reporterResult.rows.length > 0) {
            const chatId = reporterResult.rows[0].telegram_id;
            await sendMessage(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        return res.status(200).json({ message: "Notifications sent." });
    } catch (err) {
        console.error("Error sending notifications:", err);
        return res.status(500).send("Server error");
    }
});



// Telegram Api
/*
app.post("/webhook", async (req, res) => {

    const body = req.body;

    if (!body || !body.message) {
        console.log("❗ Invalid Telegram payload:", body);
        return res.sendStatus(400); // Bad Request
    }

    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text.trim();

    switch (text) {
        case '/start': {
            await sendMessage(chatId, `👋 Welcome! This bot is connected to your Jira system.\nPlease register if you are not registered before /register\nIf you want to update your information tap /update`);
            return res.sendStatus(200);
        }

        case '/register': {
            userStates[chatId] = { step: 'awaiting_email', data: {} };
            await sendMessage(chatId, `📧 Please enter your *Jira email address*:`, { parse_mode: 'Markdown' });
            return res.sendStatus(200);
        }

        case '/update': {
            userStates[chatId] = { step: 'awaiting_email', data: {} };
            await sendMessage(chatId, `📧 Please enter your *Jira email address* to update your information:`, { parse_mode: 'Markdown' });
            return res.sendStatus(200);
        }
    }

    if (userStates[chatId]?.step === 'awaiting_email') {
        if (!isValidEmail(text)) {
            await sendMessage(chatId, "❌ Invalid email format. Please enter a valid Jira email address.");
            return res.sendStatus(200);
        }

        try {
            const existing = await pool.query("SELECT * FROM jira_users WHERE email = $1", [text]);
            if (existing.rows.length > 0) {
                await sendMessage(chatId, "⚠️ This email is already registered. If it’s yours, use /update to change your information.");
                delete userStates[chatId];
                return res.sendStatus(200);
            }
        } catch (err) {
            console.error("DB email check error:", err.message);
            await sendMessage(chatId, "❌ Error checking email in the database.");
            return res.sendStatus(200);
        }

        userStates[chatId].data.email = text;
        userStates[chatId].step = 'awaiting_username';
        await sendMessage(chatId, `👤 Now enter your *Jira username*:`, { parse_mode: 'Markdown' });
        return res.sendStatus(200);
    }

    if (userStates[chatId]?.step === 'awaiting_username') {
        userStates[chatId].data.username = text;
        const { email, username } = userStates[chatId].data;

        try {
            await pool.query(
                "INSERT INTO jira_users (telegram_id, username, email) VALUES ($1, $2, $3) ON CONFLICT (telegram_id) DO UPDATE SET username = $2, email = $3",
                [chatId, username, email]
            );
            await sendMessage(chatId, `✅ You have been registered!\n📧 Email: ${email}\n👤 Username: ${username}`);
        } catch (err) {
            console.log('DB error: ', err);
            await sendMessage(chatId, '❌ Error saving to database.');
        }

        delete userStates[chatId];
        return res.sendStatus(200);
    }

    // Default response if no condition was met
    return res.sendStatus(200);
});
*/

app.post("/webhook", async (req, res) => {
    const body = req.body;

    // callback query
    if (body.callback_query) {
        const callback = body.callback_query;
        const chatId = callback.message.chat.id;
        const data = callback.data;

        if (!await isAdmin(chatId)) {
            await sendMessage(chatId, "🚫 You are not authorized for this action.");
            return res.sendStatus(200);
        }

        if (data.startsWith('delete_user:')) {
            const userId = data.split(':')[1];
            await pool.query("DELETE FROM jira_users WHERE id = $1", [userId]);
            await sendMessage(chatId, `🗑 User deleted.`);
            return res.sendStatus(200);
        }

        if (data.startsWith('toggle_admin:')) {
            const userId = data.split(':')[1];
            const user = await pool.query("SELECT is_admin FROM jira_users WHERE id = $1", [userId]);
            if (user.rows.length > 0) {
                const newStatus = !user.rows[0].is_admin;
                await pool.query("UPDATE jira_users SET is_admin = $1 WHERE id = $2", [newStatus, userId]);
                await sendMessage(chatId, `🔁 User admin status changed to: ${newStatus ? '✅ Admin' : '❌ Not Admin'}`);
            } else {
                await sendMessage(chatId, `❗ User not found.`);
            }
            return res.sendStatus(200);
        }

        if (data.startsWith('edit_user:')) {
            const userId = data.split(':')[1];
            const user = await pool.query("SELECT * FROM jira_users WHERE id = $1", [userId]);
            if (user.rows.length === 0) {
                await sendMessage(chatId, "❗ User not found.");
                return res.sendStatus(200);
            }

            userStates[chatId] = {
                step: 'edit_email',
                mode: 'edit',
                data: {
                    id: userId,
                    username: user.rows[0].username,
                    email: user.rows[0].email
                }
            };

            await sendMessage(chatId, `📧 Current email: ${user.rows[0].email}\nEnter the new email:`);
            return res.sendStatus(200);
        }

        return res.sendStatus(200);
    }

    if (!body || !body.message) return res.sendStatus(400);

    const message = body.message;
    const chatId = message.chat.id;
    const text = message.text?.trim();

    if (!text) return res.sendStatus(200);

    // Handle commands
    if (text === '/start') {
        await sendMessage(chatId, `👋 Welcome! This bot is connected to your Jira system.
Use /register to sign up or /update to change your information.`);
        return res.sendStatus(200);
    }

    if (text === '/register') {
        const checkUser = await pool.query("SELECT * FROM jira_users WHERE telegram_id = $1", [chatId]);

        if (checkUser.rows.length > 0) {
            await sendMessage(chatId, `⚠️ You are already registered with email: ${checkUser.rows[0].email}\nIf you want to change it, use /update`);
            return res.sendStatus(200);
        }

        userStates[chatId] = { step: 'awaiting_email', data: {}, mode: 'register' };
        await sendMessage(chatId, `📧 Please enter your *Jira email address*:\nType /cancel to abort.`, { parse_mode: 'Markdown' });
        return res.sendStatus(200);
    }

    if (text === '/update') {
        const checkUser = await pool.query("SELECT * FROM jira_users WHERE telegram_id = $1", [chatId]);

        if (checkUser.rows.length === 0) {
            await sendMessage(chatId, `⚠️ You are not registered yet. Please use /register first.`);
            return res.sendStatus(200);
        }

        userStates[chatId] = { step: 'awaiting_email', data: {}, mode: 'update' };
        await sendMessage(chatId, `📧 Enter your new *Jira email address* to update:\nType /cancel to abort.`, { parse_mode: 'Markdown' });

        return res.sendStatus(200);
    }

    if (text === '/cancel') {
        if (userStates[chatId]) {
            delete userStates[chatId];
            await sendMessage(chatId, "❌ Operation cancelled.");
        } else {
            await sendMessage(chatId, "ℹ️ Nothing to cancel.");
        }
        return res.sendStatus(200);
    }


    // Awaiting email
    if (userStates[chatId]?.step === 'awaiting_email') {
        if (!isValidEmail(text)) {
            await sendMessage(chatId, "❌ Invalid email format. Please enter a valid Jira email.\nType /cancel to abort.");
            return res.sendStatus(200);
        }

        const mode = userStates[chatId].mode;
        const existing = await pool.query("SELECT * FROM jira_users WHERE email = $1", [text]);

        if (mode === 'register' && existing.rows.length > 0) {
            await sendMessage(chatId, "⚠️ This email is already registered. Use /update to change your info.\nType /cancel to abort.");
            delete userStates[chatId];
            return res.sendStatus(200);
        }

        if (mode === 'update' && existing.rows.length > 0 && existing.rows[0].telegram_id !== chatId) {
            await sendMessage(chatId, "⚠️ This email is already used by another user. Please use a different one.");
            delete userStates[chatId];
            return res.sendStatus(200);
        }


        const code = Math.floor(100000 + Math.random() * 900000);
        userStates[chatId].data.verificationCode = code;
        await sendVerificationCode(text, code);
        await sendMessage(chatId, `📩 A verification code has been sent to your email. Please enter the code:\nType /cancel to abort.`);

        userStates[chatId].data.email = text;
        userStates[chatId].step = 'awaiting_verification_code';
        return res.sendStatus(200);
    }

    if (userStates[chatId]?.step === 'awaiting_verification_code') {
        if (text === userStates[chatId].data.verificationCode.toString()) {
            userStates[chatId].step = 'awaiting_username';
            await sendMessage(chatId, `✅ Verified! Now enter your *Jira username*:`, { parse_mode: 'Markdown' });
        } else {
            await sendMessage(chatId, "❌ Incorrect code. Please try again.");
        }
        return res.sendStatus(200);
    }


    // Awaiting username
    if (userStates[chatId]?.step === 'awaiting_username') {
        const { email, mode } = userStates[chatId].data;
        const username = text;

        try {
            await pool.query(
                `INSERT INTO jira_users (telegram_id, username, email)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (telegram_id)
                 DO UPDATE SET username = $2, email = $3`,
                [chatId, username, email]
            );

            await sendMessage(chatId,
                `✅ Your info has been ${userStates[chatId].mode === 'register' ? 'registered' : 'updated'}!\n📧 Email: ${email}\n👤 Username: ${username}`
            );
        } catch (err) {
            console.error("DB save error:", err);
            await sendMessage(chatId, '❌ Error saving to database.');
        }

        delete userStates[chatId];
        return res.sendStatus(200);
    }

    // show users
    if (text.startsWith('/users')) {
        if (await isAdmin(chatId)) {
            const users = await pool.query("SELECT id, username, email, is_admin FROM jira_users");

            if (users.rows.length === 0) {
                await sendMessage(chatId, "📭 No registered users.");
                return res.sendStatus(200);
            }

            for (const user of users.rows) {
                await sendMessage(chatId,
                    `👤 *${user.username}*\n📧 ${user.email}\n🛡 Admin: ${user.is_admin ? "✅ Yes" : "❌ No"}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✏️ Edit', callback_data: `edit_user:${user.id}` },
                                    { text: '🗑 Delete', callback_data: `delete_user:${user.id}` }
                                ],
                                [
                                    { text: user.is_admin ? '❌ Remove Admin' : '✅ Make Admin', callback_data: `toggle_admin:${user.id}` }
                                ]
                            ]
                        }
                    }
                );
            }

        } else {
            await sendMessage(chatId, "🚫 You are not authorized to use this command.");
        }
        return res.sendStatus(200);
    }

    // Help 
    if (text === '/help') {
        await sendMessage(chatId, `📌 Available commands:
    /start - Welcome message
    /register - Register your Jira info
    /update - Update your info
    /users - (Admins only) List all registered users
    /cancel - Press to abort the command.
    `);
        return res.sendStatus(200);
    }




    // No match
    return res.sendStatus(200);
});


const PORT = process.env.PORT || 3000
app.listen(PORT, (err) => {
    if (err) {
        console.log(err)
    } else {
        console.log('Listening for jira webhook on port ', PORT)
    }
})


