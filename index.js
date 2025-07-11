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
} = require('./helper');


dotenv.config();

const app = express();
app.use(bodyParser.json())

// States
const projectCache = {};
const userStates = {}
const userPages = {}
const issueCashe = {}
const componentNameCashe = {}

// for test
app.get("/", async (req, res) => {
    console.log(req.body)
    res.send('✅ Bot and server are running.');
})


// for test
// Get users from db
// app.get("/users", async (req, res) => {
//     try {
//         const result = await pool.query("SELECT * FROM jira_users");
//         res.send(result.rows).json(result.rows);
//     } catch (err) {
//         console.error("DB error: ", err.message);
//         res.status(500).send("Server error");
//     }
// });

// jira API 
app.post("/notification", async (req, res) => {
    const event = req.body;

    if (!event || !event.issue || !event.issue.fields) {
        return res.sendStatus(200); // Ignore invalid events
    }

    const projectId = event.issue?.fields?.components[0]?.id;
    const issueKey = event.issue?.key;
    const summary = event.issue?.fields?.summary;
    const changelog = event.changelog || {};
    const user = event.user?.displayName || 'Unknown user';
    const projectName = event?.issue?.fields?.components[0]?.name
    const prId = event.issue?.fields?.project?.id
    console.log("Project Id: ", prId)
    console.log("Component Id: ", projectId)
    const issueComment = event.comment?.body || null;

    let message = `📋 *Project Name:* ${projectName}\n\n`

    if (event.issue?.fields?.project?.id === process.env.MB_ID) {
        if (event.webhookEvent === 'jira:issue_updated') {
            if (event.issue_event_type_name === 'issue_commented') {
                const commentText = `💬 *${user} Added New Comment*:\n${issueComment}`;
                await sendCommentNotification(projectId, issueKey, summary, commentText, message);
                return res.sendStatus(200);
            } else if (event.issue_event_type_name === 'issue_comment_edited') {
                const commentText = `💬 *${user} Updated Comment*:\n${issueComment}`;
                await sendCommentNotification(projectId, issueKey, summary, commentText, message);
                return res.sendStatus(200);
            }
        }

        if (event.webhookEvent === 'jira:issue_updated' && !event.issue_event_type_name.includes('issue_comment')) {
            const rows = await pool.query(
                `SELECT chat_id FROM project_subscriptions WHERE project_id = $1`,
                [projectId]
            );

            if (rows.rowCount === 0) return res.sendStatus(200); // No subscribers

            const changeText = changelog.items?.map(item => {
                return `• *${item.field}*: "${item.fromString || '–'}" → "${item.toString || '–'}"`;
            }).join('\n') || '_No specific changes listed._';

            message += `🛠 *${user}* updated issue *${issueKey}*\n📝 ${summary}\n\n${changeText}`;

            if (issueComment) {
                message += `\n💬 *Comment Added*:\n${issueComment}`;
            }

            for (const { chat_id } of rows.rows) {
                await bot2.sendMessage(chat_id, message, { parse_mode: 'Markdown' });
            }
        }

    }
    res.sendStatus(200);
});

const sendCommentNotification = async (projectId, issueKey, summary, commentText, projectName) => {
    const rows = await pool.query(
        `SELECT chat_id FROM project_subscriptions WHERE project_id = $1`,
        [projectId]
    );

    if (rows.rowCount === 0) return;
    const message = projectName + `🛠 *Comment on Issue ${issueKey} Updated*\n📝 ${summary}\n\n${commentText}`;
    for (const { chat_id } of rows.rows) {
        await bot2.sendMessage(chat_id, message, { parse_mode: 'Markdown' });
    }
};

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

                if (req.body?.issue_event_type_name === 'issue_comment_deleted') {
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

bot2.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    const contact = msg.contact;

    const sendMessage = (text, options = {}) => bot2.sendMessage(chatId, text, options);

    async function checkIfManager(chatId) {
        const result = await pool.query("SELECT 1 FROM managers WHERE telegram_chat_id = $1", [chatId]);
        return result.rowCount > 0;
    }

    const MainMenuKeyboard = async (chatId) => {
        const admin = await isAdmin(chatId);
        const isManager = await checkIfManager(chatId); // Check if user is a manager
        let inlineKeyboard = [];
        console.log(admin)
        if (admin) {
            inlineKeyboard = [
                [{ text: 'Projects List' }, { text: 'Notifications List' }],
                [{ text: '📋 Managers List' }, { text: "Add manager" }]
            ];
        } else if (isManager) {
            inlineKeyboard = [
                [{ text: 'Projects List' }, { text: 'Notifications List' }]
            ];
        } else {
            inlineKeyboard = [
                [{ text: 'Projects List' }, { text: 'Notifications List' }],
                [{ text: 'Ask for access' }]
            ];
        }

        return {
            reply_markup: {
                keyboard: inlineKeyboard,
                resize_keyboard: true,
                one_time_keyboard: false
            }
        };
    };

    // Handle "Ask for access" message
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

    // Handle contact sharing
    if (contact && contact.phone_number) {
        const phone = '+' + contact.phone_number;
        try {
            const result = await pool.query(
                `UPDATE managers SET telegram_chat_id = $1 WHERE phone_number = $2`,
                [chatId, phone]
            );

            if (result.rowCount === 0) {
                await sendMessage(`⚠️ Your phone number is not recognized. Please ask an admin to register you.`, await MainMenuKeyboard(chatId));
            } else {
                await sendMessage(`✅ Thank you! You’ve been granted access.`, await MainMenuKeyboard(chatId));
            }
        } catch (err) {
            console.error("❌ Error updating Telegram ID:", err);
            await sendMessage("❌ Failed to link your phone number. Please try again later.", await MainMenuKeyboard(chatId));
        }
        return;
    }

    // Handle the '/cancel' command
    if (text === '/cancel') {
        await saveUserNavigation(chatId, []);
        await sendMessage("❌ Cancelled. Back to main menu.", await MainMenuKeyboard(chatId));
        return;
    }

    if (text === '/start') {
        await saveUserNavigation(chatId, navigationStack);
        await sendMessage("👋 Welcome! This bot is connected to your Jira software.", await MainMenuKeyboard());
        return;
    }

    // Handle 'Projects List'
    if (text === 'Projects List') {
        if (await checkIfManager(chatId)) {
            try {
                const components = await getComponentsFromMainBoard(process.env.MB_ID);
                if (components.length === 0) {
                    await sendMessage("📭 No components found for this project.");
                    return;
                }

                projectCache[chatId] = components
                console.log("Project cashe: ", projectCache[chatId])

                const size = 10;
                const totalPages = Math.ceil(components.length / size);
                let currentPage = 1;

                let navigationStack = await getUserNavigation(chatId) || [];
                if (!Array.isArray(navigationStack)) {
                    navigationStack = [];
                }
                navigationStack.push({ step: 'projects_list', data: { page: currentPage } });
                await saveUserNavigation(chatId, navigationStack);

                await showPage(chatId, currentPage, components, totalPages);
            } catch (err) {
                console.error("Failed to load components from Main board", err);
                await sendMessage("❌ Failed to fetch projects from Jira", await MainMenuKeyboard(chatId));
            }
        }
        else {
            sendMessage("🚫 You are not authorized to use this command.")
        }
        return;
    }

    if (text === '/managers_list' || text === '📋 Managers List') {
        const admin = await isAdmin(chatId);
        if (admin) {
            try {
                const result = await pool.query(`SELECT * FROM managers`);
                const managers = result.rows;

                if (managers.length === 0) {
                    await sendMessage("📭 No registered managers.");
                    return;
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
        return;
    }


    // Add manager
    if (text === 'Add manager' || text === '/add_manager') {
        let navigationStack = await getUserNavigation(chatId) || [];
        console.log("navigationStack: ", navigationStack)
        if (!Array.isArray(navigationStack)) {
            console.error("Navigation stack is not an array, resetting to an empty array.");
            navigationStack = [];
        }
        navigationStack.push({ step: 'awaiting_managers_phone', data: {} });
        await saveUserNavigation(chatId, navigationStack);


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
    const userNavigation = await getUserNavigation(chatId)

    // Handle 'awaiting_managers_phone' step
    if (userNavigation && userNavigation[userNavigation.length - 1]?.step === 'awaiting_managers_phone') {
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

        // Move to the next step
        const newNavigationStack = userNavigation.slice();
        newNavigationStack.push({ step: 'completed', data: { phone: phoneNumber } });
        await saveUserNavigation(chatId, navigationStack) //save the updated navigation
        return;
    }

    // Handle 'Notifications List'
    if (text === 'Notifications List') {
        if (await checkIfManager(chatId)) {
            try {
                const componentsWithNotification = await pool.query("SELECT * FROM project_subscriptions WHERE chat_id = $1", [chatId]);

                if (componentsWithNotification.rows.length === 0) {
                    await sendMessage("📭 No notifications found.");
                    return;
                }

                const components = await getComponentsFromMainBoard(process.env.MB_ID);

                if (components.length === 0) {
                    await sendMessage("📭 No components found for this project.");
                    return;
                }

                const filteredComponents = await filterComponents(components, componentsWithNotification.rows);
                projectCache[chatId] = filteredComponents
                if (filteredComponents.length > 0) {
                    const size = 10;
                    const totalPages = Math.ceil(filteredComponents.length / size);
                    let currentPage = 1;

                    const navigationStack = await getUserNavigation(chatId) || [];
                    navigationStack.push({ step: 'notifications_list', data: { page: currentPage } });
                    await saveUserNavigation(chatId, navigationStack);

                    await showPage(chatId, currentPage, filteredComponents, totalPages);
                } else {
                    await sendMessage("❌ No components found for the specified project IDs.");
                }
            } catch (err) {
                console.error("Error in fetching notifications list from DB", err);
            }
        } else {
            sendMessage("🚫 You are not authorized to use this command.")
        }
        return;
    }
});


// bot2.on('message', async (msg) => {
//     const chatId = msg.chat.id;
//     const text = msg.text?.trim();
//     const contact = msg.contact;

//     const sendMessage = (text, options = {}) => bot2.sendMessage(chatId, text, options);

//     async function checkIfManager(chatId) {
//         const result = await pool.query("SELECT 1 FROM managers WHERE telegram_chat_id = $1", [chatId]);
//         return result.rowCount > 0;

//     }
//     // const MainMenuKeyboard = async () => {
//     //     const admin = await isAdmin(chatId);
//     //     return {
//     //         reply_markup: {
//     //             keyboard: admin
//     //                 ? [
//     //                     [{ text: 'Ask for access' }, { text: 'Projects List' }, { text: 'Notifications List' }],
//     //                     [{ text: '📋 Managers List' }, { text: "Add manager" }],

//     //                 ]
//     //                 : [
//     //                     [{ text: 'Ask for access' }, { text: 'Projects List' }, { text: 'Notifications List' }],

//     //                 ],
//     //             resize_keyboard: true,
//     //             one_time_keyboard: false
//     //         }
//     //     };
//     // };

//     const MainMenuKeyboard = async (chatId) => {
//         // Check if user is an admin and if they exist in the managers table
//         const admin = await isAdmin(chatId);
//         let inlineKeyboard = []
//         const isManager = await checkIfManager(chatId);  // Function to check if chatId exists in the managers table
//         if (admin) {
//             inlineKeyboard = [
//                 [{ text: 'Projects List' }, { text: 'Notifications List' }],
//                 [{ text: '📋 Managers List' }, { text: "Add manager" }],
//             ]
//         } else if (isManager) {
//             inlineKeyboard = [
//                 [{ text: 'Projects List' }, { text: 'Notifications List' }]
//             ]
//         } else {
//             inlineKeyboard = [
//                 [{ text: 'Projects List' }, { text: 'Notifications List' }],
//                 [{ text: 'Ask for access' }]

//             ]
//         }
//         // Build the keyboard based on admin status and manager status
//         return {
//             reply_markup: {
//                 keyboard: inlineKeyboard,
//                 // keyboard: admin
//                 //     ? [
//                 //         [{ text: 'Projects List' }, { text: 'Notifications List' }],
//                 //         [{ text: '📋 Managers List' }, { text: "Add manager" }],
//                 //     ]
//                 //     : [
//                 //         [{ text: 'Projects List' }, { text: 'Notifications List' }],
//                 //         !isManager ? [] : [{ text: 'Ask for access' }],  // Add "Ask for access" only if the user is not a manager
//                 //     ],
//                 resize_keyboard: true,
//                 one_time_keyboard: false
//             }
//         };
//     };

//     const userNavigation = await getUserNavigation(chatId)

//     if (text === "⬅️ Back") {
//         if (!userNavigation || userNavigation.length === 0) {
//             await sendMessage("⚠️ No previous step to go back to.");
//             return;
//         }

//         const lastStep = userNavigation.pop();
//         await saveUserNavigation(chatId, userNavigation)
//         if (lastStep.step === 'projects_list') {
//             const components = projectCache[chatId] || [];
//             const page = lastStep.data.page || 1;  // Use last visited page number
//             await showPage(chatId, page, components);
//         } else if (lastStep.step === 'status_page') {
//             const { componentId } = lastStep.data;
//             const issues = await getIssuesByComponentId(componentId);
//             await sendIssuesByStatus(chatId, issues);
//         } else {
//             await sendMessage("⚠️ Unknown step. Returning to main menu.");
//             await sendMessage("👋 Welcome! This bot is connected to your Jira software.", await MainMenuKeyboard());
//         }
//         return;
//     }

//     // Cancel handler
//     if (text === '/cancel') {
//         await saveUserNavigation(chatId, [])
//         await sendMessage("❌ Cancelled. Back to main menu.", await MainMenuKeyboard());
//         return;
//     }

//     // Contact handler
//     if (contact && contact.phone_number) {
//         const phone = '+' + contact.phone_number;
//         try {
//             const result = await pool.query(
//                 `UPDATE managers SET telegram_chat_id = $1 WHERE phone_number = $2`,
//                 [chatId, phone]
//             );

//             if (result.rowCount === 0) {
//                 await sendMessage(`⚠️ Your phone number is not recognized. Please ask an admin to register you.`, await MainMenuKeyboard());
//             } else {
//                 await sendMessage(`✅ Thank you! You’ve been granted access.`, await MainMenuKeyboard());
//             }
//         } catch (err) {
//             console.error("❌ Error updating Telegram ID:", err);
//             await sendMessage("❌ Failed to link your phone number. Please try again later.");
//         }
//         return;
//     }

//     // Start
//     if (text === '/start') {

//         await saveUserNavigation(chatId, navigationStack);
//         await sendMessage("👋 Welcome! This bot is connected to your Jira software.", await MainMenuKeyboard());
//         return;
//     }

//     // Add manager
//     if (text === 'Add manager' || text === '/add_manager') {
//         let navigationStack = await getUserNavigation(chatId) || [];
//         console.log("navigationStack: ", navigationStack)
//         if (!Array.isArray(navigationStack)) {
//             console.error("Navigation stack is not an array, resetting to an empty array.");
//             navigationStack = [];
//         }
//         navigationStack.push({ step: 'awaiting_managers_phone', data: {} });
//         await saveUserNavigation(chatId, navigationStack);


//         await sendMessage("📱 Please enter the manager’s *phone number*:", {
//             parse_mode: 'Markdown',
//             reply_markup: {
//                 keyboard: [[{ text: '/cancel' }]],
//                 resize_keyboard: true,
//                 one_time_keyboard: true
//             }
//         });
//         return;
//     }


//     // Handle 'awaiting_managers_phone' step
//     if (userNavigation && userNavigation[userNavigation.length - 1]?.step === 'awaiting_managers_phone') {
//         const phoneNumber = text;
//         if (!/^\+?\d{7,15}$/.test(phoneNumber)) {
//             await sendMessage("❗ Invalid phone number. Please enter a valid one (e.g., +998901234567):");
//             return;
//         }

//         try {
//             await pool.query(`INSERT INTO managers (phone_number) VALUES ($1)`, [phoneNumber]);
//             await sendMessage("✅ Phone number has been saved to the database.", await MainMenuKeyboard());
//         } catch (err) {
//             console.error("DB save error:", err);
//             await sendMessage("❌ Error saving to the database.");
//         }

//         // Move to the next step
//         const newNavigationStack = userNavigation.slice();
//         newNavigationStack.push({ step: 'completed', data: { phone: phoneNumber } });
//         await saveUserNavigation(chatId, navigationStack) //save the updated navigation
//         return;
//     }

//     // Managers list??
//     if (text === '/managers_list' || text === '📋 Managers List') {
//         const admin = await isAdmin(chatId);
//         if (admin) {
//             try {
//                 const result = await pool.query(`SELECT * FROM managers`);
//                 const managers = result.rows;

//                 if (managers.length === 0) {
//                     await sendMessage("📭 No registered managers.");
//                     return;
//                 }

//                 for (const manager of managers) {
//                     const phone = manager.phone_number || 'Not provided';
//                     const email = manager.jira_email || '❌ Not registered yet';
//                     const telegramId = manager.telegram_chat_id || '❌ Not linked';

//                     await sendMessage(
//                         `👤 *Phone:* ${phone}\n📧 *Jira Email:* ${email}\n💬 *Telegram ID:* ${telegramId}`,
//                         {
//                             parse_mode: 'Markdown',
//                             reply_markup: {
//                                 inline_keyboard: [
//                                     [
//                                         { text: '✏️ Edit', callback_data: `edit_user:${manager.id}` },
//                                         { text: '🗑 Delete', callback_data: `delete_user:${manager.id}` }
//                                     ]
//                                 ]
//                             }
//                         }
//                     );
//                 }

//             } catch (err) {
//                 console.error("❌ Error fetching managers:", err);
//                 await sendMessage("⚠️ Error retrieving managers from the database.");
//             }
//         } else {
//             await sendMessage("🚫 You are not authorized to use this command.");
//         }
//         return;
//     }


//     // Ask for access??
//     if (text === 'Ask for access') {

//         // const navigationStack = await getUserNavigation(chatId) || []
//         // if (!Array.isArray(navigationStack)) {
//         //     console.error("Navigation stack is not an array, resetting to an empty array.");
//         //     navigationStack = [];
//         // }
//         // navigationStack.push({ step: 'ask_for_access', data: {} })
//         // await saveUserNavigation(chatId, navigationStack)

//         await sendMessage('📲 To get access, please share your phone number:', {
//             reply_markup: {
//                 keyboard: [[{ text: '📤 Share phone number', request_contact: true }], [{ text: '/cancel' }]],
//                 resize_keyboard: true,
//                 one_time_keyboard: true
//             }
//         });
//         return;
//     }

//     // Projects list
//     if (text === 'Projects List') {
//         console.log(await isAdmin(chatId))
//         try {
//             const components = await getComponentsFromMainBoard(process.env.MB_ID);
//             if (components.length === 0) {
//                 await sendMessage("📭 No components found for this project.");
//                 return;
//             }

//             projectCache[chatId] = components


//             const size = 10;
//             const totalPages = Math.ceil(components.length / size);

//             let currentPage = 1;

//             const navigationStack = await getUserNavigation(chatId) || []
//             navigationStack.push({ step: 'projects_list', data: { page: currentPage } }) //update the last stack
//             await saveUserNavigation(chatId, navigationStack) //saving to the d

//             await showPage(chatId, currentPage, components, totalPages);
//         }
//         catch (err) {
//             console.error("Failed to load components from Main board", err);
//             await sendMessage("❌ Failed to fetch projects from Jira");
//         }
//         return;
//     }

//     if (text === 'Notifications List') {
//         try {
//             const componentsWithNotification = await pool.query(
//                 "SELECT * FROM project_subscriptions"
//             );
//             if (componentsWithNotification.length === 0) {
//                 await sendMessage("📭 No Notifications list found.");
//                 return;
//             }

//             console.log("notificationList: ", componentsWithNotification.rows)

//             const components = await getComponentsFromMainBoard(process.env.MB_ID);
//             if (components.length === 0) {
//                 await sendMessage("📭 No components found for this project.");
//                 return;
//             }

//             const filteredComponents = await filterComponents(components, componentsWithNotification.rows)
//             if (filteredComponents.length > 0) {
//                 projectCache[chatId] = filteredComponents
//                 const size = 10;
//                 const totalPages = Math.ceil(filteredComponents.length / size);
//                 let currentPage = 1;

//                 const navigationStack = await getUserNavigation(chatId) || []
//                 navigationStack.push({ step: 'notificatoins_list', data: { page: currentPage } }) //update the last stack
//                 await saveUserNavigation(chatId, navigationStack)
//                 await showPage(chatId, currentPage, filteredComponents, totalPages);
//             } else {
//                 console.log("No components found for the specified project IDs.");
//                 await sendMessage("❌ Failed to fetch Notifications list from DB");
//             }

//         }
//         catch (err) {
//             console.error("Error in fetching notifications list from db", err)
//         }
//     }
// });

bot2.on('callback_query', async (callback) => {
    const chatId = callback.message.chat.id;
    const data = callback.data;

    const sendMessage = (text, options = {}) => bot2.sendMessage(chatId, text, options);

    await bot2.answerCallbackQuery(callback.id);

    if (data.startsWith('notifications_page:')) {
        const page = parseInt(data.split(':')[1], 10);
        if (!userPages[chatId]) {
            await sendMessage("❗ Users data not available.");
            return;
        }
        await showPage(chatId, page, userPages[chatId]); // Display the corresponding page
        return;
    }

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
        const navigationStack = await getUserNavigation(chatId) || [];
        navigationStack.push({ step: 'edit_email', data: { id: userId, phone: user.rows[0].phone_number, email: user.rows[0].jira_email } });
        await saveUserNavigation(chatId, navigationStack); // Save stack in DB

        await sendMessage(`📧 Current Jira email: ${user.rows[0].jira_email || "❌ Not registered"}\nPlease enter the new Jira email:`);
        return;
    }

    if (data.startsWith('projects_page:')) {
        const page = parseInt(data.split(':')[1], 10);

        const components = projectCache[chatId] || [];

        const totalPages = Math.ceil(components.length / 10);

        if (page < 1 || page > totalPages) {
            await sendMessage("❗ Invalid page.");
            return;
        }

        await showPage(chatId, page, components, totalPages);
    }

    if (data.startsWith('toggle_notify:')) {
        const componentId = parseInt(data.split(':')[1], 10);
        if (isNaN(componentId)) {
            await sendMessage("❌ Invalid project ID.");
            return;
        }
        const { message, messageId } = messageIdCashe[chatId]
        let inlineKeyboard = messageIdCashe[chatId].inlineKeyboard
        console.log("inline keyboard: ", inlineKeyboard)

        if (!messageId) {
            console.error("No message ID found, unable to edit message");
            return;
        }

        let updatedButtonText = ''
        try {
            const existing = await pool.query(
                `SELECT * FROM project_subscriptions WHERE chat_id = $1 AND project_id = $2`,
                [chatId, componentId]
            );

            if (existing.rowCount > 0) {

                await pool.query(
                    `DELETE FROM project_subscriptions WHERE chat_id = $1 AND project_id = $2`,
                    [chatId, componentId]
                );


                updatedButtonText = '🔔 Turn On Notifications'
            } else {

                await pool.query(
                    `INSERT INTO project_subscriptions (chat_id, project_id) VALUES ($1, $2)`,
                    [chatId, componentId]
                );

                updatedButtonText = '🔕 Turn Off Notifications';
            }


        } catch (err) {
            console.error("Database error:", err);
            await sendMessage("❌ Failed to update notifications. Please try again later.");
        }
        inlineKeyboard.forEach(row => {
            row.forEach(button => {
                if (button.callback_data && button.callback_data.startsWith('toggle_notify')) {
                    button.text = updatedButtonText;  // Update the button text
                }
            });
        });
        console.log("Updated inline keyboar: ", inlineKeyboard)

        await editUserMessage(message, inlineKeyboard, chatId, messageId)

    }

    if (data.startsWith('component_detail:')) {
        const componentIndex = parseInt(data.split(':')[1], 10);
        console.log("ComponenIndex: ", componentIndex)

        const components = projectCache[chatId] || [];
        // console.log("components: ", components)
        const component = components[componentIndex];
        console.log("component: ", component)
        componentNameCashe[chatId] = component.name
        const componentId = component.id
        const navigationStack = await getUserNavigation(chatId)
        navigationStack.push({ step: 'component_detail', data: { componentId, component, componentIndex, components } });
        await saveUserNavigation(chatId, navigationStack);

        const issues = await getIssuesByComponentId(componentId)
        issueCashe[chatId] = { issues, componentId }

        const groupedStatuses = await groupIssuesByStatus(issues)
        await sendPaginatedStatusNames(groupedStatuses, chatId, 1, componentNameCashe[chatId], componentId, componentIndex)
    }

    if (data.startsWith('status_')) {
        const statusName = data.split('_')[1];
        const allIssues = issueCashe[chatId].issues

        if (!allIssues || allIssues.length === 0) {
            await sendMessage(chatId, "No issues found for this project.");
            return;
        }

        const navigationStack = await getUserNavigation(chatId)
        navigationStack.push({ step: 'issue_list', data: { status: statusName, allIssues: allIssues } });
        await saveUserNavigation(chatId, navigationStack)

        const groupedStatuses = await groupIssuesByStatus(allIssues);

        if (groupedStatuses[statusName]) {
            await sendIssuesForStatus(statusName, chatId, groupedStatuses);
        } else {
            await sendMessage(chatId, `No issues found for the selected status: ${statusName}`);
        }
    }

    if (data.startsWith('next_status_page:')) {
        const allIssues = issueCashe[chatId]

        if (!allIssues || allIssues.length === 0) {
            await sendMessage(chatId, "No issues found for this project.");
            return;
        }
        const groupedStatuses = await groupIssuesByStatus(allIssues);
        const page = parseInt(data.split(':')[1], 10);
        await sendPaginatedStatusNames(groupedStatuses, chatId, page, componentNameCashe[chatId]);
    }

    if (data.startsWith('prev_status_page:')) {
        const allIssues = issueCashe[chatId]

        if (!allIssues || allIssues.length === 0) {
            await sendMessage("No issues found for this project.", chatId);
            return;
        }
        const groupedStatuses = await groupIssuesByStatus(allIssues);
        const page = parseInt(data.split(':')[1], 10);
        await sendPaginatedStatusNames(groupedStatuses, chatId, page, componentNameCashe[chatId]);
    }

    if (data === 'back') {
        const navigationStack = await getUserNavigation(chatId) || []
        if (!navigationStack || navigationStack.length === 0) {
            await sendMessage("⚠️ No previous step to go back to.");
            return;
        }

        const lastStep = navigationStack.pop();
        await saveUserNavigation(chatId, navigationStack)
        if (lastStep.step === 'issue_list') {
            console.log('Navigating back from issue list:', lastStep);

            const { status, allIssues } = lastStep.data;

            if (!allIssues || allIssues.length === 0) {
                await sendMessage(chatId, "No issues found for this project.");
                return;
            }

            const componentName = componentNameCashe[chatId]

            const componentId = issueCashe[chatId].componentId


            const groupedStatuses = await groupIssuesByStatus(allIssues);

            if (groupedStatuses[status]) {
                await sendPaginatedStatusNames(groupedStatuses, chatId, 1, componentName, componentId);  // Send the issues for the selected status
            } else {
                await sendMessage(chatId, `No issues found for the selected status: ${status}`);  // No issues for this status
            }
        } else if (lastStep.step === 'component_detail') {
            const { componentIndex, components } = lastStep.data;

            const size = 10;
            const totalPages = Math.ceil(components.length / size);
            console.log("Total pages: ", totalPages)
            let currentPage = Math.floor(componentIndex / size) + 1; // 


            console.log("current page: ", currentPage)

            await showPage(chatId, currentPage, components, totalPages);
        } else if (lastStep.step === 'status_page') {
            try {
                const components = await getComponentsFromMainBoard(process.env.MB_ID);
                if (components.length === 0) {
                    await sendMessage(chatId, "📭 No components found for this project.");
                    return;
                }

                projectCache[chatId] = components;
                const size = 10;
                const totalPages = Math.ceil(components.length / size);

                let currentPage = lastStep.data.page; // Use the last saved page number

                await showPage(chatId, currentPage, components, totalPages);
            }
            catch (err) {
                console.error("Failed to load components from Main board", err);
                await sendMessage("❌ Failed to fetch projects from Jira");
            }
        }

        else {
            await sendMessage("⚠️ Unknown step. Returning to main menu.");
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

    // if (text === '/users') {
    //     const admin = await isAdmin(chatId);
    //     if (!admin) {
    //         await sendMessage("🚫 You are not authorized to use this command.");
    //         return;
    //     }
    //     const result = await pool.query("SELECT id, username, email, is_admin FROM jira_users");
    //     const users = result.rows;
    //     if (users.length === 0) return await sendMessage("📭 No registered users.");

    //     const size = 10;
    //     userPages[chatId] = users;
    //     const totalPages = Math.ceil(users.length / size);

    //     const showPage = async (page) => {
    //         const subset = users.slice((page - 1) * size, page * size);
    //         for (const user of subset) {
    //             await sendMessage(`👤 *${user.username}*\n📧 ${user.email}\n🛡 Admin: ${user.is_admin ? "✅ Yes" : "❌ No"}`,
    //                 {
    //                     parse_mode: 'Markdown',
    //                     reply_markup: {
    //                         inline_keyboard: [
    //                             [
    //                                 { text: '✏️ Edit', callback_data: `edit_user:${user.id}` },
    //                                 { text: '🗑 Delete', callback_data: `delete_user:${user.id}` }
    //                             ],
    //                             [
    //                                 {
    //                                     text: user.is_admin ? '❌ Remove Admin' : '✅ Make Admin',
    //                                     callback_data: `toggle_admin:${user.id}`
    //                                 }
    //                             ]
    //                         ]
    //                     }
    //                 });
    //         }
    //         const navButtons = [];
    //         if (page > 1) navButtons.push({ text: '⬅️ Prev', callback_data: `users_page:${page - 1}` });
    //         if (page < totalPages) navButtons.push({ text: '➡️ Next', callback_data: `users_page:${page + 1}` });
    //         if (totalPages > 1) await sendMessage(`📄 Page ${page} of ${totalPages}`, {
    //             reply_markup: { inline_keyboard: [navButtons] }
    //         });
    //     }
    //     await showPage(1);
    //     return;
    // }

    // if (text === '/users') {
    //     const admin = await isAdmin(chatId);
    //     if (!admin) {
    //         await sendMessage("🚫 You are not authorized to use this command.");
    //         return;
    //     }

    //     // Fetch users from the PostgreSQL database (using pg or pg-promise)
    //     const result = await pool.query("SELECT id, username, email, is_admin FROM jira_users");
    //     const users = result.rows;

    //     if (users.length === 0) {
    //         return await sendMessage("📭 No registered users.");
    //     }

    //     const size = 10; // 10 users per page
    //     const totalPages = Math.ceil(users.length / size);
    //     userPages[chatId] = users; // Store users for the chatId

    //     // Function to show a page of users
    //     const showPage = async (page) => {
    //         // Ensure page number is valid
    //         if (page < 1 || page > totalPages) {
    //             await sendMessage("❗ Invalid page.");
    //             return;
    //         }

    //         const start = (page - 1) * size;
    //         const end = start + size;
    //         const subset = users.slice(start, end);

    //         let messageText = `📄 *Users List* (Page ${page} of ${totalPages})\n\n`;
    //         subset.forEach((user, i) => {
    //             messageText += `${i + 1}. 👤 *${user.username}*\n📧 ${user.email}\n🛡 Admin: ${user.is_admin ? "✅ Yes" : "❌ No"}\n\n`;
    //         });

    //         // Inline buttons for selecting users (1 to 10)
    //         const inlineButtons = [
    //             subset.slice(0, 5).map((user, idx) => ({ text: `${idx + 1}`, callback_data: `user_detail:${start + idx}` })),
    //             subset.slice(5, 10).map((user, idx) => ({ text: `${idx + 6}`, callback_data: `user_detail:${start + idx + 5}` }))
    //         ];


    //         // Navigation buttons
    //         const navButtons = [];
    //         if (page > 1) {
    //             navButtons.push({ text: '⬅️ Prev', callback_data: `users_page:${page - 1}` });
    //         }
    //         if (page < totalPages) {
    //             navButtons.push({ text: '➡️ Next', callback_data: `users_page:${page + 1}` });
    //         }

    //         await sendMessage(messageText, {
    //             parse_mode: 'Markdown',
    //             reply_markup: {
    //                 inline_keyboard: [...inlineButtons, navButtons.length ? navButtons : []] // Add user buttons and navigation buttons
    //             }
    //         });
    //     };

    //     // Display the first page
    //     await showPage(1);
    //     return;
    // }

    // Inside the /users command:
    if (text === '/users') {
        const admin = await isAdmin(chatId);
        if (!admin) {
            await sendMessage("🚫 You are not authorized to use this command.");
            return;
        }

        // Fetch users from the PostgreSQL database (using pg or pg-promise)
        const result = await pool.query("SELECT id, username, email, is_admin FROM jira_users");
        const users = result.rows;

        if (users.length === 0) {
            return await sendMessage("📭 No registered users.");
        }

        userPages[chatId] = users; // Store users for the chatId

        // Display the first page
        await showPage(chatId, 1, users);
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


    // Handle pagination for users
    if (data.startsWith('users_page:')) {
        const page = parseInt(data.split(':')[1], 10);
        if (!userPages[chatId]) {
            await sendMessage("❗ Users data not available.");
            return;
        }
        await showPage(chatId, page, userPages[chatId]); // Display the corresponding page
        return;
    }

    // Handle user details when a numeric button is pressed
    if (data.startsWith('user_detail:')) {
        const userIndex = parseInt(data.split(':')[1], 10);
        if (!userPages[chatId] || !userPages[chatId][userIndex]) {
            await sendMessage("❗ User not found.");
            return;
        }
        const user = userPages[chatId][userIndex];

        // Show detailed user information and action buttons (edit, delete, make admin)
        const userDetails = `👤 *Username:* ${user.username}\n📧 *Email:* ${user.email}\n🛡 *Admin:* ${user.is_admin ? "✅ Yes" : "❌ No"}`;

        const actionButtons = [
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
        ];

        await sendMessage(userDetails, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: actionButtons
            }
        });
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

