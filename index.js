const express = require('express');
const fetch = require('node-fetch');
const dotenv = require('dotenv');
const pool = require("./db");
const bodyParser = require("body-parser");
const [sendMessage, isValidEmail] = require('./helper')

dotenv.config();


const app = express();
app.use(bodyParser.json())

const userStates = {};

app.get("/", async (req, res) => {
    console.log(req.body)
    res.send('✅ Bot and server are running.');
})

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

app.post("/webhook-jira", async (req, res) => {

    const displayName = req.body?.issue?.fields?.assignee?.displayName;
    const username = req.body?.user?.name;
    const userEmail = req.body?.issue?.fields?.assignee?.emailAddress
    const porjectName = req.body?.issue?.fields?.project?.name
    const issueTypeName = req.body?.issue?.fields?.issuetype?.name
    const issueTypeDescription = req.body?.issue?.fields?.issuetype?.description
    const issuePriority = req.body?.issue?.fields?.priority?.name
    const issueStatus = req.body?.issue?.fields?.status?.name
    const issueSummary = req.body?.issue?.fields?.summary

    try {
        const result = await pool.query(`SELECT telegram_id FROM jira_users WHERE email = ($1)`, [userEmail])
        if (result.rows.length > 0) {
            const chatId = result.rows[0].telegram_id;
            sendMessage(chatId, `
Assigne name: ${displayName} \n
Assigne username: ${username} \n
Project name: ${porjectName} \n
Issue type: ${issueTypeName} \n
Issue description: ${issueTypeDescription} \n
Issue priority: ${issuePriority} \n
Issue status; ${issueStatus} \n
Summary: ${issueSummary} \n
                `)
            // You can now use chatId
        } else {
            // No user found
            console.log('no user found')
        }

        res.json(result.rows);


    } catch (err) {
        console.log(err)
    }
    
})

app.post("/webhook", async (req, res) => {
    const message = req.body.message;
    if (!message || !message.text) return res.sendStatus(200);

    const chatId = message.chat.id;
    const text = message.text.trim();

    switch (text) {
        case '/start': {
            await sendMessage(chatId, `👋 Welcome! This bot is connected to your Jira system.\nPlease register if you are not registered before /register`);
            return res.sendStatus(200);
        }

        case '/register': {
            userStates[chatId] = { step: 'awaiting_email', data: {} };
            await sendMessage(chatId, `📧 Please enter your *Jira email address*:`, { parse_mode: 'Markdown' });
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


const PORT = process.env.PORT || 3000
app.listen(PORT, (err) => {
    if (err) {
        console.log(err)
    } else {
        console.log('Listening for jira webhook on port ', PORT)
    }
})


