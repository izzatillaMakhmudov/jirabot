const express = require('express');
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
    getJiraProjects,
    getBoardsByProject,
    getIssuesByBoardId,
    fetchAndSortStatuses,
    jiraRequest
} = require('./helper');


dotenv.config();

const app = express();
app.use(bodyParser.json())

// States
const userPages = {}
const projectCache = {};
const userStates = {};
const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const statusLookup = {};
const statusPages = {};

const boardSelectionCache = {};





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

app.post('/project-webhook', async (req, res) => {
    const event = req.body;

    if (!event || !event.issue || !event.issue.fields) {
        return res.sendStatus(200); // Ignore invalid events
    }

    const projectId = event.issue.fields.project.id;
    const issueKey = event.issue.key;
    const summary = event.issue.fields.summary;
    const changelog = event.changelog || {};
    const user = event.user?.displayName || 'Unknown user';

    const rows = await pool.query(
        `SELECT chat_id FROM project_subscriptions WHERE project_id = $1`,
        [projectId]
    );

    if (rows.rowCount === 0) return res.sendStatus(200); // No subscribers

    const changeText = changelog.items?.map(item => {
        return `• *${item.field}*: "${item.fromString || '–'}" → "${item.toString || '–'}"`;
    }).join('\n') || '_No specific changes listed._';

    const message = `🛠 *${user}* updated issue *${issueKey}*\n📝 ${summary}\n\n${changeText}`;

    for (const { chat_id } of rows.rows) {
        await bot2.sendMessage(chat_id, message, { parse_mode: 'Markdown' });
    }

    res.sendStatus(200);
})

app.post("/webhook-jira", async (req, res) => {
    const changeLog = req.body?.changelog
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

        // case 'comment_updated': { }

        // case 'comment_deleted': { }

        // case 'jira:worklog_updated': { }

        // case 'jira:worklog_deleted': { }

        // case 'issuelink_created': { }

        // case 'issuelink_deleted': { }

        // case 'project_created': { }

        // case 'project_updated': { }

        // case 'project_deleted': { }

        // case 'board_created': { }

        // case 'board_updated': { }

        // case 'board_deleted': { }

        // case 'user_created': { }

        // case 'user_updated': { }

        // case 'user_deleted': { }

    }
    try {
        // Get both telegram IDs from DB
        const assigneeResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [assigneEmail]
        );

        const reporterResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [reporterEmail]
        );

        const assigneeId = assigneeResult.rows[0]?.telegram_id;
        const reporterId = reporterResult.rows[0]?.telegram_id;

        // Set to avoid duplicates
        const notifiedUsers = new Set();

        if (assigneeId) {
            notifiedUsers.add(assigneeId);
        }

        if (reporterId) {
            notifiedUsers.add(reporterId);
        }

        // Send message to all unique IDs
        for (const id of notifiedUsers) {
            await sendMessageBot1(id, messageTemplate, { parse_mode: "HTML" });
        }

        return res.status(200).json({ message: "Notifications sent." });

    } catch (err) {
        console.error("Error sending notifications:", err);
        return res.status(500).send("Server error");
    }


});


// ============= Managers bot =============
const navigationStack = {}; // key: chatId, value: array of previous messages

async function pushAndSend(bot, chatId, text, options = {}) {
    const msg = await bot.sendMessage(chatId, text, options);
    if (!navigationStack[chatId]) navigationStack[chatId] = [];
    navigationStack[chatId].push({
        message_id: msg.message_id,
        text,
        reply_markup: options.reply_markup || {}
    });
    return msg;
}

bot2.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const contact = msg.contact;

    const sendMessage = (text, options = {}) => bot2.sendMessage(chatId, text, options);

    const MainMenuKeyboard = async () => {
        const admin = await isAdmin(chatId);
        return {
            reply_markup: {
                keyboard: admin
                    ? [
                        [{ text: 'Ask for access' }, { text: 'Projects List' }],
                        [{ text: '📋 Managers List' }, { text: "Add manager" }]
                    ]
                    : [
                        [{ text: 'Ask for access' }, { text: 'Projects List' }]
                    ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
    };

    // Cancel handler
    if (text === '/cancel') {
        delete userStates[chatId];
        navigationStack[chatId] = []; // reset navigation stack
        await sendMessage("❌ Cancelled. Back to main menu.", await MainMenuKeyboard());
    }

    // Contact handler
    if (contact) {
        const phone = '+' + contact.phone_number;
        try {
            const result = await pool.query(
                `UPDATE managers SET telegram_chat_id = $1 WHERE phone_number = $2`,
                [chatId, phone]
            );

            if (result.rowCount === 0) {
                await sendMessage(`⚠️ Your phone number is not recognized. Please ask an admin to register you.`, await MainMenuKeyboard());
            } else {
                await sendMessage(`✅ Thank you! You’ve been granted access.`, await MainMenuKeyboard());
            }
        } catch (err) {
            console.error("❌ Error updating Telegram ID:", err);
            await sendMessage("❌ Failed to link your phone number. Please try again later.");
        }
        return;
    }

    // Start
    if (text === '/start') {
        navigationStack[chatId] = []; // reset navigation stack
        await sendMessage("👋 Welcome! This bot is connected to your Jira software.", await MainMenuKeyboard());
        return;
    }

    // Add manager
    if (text === 'Add manager' || text === '/add_manager') {
        userStates[chatId] = { step: 'awaiting_managers_phone' };
        await sendMessage("📱 Please enter the manager’s *phone number*:", {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [[{ text: '/cancel' }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    if (userStates[chatId]?.step === 'awaiting_managers_phone') {
        const phoneNumber = text;
        if (!/^\+?\d{7,15}$/.test(phoneNumber)) {
            await sendMessage("❗ Invalid phone number. Please enter a valid one (e.g., +998901234567):");
            return;
        }

        try {
            await pool.query(`INSERT INTO managers (phone_number) VALUES ($1)`, [phoneNumber]);
            await sendMessage("✅ Phone number has been saved to the database.", await MainMenuKeyboard());
        } catch (err) {
            console.error("DB save error:", err);
            await sendMessage("❌ Error saving to the database.");
        }

        delete userStates[chatId];
        return;
    }

    // Managers list
    if (text === '/managers_list' || text === '📋 Managers List') {
        const admin = await isAdmin(chatId);
        if (admin) {
            try {
                const result = await pool.query(`SELECT * FROM managers`);
                const managers = result.rows;

                if (managers.length === 0) {
                    await sendMessage("📭 No registered managers.");
                    return; // ✅ stop execution
                }

                for (const manager of managers) {
                    const phone = manager.phone_number || 'Not provided';
                    const email = manager.jira_email || '❌ Not registered yet';
                    const telegramId = manager.telegram_chat_id || '❌ Not linked';

                    await sendMessage(
                        `👤 *Phone:* ${phone}\n📧 *Jira Email:* ${email}\n💬 *Telegram ID:* ${telegramId}`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        { text: '✏️ Edit', callback_data: `edit_user:${manager.id}` },
                                        { text: '🗑 Delete', callback_data: `delete_user:${manager.id}` }
                                    ]
                                ]
                            }
                        }
                    );
                }
            } catch (err) {
                console.error("❌ Error fetching managers:", err);
                await sendMessage("⚠️ Error retrieving managers from the database.");
            }
        } else {
            await sendMessage("🚫 You are not authorized to use this command.");
        }
        return; // ✅ no res.sendStatus
    }


    // Ask for access
    if (text === 'Ask for access') {
        await sendMessage('📲 To get access, please share your phone number:', {
            reply_markup: {
                keyboard: [[{ text: '📤 Share phone number', request_contact: true }], [{ text: '/cancel' }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return;
    }

    // Projects List
    if (text === 'Projects List') {
        try {
            const all = await getJiraProjects();
            if (!Array.isArray(all) || all.length === 0) {
                await sendMessage("⚠️ No projects found.");
                return;
            }

            const page = 1;
            const size = 10;
            const totalPages = Math.ceil(all.length / size);
            const subset = all.slice(0, size);

            projectCache[chatId] = all;
            setTimeout(() => delete projectCache[chatId], 5 * 60 * 1000); // Clear cache after 5 mins

            const messageText = [
                `📋 *Jira Projects (${page}/${totalPages})*`,
                ...subset.map((p, i) => `${i + 1}. ${p.name}`)
            ].join('\n');

            const keyboard = [];
            for (let i = 0; i < subset.length; i += 5) {
                keyboard.push(
                    subset.slice(i, i + 5).map((project, j) => {
                        const localIndex = i + j;
                        const globalIndex = (page - 1) * size + localIndex;
                        const emoji = emojiNumbers[localIndex] || `${localIndex + 1}`;
                        return {
                            text: emoji,
                            callback_data: `project_detail:${globalIndex}`
                        };
                    })
                );
            }



            if (totalPages > 1) {
                keyboard.push([{ text: '➡️', callback_data: `project_page:${page + 1}` }]);
            }

            await sendMessage(messageText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });

        } catch (err) {
            console.error('Error in /show_projects_list:', err);
            await sendMessage('❌ Failed to load projects from Jira.');
        }
        return;
    }



});


bot2.on('callback_query', async (callback) => {
    const chatId = callback.message.chat.id;
    const data = callback.data;

    const sendMessage = (text, options = {}) => bot2.sendMessage(chatId, text, options);

    // Handle delete_user
    if (data.startsWith('delete_user:')) {
        const userId = data.split(':')[1];
        try {
            await pool.query("DELETE FROM managers WHERE id = $1", [userId]);
            await sendMessage(`🗑 User deleted.`);
        } catch (err) {
            console.error("DB error:", err);
            await sendMessage("❌ Failed to delete user.");
        }
        return;
    }

    // Handle edit_user
    if (data.startsWith('edit_user:')) {
        const userId = data.split(':')[1];
        const user = await pool.query("SELECT * FROM managers WHERE id = $1", [userId]);

        if (user.rows.length === 0) {
            await sendMessage("❗ Manager not found.");
            return;
        }

        userStates[chatId] = {
            step: 'edit_email',
            mode: 'edit',
            data: {
                id: userId,
                phone: user.rows[0].phone_number,
                email: user.rows[0].jira_email
            }
        };

        await sendMessage(`📧 Current Jira email: ${user.rows[0].jira_email || "❌ Not registered"}\nPlease enter the new Jira email:`);
        return;
    }

    if (data.startsWith('select_board:')) {
        const boardId = parseInt(data.split(':')[1]);
        const boardState = boardSelectionCache[chatId];

        if (!boardState || !boardState.boards.find(b => b.id === boardId)) {
            return await sendMessageBot2(chatId, "⚠️ Board not found or expired.");
        }

        const selectedBoard = boardState.boards.find(b => b.id === boardId);
        const project = boardState.project;
        const projectPage = Math.floor(boardState.projectIndex / 10) + 1;

        try {
            const issueData = await getIssuesByBoardId(boardId);
            const issues = issueData.issues;



            if (!issues.length) {
                await pushAndSend(bot2, chatId, "📭 No issues found in this board.", {
                    reply_markup: {
                        inline_keyboard: [[{ text: '⬅️ Back', callback_data: `project_detail:${boardState.projectIndex}` }]]
                    }
                });
                return;
            }

            const groupedByStatus = issues.reduce((acc, issue) => {
                const status = issue.fields.status?.name || 'Unknown';
                const summary = issue.fields.summary || 'No summary';
                const priority = issue.fields.priority?.name || 'None';
                if (!acc[status]) acc[status] = [];
                acc[status].push(`🔹 *${summary}* (${priority})`);
                return acc;
            }, {});


            const allStatusNames = Object.keys(groupedByStatus);
            const sortedStatuses = await fetchAndSortStatuses(project.id);

            const statusKeys = sortedStatuses
                .map(status => status.name)
                .filter(name => allStatusNames.includes(name));


            if (statusKeys.length === 0) {
                await sendMessageBot2(chatId, "📭 No issues found with known statuses.");
                return;
            }

            statusLookup[chatId] = {
                statuses: statusKeys,
                grouped: groupedByStatus,
                projectPage,
                projectIndex: boardState.projectIndex,
                boardId: selectedBoard.id,
                boardName: selectedBoard.name,
                projectId: project.id
            };

            let message = `🗂 *Issues grouped by Status in "${selectedBoard.name}"*\n\n`;
            statusKeys.forEach((status, idx) => {
                const count = groupedByStatus[status].length;
                message += `*${idx + 1}. ${status}* — ${count} issues\n`;
            });

            const inlineButtons = statusKeys.map((_, i) => ({
                text: `${i + 1}`,
                callback_data: `status_detail:${i}`
            }));

            const inlineKeyboard = [];
            for (let i = 0; i < inlineButtons.length; i += 4) {
                inlineKeyboard.push(inlineButtons.slice(i, i + 4));
            }

            inlineKeyboard.push([{ text: '⬅️ Back', callback_data: `project_detail:${boardState.projectIndex}` }]);


            await pushAndSend(bot2, chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });

        } catch (e) {
            console.error("Error loading issues for selected board:", e);
            await sendMessageBot2(chatId, "❌ Failed to load issues.");
        }

        return;
    }

    if (data.startsWith('toggle_notify:')) {
        const projectId = parseInt(data.split(':')[1], 10);
        const existing = await pool.query(
            `SELECT 1 FROM project_subscriptions WHERE chat_id = $1 AND project_id = $2`,
            [chatId, projectId]
        );

        if (existing.rowCount > 0) {
            await pool.query(`DELETE FROM project_subscriptions WHERE chat_id = $1 AND project_id = $2`, [chatId, projectId]);
            await sendMessage(`🔕 Notifications *disabled* for project ID ${projectId}.`, { parse_mode: 'Markdown' });
        } else {
            await pool.query(`INSERT INTO project_subscriptions (chat_id, project_id) VALUES ($1, $2)`, [chatId, projectId]);
            await sendMessage(`🔔 Notifications *enabled* for project ID ${projectId}.`, { parse_mode: 'Markdown' });
        }

        return;
    }


    if (data.startsWith('project_detail:')) {
        const idx = parseInt(data.split(':')[1], 10);
        const all = projectCache[chatId] || [];

        if (isNaN(idx) || idx < 0 || idx >= all.length) {
            await sendMessageBot2(chatId, "⚠️ Project not found or expired.");
            return;
        }




        const project = all[idx];
        const currentProjectPage = Math.floor(idx / 10) + 1;

        // await sendMessageBot2(chatId, `📁 *${project.name}*\nKey: \`${project.key}\`\nID: \`${project.id}\``, {
        //     parse_mode: 'Markdown'
        // });

        const isSubscribed = await pool.query(
            "SELECT 1 FROM project_subscriptions WHERE chat_id = $1 AND project_id = $2",
            [chatId, project.id]
        );

        try {
            const boards = await getBoardsByProject(project.id);

            if (!boards.values?.length) {
                await sendMessageBot2(chatId, "⚠️ No boards found for this project.");
                return;
            }

            // Store boards temporarily for user
            boardSelectionCache[chatId] = {
                project,
                boards: boards.values,
                projectIndex: idx
            };

            const keyboard = boards.values.map(board => {
                return [
                    {
                        text: board.name,
                        callback_data: `select_board:${board.id}`
                    }
                ];
            });
            keyboard.push([{
                text: isSubscribed.rowCount > 0 ? '🔕 Turn Off Notifications' : '🔔 Turn On Notifications',
                callback_data: `toggle_notify:${project.id}`
            }]);
            keyboard.push([{ text: '⬅️ Back', callback_data: `project_page:${currentProjectPage}` }]);

            // prevent duplicated board selector in history
            const lastView = navigationStack[chatId]?.at(-1);
            if (lastView?.text?.startsWith('🛠 *Select a board')) {
                navigationStack[chatId].pop();
            }


            const lastMsg = navigationStack[chatId]?.at(-1);
            if (!lastMsg?.text?.startsWith(`🛠 *Select a board to view issues for "${project.name}"*`)) {
                await pushAndSend(bot2, chatId, `🛠 *Select a board to view issues for "${project.name}"*:`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
            }



        } catch (e) {
            console.error('Error fetching boards:', e);
            await sendMessageBot2(chatId, "❌ Failed to load boards.");
        }

        return;
    }



    // Handle status_detail
    if (data.startsWith('status_detail:')) {
        const index = parseInt(data.split(':')[1]);
        const state = statusLookup[chatId];
        if (!state) return await sendMessage("⚠️ No status info available.");

        const statusName = state.statuses[index];
        const issues = state.grouped[statusName];
        const pageSize = 10, page = 1;
        const totalPages = Math.ceil(issues.length / pageSize);
        const start = (page - 1) * pageSize;
        const currentIssues = issues.slice(start, start + pageSize);

        let message = `🔎 *Details for Status: ${statusName}*\n📄 Page ${page} of ${totalPages} | Total: ${issues.length} issues\n\n`;
        message += currentIssues.map((issue, i) => `${start + i + 1}. ${issue}`).join('\n');

        const navButtons = [];
        if (page < totalPages) navButtons.push({ text: '➡️ Next', callback_data: `status_page:${index}:${page + 1}` });
        navButtons.push({ text: '⬅️ Back', callback_data: 'go_back' });

        await pushAndSend(bot2, chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [navButtons] }
        });

        return;
    }

    // Handle status_page
    if (data.startsWith('status_page:')) {
        const [_, statusIndexStr, pageStr] = data.split(':');
        const statusIndex = parseInt(statusIndexStr, 10);
        const page = parseInt(pageStr, 10);
        const state = statusLookup[chatId];
        if (!state || isNaN(page)) return;

        const statusName = state.statuses[statusIndex];
        const issues = state.grouped[statusName];
        const pageSize = 10;
        const totalPages = Math.ceil(issues.length / pageSize);
        const start = (page - 1) * pageSize;
        const currentIssues = issues.slice(start, start + pageSize);

        let message = `🔎 *Details for Status: ${statusName}*\n📄 Page ${page} of ${totalPages} | Total: ${issues.length} issues\n\n`;
        message += currentIssues.map((issue, i) => `${start + i + 1}. ${issue}`).join('\n');

        const navButtons = [];
        if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `status_page:${statusIndex}:${page - 1}` });
        if (page < totalPages) navButtons.push({ text: '➡️ Next', callback_data: `status_page:${statusIndex}:${page + 1}` });
        navButtons.push({ text: '⬅️ Back', callback_data: 'go_back' });

        await bot2.deleteMessage(chatId, callback.message.message_id).catch(() => { });
        await pushAndSend(bot2, chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [navButtons] }
        });

        return;
    }

    // Handle project_page
    if (data.startsWith('project_page:')) {
        const page = parseInt(data.split(':')[1], 10);
        const all = projectCache[chatId] || [];
        const total = all.length, size = 10, pages = Math.ceil(total / size);
        if (isNaN(page) || page < 1 || page > pages) return;

        const subset = all.slice((page - 1) * size, page * size);
        const text = [`📋 *Jira Projects (${page}/${pages})*`, ...subset.map((p, i) => `${i + 1}. ${p.name}`)].join('\n');

        const keyboard = [];
        for (let i = 0; i < subset.length; i += 5) {
            keyboard.push(
                subset.slice(i, i + 5).map((project, j) => {
                    const localIndex = i + j;
                    const globalIndex = (page - 1) * size + localIndex;
                    const emoji = emojiNumbers[localIndex] || `${localIndex + 1}`;
                    return {
                        text: emoji,
                        callback_data: `project_detail:${globalIndex}`
                    };
                })
            );
        }



        keyboard.push([
            ...(page > 1 ? [{ text: '⬅️', callback_data: `project_page:${page - 1}` }] : []),
            ...(page < pages ? [{ text: '➡️', callback_data: `project_page:${page + 1}` }] : [])
        ]);


        await bot2.deleteMessage(chatId, callback.message.message_id).catch(() => { });
        await pushAndSend(bot2, chatId, text, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
        });

        return;
    }

    if (data === 'go_back') {
        const state = statusLookup[chatId];
        const history = navigationStack[chatId];
        console.log(history)

        if (!history || history.length < 2) {
            await bot2.deleteMessage(chatId, callback.message.message_id).catch(() => { });
            await sendMessage("⚠️ Nothing to go back to.");
            return;
        }

        const current = history.pop();
        // remove current message
        const previous = history.pop();     // remove previous to re-send clean

        // 1. Go back to grouped statuses (from 🔎 status_detail or page)
        if (current.text.startsWith('🔎 *Details for Status:') && state) {
            let message = `🗂 *Issues grouped by Status in "${state.boardName || 'all boards'}"*\n\n`;
            state.statuses.forEach((status, idx) => {
                const count = state.grouped[status].length;
                message += `*${idx + 1}. ${status}* — ${count} issues\n`;
            });

            const inlineButtons = state.statuses.map((_, i) => ({
                text: `${i + 1}`,
                callback_data: `status_detail:${i}`
            }));

            const inlineKeyboard = [];
            for (let i = 0; i < inlineButtons.length; i += 4) {
                inlineKeyboard.push(inlineButtons.slice(i, i + 4));
            }
            inlineKeyboard.push([{ text: '⬅️ Back', callback_data: `back_to_board_selector:${state.projectIndex}` }]);

            history.pop(); // remove current status detail
            history.pop(); // remove grouped status view (to prevent duplication)

            await bot2.deleteMessage(chatId, callback.message.message_id).catch(() => { });
            await pushAndSend(bot2, chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: inlineKeyboard }
            });
            return;

        }

        // 3. Go back to previous message (default safe fallback)
        await bot2.deleteMessage(chatId, callback.message.message_id).catch(() => { });
        await bot2.sendMessage(chatId, previous.text, {
            parse_mode: 'Markdown',
            reply_markup: previous.reply_markup
        });

        // Do not re-push old message again, or it will loop.
        return;
    }

    if (data.startsWith('back_to_board_selector:')) {
        const idx = parseInt(data.split(':')[1], 10);
        const all = projectCache[chatId] || [];
        console.log(data)
        if (!all[idx]) return await sendMessage("⚠️ Project not found or expired.");

        const project = all[idx];
        const boards = await getBoardsByProject(project.id);

        if (!boards.values?.length) {
            await sendMessage("⚠️ No boards found for this project.");
            return;
        }

        boardSelectionCache[chatId] = {
            project,
            boards: boards.values,
            projectIndex: idx
        };

        const keyboard = boards.values.map(board => [{
            text: board.name,
            callback_data: `select_board:${board.id}`
        }]);

        keyboard.push([{ text: '⬅️ Back', callback_data: `project_detail:${idx}` }]);

        const lastMsg = navigationStack[chatId]?.at(-1);
        if (!lastMsg?.text?.startsWith(`🛠 *Select a board to view issues for "${project.name}"*`)) {
            await pushAndSend(bot2, chatId, `🛠 *Select a board to view issues for "${project.name}"*:`, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });
        }


        return;
    }



    await bot2.answerCallbackQuery(callback.id);
});


// ============= Developers bot =============


bot1.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const sendMessage = (text, options = {}) => bot1.sendMessage(chatId, text, options);

    if (!text) return;

    if (text === '/cancel') {
        if (userStates[chatId]) {
            delete userStates[chatId];
            await sendMessage("❌ Operation cancelled.");
        } else {
            await sendMessage("ℹ️ Nothing to cancel.");
        }
        return;
    }

    if (text === '/start') {
        await sendMessage("👋 Welcome! This bot is connected to your Jira system.\nUse /register to sign up or /update to change your information.");
        return;
    }

    if (text === '/register') {
        const checkUser = await pool.query("SELECT * FROM jira_users WHERE telegram_id = $1", [chatId]);
        if (checkUser.rows.length > 0) {
            await sendMessage(`⚠️ You are already registered with email: ${checkUser.rows[0].email}\nIf you want to change it, use /update`);
            return;
        }
        userStates[chatId] = { step: 'awaiting_email', data: {}, mode: 'register' };
        await sendMessage("📧 Please enter your *Jira email address*:\nType /cancel to abort.", { parse_mode: 'Markdown' });
        return;
    }

    if (text === '/update') {
        const checkUser = await pool.query("SELECT * FROM jira_users WHERE telegram_id = $1", [chatId]);
        if (checkUser.rows.length === 0) {
            await sendMessage("⚠️ You are not registered yet. Please use /register first.");
            return;
        }
        userStates[chatId] = { step: 'awaiting_email', data: {}, mode: 'update' };
        await sendMessage("📧 Enter your new *Jira email address* to update:\nType /cancel to abort.", { parse_mode: 'Markdown' });
        return;
    }

    if (userStates[chatId]?.step === 'awaiting_email') {
        if (!isValidEmail(text)) {
            await sendMessage("❌ Invalid email format. Please enter a valid Jira email.\nType /cancel to abort.");
            return;
        }
        const { mode } = userStates[chatId];
        const existing = await pool.query("SELECT * FROM jira_users WHERE email = $1", [text]);

        if (mode === 'register' && existing.rows.length > 0) {
            await sendMessage("⚠️ This email is already registered. Use /update to change your info.\nType /cancel to abort.");
            delete userStates[chatId];
            return;
        }

        if (mode === 'update' && existing.rows.length > 0 && existing.rows[0].telegram_id !== chatId) {
            await sendMessage("⚠️ This email is already used by another user. Please use a different one.");
            delete userStates[chatId];
            return;
        }

        const code = Math.floor(100000 + Math.random() * 900000);
        userStates[chatId].data.verificationCode = code;
        userStates[chatId].data.email = text;
        userStates[chatId].step = 'awaiting_verification_code';

        await sendVerificationCode(text, code);
        await sendMessage("📩 A verification code has been sent to your email. Please enter the code:\nType /cancel to abort.");
        return;
    }

    if (userStates[chatId]?.step === 'awaiting_verification_code') {
        if (text === userStates[chatId].data.verificationCode.toString()) {
            const { email, mode } = userStates[chatId].data;
            await sendMessage("✅ Verified!", { parse_mode: 'Markdown' });

            try {
                await pool.query(
                    `INSERT INTO jira_users (telegram_id, email)
                     VALUES ($1, $2)
                     ON CONFLICT (telegram_id) DO UPDATE SET email = $2`,
                    [chatId, email]
                );
                await sendMessage(`✅ Your info has been ${mode === 'register' ? 'registered' : 'updated'}!\n📧 Email: ${email}`);
            } catch (err) {
                console.error("DB save error:", err);
                await sendMessage('❌ Error saving to database.');
            }

            delete userStates[chatId];
        } else {
            await sendMessage("❌ Incorrect code. Please try again.");
        }
        return;
    }

    if (userStates[chatId]?.step === 'edit_email') {
        const { id } = userStates[chatId].data;
        if (!isValidEmail(text)) {
            await sendMessage("❌ Invalid email format.");
            return;
        }
        await pool.query("UPDATE jira_users SET email = $1 WHERE id = $2", [text, id]);
        await sendMessage("✅ Email updated.");
        delete userStates[chatId];
        return;
    }

    if (text === '/users') {
        const admin = await isAdmin(chatId);
        if (!admin) {
            await sendMessage("🚫 You are not authorized to use this command.");
            return;
        }
        const result = await pool.query("SELECT id, username, email, is_admin FROM jira_users");
        const users = result.rows;
        if (users.length === 0) return await sendMessage("📭 No registered users.");

        const size = 10;
        userPages[chatId] = users;
        const totalPages = Math.ceil(users.length / size);

        const showPage = async (page) => {
            const subset = users.slice((page - 1) * size, page * size);
            for (const user of subset) {
                await sendMessage(`👤 *${user.username}*\n📧 ${user.email}\n🛡 Admin: ${user.is_admin ? "✅ Yes" : "❌ No"}`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '✏️ Edit', callback_data: `edit_user:${user.id}` },
                                    { text: '🗑 Delete', callback_data: `delete_user:${user.id}` }
                                ],
                                [
                                    {
                                        text: user.is_admin ? '❌ Remove Admin' : '✅ Make Admin',
                                        callback_data: `toggle_admin:${user.id}`
                                    }
                                ]
                            ]
                        }
                    });
            }
            const navButtons = [];
            if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `users_page:${page - 1}` });
            if (page < totalPages) navButtons.push({ text: '➡️ Next', callback_data: `users_page:${page + 1}` });
            if (totalPages > 1) await sendMessage(`📄 Page ${page} of ${totalPages}`, {
                reply_markup: { inline_keyboard: [navButtons] }
            });
        }
        await showPage(1);
        return;
    }

    if (text === '/help') {
        await sendMessage(`📌 Available commands:\n/start - Welcome message\n/register - Register your Jira info\n/update - Update your info\n/users - (Admins only) List all users\n/cancel - Cancel the current operation.`);
        return;
    }
});

// ========== Developers bot ==========

bot1.on('callback_query', async (callback) => {
    const chatId = callback.message.chat.id;
    const data = callback.data;
    const sendMessage = (text, options = {}) => bot1.sendMessage(chatId, text, options);
    await bot1.answerCallbackQuery(callback.id);

    if (!await isAdmin(chatId)) return await sendMessage("🚫 You are not authorized for this action.");

    if (data.startsWith('delete_user:')) {
        const userId = data.split(':')[1];
        try {
            await pool.query("DELETE FROM jira_users WHERE id = $1", [userId]);
            await sendMessage("🗑 User deleted.");
        } catch (err) {
            console.error("❌ Delete error:", err);
            await sendMessage("❌ Failed to delete user.");
        }
        return;
    }

    if (data.startsWith('toggle_admin:')) {
        const userId = data.split(':')[1];
        const result = await pool.query("SELECT is_admin FROM jira_users WHERE id = $1", [userId]);
        if (result.rows.length > 0) {
            const newStatus = !result.rows[0].is_admin;
            await pool.query("UPDATE jira_users SET is_admin = $1 WHERE id = $2", [newStatus, userId]);
            await sendMessage(`🔁 User admin status changed to: ${newStatus ? '✅ Admin' : '❌ Not Admin'}`);
        } else {
            await sendMessage("❗ User not found.");
        }
        return;
    }

    if (data.startsWith('edit_user:')) {
        const userId = data.split(':')[1];
        const result = await pool.query("SELECT * FROM jira_users WHERE id = $1", [userId]);
        if (result.rows.length === 0) return await sendMessage("❗ User not found.");

        userStates[chatId] = {
            step: 'edit_email',
            mode: 'edit',
            data: {
                id: userId,
                username: result.rows[0].username,
                email: result.rows[0].email
            }
        };
        await sendMessage(`📧 Current email: ${result.rows[0].email}\nEnter the new email:`);
        return;
    }

    if (data.startsWith('users_page:')) {
        const page = parseInt(data.split(':')[1], 10);
        const all = userPages[chatId] || [];
        const size = 10;
        const totalPages = Math.ceil(all.length / size);

        if (isNaN(page) || page < 1 || page > totalPages) {
            await sendMessage("❗ Invalid page.");
            return;
        }

        const subset = all.slice((page - 1) * size, page * size);
        for (const user of subset) {
            await sendMessage(
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
                                {
                                    text: user.is_admin ? '❌ Remove Admin' : '✅ Make Admin',
                                    callback_data: `toggle_admin:${user.id}`
                                }
                            ]
                        ]
                    }
                }
            );
        }

        const navButtons = [];
        if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `users_page:${page - 1}` });
        if (page < totalPages) navButtons.push({ text: '➡️ Next', callback_data: `users_page:${page + 1}` });

        await sendMessage(`📄 Page ${page} of ${totalPages}`, {
            reply_markup: { inline_keyboard: [navButtons] }
        });
    }
});


process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});


const PORT = process.env.PORT || 3000
app.listen(PORT, (err) => {
    if (err) {
        console.log(err)
    } else {
        console.log('Listening for jira webhook on port ', PORT)
    }
})

