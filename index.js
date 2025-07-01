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
    sendLongMessagebot2,
    getJiraProjects,
    sendPaginatedProjects,
    getBoardsByProject,
    getIssuesByBoardId
} = require('./helper');


dotenv.config();

const app = express();
app.use(bodyParser.json())

const projectCache = {};
const userStates = {};
const emojiNumbers = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];



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
        // Notify assignee
        const assigneeResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [assigneEmail]
        );


        // Notify reporter
        const reporterResult = await pool.query(
            `SELECT telegram_id FROM jira_users WHERE email = $1`,
            [reporterEmail]
        );

        if (assigneeResult.rows[0].telegram_id === reporterResult.rows[0].telegram_id) {
            await sendMessageBot1(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        if (assigneeResult.rows.length > 0 && (assigneeResult.rows[0].telegram_id != reporterResult.rows[0].telegram_id)) {
            const chatId = assigneeResult.rows[0].telegram_id;
            await sendMessageBot1(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        if (reporterResult.rows.length > 0 && (assigneeResult.rows[0].telegram_id != reporterResult.rows[0].telegram_id)) {
            const chatId = reporterResult.rows[0].telegram_id;
            await sendMessageBot1(chatId, messageTemplate, { parse_mode: "HTML" });
        }

        return res.status(200).json({ message: "Notifications sent." });
    } catch (err) {
        console.error("Error sending notifications:", err);
        return res.status(500).send("Server error");
    }

});


// Second bot 

app.post('/jirabotapi', async (req, res) => {
    const body = req.body;

    // Dynamic main menu keyboard
    const MainMenuKeyboard = async (chatId) => {
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

    if (body.callback_query) {
        const callback = body.callback_query;
        const chatId = callback.message.chat.id;
        const data = callback.data;

        if (data.startsWith('delete_user:')) {
            const userId = data.split(':')[1];
            try {
                await pool.query("DELETE FROM managers WHERE id = $1", [userId]);
            } catch (err) {
                console.error("DB error:", err);
                await sendMessageBot2(chatId, "❌ Failed to delete user.");
            }

            await sendMessageBot2(chatId, `🗑 User deleted.`);
            return res.sendStatus(200);
        }

        if (data.startsWith('edit_user:')) {
            const userId = data.split(':')[1];
            const user = await pool.query("SELECT * FROM managers WHERE id = $1", [userId]);

            if (user.rows.length === 0) {
                await sendMessageBot2(chatId, "❗ Manager not found.");
                return res.sendStatus(200);
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

            await sendMessageBot2(
                chatId,
                `📧 Current Jira email: ${user.rows[0].jira_email || "❌ Not registered"}\nPlease enter the new Jira email:`
            );
            return res.sendStatus(200);
        }

        // if (data.startsWith('project_detail:')) {
        //     const [_, index] = data.split(':').map(Number);
        //     const projects = projectCache[chatId];

        //     if (!projects || !projects[index]) {
        //         await sendMessageBot2(chatId, "⚠️ Project not found or cache expired.");
        //         return res.sendStatus(200);
        //     }

        //     const project = projects[index];

        //     await sendMessageBot2(
        //         chatId,
        //         `📁 *${project.name}*\nKey: \`${project.key}\`\nID: \`${project.id}\`\nProject Type: ${project.projectTypeKey || 'N/A'}`,
        //         { parse_mode: 'Markdown' }
        //     );

        //     try {
        //         const boards = await getBoardsByProject(project.id);
        //         const boardId = boards.values?.[0]?.id;
        //         if (!boardId) {
        //             console.warn(`⚠️ No boards found for project ID: ${project.id}`);
        //             await sendMessageBot2(chatId, "⚠️ No board found for this project.");
        //             return res.sendStatus(200);
        //         }

        //         const issueData = await getIssuesByBoardId(boardId);

        //         const issues = issueData.issues.map((issue) => ({
        //             name: issue.fields.summary || '❓ No summary',
        //             status: issue.fields.status?.name || '❓ Unknown',
        //             priority: issue.fields.priority?.name || '❓ None'
        //         }));

        //         if (issues.length === 0) {
        //             await sendMessageBot2(chatId, "📭 No issues found for this project.");
        //         } else {
        //             const grouped = {};
        //             for (const issue of issues) {
        //                 if (!grouped[issue.status]) grouped[issue.status] = [];
        //                 grouped[issue.status].push(`🔹 *${issue.name}* (${issue.priority})`);
        //             }

        //             let message = `🗂 *Issues Grouped by Status*\n\n`;
        //             for (const [status, items] of Object.entries(grouped)) {
        //                 message += `*${status}*\n${items.join('\n')}\n\n`;
        //             }

        //             await sendMessageBot2(chatId, message, { parse_mode: 'Markdown' });
        //         }

        //     } catch (err) {
        //         console.error("❌ Error fetching issues:", err);
        //         await sendMessageBot2(chatId, "❌ Failed to fetch board or issues.");
        //     }

        //     return res.sendStatus(200);
        // }

        if (data.startsWith('project_detail:')) {
            const idx = parseInt(data.split(':')[1], 10);
            const all = projectCache[chatId] || [];
            if (isNaN(idx) || idx < 0 || idx >= all.length) {
                await sendMessageBot2(chatId, "⚠️ Project not found or expired.");
                return res.sendStatus(200);
            }
            const proj = all[idx];
            await sendMessageBot2(chatId, `📁 *${proj.name}*\nKey: \`${proj.key}\`\nID: \`${proj.id}\``, { parse_mode: 'Markdown' });

            try {
                const boards = await getBoardsByProject(proj.id);
                const boardId = boards.values?.[0]?.id;
                if (!boardId) {
                    await sendMessageBot2(chatId, "⚠️ No boards found.");
                    return res.sendStatus(200);
                }

                const data = await getIssuesByBoardId(boardId);
                const issues = data.issues.map(i => ({
                    name: i.fields.summary || 'No summary',
                    status: i.fields.status?.name || 'Unknown',
                    priority: i.fields.priority?.name || 'None'
                }));

                if (issues.length === 0) {
                    await sendMessageBot2(chatId, "📭 No issues found.");
                } else {
                    const grouped = issues.reduce((g, item) => {
                        g[item.status] = g[item.status] || [];
                        g[item.status].push(`🔹 *${item.name}* (${item.priority})`);
                        return g;
                    }, {});

                    let msg = `🗂 *Issues by Status*\n\n`;
                    for (const [status, list] of Object.entries(grouped)) {
                        msg += `*${status}*\n${list.join('\n')}\n\n`;
                    }
                    await sendMessageBot2(chatId, msg, { parse_mode: 'Markdown' });
                }
            } catch (e) {
                console.error('Error loading issues:', e);
                await sendMessageBot2(chatId, "❌ Failed to load boards or issues.");
            }

            return res.sendStatus(200);
        }


        // if (data.startsWith('project_page:')) {
        //     const newPage = Number(data.split(':')[1]);
        //     const allProjects = projectCache[chatId];
        //     if (!allProjects || !Array.isArray(allProjects)) {
        //         console.warn(`⚠️ No project data found for chatId: ${chatId}`);
        //         return res.sendStatus(200);
        //     }
        //     const total = allProjects.length;
        //     const pageSize = 10;
        //     const pageCount = Math.ceil(total / pageSize);

        //     if (newPage < 1 || newPage > pageCount) return res.sendStatus(200);

        //     const projects = allProjects.slice((newPage - 1) * pageSize, newPage * pageSize);

        //     let messageText = `📋 *Jira Projects List*\nTotal: ${total} | Page: ${newPage}/${pageCount}\n\n`;
        //     projects.forEach((p, i) => {
        //         messageText += `${i + 1}. ${p.name}\n`;
        //     });


        //     const inlineButtons = [];
        //     for (let i = 0; i < projects.length; i += 5) {
        //         const row = projects.slice(i, i + 5).map((_, j) => {
        //             const localIndex = i + j;
        //             const globalIndex = (newPage - 1) * pageSize + localIndex;
        //             return {
        //                 text: emojiNumbers[localIndex] || `${localIndex + 1}`,
        //                 callback_data: `project_detail:${globalIndex}`
        //             };
        //         });
        //         inlineButtons.push(row);
        //     }

        //     try {
        //         await bot2.deleteMessage(chatId, callback.message.message_id);
        //     } catch (err) {
        //         console.error("⚠️ Failed to delete previous page message:", err);
        //     }

        //     await sendMessageBot2(chatId, messageText, {
        //         parse_mode: 'Markdown',
        //         reply_markup: {
        //             inline_keyboard: [
        //                 ...inlineButtons,
        //                 [
        //                     ...(newPage > 1 ? [{ text: '⬅️ Prev', callback_data: `project_page:${newPage - 1}` }] : []),
        //                     ...(newPage < pageCount ? [{ text: '➡️ Next', callback_data: `project_page:${newPage + 1}` }] : [])
        //                 ]
        //             ]
        //         }
        //     });

        //     return res.sendStatus(200);
        // }


        if (data.startsWith('project_page:')) {
            const page = parseInt(data.split(':')[1], 10);
            const all = projectCache[chatId] || [];
            const total = all.length, size = 10, pages = Math.ceil(total / size);
            if (isNaN(page) || page < 1 || page > pages) return res.sendStatus(200);

            const subset = all.slice((page - 1) * size, page * size);
            const text = [`📋 *Jira Projects (${page}/${pages})*`, ...subset.map((p, i) => `${i + 1}. ${p.name}`)].join('\n');

            const keyboard = [];
            for (let i = 0; i < subset.length; i += 5) {
                keyboard.push(subset.slice(i, i + 5).map((_, j) => {
                    const li = i + j;
                    return { text: emojiNumbers[li], callback_data: `project_detail:${(page - 1) * size + li}` };
                }));
            }
            keyboard.push([
                ...(page > 1 ? [{ text: '⬅️', callback_data: `project_page:${page - 1}` }] : []),
                ...(page < pages ? [{ text: '➡️', callback_data: `project_page:${page + 1}` }] : [])
            ]);

            await bot2.deleteMessage(chatId, callback.message.message_id).catch(() => { });
            await sendMessageBot2(chatId, text, { reply_markup: { inline_keyboard: keyboard }, parse_mode: 'Markdown' });
            return res.sendStatus(200);
        }
    }

    if (!body || !body.message) {
        console.log("❗ Invalid Telegram payload:", body);
        return res.sendStatus(400);
    }

    const message = body.message;
    const chatId = message.chat.id;
    const text = message.text?.trim();
    if (message.contact) {
        const phone = '+' + message.contact.phone_number;

        try {
            const result = await pool.query(
                `UPDATE managers SET telegram_chat_id = $1 WHERE phone_number = $2`,
                [chatId, phone]
            );

            if (result.rowCount === 0) {
                // No such phone exists in DB, optionally insert or notify
                await sendMessageBot2(chatId, `⚠️ Your phone number is not recognized. Please ask an admin to register you.`, await MainMenuKeyboard());
            } else {
                await sendMessageBot2(chatId, `✅ Thank you! You’ve been granted access.`, await MainMenuKeyboard());
            }

        } catch (err) {
            console.error("❌ Error updating Telegram ID:", err);
            await sendMessageBot2(chatId, "❌ Failed to link your phone number. Please try again later.");
        }

        return res.sendStatus(200);
    }

    if (!text) return res.sendStatus(200);

    // Message callback
    if (userStates[chatId]?.step === 'edit_email') {
        const newEmail = text;

        if (!isValidEmail(newEmail)) {
            await sendMessageBot2(chatId, "❌ Invalid email. Please enter a valid email address.");
            return res.sendStatus(200);
        }

        // Save email and move to phone number step
        userStates[chatId].data.email = newEmail;
        userStates[chatId].step = 'edit_phone';

        await sendMessageBot2(chatId, "📱 Now enter the new *phone number* for this manager:", { parse_mode: 'Markdown' });
        return res.sendStatus(200);
    }

    if (userStates[chatId]?.step === 'edit_phone') {
        const newPhone = text;

        if (!/^\+?\d{7,15}$/.test(newPhone)) {
            await sendMessageBot2(chatId, "❗ Invalid phone number. Please enter a valid one (e.g., +998901234567):");
            return res.sendStatus(200);
        }

        const { id, email } = userStates[chatId].data;

        try {
            await pool.query(
                `UPDATE managers SET phone_number = $1, jira_email = $2 WHERE id = $3`,
                [newPhone, email, id]
            );

            await sendMessageBot2(chatId, "✅ Manager info updated successfully!");
        } catch (err) {
            console.error("DB update error:", err);
            await sendMessageBot2(chatId, "❌ Failed to update manager info.");
        }

        delete userStates[chatId];
        return res.sendStatus(200);
    }


    // START command
    if (text === '/start') {
        await sendMessageBot2(chatId, "👋 Welcome! This bot is connected to your Jira software.", await MainMenuKeyboard());
        return res.sendStatus(200);
    }

    // Add manager (ask for phone)
    if (text === '/add-manager' || text === 'Add manager') {
        userStates[chatId] = { step: 'awaiting_managers_phone' };
        await sendMessageBot2(chatId, "📱 Please enter the manager’s *phone number*:", {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    [{ text: '/cancel' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return res.sendStatus(200);
    }

    // Awaiting phone input
    if (userStates[chatId]?.step === 'awaiting_managers_phone') {
        const phoneNumber = text;

        // Optional: Validate phone number format
        if (!/^\+?\d{7,15}$/.test(phoneNumber)) {
            await sendMessageBot2(chatId, "❗ Invalid phone number. Please enter a valid one (e.g., +998901234567):");
            return res.sendStatus(200);
        }

        try {
            await pool.query(`INSERT INTO managers (phone_number) VALUES ($1)`, [phoneNumber]);
            await sendMessageBot2(chatId, "✅ Phone number has been saved to the database.");
        } catch (err) {
            console.error("DB save error:", err);
            await sendMessageBot2(chatId, "❌ Error saving to the database.");
        }

        delete userStates[chatId];
        return res.sendStatus(200);
    }

    if (text === '/managers-list' || text === '📋 Managers List') {
        const admin = await isAdmin(chatId)
        if (admin) {
            try {
                const result = await pool.query(`SELECT * FROM managers`);
                const managers = result.rows;

                if (managers.length === 0) {
                    await sendMessageBot2(chatId, "📭 No registered managers.");
                    return res.sendStatus(200);
                }

                for (const manager of managers) {
                    const phone = manager.phone_number || 'Not provided';
                    const email = manager.jira_email || '❌ Not registered yet';
                    const telegramId = manager.telegram_chat_id || '❌ Not linked';

                    await sendMessageBot2(
                        chatId,
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
                await sendMessageBot2(chatId, "⚠️ Error retrieving managers from the database.");
            }
        } else {
            await sendMessageBot1(chatId, "🚫 You are not authorized to use this command.");
        }
        return res.sendStatus(200);
    }

    // Get access 
    if (text === '/get_access' || text === 'Ask for access') {
        await sendMessageBot2(chatId, '📲 To get access, please share your phone number:', {
            reply_markup: {
                keyboard: [
                    [{ text: '📤 Share phone number', request_contact: true }],
                    [{ text: '/cancel' }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return res.sendStatus(200);
    }

    // show Projects list
    // if (text === '/show_projects_list' || text === 'Projects List') {
    //     const page = 1;
    //     const pageSize = 10;

    //     try {
    //         // Authorization check
    //         const result = await pool.query(`SELECT * FROM managers WHERE telegram_chat_id = $1`, [chatId]);
    //         if (result.rows.length === 0) {
    //             await sendMessageBot2(chatId, "📭 You are not authorized to view projects.");
    //             return res.sendStatus(200);
    //         }



    //         const allProjects = await getJiraProjects();
    //         const total = allProjects.length;
    //         const pageCount = Math.ceil(total / pageSize);
    //         console.log(total, pageCount)
    //         const projects = allProjects.slice((page - 1) * pageSize, page * pageSize);

    //         // Cache for navigation
    //         projectCache[chatId] = allProjects;
    //         setTimeout(() => { delete projectCache[chatId]; }, 5 * 60 * 1000); // 5 min cache

    //         // Message text
    //         let messageText = `📋 *Jira Projects List*\nTotal: ${total} | Page: ${page}/${pageCount}\n\n`;
    //         projects.forEach((p, i) => {
    //             messageText += `${i + 1}. ${p.name}\n`; // 1-10 per page
    //         });

    //         // Inline keyboard (1️⃣ to 🔟 style)
    //         const inlineButtons = [];
    //         for (let i = 0; i < projects.length; i += 5) {
    //             const row = projects.slice(i, i + 5).map((_, j) => {
    //                 const localIndex = i + j; // 0–9
    //                 const globalIndex = (page - 1) * pageSize + localIndex; // correct index in allProjects
    //                 return {
    //                     text: emojiNumbers[localIndex] || `${localIndex + 1}`,
    //                     callback_data: `project_detail:${globalIndex}`
    //                 };
    //             });
    //             inlineButtons.push(row);
    //         }

    //         // Send paginated message
    //         await sendMessageBot2(chatId, messageText, {
    //             parse_mode: 'Markdown',
    //             reply_markup: {
    //                 inline_keyboard: [
    //                     ...inlineButtons,
    //                     [
    //                         ...(page > 1 ? [{ text: '⬅️ Prev', callback_data: `project_page:${page - 1}` }] : []),
    //                         ...(page < pageCount ? [{ text: '➡️ Next', callback_data: `project_page:${page + 1}` }] : [])
    //                     ]
    //                 ]
    //             }
    //         });

    //     } catch (err) {
    //         console.error("❌ Failed to fetch Jira projects:", err);
    //         await sendMessageBot2(chatId, "❌ Error fetching Jira projects.");
    //     }

    //     return res.sendStatus(200);
    // }

    if (text === '/show_projects_list' || text === 'Projects List') {
        try {
            const all = await getJiraProjects(); // Fetch all Jira projects
            if (!Array.isArray(all) || all.length === 0) {
                await sendMessageBot2(chatId, "⚠️ No projects found.");
                return res.sendStatus(200);
            }

            // Cache for callback pagination
            projectCache[chatId] = all;
            setTimeout(() => delete projectCache[chatId], 5 * 60 * 1000); // 5 minutes

            const page = 1;
            const size = 10;
            const totalPages = Math.ceil(all.length / size);
            const subset = all.slice(0, size); // First 10

            // Create message text
            const textMsg = [
                `📋 *Jira Projects (${page}/${totalPages})*`,
                ...subset.map((p, i) => `${i + 1}. ${p.name}`)
            ].join('\n');

            // Inline keyboard
            const keyboard = [];
            for (let i = 0; i < subset.length; i += 5) {
                keyboard.push(
                    subset.slice(i, i + 5).map((_, j) => ({
                        text: emojiNumbers[i + j],
                        callback_data: `project_detail:${(page - 1) * size + i + j}`,
                    }))
                );
            }

            // Add pagination button if needed
            if (totalPages > 1) {
                keyboard.push([{ text: '➡️', callback_data: `project_page:${page + 1}` }]);
            }

            // Send message
            await sendMessageBot2(chatId, textMsg, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard },
            });

        } catch (err) {
            console.error('Error in /show_projects_list:', err);
            await sendMessageBot2(chatId, '❌ Failed to load projects from Jira.');
        }

        return res.sendStatus(200);
    }

    // Cancel command
    if (text === '/cancel') {
        delete userStates[chatId]; // Clear any in-progress interaction
        await sendMessageBot2(chatId, "❌ Cancelled. Back to main menu.", {
            reply_markup: {
                keyboard: (await MainMenuKeyboard()).reply_markup.keyboard,
                resize_keyboard: true
            }
        });

        return res.sendStatus(200);
    }



    return res.sendStatus(200);
});



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


