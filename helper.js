const nodemailer = require('nodemailer');
const https = require('https')
const TelegramBot = require('node-telegram-bot-api');
const pool = require('./db')
const dotenv = require("dotenv");
const fetch = require('node-fetch')
dotenv.config();

// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
// const BOT_URL = process.env.BOT_URL;

const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // <- ignore SSL errors (temporary fix)
});

const { JIRA_USERNAME, JIRA_PASSWORD, JIRA_BASE_URL } = process.env;
console.log("👉 Jira Base URL:", JIRA_BASE_URL);
// admin check
const ADMIN_IDS = process.env.ADMIN_IDS

// Telegram connection
const TELEGRAM_TOKEN1 = process.env.TELEGRAM_TOKEN_1_TEST;
const TELEGRAM_TOKEN2 = process.env.TELEGRAM_TOKEN_2_TEST;

if (!TELEGRAM_TOKEN1) {
    console.log('Missing TELEGRAM TOKEN in .env')
    process.exit(1);
}
if (!TELEGRAM_TOKEN2) {
    console.log('Missing TELEGRAM TOKEN in .env')
    process.exit(1);
}

// Load tokens from .env
const bot1 = new TelegramBot(TELEGRAM_TOKEN1, { polling: true });
const bot2 = new TelegramBot(TELEGRAM_TOKEN2, { polling: true });

const sendMessageBot1 = (chatId, text, options = {}) => bot1.sendMessage(chatId, text, options);
const sendMessageBot2 = (chatId, text, options = {}) => bot2.sendMessage(chatId, text, options);

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

// Fetch data from jira
async function getJiraProjects() {
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/2/project`, {
        method: "GET",
        headers: {
            Authorization: "Basic " + Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString("base64"),
            "Content-Type": "application/json"
        },
        agent: new (require("https").Agent)({ rejectUnauthorized: false }) // ignore SSL cert error
    });

    if (!response.ok) throw new Error("Failed to fetch Jira projects");

    return await response.json();
}

async function sendPaginatedProjects(chatId, projects, page) {
    const pageSize = 10;
    const start = page * pageSize;
    const end = start + pageSize;
    const pageProjects = projects.slice(start, end);

    let messageText = `📁 *Jira Projects* (Page ${page + 1})\n\n`;
    pageProjects.forEach((p, i) => {
        messageText += `${i + 1}. ${p.name}\n`;
    });

    const buttons = pageProjects.map((_, idx) => [
        { text: `${idx + 1}`, callback_data: `project_detail:${start + idx}` }
    ]);

    const navigationButtons = [];
    if (start > 0) navigationButtons.push({ text: "⬅️ Prev", callback_data: `project_page:${page - 1}` });
    if (end < projects.length) navigationButtons.push({ text: "Next ➡️", callback_data: `project_page:${page + 1}` });

    await sendMessageBot2(chatId, messageText, {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [...buttons, navigationButtons.length ? navigationButtons : []]
        }
    });
}

async function getBoardsByProject(projectKeyOrId) {
    const response = await fetch(`${JIRA_BASE_URL}/rest/agile/1.0/board?projectKeyOrId=${projectKeyOrId}`, {
        method: "GET",
        headers: {
            Authorization: "Basic " + Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString("base64"),
            "Content-Type": "application/json"
        },
        agent: new (require("https").Agent)({ rejectUnauthorized: false }) // ignore SSL cert error
    });

    if (!response.ok) throw new Error("Failed to fetch boards");

    const data = await response.json();
    return data; // List of boards

}

async function jiraRequest(endpoint) {
    const response = await fetch(`${JIRA_BASE_URL}${endpoint}`, {
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString('base64'),
            'Accept': 'application/json'
        },
        agent: new (require("https").Agent)({ rejectUnauthorized: false })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jira request failed: ${response.status} ${errorText}`);
    }

    return await response.json();
}

async function getIssuesByBoardId(boardId) {
    const allIssues = [];
    let startAt = 0;
    const maxResults = 1000; // 50 is the default and safe limit

    while (true) {
        const url = `${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/issue?startAt=${startAt}&maxResults=${maxResults}`;
        console.log("📡 Fetching:", url);

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: "Basic " + Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString("base64"),
                "Content-Type": "application/json"
            },
            agent: new (require("https").Agent)({ rejectUnauthorized: false })
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error("❌ Status:", response.status);
            console.error("❌ Body:", errorBody);
            throw new Error("Failed to fetch issues from board");
        }

        const data = await response.json();
        allIssues.push(...data.issues);

        if (data.issues.length < maxResults) break;
        startAt += maxResults;
    }

    return { issues: allIssues };
}

async function fetchAndSortStatuses(projectId) {
    const url = `${JIRA_BASE_URL}/rest/api/2/project/${projectId}/statuses`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: "Basic " + Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString("base64"),
            "Content-Type": "application/json"
        },
        agent: new (require("https").Agent)({ rejectUnauthorized: false })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("❌ Status:", response.status);
        console.error("❌ Body:", errorBody);
        throw new Error("Failed to fetch statuses");
    }

    const allStatusesResponse = await response.json();

    // Flatten all status names
    const statusMap = {};
    allStatusesResponse.forEach(workflow => {
        workflow.statuses.forEach(status => {
            statusMap[status.name] = status;
        });
    });

    const desiredStatusOrder = [
        "Blocked",
        "«Заблокировано»",
        "Backlog",
        "Отставание",
        "Analitik",
        "Designer",
        "Ready for Developing",
        "Selected for Development",
        "Готово к разработке",
        "In progress",
        "В процессе",
        "В работе",
        "Rework",
        "Переработка",
        "QA",
        "Done",
        "Готово"
    ];

    const sortedStatuses = desiredStatusOrder
        .filter(name => statusMap[name])
        .map(name => statusMap[name]);

    return sortedStatuses;
}
async function getBoardColumns(boardId) {
    const response = await fetch(`${JIRA_BASE_URL}/rest/agile/1.0/board/${boardId}/configuration`, {
        method: "GET",
        headers: {
            Authorization: "Basic " + Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString("base64"),
            "Content-Type": "application/json"
        },
        agent: new (require("https").Agent)({ rejectUnauthorized: false })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch board configuration: ${errorText}`);
    }

    const config = await response.json();

    return config.columnConfig.columns.map(col => ({
        name: col.name,
        statuses: col.statuses.map(s => s.name)
    }));
}

const saveUserNavigation = async (chatId, data) => {
    try {
        await pool.query(`INSERT INTO user_navigation (chat_id, navigation_stack)
            VALUES ($1, $2)
            ON CONFLICT (chat_id) DO UPDATE
            SET navigation_stack = $2, updated_at = CURRENT_TIMESTAMP`,
            [chatId, JSON.stringify(data)])
    } catch (err) {
        console.log("Error saving user navigation to the database:", err)
    }

}

const getUserNavigation = async (chatId) => {
    try {
        const result = await pool.query('SELECT navigation_stack FROM user_navigation WHERE chat_id = $1', [chatId])
        if (result.rows.length === 0) {
            return null
        }

        return result.rows[0].navigation_stack
    } catch (err) {
        console.log("Error fetching user navigation:", err)
        return null;
    }
}



module.exports = {
    isValidEmail,
    sendVerificationCode,
    isAdmin,
    bot1,
    bot2,
    sendMessageBot1,
    sendMessageBot2,
    getJiraProjects,
    getBoardsByProject,
    getIssuesByBoardId,
    fetchAndSortStatuses,
    jiraRequest,
    getBoardColumns,
    saveUserNavigation,
    getUserNavigation
};