const express = require('express');
// const fetch = require('node-fetch');
const dotenv = require('dotenv');
const pool = require("./db");
const bodyParser = require("body-parser");
const {
    isValidEmail,
    sendVerificationCode,
    isAdmin,
    bot1,
    bot2,
    sendMessageBot1,
    sendMessageBot2,
    sendLongMessagebot1,
    sendLongMessagebot2
} = require('./helper');


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

app.post("/webhook-jira", async (req, res) => {
    const changeLog = req.body?.changelog
    const issueId = req.body?.issue?.id;
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

    const messageTemplateUser = `

<b>👤 Reporter:</b>
• <b>Name:</b> ${reporterName}
• <b>Username:</b> ${reporterUsername}

<b>👤 Assignee:</b>
• <b>Name:</b> ${assigneName}
• <b>Username:</b> ${assigneUsername}
    `;

    let messageTemplate = ''

    switch (webhookEvent) {
        case 'jira:issue_created':
            {
                messageTemplate += `<b>🆕 New issue has been created</b>`
                messageTemplate += messageTemplateUser;
                messageTemplate += `
<b>🗂 Project:</b> ${projectName}
    • <b>🎫 Issue Key:</b> ${issueKey}
    • <b>📝 Issue Type:</b> ${issueTypeName}
    • <b>🚨 Priority:</b> ${issuePriority}
    • <b>📌 Status:</b> ${issueStatus}

<b>📝 Task Name:</b>
${issueSummary}
<b>🧾 Description:</b>
${issueTypeDescription || "No description."}
`
                break;
            }

        case 'jira:issue_updated':
            {
                if (req.body?.issue_event_type_name === 'issue_commented') {
                    break
                }
                messageTemplate += `<b>✏️ Issue has been updated</b>`
                messageTemplate += `

<b>🗂 Project:</b> ${projectName}
<b>📝 Task Name:</b>
${issueSummary}
`
                messageTemplate += `<b>
📝 Modified part:</b>
`
                if (changeLog?.items && Array.isArray(changeLog.items)) {
                    changeLog.items.forEach(item => {
                        const field = item.field;
                        const fromString = item.fromString;
                        const toString = item.toString;

                        messageTemplate += `<b> • ${field}:</b> ${fromString ? `from <i>${fromString}</i> to` : ``} <i>${toString}</i>`

                    });
                } else {
                    console.log("No changelog items found.");
                }

                break
            }

        case 'jira:issue_deleted':
            {
                messageTemplate += `<b>❌ Issue has been deleted</b>`
                messageTemplate += messageTemplateUser;
                messageTemplate += `
<b>🗂 Project:</b> ${projectName}
    • <b>🎫 Issue Key:</b> ${issueKey}

<b>📝 Task Name:</b> ${issueSummary}
                `
                break
            }

        case 'comment_created':
            {
                messageTemplate += `<b>💬 New comment added!</b>`
                messageTemplate += `

<b>🗂 Project:</b> ${projectName}
<b>📝 Task Name:</b>
${issueSummary}
`
                messageTemplate += `💬 Comment: ${issueComment}`
                break
            }

        case 'comment_updated':
            {
                messageTemplate += `<b>✏️ Comment was updated.</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        /*
    case 'comment_deleted':
        {
            messageTemplate += `<b>🗑️ Comment deleted</b>`
            messageTemplate += messageTemplateUser;

            messageTemplate += `💬 Comment: ${issueComment}`
            break
        }*/

        case 'jira:worklog_updated':
            {
                messageTemplate += `<b>✏️ Worklog has been updated</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'jira:worklog_deleted':
            {
                messageTemplate += `<b>❌ Worklog has been deleted</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        /*
                case 'issuelink_created':
                    {
                        messageTemplate += `<b>🆕 New issue link has been created</b>`
                        messageTemplate += messageTemplateUser;
                        break
                    }
        
                case 'issuelink_deleted':
                    {
                        messageTemplate += `<b>❌ Issue link has been deleted</b>`
                        messageTemplate += messageTemplateUser;
                        break
                    }
        */


        case 'project_created':
            {
                messageTemplate += `<b>🆕 New project has been created</b>`
                messageTemplate += messageTemplateUser;
                break
            }


        case 'project_updated':
            {
                messageTemplate += `<b>✏️ Project has been updated</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'project_deleted':
            {
                messageTemplate += `<b>❌ Project has been deleted</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'board_created':
            {
                messageTemplate += `<b>🆕 New board has been created</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'board_updated':
            {
                messageTemplate += `<b>✏️ Board has been updated</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'board_deleted':
            {
                messageTemplate += `<b>❌ Board has been deleted</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'user_created':
            {
                messageTemplate += `<b>🆕 New user has been created</b>`
                messageTemplate += messageTemplateUser;
                break
            }

        case 'user_updated':
            {
                messageTemplate += `<b>✏️ User has been updated</b>`
                messageTemplate += messageTemplateUser;

                break
            }

        case 'user_deleted':
            {
                messageTemplate += `<b>❌ User has been deleted</b>`
                messageTemplate += messageTemplateUser;

                break
            }

    }

    try {
        // Notify assignee
        const assigneeResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [assigneEmail]
        );
        if (assigneeResult.rows.length > 0) {
            const chatId = assigneeResult.rows[0].telegram_id;
            await sendMessageBot1(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        // Notify reporter
        const reporterResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [reporterEmail]
        );
        if (reporterResult.rows.length > 0) {
            const chatId = reporterResult.rows[0].telegram_id;
            await sendMessageBot1(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        return res.status(200).json({ message: "Notifications sent." });
    } catch (err) {
        console.error("Error sending notifications:", err);
        return res.status(500).send("Server error");
    }

});

app.post('/jirabotapi', async (req, res) => {
    const body = req.body;

    if (!body || !body.message) {
        console.log("❗ Invalid Telegram payload:", body)
        return res.sendStatus(400);
    }

    const message = body.message;
    const chatId = message.chat.id;
    if (!message.text) return res.sendStatus(200);
    const text = message.text.trim();

    const MainMenuKeyboard = async (chatId) => {
        const admin = await isAdmin(chatId)
        if (admin) {
            return {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Ask for access' }, { text: 'Projects List' }],
                        [{ text: '📋 Managers List' }, { text: '⚙️ Admin Panel' }],
                        [{ text: "Add manager" }]
                    ],
                    resize_keyboard: true
                }
            };
        } else {
            return {
                reply_markup: {
                    keyboard: [
                        [{ text: 'Ask for access' }, { text: 'Projects List' }]
                    ],
                    resize_keyboard: true
                }
            };
        }

    };

    if (text === '/start') {
        await sendMessageBot2(chatId, "Welcome, This bot is connected to your jira software", await MainMenuKeyboard(chatId))

        return res.sendStatus(200)
    }
})


app.post("/webhook", async (req, res) => {
    const body = req.body;

    // callback query
    if (body.callback_query) {
        const callback = body.callback_query;
        const chatId = callback.message.chat.id;
        const data = callback.data;


        if (!await isAdmin(chatId)) {
            await sendMessageBot1(chatId, "🚫 You are not authorized for this action.");
            return res.sendStatus(200);
        }

        if (data.startsWith('delete_user:')) {
            const userId = data.split(':')[1];
            await pool.query("DELETE FROM jira_users WHERE id = $1", [userId]);
            await sendMessageBot1(chatId, `🗑 User deleted.`);
            return res.sendStatus(200);
        }

        if (data.startsWith('toggle_admin:')) {
            const userId = data.split(':')[1];
            const user = await pool.query("SELECT is_admin FROM jira_users WHERE id = $1", [userId]);
            if (user.rows.length > 0) {
                const newStatus = !user.rows[0].is_admin;
                await pool.query("UPDATE jira_users SET is_admin = $1 WHERE id = $2", [newStatus, userId]);
                await sendMessageBot1(chatId, `🔁 User admin status changed to: ${newStatus ? '✅ Admin' : '❌ Not Admin'}`);
            } else {
                await sendMessageBot1(chatId, `❗ User not found.`);
            }
            return res.sendStatus(200);
        }

        if (data.startsWith('edit_user:')) {
            const userId = data.split(':')[1];
            const user = await pool.query("SELECT * FROM jira_users WHERE id = $1", [userId]);
            if (user.rows.length === 0) {
                await sendMessageBot1(chatId, "❗ User not found.");
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

            await sendMessageBot1(chatId, `📧 Current email: ${user.rows[0].email}\nEnter the new email:`);
            return res.sendStatus(200);
        }

        return res.sendStatus(200);
    }

    if (!body || !body.message) return res.sendStatus(400);

    const message = body.message;
    const chatId = message.chat.id;
    const text = message.text?.trim();

    // const admin = await isAdmin(chatId)
    // console.log(admin)

    if (!text) return res.sendStatus(200);

    // Handle commands
    if (text === '/start') {
        await sendMessageBot1(chatId, `👋 Welcome! This bot is connected to your Jira system.
Use /register to sign up or /update to change your information.`);
        return res.sendStatus(200);
    }

    if (text === '/register') {
        const checkUser = await pool.query("SELECT * FROM jira_users WHERE telegram_id = $1", [chatId]);

        if (checkUser.rows.length > 0) {
            await sendMessageBot1(chatId, `⚠️ You are already registered with email: ${checkUser.rows[0].email}\nIf you want to change it, use /update`);
            return res.sendStatus(200);
        }

        userStates[chatId] = { step: 'awaiting_email', data: {}, mode: 'register' };
        await sendMessageBot1(chatId, `📧 Please enter your *Jira email address*:\nType /cancel to abort.`, { parse_mode: 'Markdown' });
        return res.sendStatus(200);
    }

    if (text === '/update') {
        const checkUser = await pool.query("SELECT * FROM jira_users WHERE telegram_id = $1", [chatId]);

        if (checkUser.rows.length === 0) {
            await sendMessageBot1(chatId, `⚠️ You are not registered yet. Please use /register first.`);
            return res.sendStatus(200);
        }

        userStates[chatId] = { step: 'awaiting_email', data: {}, mode: 'update' };
        await sendMessageBot1(chatId, `📧 Enter your new *Jira email address* to update:\nType /cancel to abort.`, { parse_mode: 'Markdown' });

        return res.sendStatus(200);
    }

    if (text === '/cancel') {
        if (userStates[chatId]) {
            delete userStates[chatId];
            await sendMessageBot1(chatId, "❌ Operation cancelled.");
        } else {
            await sendMessageBot1(chatId, "ℹ️ Nothing to cancel.");
        }
        return res.sendStatus(200);
    }


    // Awaiting email
    if (userStates[chatId]?.step === 'awaiting_email') {
        if (!isValidEmail(text)) {
            await sendMessageBot1(chatId, "❌ Invalid email format. Please enter a valid Jira email.\nType /cancel to abort.");
            return res.sendStatus(200);
        }

        const mode = userStates[chatId].mode;
        const existing = await pool.query("SELECT * FROM jira_users WHERE email = $1", [text]);

        if (mode === 'register' && existing.rows.length > 0) {
            await sendMessageBot1(chatId, "⚠️ This email is already registered. Use /update to change your info.\nType /cancel to abort.");
            delete userStates[chatId];
            return res.sendStatus(200);
        }

        if (mode === 'update' && existing.rows.length > 0 && existing.rows[0].telegram_id !== chatId) {
            await sendMessageBot1(chatId, "⚠️ This email is already used by another user. Please use a different one.");
            delete userStates[chatId];
            return res.sendStatus(200);
        }


        const code = Math.floor(100000 + Math.random() * 900000);
        userStates[chatId].data.verificationCode = code;
        await sendVerificationCode(text, code);
        await sendMessageBot1(chatId, `📩 A verification code has been sent to your email. Please enter the code:\nType /cancel to abort.`);

        userStates[chatId].data.email = text;
        userStates[chatId].step = 'awaiting_verification_code';
        return res.sendStatus(200);
    }

    if (userStates[chatId]?.step === 'awaiting_verification_code') {
        if (text === userStates[chatId].data.verificationCode.toString()) {
            userStates[chatId].step = 'awaiting_username';
            await sendMessageBot1(chatId, `✅ Verified! Now enter your *Jira username*:`, { parse_mode: 'Markdown' });
        } else {
            await sendMessageBot1(chatId, "❌ Incorrect code. Please try again.");
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

            await sendMessageBot1(chatId,
                `✅ Your info has been ${userStates[chatId].mode === 'register' ? 'registered' : 'updated'}!\n📧 Email: ${email}\n👤 Username: ${username}`
            );
        } catch (err) {
            console.error("DB save error:", err);
            await sendMessageBot1(chatId, '❌ Error saving to database.');
        }

        delete userStates[chatId];
        return res.sendStatus(200);
    }

    // show users
    if (text.startsWith('/users')) {
        const admin = await isAdmin(chatId)
        if (admin) {
            const users = await pool.query("SELECT id, username, email, is_admin FROM jira_users");

            if (users.rows.length === 0) {
                await sendMessageBot1(chatId, "📭 No registered users.");
                return res.sendStatus(200);
            }

            for (const user of users.rows) {
                await sendMessageBot1(chatId,
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
            await sendMessageBot1(chatId, "🚫 You are not authorized to use this command.");
        }
        return res.sendStatus(200);
    }

    // Help 
    if (text === '/help') {
        await sendMessageBot1(chatId, `📌 Available commands:
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


