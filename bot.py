from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
import requests
import json

# TOKEN BOT TELEGRAM
BOT_TOKEN = "8247907501:AAEB_0Q2OVfgBng_rOnYUwG-ipgtJNP-TYo"

# URL BACKEND EXPRESS (HTTPS dan port 443)
BACKEND_URL = "https://privates.icu:443/register"  # Ganti <your-domain> dengan domain yang sesuai

# ===============================
# /start command
# ===============================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "👋 Halo! Kirim perintah /create <nama> untuk membuat login URL.\n"
        "Contoh: /create LolPS"
    )

# ===============================
# /create command
# ===============================
async def create(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if len(context.args) < 1:
        await update.message.reply_text("⚠️ Gunakan format: /create <nama>")
        return

    name = context.args[0]
    try:
        response = requests.post(BACKEND_URL, json={"name": name}, verify=False)  # Menonaktifkan verifikasi SSL untuk sertifikat self-signed
        data = response.json()

        if data.get("success"):
            await update.message.reply_text(
                f"✅ Server berhasil dibuat!\n🔗 Login URL: {data['loginUrl']}"
            )
        else:
            await update.message.reply_text(f"❌ Gagal: {data.get('error', 'Unknown error')}")
    except Exception as e:
        await update.message.reply_text(f"⚠️ Terjadi kesalahan: {str(e)}")

# ===============================
# /list command
# ===============================
async def list_servers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        response = requests.get("https://privates.icu:443/servers", verify=False)  # Menonaktifkan verifikasi SSL untuk sertifikat self-signed
        data = response.json()
        if not data["servers"]:
            await update.message.reply_text("📭 Belum ada server yang dibuat.")
            return

        msg = "📋 Daftar Server:\n"
        for s in data["servers"]:
            msg += f"• {s['name']} → {s['domain']}\n"
        await update.message.reply_text(msg)
    except Exception as e:
        await update.message.reply_text(f"⚠️ Gagal mengambil data: {str(e)}")

# ===============================
# Jalankan bot
# ===============================
def main():
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("create", create))
    app.add_handler(CommandHandler("list", list_servers))

    print("🤖 Bot Telegram berjalan...")
    app.run_polling()

if __name__ == "__main__":
    main()
