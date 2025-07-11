const nodemailer = require('nodemailer');
const https = require('https')
const TelegramBot = require('node-telegram-bot-api');
const pool = require('./db')
const dotenv = require("dotenv");
const fetch = require('node-fetch')
dotenv.config();

const messageIdCashe = {}

const httpsAgent = new https.Agent({
    rejectUnauthorized: false, // 
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

    try {
        const result = await pool.query(
            "SELECT is_admin FROM jira_users WHERE telegram_id = $1",
            [chatId]
        );
        // console.log("result is admin: ", result)

        if (ADMIN_IDS.includes(chatId) || (result.rows.length > 0 && result.rows[0].is_admin === true)) {
            console.log("Admin: ", true)
            return true
        } else return false
    } catch (err) {
        console.error("Error checking admin status:", err);
        return false;
    }



};


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

const showPage = async (chatId, page, components, totalPages) => {
    const size = 10;
    const startIndex = (page - 1) * size;
    const endIndex = startIndex + size;
    const currentComponents = components.slice(startIndex, endIndex);

    let messageText = `📋 *Components for Main Board (Page ${page} of ${totalPages})*\n\n`;
    currentComponents.forEach((component, i) => {
        messageText += `${startIndex + i + 1}. *${component.name}*\n`;
    });

    const inlineButtons = [];
    const buttonRow1 = currentComponents.slice(0, 5).map((_, i) => ({
        text: `${startIndex + i + 1}`,
        callback_data: `component_detail:${startIndex + i}`
    }));
    const buttonRow2 = currentComponents.slice(5, 10).map((_, i) => ({
        text: `${startIndex + 5 + i + 1}`,
        callback_data: `component_detail:${startIndex + 5 + i}`
    }));

    inlineButtons.push(buttonRow1);
    if (buttonRow2.length > 0) inlineButtons.push(buttonRow2);

    const navButtons = [];
    if (page > 1) {
        navButtons.push({ text: '⬅️ Prev', callback_data: `projects_page:${page - 1}` });
    }
    if (page < totalPages) {
        navButtons.push({ text: '➡️ Next', callback_data: `projects_page:${page + 1}` });
    }

    await sendMessageBot2(chatId, messageText, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [...inlineButtons, navButtons.length ? navButtons : []]
        }
    });
}

async function getComponentsFromMainBoard(projectId) {
    const response = await fetch(`${JIRA_BASE_URL}/rest/api/2/project/${projectId}/components`, {
        method: 'GET',
        headers: {
            Authorization: `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString('base64')}`,
            'Content-Type': 'application/json',
        },
        agent: new (require("https").Agent)({ rejectUnauthorized: false })
    });

    if (!response.ok) {
        console.error("Failed to fetch components");
        return [];
    }

    return await response.json();
}
async function getIssuesByComponentId(componentId, startAt = 0, allIssues = []) {
    const jql = `component = ${componentId}`;
    const url = `${JIRA_BASE_URL}/rest/api/2/search?jql=${encodeURIComponent(jql)}&fields=summary,issuetype,status&startAt=${startAt}&maxResults=50`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Basic ${Buffer.from(`${JIRA_USERNAME}:${JIRA_PASSWORD}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            agent: new (require("https").Agent)({ rejectUnauthorized: false })
        });

        if (response.status === 404) {
            console.error("Component not found.");
            return [];
        } else if (!response.ok) {
            console.error(`Error: ${response.status} - ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        allIssues = allIssues.concat(data.issues);

        if (data.total > startAt + 50) {
            return await getIssuesByComponentId(componentId, startAt + 50, allIssues);
        }

        return allIssues;
    } catch (error) {
        console.error('Error fetching issues:', error);
        return [];
    }
}

async function groupIssuesByStatus(issues) {
    const groupedByStatus = issues.reduce((acc, issue) => {
        const statusName = issue.fields?.status?.name || 'Unknown';
        if (!acc[statusName]) acc[statusName] = [];
        acc[statusName].push(issue);
        return acc;
    }, {});

    return groupedByStatus;
}

async function sendPaginatedStatusNames(groupedStatuses, chatId, page = 1, componentName, componentId) {
    try {
        const statusNames = Object.keys(groupedStatuses);
        const statusesPerPage = 5;
        const totalPages = Math.ceil(statusNames.length / statusesPerPage);

        const currentStatusNames = statusNames.slice((page - 1) * statusesPerPage, page * statusesPerPage);

        let message = `🗂 *Statuses for ${componentName} (Page ${page} of ${totalPages})*\n\n`;
        currentStatusNames.forEach((status, idx) => {
            message += `*${idx + 1}. ${status}* — ${groupedStatuses[status].length} issues\n`;
        });

        const inlineKeyboard = [];

        const row1 = currentStatusNames.slice(0, 5).map((status, idx) => ({
            text: `${idx + 1}`,
            callback_data: `status_${status}`
        }));

        if (row1.length > 0) inlineKeyboard.push(row1);

        const navButtons = [];
        if (page < totalPages) {
            navButtons.push({ text: '➡️ Next', callback_data: `next_status_page:${page + 1}` });
        }
        if (page > 1) {
            navButtons.push({ text: '⬅️ Prev', callback_data: `prev_status_page:${page - 1}` });
        }

        if (navButtons.length > 0) {
            inlineKeyboard.push(navButtons);
        }

        const isSubscribed = await pool.query(
            "SELECT 1 FROM project_subscriptions WHERE chat_id = $1 AND project_id = $2",
            [chatId, componentId]
        );

        const notificationButtonText = isSubscribed.rowCount > 0 ? '🔕 Turn Off Notifications' : '🔔 Turn On Notifications';
        const notificationButton = { text: notificationButtonText, callback_data: `toggle_notify:${componentId}` };

        inlineKeyboard.push([notificationButton]);

        inlineKeyboard.push([{ text: '⬅️ Back', callback_data: 'back' }]);

        await sendMessageToUser(message, inlineKeyboard, chatId);

    } catch (error) {
        console.error("Error while sending paginated status names:", error);
        await sendMessageToUser("❌ An error occurred while fetching statuses. Please try again.", chatId);
    }
}

async function sendIssuesForStatus(statusName, chatId, groupedStatuses) {
    const issues = groupedStatuses[statusName];

    const inlineKeyboard = [
        [{ text: '⬅️ Back', callback_data: 'back' }]
    ];

    if (!issues || issues.length === 0) {
        await sendMessageToUser(`No issues found for status: ${statusName}`, inlineKeyboard, chatId);
        return;
    }

    let message = `🔎 *Issues for Status: ${statusName}*\n\n`;
    issues.forEach((issue, idx) => {
        message += `${idx + 1}. ${issue.fields.summary} - ${issue.key}\n`;
    });



    await sendMessageToUser(message, inlineKeyboard, chatId);
}

async function sendMessageToUser(message, inlineKeyboard, chatId) {
    const sentMessage = await bot2.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    });

    const messageId = sentMessage.message_id
    messageIdCashe[chatId] = {
        messageId: messageId,
        message: message,
        inlineKeyboard: inlineKeyboard,
        chatId: chatId
    }
}

async function editUserMessage(message, inlineKeyboard, chatId, messageId) {

    try {
        if (!messageId) {
            console.error("Message ID is undefined or invalid.");
            return;
        }

        if (!Array.isArray(inlineKeyboard) || !inlineKeyboard.every(row => Array.isArray(row))) {
            console.error("Invalid inlineKeyboard format. Expected an array of arrays:", inlineKeyboard);
            await bot2.sendMessage(chatId, "❌ Invalid keyboard format. Please try again.");
            return;
        }

        const validatedKeyboard = inlineKeyboard.map(row =>
            row.filter(button => button.text && (button.callback_data || button.url))
        );

        if (validatedKeyboard.every(row => row.length === 0)) {
            console.error("No valid buttons in inlineKeyboard:", inlineKeyboard);
            await bot2.sendMessage(chatId, "❌ No valid buttons provided. Please try again.");
            return;
        }

        const sentMessage = await bot2.editMessageText(message, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: validatedKeyboard
            }
        });

        messageId = sentMessage.message_id
        messageIdCashe[chatId] = {
            messageId: messageId,
            message: message,
            inlineKeyboard: inlineKeyboard,
            chatId: chatId
        }
    } catch (err) {
        console.error("Error editing message:", err);
        await bot2.sendMessage("❌ An error occurred while updating the message. Please try again later.");
    }
}

async function filterComponents(components, dataRows) {
    const projectIdsFromDb = dataRows.map(row => row.project_id);

    const filteredComponents = components.filter(component =>
        projectIdsFromDb.includes(parseInt(component.id))
    );

    return filteredComponents;
}



module.exports = {
    isValidEmail,
    sendVerificationCode,
    isAdmin,
    bot1,
    bot2,
    sendMessageBot1,
    sendMessageBot2,
    saveUserNavigation,
    getUserNavigation,
    showPage,
    getComponentsFromMainBoard,
    getIssuesByComponentId,
    groupIssuesByStatus,
    sendPaginatedStatusNames,
    sendIssuesForStatus,
    messageIdCashe,
    editUserMessage,
    filterComponents
};