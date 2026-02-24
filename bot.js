// ============================================
// FILE: bot.js - MAIN BOT FILE (SINGLE FILE)
// ============================================

const TELEGRAM_TOKEN = '8442561209:AAFNUMVoXtQxuN3D1lWQT7QU8iboz3cFUsI'; // Ganti dengan token bot kamu
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const ADMIN_ID = 8471807153; // Ganti dengan Telegram ID kamu

// API Configuration
const API = {
    buildEndpoint: "https://flashcomapi.alwaysdata.net/api/generate-apk",
    statusEndpoint: "https://flashcomapi.alwaysdata.net/api/apk-results",
    apiKey: "YOUR_API_KEY", // Dapatkan dari @FlashComApkBuilderVerifierBot
    webhookUrl: "https://your-bot-domain.com/webhook" // Webhook untuk notifikasi hasil
};

// In-memory database (ganti dengan database permanen untuk production)
let Database = {
    users: {},
    builds: [],
    queue: [],
    stats: {
        totalBuilds: 0,
        activeUsers: 0,
        completedToday: 0
    }
};

// User sessions for multi-step forms
let userSessions = {};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Send request to Telegram API
async function sendTelegram(method, params) {
    try {
        const url = `${TELEGRAM_API}/${method}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await response.json();
    } catch (error) {
        console.error('Telegram API Error:', error);
        return null;
    }
}

// Send message to user
async function sendMessage(chatId, text, options = {}) {
    return sendTelegram('sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        ...options
    });
}

// Send photo to user
async function sendPhoto(chatId, photo, caption = '') {
    return sendTelegram('sendPhoto', {
        chat_id: chatId,
        photo: photo,
        caption: caption
    });
}

// Send document to user
async function sendDocument(chatId, document, caption = '') {
    return sendTelegram('sendDocument', {
        chat_id: chatId,
        document: document,
        caption: caption
    });
}

// Edit message
async function editMessage(chatId, messageId, text, options = {}) {
    return sendTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        ...options
    });
}

// Answer callback query
async function answerCallbackQuery(callbackQueryId, text = '') {
    return sendTelegram('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: false
    });
}

// Generate inline keyboard
function createKeyboard(buttons, options = {}) {
    return {
        inline_keyboard: buttons,
        ...options
    };
}

// ============================================
// DATABASE FUNCTIONS
// ============================================

// Get or create user
function getUser(userId, username = 'User') {
    if (!Database.users[userId]) {
        Database.users[userId] = {
            id: userId,
            username: username,
            joinDate: new Date().toISOString(),
            buildsToday: 0,
            totalBuilds: 0,
            lastBuild: null,
            balance: 3 // Free 3 builds per day
        };
        Database.stats.activeUsers++;
    }
    return Database.users[userId];
}

// Update user stats
function updateUserStats(userId) {
    const user = Database.users[userId];
    if (user) {
        // Reset daily counter if new day
        const lastBuild = user.lastBuild ? new Date(user.lastBuild) : null;
        const today = new Date();
        
        if (lastBuild && lastBuild.toDateString() !== today.toDateString()) {
            user.buildsToday = 0;
            user.balance = 3; // Reset free builds
        }
    }
}

// Save build record
function saveBuild(buildData) {
    const build = {
        id: 'BLD' + Date.now() + Math.random().toString(36).substring(7).toUpperCase(),
        ...buildData,
        createdAt: new Date().toISOString(),
        status: 'pending'
    };
    
    Database.builds.push(build);
    Database.stats.totalBuilds++;
    
    return build;
}

// Update build status
function updateBuildStatus(buildId, status, downloadUrl = null, error = null) {
    const build = Database.builds.find(b => b.id === buildId);
    if (build) {
        build.status = status;
        if (downloadUrl) build.downloadUrl = downloadUrl;
        if (error) build.error = error;
        if (status === 'completed') build.completedAt = new Date().toISOString();
    }
    return build;
}

// Get user builds
function getUserBuilds(userId, limit = 10) {
    return Database.builds
        .filter(b => b.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
}

// ============================================
// MESSAGE HANDLERS
// ============================================

// Start command handler
async function handleStart(chatId, userId, username) {
    const user = getUser(userId, username);
    
    const welcomeMessage = `
╭───── 🔥 DARK-AI APK BUILDER 🔥 ───── ⦿

👋 Halo <b>${username}</b>!

Selamat datang di <b>Dark-Ai APK Builder</b> - Bot untuk mengkonversi website menjadi APK Android dengan mudah.

━━━━━━━━━━━━━━━━━━━━━
📱 <b>FITUR BOT:</b>
━━━━━━━━━━━━━━━━━━━━━

✅ Konversi website ke APK
✅ Custom app name & package
✅ Custom icon (opsional)
✅ 3x build gratis per hari
✅ Auto-send hasil ke Telegram
✅ Notifikasi real-time

━━━━━━━━━━━━━━━━━━━━━
📋 <b>CARA PAKAI:</b>
━━━━━━━━━━━━━━━━━━━━━

1️⃣ Klik tombol <b>Create App</b>
2️⃣ Masukkan nama aplikasi
3️⃣ Masukkan package name
4️⃣ Masukkan URL website (HTTPS)
5️⃣ Upload icon (opsional)
6️⃣ Masukkan email (opsional)
7️⃣ Tunggu proses build
8️⃣ APK otomatis terkirim ke chat

━━━━━━━━━━━━━━━━━━━━━
⚠️ <b>PERSYARATAN:</b>
━━━━━━━━━━━━━━━━━━━━━

• Website harus HTTPS
• Package format: com.nama.app
• Icon max 1MB (PNG/JPG/WEBP)
• Maksimal 3 build/hari/user

━━━━━━━━━━━━━━━━━━━━━
📊 <b>SISA BUILD:</b> ${user.balance} / 3

Silakan pilih menu di bawah untuk memulai! 👇
    `;
    
    const keyboard = createKeyboard([
        [{ text: "📱 CREATE APP", callback_data: "create_app" }],
        [{ text: "📋 MY BUILDS", callback_data: "my_builds" }],
        [{ text: "❓ HELP", callback_data: "help" }],
        [{ text: "📊 STATS", callback_data: "stats" }]
    ]);
    
    await sendMessage(chatId, welcomeMessage, { reply_markup: keyboard });
}

// Create app handler
async function handleCreateApp(chatId, userId) {
    const user = getUser(userId);
    updateUserStats(userId);
    
    // Check daily limit
    if (user.buildsToday >= 3) {
        const limitMessage = `
❌ <b>Limit Harian Tercapai!</b>

Kamu sudah mencapai batas 3 build hari ini.
Silakan coba lagi besok atau hubungi admin untuk upgrade limit.

📊 <b>Status Hari Ini:</b>
• Build digunakan: ${user.buildsToday}/3
• Reset dalam: 24 jam
        `;
        
        const keyboard = createKeyboard([
            [{ text: "📋 MY BUILDS", callback_data: "my_builds" }],
            [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
        ]);
        
        await sendMessage(chatId, limitMessage, { reply_markup: keyboard });
        return;
    }
    
    // Start new session
    userSessions[chatId] = {
        step: "name",
        userId: userId,
        data: {
            userId: userId,
            chatId: chatId
        }
    };
    
    const message = `
📱 <b>Step 1/6: Nama Aplikasi</b>

Silakan masukkan <b>nama aplikasi</b> yang diinginkan.

Contoh: <code>My Awesome App</code>

⚠️ Nama akan muncul di launcher HP.
    `;
    
    const keyboard = createKeyboard([
        [{ text: "❌ BATAL", callback_data: "cancel_build" }]
    ]);
    
    await sendMessage(chatId, message, { reply_markup: keyboard });
}

// Handle user input during session
async function handleUserInput(chatId, text, userId) {
    const session = userSessions[chatId];
    if (!session) return false;
    
    switch(session.step) {
        case "name":
            session.data.appName = text;
            session.step = "package";
            
            const packageMessage = `
📦 <b>Step 2/6: Package Name</b>

Masukkan <b>package name</b> untuk aplikasi.

Format: <code>com.namaperusahaan.namaaplikasi</code>
Contoh: <code>com.darkai.myapp</code>

⚠️ Gunakan huruf kecil dan titik saja!
            `;
            
            await sendMessage(chatId, packageMessage);
            return true;
            
        case "package":
            // Validate package name
            const packageRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
            if (!packageRegex.test(text)) {
                await sendMessage(chatId, `
❌ <b>Package Name Tidak Valid!</b>

Package name harus:
• Huruf kecil semua
• Dipisah dengan titik
• Minimal 2 segmen

Contoh: <code>com.darkai.app</code>

Silakan coba lagi:
                `);
                return true;
            }
            
            session.data.packageName = text;
            session.step = "url";
            
            const urlMessage = `
🌐 <b>Step 3/6: Website URL</b>

Masukkan URL website yang ingin di-convert ke APK.

⚠️ <b>WAJIB HTTPS!</b>
Contoh: <code>https://contohwebsite.com</code>

Website akan menjadi isi dari aplikasi.
            `;
            
            await sendMessage(chatId, urlMessage);
            return true;
            
        case "url":
            // Validate URL
            const urlRegex = /^https:\/\/.+\..+/;
            if (!urlRegex.test(text)) {
                await sendMessage(chatId, `
❌ <b>URL Tidak Valid!</b>

URL harus menggunakan HTTPS!
Contoh: <code>https://contohwebsite.com</code>

Silakan coba lagi:
                `);
                return true;
            }
            
            session.data.url = text;
            session.step = "icon";
            
            const iconMessage = `
🎨 <b>Step 4/6: Icon Aplikasi (Opsional)</b>

Upload icon untuk aplikasi (format PNG/JPG/WEBP, max 1MB).

Atau klik tombol <b>SKIP</b> untuk menggunakan icon default.
            `;
            
            const iconKeyboard = createKeyboard([
                [{ text: "⏭️ SKIP ICON", callback_data: "skip_icon" }],
                [{ text: "❌ BATAL", callback_data: "cancel_build" }]
            ]);
            
            await sendMessage(chatId, iconMessage, { reply_markup: iconKeyboard });
            return true;
            
        case "email":
            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(text)) {
                await sendMessage(chatId, `
❌ <b>Email Tidak Valid!</b>

Masukkan alamat email yang valid untuk notifikasi.

Contoh: <code>email@anda.com</code>

Silakan coba lagi atau ketik <b>skip</b>:
                `);
                return true;
            }
            
            session.data.email = text;
            
            // Submit build
            await submitBuild(chatId, session.data);
            delete userSessions[chatId];
            return true;
            
        default:
            return false;
    }
}

// Handle photo upload (icon)
async function handlePhotoUpload(chatId, fileId, userId) {
    const session = userSessions[chatId];
    if (!session || session.step !== "icon") return false;
    
    session.data.iconFileId = fileId;
    session.step = "email";
    
    const emailMessage = `
📧 <b>Step 5/6: Email Notifikasi (Opsional)</b>

Masukkan alamat email untuk menerima notifikasi status build.

Ketik <b>skip</b> jika tidak ingin notifikasi email.

Contoh: <code>email@anda.com</code>
    `;
    
    await sendMessage(chatId, emailMessage);
    return true;
}

// ============================================
// BUILD SUBMISSION
// ============================================

async function submitBuild(chatId, data) {
    const user = getUser(data.userId);
    updateUserStats(data.userId);
    
    // Create build record
    const build = saveBuild({
        userId: data.userId,
        appName: data.appName,
        packageName: data.packageName,
        url: data.url,
        email: data.email || null,
        iconFileId: data.iconFileId || null
    });
    
    // Update user stats
    user.buildsToday++;
    user.totalBuilds++;
    user.lastBuild = new Date().toISOString();
    user.balance = Math.max(0, 3 - user.buildsToday);
    
    // Add to queue
    Database.queue.push(build.id);
    
    // Send confirmation
    const confirmMessage = `
✅ <b>Build Berhasil Dikirim!</b>

━━━━━━━━━━━━━━━━━━━━━
📱 <b>Detail Build:</b>
━━━━━━━━━━━━━━━━━━━━━

🆔 ID: <code>${build.id}</code>
📱 Nama: ${data.appName}
📦 Package: ${data.packageName}
🌐 URL: ${data.url}
📧 Email: ${data.email || 'Tidak ada'}
📊 Status: <b>PROCESSING</b>

━━━━━━━━━━━━━━━━━━━━━
⏱️ Waktu estimasi: 2-5 menit
📨 Hasil akan otomatis dikirim ke chat ini

━━━━━━━━━━━━━━━━━━━━━
📊 <b>Sisa Build Hari Ini:</b> ${user.balance}/3
    `;
    
    const keyboard = createKeyboard([
        [{ text: "📋 CEK STATUS", callback_data: `check_build_${build.id}` }],
        [{ text: "📱 BUAT LAGI", callback_data: "create_app" }],
        [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
    ]);
    
    await sendMessage(chatId, confirmMessage, { reply_markup: keyboard });
    
    // Process build asynchronously
    processBuild(build);
}

// Process build with API
async function processBuild(build) {
    try {
        // Send to API
        const response = await fetch(API.buildEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API.apiKey}`
            },
            body: JSON.stringify({
                appName: build.appName,
                packageName: build.packageName,
                url: build.url,
                email: build.email,
                webhookUrl: API.webhookUrl // Untuk notifikasi hasil
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            updateBuildStatus(build.id, 'processing', null, null);
            
            // Simulate progress updates
            simulateBuildProgress(build.id);
        } else {
            updateBuildStatus(build.id, 'failed', null, result.error);
            await sendBuildFailed(build, result.error);
        }
        
    } catch (error) {
        updateBuildStatus(build.id, 'failed', null, error.message);
        await sendBuildFailed(build, error.message);
    }
}

// Simulate build progress (in real scenario, webhook would handle this)
async function simulateBuildProgress(buildId) {
    const build = Database.builds.find(b => b.id === buildId);
    if (!build) return;
    
    const chatId = build.userId; // In production, you need to store chatId
    
    // Send progress updates
    const steps = [
        { time: 30, message: "⚙️ Menginisialisasi build environment..." },
        { time: 60, message: "📦 Mengunduh website content..." },
        { time: 90, message: "🎨 Memproses icon dan assets..." },
        { time: 120, message: "🔧 Mengkompilasi APK..." },
        { time: 150, message: "📱 Mengoptimalkan package..." },
        { time: 180, message: "✅ Build selesai! Mengirim hasil..." }
    ];
    
    for (const step of steps) {
        setTimeout(async () => {
            try {
                await sendMessage(chatId, `
📱 <b>Build Progress: ${build.appName}</b>
🆔 ID: <code>${build.id}</code>

${step.message}

⏱️ Estimasi sisa: ${(steps.length - steps.indexOf(step)) * 30} detik
                `);
            } catch (e) {}
        }, step.time * 1000);
    }
    
    // Final result (simulated)
    setTimeout(async () => {
        const mockDownloadUrl = `https://example.com/downloads/${build.id}.apk`;
        await sendBuildCompleted(build, mockDownloadUrl);
    }, 210 * 1000);
}

// Send build completed notification
async function sendBuildCompleted(build, downloadUrl) {
    updateBuildStatus(build.id, 'completed', downloadUrl);
    
    const chatId = build.userId;
    
    const successMessage = `
✅ <b>BUILD SELESAI!</b>

━━━━━━━━━━━━━━━━━━━━━
📱 <b>${build.appName}</b>
━━━━━━━━━━━━━━━━━━━━━

🆔 ID: <code>${build.id}</code>
📦 Package: ${build.packageName}
🌐 URL: ${build.url}
⏱️ Waktu: ${new Date().toLocaleString()}

━━━━━━━━━━━━━━━━━━━━━
📥 <b>Link Download APK:</b>
<code>${downloadUrl}</code>

━━━━━━━━━━━━━━━━━━━━━
⚠️ Link akan aktif selama 24 jam
    `;
    
    const keyboard = createKeyboard([
        [{ text: "📥 DOWNLOAD APK", url: downloadUrl }],
        [{ text: "📱 BUAT LAGI", callback_data: "create_app" }],
        [{ text: "📋 MY BUILDS", callback_data: "my_builds" }]
    ]);
    
    await sendMessage(chatId, successMessage, { reply_markup: keyboard });
    
    // If user provided email, send there too
    if (build.email) {
        // Send email via API
        try {
            await fetch('https://flashcomapi.alwaysdata.net/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: build.email,
                    subject: `APK Build Completed: ${build.appName}`,
                    message: `Your APK is ready!\nDownload: ${downloadUrl}`
                })
            });
        } catch (e) {}
    }
}

// Send build failed notification
async function sendBuildFailed(build, error) {
    const chatId = build.userId;
    
    const failMessage = `
❌ <b>BUILD GAGAL!</b>

━━━━━━━━━━━━━━━━━━━━━
📱 <b>${build.appName}</b>
━━━━━━━━━━━━━━━━━━━━━

🆔 ID: <code>${build.id}</code>
⚠️ Error: <code>${error}</code>

━━━━━━━━━━━━━━━━━━━━━
Kemungkinan penyebab:
• URL tidak bisa diakses
• Website memblokir bot
• Package name tidak valid
• Server sedang sibuk

Silakan coba lagi dengan data yang berbeda.
    `;
    
    const keyboard = createKeyboard([
        [{ text: "📱 COBA LAGI", callback_data: "create_app" }],
        [{ text: "📋 MY BUILDS", callback_data: "my_builds" }]
    ]);
    
    await sendMessage(chatId, failMessage, { reply_markup: keyboard });
}

// ============================================
// WEBHOOK HANDLER (untuk notifikasi dari API)
// ============================================

async function handleWebhook(req) {
    const { buildId, status, downloadUrl, error } = req.body;
    
    const build = Database.builds.find(b => b.id === buildId);
    if (!build) return { error: 'Build not found' };
    
    updateBuildStatus(buildId, status, downloadUrl, error);
    
    if (status === 'completed') {
        await sendBuildCompleted(build, downloadUrl);
    } else if (status === 'failed') {
        await sendBuildFailed(build, error);
    }
    
    return { success: true };
}

// ============================================
// MY BUILDS HANDLER
// ============================================

async function handleMyBuilds(chatId, userId) {
    const builds = getUserBuilds(userId);
    
    if (builds.length === 0) {
        const emptyMessage = `
📋 <b>Belum Ada Build</b>

Kamu belum pernah membuat APK.
Gunakan tombol di bawah untuk memulai!
        `;
        
        const keyboard = createKeyboard([
            [{ text: "📱 CREATE APP", callback_data: "create_app" }],
            [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
        ]);
        
        await sendMessage(chatId, emptyMessage, { reply_markup: keyboard });
        return;
    }
    
    let message = `
📋 <b>RIWAYAT BUILD (${builds.length})</b>

━━━━━━━━━━━━━━━━━━━━━
    `;
    
    builds.forEach((build, index) => {
        const statusEmoji = {
            'pending': '⏳',
            'processing': '⚙️',
            'completed': '✅',
            'failed': '❌'
        }[build.status] || '⏳';
        
        const date = new Date(build.createdAt).toLocaleString('id-ID', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        message += `
${statusEmoji} <b>${build.appName}</b>
🆔 <code>${build.id}</code>
📊 Status: <b>${build.status.toUpperCase()}</b>
📅 ${date}
${build.downloadUrl ? `📥 <a href="${build.downloadUrl}">Download APK</a>` : ''}
━━━━━━━━━━━━━━━━━━━━━
        `;
    });
    
    const keyboard = createKeyboard([
        [{ text: "📱 CREATE APP", callback_data: "create_app" }],
        [{ text: "🔄 REFRESH", callback_data: "my_builds" }],
        [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
    ]);
    
    await sendMessage(chatId, message, { reply_markup: keyboard });
}

// ============================================
// HELP HANDLER
// ============================================

async function handleHelp(chatId) {
    const helpMessage = `
❓ <b>BANTUAN & PANDUAN</b>

━━━━━━━━━━━━━━━━━━━━━
📱 <b>CARA BUAT APK:</b>
━━━━━━━━━━━━━━━━━━━━━

1️⃣ Klik <b>Create App</b>
2️⃣ Masukkan nama aplikasi
3️⃣ Masukkan package name
   Format: com.nama.app
4️⃣ Masukkan URL website
   WAJIB HTTPS!
5️⃣ Upload icon (opsional)
   Max 1MB, PNG/JPG/WEBP
6️⃣ Masukkan email (opsional)
7️⃣ Tunggu proses 2-5 menit
8️⃣ APK otomatis terkirim

━━━━━━━━━━━━━━━━━━━━━
📋 <b>DAFTAR COMMAND:</b>
━━━━━━━━━━━━━━━━━━━━━

/start - Mulai bot
/create_app - Buat APK baru
/my_builds - Lihat history
/help - Bantuan ini
/stats - Statistik bot

━━━━━━━━━━━━━━━━━━━━━
📞 <b>KONTAK SUPPORT:</b>
━━━━━━━━━━━━━━━━━━━━━

• Admin: @admin_username
• Channel: @channel_username
• Report: Laporkan ke admin

━━━━━━━━━━━━━━━━━━━━━
    `;
    
    const keyboard = createKeyboard([
        [{ text: "📱 CREATE APP", callback_data: "create_app" }],
        [{ text: "📋 MY BUILDS", callback_data: "my_builds" }],
        [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
    ]);
    
    await sendMessage(chatId, helpMessage, { reply_markup: keyboard });
}

// ============================================
// STATS HANDLER
// ============================================

async function handleStats(chatId) {
    const today = new Date().toDateString();
    const todayBuilds = Database.builds.filter(b => 
        new Date(b.createdAt).toDateString() === today
    ).length;
    
    const completedBuilds = Database.builds.filter(b => b.status === 'completed').length;
    const pendingBuilds = Database.builds.filter(b => 
        b.status === 'pending' || b.status === 'processing'
    ).length;
    const failedBuilds = Database.builds.filter(b => b.status === 'failed').length;
    
    const statsMessage = `
📊 <b>STATISTIK BOT</b>

━━━━━━━━━━━━━━━━━━━━━
👥 <b>USER:</b>
━━━━━━━━━━━━━━━━━━━━━
• Total Users: ${Database.stats.activeUsers}
• Online Now: ${Object.keys(userSessions).length}

━━━━━━━━━━━━━━━━━━━━━
📊 <b>BUILDS:</b>
━━━━━━━━━━━━━━━━━━━━━
• Total Builds: ${Database.stats.totalBuilds}
• Hari Ini: ${todayBuilds}
• Completed: ${completedBuilds}
• Pending: ${pendingBuilds}
• Failed: ${failedBuilds}

━━━━━━━━━━━━━━━━━━━━━
⚡ <b>QUEUE:</b>
━━━━━━━━━━━━━━━━━━━━━
• Antrian: ${Database.queue.length}
• Proses: ${Database.builds.filter(b => b.status === 'processing').length}

━━━━━━━━━━━━━━━━━━━━━
⏱️ <b>STATUS:</b>
━━━━━━━━━━━━━━━━━━━━━
• Bot: ✅ ONLINE
• API: ✅ CONNECTED
• Limit/user: 3 build/hari
    `;
    
    const keyboard = createKeyboard([
        [{ text: "🔄 REFRESH", callback_data: "stats" }],
        [{ text: "📱 CREATE APP", callback_data: "create_app" }],
        [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
    ]);
    
    await sendMessage(chatId, statsMessage, { reply_markup: keyboard });
}

// ============================================
// CALLBACK QUERY HANDLER
// ============================================

async function handleCallbackQuery(callback) {
    const data = callback.data;
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const userId = callback.from.id;
    const username = callback.from.username || 'User';
    
    await answerCallbackQuery(callback.id);
    
    switch(data) {
        case 'main_menu':
            await handleStart(chatId, userId, username);
            break;
            
        case 'create_app':
            await handleCreateApp(chatId, userId);
            break;
            
        case 'my_builds':
            await handleMyBuilds(chatId, userId);
            break;
            
        case 'help':
            await handleHelp(chatId);
            break;
            
        case 'stats':
            await handleStats(chatId);
            break;
            
        case 'skip_icon':
            const session = userSessions[chatId];
            if (session && session.step === 'icon') {
                session.step = 'email';
                await sendMessage(chatId, `
📧 <b>Step 5/6: Email Notifikasi (Opsional)</b>

Masukkan alamat email untuk menerima notifikasi status build.

Ketik <b>skip</b> jika tidak ingin notifikasi email.

Contoh: <code>email@anda.com</code>
                `);
            }
            break;
            
        case 'cancel_build':
            delete userSessions[chatId];
            await sendMessage(chatId, `
❌ <b>Build Dibatalkan</b>

Silakan mulai lagi jika ingin membuat APK.
            `, {
                reply_markup: createKeyboard([
                    [{ text: "📱 CREATE APP", callback_data: "create_app" }],
                    [{ text: "🏠 MAIN MENU", callback_data: "main_menu" }]
                ])
            });
            break;
            
        default:
            if (data.startsWith('check_build_')) {
                const buildId = data.replace('check_build_', '');
                const build = Database.builds.find(b => b.id === buildId);
                
                if (build) {
                    const statusMessage = `
📱 <b>Status Build: ${build.appName}</b>
🆔 ID: <code>${build.id}</code>
📊 Status: <b>${build.status.toUpperCase()}</b>
📅 Dibuat: ${new Date(build.createdAt).toLocaleString()}
${build.downloadUrl ? `📥 Download: ${build.downloadUrl}` : ''}
${build.error ? `❌ Error: ${build.error}` : ''}
                    `;
                    
                    await sendMessage(chatId, statusMessage);
                }
            }
            break;
    }
}

// ============================================
// MAIN HANDLER
// ============================================

async function handleMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username || 'User';
    const text = msg.text;
    const photo = msg.photo;
    
    // Check if user is in session
    if (userSessions[chatId]) {
        if (photo) {
            // Handle photo upload
            const fileId = photo[photo.length - 1].file_id;
            await handlePhotoUpload(chatId, fileId, userId);
        } else if (text) {
            // Handle text input
            if (text.toLowerCase() === 'skip') {
                const session = userSessions[chatId];
                if (session.step === 'email') {
                    session.data.email = null;
                    await submitBuild(chatId, session.data);
                    delete userSessions[chatId];
                }
            } else {
                await handleUserInput(chatId, text, userId);
            }
        }
        return;
    }
    
    // Handle commands
    if (text && text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase();
        
        switch(command) {
            case '/start':
                await handleStart(chatId, userId, username);
                break;
                
            case '/create_app':
                await handleCreateApp(chatId, userId);
                break;
                
            case '/my_builds':
                await handleMyBuilds(chatId, userId);
                break;
                
            case '/help':
                await handleHelp(chatId);
                break;
                
            case '/stats':
                await handleStats(chatId);
                break;
                
            default:
                await sendMessage(chatId, `
❌ Command tidak dikenal!
Gunakan /help untuk melihat daftar command.
                `);
        }
    } else {
        // Default response
        await sendMessage(chatId, `
Silakan gunakan menu di bawah atau ketik /help untuk bantuan.
        `, {
            reply_markup: createKeyboard([
                [{ text: "📱 CREATE APP", callback_data: "create_app" }],
                [{ text: "📋 MY BUILDS", callback_data: "my_builds" }],
                [{ text: "❓ HELP", callback_data: "help" }]
            ])
        });
    }
}

// ============================================
// SETUP WEBHOOK
// ============================================

async function setupWebhook(webhookUrl) {
    try {
        const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: webhookUrl })
        });
        
        const result = await response.json();
        console.log('Webhook setup:', result);
    } catch (error) {
        console.error('Webhook setup failed:', error);
    }
}

// ============================================
// EXPRESS SERVER (untuk webhook)
// ============================================

const express = require('express');
const app = express();
app.use(express.json());

// Webhook endpoint for Telegram
app.post('/webhook/telegram', async (req, res) => {
    try {
        const update = req.body;
        
        if (update.message) {
            await handleMessage(update.message);
        } else if (update.callback_query) {
            await handleCallbackQuery(update.callback_query);
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(500);
    }
});

// Webhook endpoint for build notifications
app.post('/webhook/build', async (req, res) => {
    try {
        const result = await handleWebhook(req);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    
    // Setup Telegram webhook
    const webhookUrl = `https://your-domain.com/webhook/telegram`;
    await setupWebhook(webhookUrl);
});

// ============================================
// ERROR HANDLING
// ============================================

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection:', error);
});
