

// Telegram Api

// app.post("/jirabotapi", async (req, res) => {

//     const body = req.body;



//     if (!body || !body.message) {
//         console.log("❗ Invalid Telegram payload:", body);
//         return res.sendStatus(400); // Bad Request
//     }

//     const message = body.message;
//     const chatId = message.chat.id;
//     // console.log(message)

//     if (message.contact) {
//         const phoneNumber = message.contact.phone_number;
//         const telegramChatId = message.contact.user_id

//         try {
//             await pool.query(
//                 `INSERT INTO managers (phone_number, telegram_chat_id)
//              VALUES ($1, $2)
//              ON CONFLICT (telegram_chat_id) DO NOTHING`,
//                 [phoneNumber, telegramChatId]
//             );

//             await sendMessageBot2(chatId, `✅ Thank you! Your phone number has been saved.`);
//         }
//         catch (err) {
//             console.log(err)
//             await sendMessageBot2(chatId, `⚠️ Failed to save your number. Please try again later.`);
//         }

//         console.log("📞 Phone:", phoneNumber);
//         console.log("💬 Chat ID:", telegramChatId);
//         return res.sendStatus(200);
//     }

//     if (!message || !message.text) return res.sendStatus(200);
//     const text = message.text.trim();

//     if (text === '/start') {
//         await sendMessageBot2(chatId, `👋 Welcome!`, {
//             reply_markup: {
//                 keyboard: [
//                     [
//                         { text: 'Ask for access' },
//                         { text: 'Projects List' }
//                     ]
//                 ],
//                 resize_keyboard: true,
//                 one_time_keyboard: false
//             }
//         });
//         return res.sendStatus(200);
//     }

//     if (text === 'Ask for access') {
//         await sendMessageBot2(chatId, `To get access to projects list, please share your phone number`, {
//             reply_markup: {
//                 keyboard: [
//                     [
//                         {
//                             text: 'Share phone number',
//                             request_contact: true
//                         },

//                     ]
//                 ],
//                 resize_keyboard: true,
//                 one_time_keyboard: true
//             }
//         });
//     }


//     if (text === '/managers_list') {
//         try {
//             const managers = await pool.query(`SELECT telegram_chat_id, phone_number FROM managers`)
//             if (managers.rows.length === 0) {
//                 await sendMessageBot2(chatId, "📭 No registered users.");
//                 return res.sendStatus(200);
//             }

//             for (const manager of managers.rows) {
//                 await sendMessageBot2(chatId,
//                     `👤 *Phone:* ${manager.phone_number}\n 💬 *Telegram ID:* ${manager.telegram_chat_id}\n}`,
//                     { parse_mode: 'Markdown' }
//                 );
//             }
//         }
//         catch (err) {
//             console.log("❌ Error fetching managers:", err);
//             await sendMessageBot2(chatId, `⚠️ Could not fetch managers list.`);
//         }
//         return res.sendStatus(200);
//     }

//     if (text === 'Projects List' || text === '/projects_list') {

//         try {
//             const result = await pool.query(
//                 `SELECT phone_number FROM managers WHERE telegram_chat_id = $1`,
//                 [chatId]
//             );

//             if (result.rows.length === 0) {
//                 await sendMessageBot2(chatId, `🚫 You don't have access. Please request access first.`);
//             } else {
//                 console.log("❌ Error checking access:", err);
//                 await sendMessageBot2(chatId, `⚠️ Something went wrong. Please try again later.`);

//             }

//             return res.sendStatus(200);
//         } catch (err) {
//             console.log(err)
//         }
//     }
//     return res.sendStatus(200);


// });

// app.post("/jirabotapi", async (req, res) => {
//     const body = req.body;


//     if (body.callback_query) {
//         const callback = body.callback_query;
//         const chatId = callback.message.chat.id;
//         const data = callback.data;
//         if (data.startsWith('give_access:')) {
//             const managerId = data.split(':')[1];

//             try {
//                 const result = await pool.query(`SELECT isAccessed, phone_number FROM managers WHERE id = $1`, [managerId]);
//                 if (result.rows.length === 0) {
//                     await sendMessageBot2(chatId, `⚠️ Manager not found.`);
//                     return res.sendStatus(200);
//                 }

//                 const currentStatus = result.rows[0].isaccessed;
//                 const newStatus = !currentStatus;

//                 await pool.query(`UPDATE managers SET isAccessed = $1 WHERE id = $2`, [newStatus, managerId]);

//                 const statusEmoji = newStatus ? '🟢 Access granted' : '🔴 Access revoked';
//                 const phoneNumber = result.rows[0].phone_number;

//                 await sendMessageBot2(chatId, `✅ Access for manager (${phoneNumber}) has been updated: ${statusEmoji}`);
//             } catch (err) {
//                 console.error("❌ Error toggling access:", err);
//                 await sendMessageBot2(chatId, `⚠️ Could not update access status.`);
//             }

//             return res.sendStatus(200);
//         }
//     }

//     if (!body || !body.message) {
//         console.log("❗ Invalid Telegram payload:", body);
//         return res.sendStatus(400);
//     }

//     const message = body.message;
//     const chatId = message.chat.id;

//     const MainMenuKeyboard = async (chatId) => {

//         return {
//             reply_markup: {
//                 keyboard: [
//                     [{ text: 'Ask for access' }, { text: 'Projects List' }],
//                     ...(admin ? [[{ text: '📋 Managers List' }, { text: '⚙️ Admin Panel' }]] : [])
//                 ],
//                 resize_keyboard: true
//             }
//         };
//     };


//     // 📤 Handle contact
//     if (message.contact) {
//         const phoneNumber = message.contact.phone_number;
//         const telegramChatId = message.contact.user_id;

//         try {
//             await pool.query(
//                 `INSERT INTO managers (phone_number, telegram_chat_id)
//                  VALUES ($1, $2)
//                  ON CONFLICT (telegram_chat_id) DO NOTHING`,
//                 [phoneNumber, telegramChatId]
//             );

//             await sendMessageBot2(chatId, `✅ Thank you! Your phone number has been saved.`, await getMainMenuKeyboard(chatId) // ✅ correct
//             );
//         } catch (err) {
//             console.log("❌ Error saving manager:", err);
//             await sendMessageBot2(chatId, `⚠️ Failed to save your number. Please try again later.`, await getMainMenuKeyboard(chatId) // ✅ correct
//             );
//         }

//         return res.sendStatus(200);
//     }

//     if (!message.text) return res.sendStatus(200);
//     const text = message.text.trim();

//     if (text === '/start') {
//         await sendMessageBot2(chatId, `👋 Welcome!`, await getMainMenuKeyboard(chatId) // ✅ correct
//         );
//         return res.sendStatus(200);
//     }

//     if (text === 'Ask for access') {
//         await sendMessageBot2(chatId, `📞 To get access, please share your phone number:`, {
//             reply_markup: {
//                 keyboard: [
//                     [{
//                         text: "📤 Share phone number",
//                         request_contact: true
//                     }],
//                     [{ text: "⬅️ Back to menu" }]
//                 ],
//                 resize_keyboard: true
//             }
//         });
//         return res.sendStatus(200);
//     }

//     if (text === '⬅️ Back to menu') {
//         await sendMessageBot2(chatId, `🏠 Main Menu`,  await getMainMenuKeyboard(chatId) // ✅ correct
//         );
//         return res.sendStatus(200);
//     }

//     if (text === '/managers_list' || text === '📋 Managers List') {

//         try {
//             const managers = await pool.query(`SELECT id, telegram_chat_id, phone_number, isAccessed FROM managers`);
//             if (managers.rows.length === 0) {
//                 await sendMessageBot2(chatId, "📭 No registered managers.", await getMainMenuKeyboard(chatId));
//                 return res.sendStatus(200);
//             }

//             for (const manager of managers.rows) {
//                 const statusText = manager.isaccessed ? '🟢 Accessed' : '🔴 Blocked';

//                 const inlineKeyboard = {
//                     inline_keyboard: [
//                         [
//                             { text: '✏️ Edit', callback_data: `edit_manager:${manager.id}` },
//                             { text: '🗑️ Delete', callback_data: `delete_manager:${manager.id}` }
//                         ],
//                         [
//                             { text: manager.isaccessed ? '🔒 Revoke Access' : '✅ Grant Access', callback_data: `give_access:${manager.id}` }
//                         ]
//                     ],
//                 };
//                 const text = `<b>👤 Phone:</b> ${manager.phone_number}\n<b>💬 Telegram ID:</b> ${manager.telegram_chat_id}\n<b>Status:</b> ${statusText}`;
//                 await sendMessageBot2(chatId, text, {
//                     parse_mode: 'HTML',
//                     reply_markup: inlineKeyboard

//                 }
//                 );
//             }
//         } catch (err) {
//             console.log("❌ Error fetching managers:", err);
//             await sendMessageBot2(chatId, `⚠️ Could not fetch managers list.`, await getMainMenuKeyboard(chatId));
//         }
//         return res.sendStatus(200);
//     }

//     if (text === 'Projects List' || text === '/projects_list') {
//         try {
//             const result = await pool.query(
//                 `SELECT phone_number FROM managers WHERE telegram_chat_id = $1`,
//                 [chatId]
//             );

//             if (result.rows.length === 0) {
//                 await sendMessageBot2(chatId, `🚫 You don't have access.`, await getMainMenuKeyboard(chatId));
//             } else {
//                 await sendMessageBot2(chatId, `📂 You have access to the project list.`, await getMainMenuKeyboard(chatId));
//             }
//         } catch (err) {
//             console.log("❌ Error checking access:", err);
//             await sendMessageBot2(chatId, `⚠️ Something went wrong.`, await getMainMenuKeyboard(chatId));
//         }
//         return res.sendStatus(200);
//     }

//     return res.sendStatus(200);
// });