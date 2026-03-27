const https = require('https');
const token = '8452017277:AAF08VRtTGyaNe5XKp5Ny_s0VsmAeLSYoBc';

console.log("Fetching latest messages sent to bot...");

https.get(`https://api.telegram.org/bot${token}/getUpdates`, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            if (!response.ok) {
                console.error("Telegram API Error:", response);
                return;
            }

            if (response.result && response.result.length > 0) {
                // Find the latest message to extract the chat_id of the user
                const latestUpdate = response.result[response.result.length - 1];
                const chat_id = latestUpdate.message ? latestUpdate.message.chat.id : null;
                
                if (!chat_id) {
                    console.log("Could not extract chat_id from the latest update.");
                    return;
                }

                console.log(`✅ Success! Detected your Chat ID: ${chat_id}`);
                console.log("Attempting to dispatch a test alert to your phone...");

                const msg = encodeURIComponent("🔔 *Kaspi Birds PRO*\nСистема алертов успешно подключена! Я буду присылать сюда уведомления об изменении цен конкурентов.");
                const sendUrl = `https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat_id}&text=${msg}&parse_mode=Markdown`;

                https.get(sendUrl, (res2) => {
                    let d2 = '';
                    res2.on('data', chunk => d2 += chunk);
                    res2.on('end', () => {
                        const sendResp = JSON.parse(d2);
                        if (sendResp.ok) {
                            console.log("🚀 ALERT SENT SUCCESSFULLY! Check your Telegram.");
                            console.log(`\nIMPORTANT: Save these variables for the Pro env:\nTELEGRAM_BOT_TOKEN="8452017277:AAF08VRtTGyaNe5XKp5Ny_s0VsmAeLSYoBc"\nTELEGRAM_CHAT_ID="${chat_id}"`);
                        } else {
                            console.error("Failed to send msg:", sendResp);
                        }
                    });
                });

            } else {
                console.log("⚠️ Жду сообщения от вас...");
                console.log("Пожалуйста, зайдите в Telegram, найдите бота @kaspibirdsBOT");
                console.log("и нажмите кнопку 'Start' (или напишите любое слово).");
            }
        } catch (e) {
            console.error("Failed to parse response:", e);
        }
    });
}).on('error', err => console.error("HTTP Error:", err));
