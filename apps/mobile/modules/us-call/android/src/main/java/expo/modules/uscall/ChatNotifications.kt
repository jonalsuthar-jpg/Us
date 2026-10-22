package expo.modules.uscall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import java.io.File
import java.net.URL
import org.json.JSONArray
import org.json.JSONObject

/**
 * New messages while Us is closed: one conversation notification that grows
 * with each message (like a messenger), not a new notification per message.
 * Cleared when the chat is opened.
 */
object ChatNotifications {
  private const val CHANNEL = "us_messages"
  private const val PREFS = "us.chat.notifications"
  private const val KEY = "messages"
  private const val KEEP = 8
  private val ID = "us-chat".hashCode()

  fun add(context: Context, sender: String, text: String, avatarUrl: String? = null) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val list = JSONArray(prefs.getString(KEY, "[]"))
    list.put(JSONObject().put("s", sender).put("t", text).put("w", System.currentTimeMillis()))
    val kept = JSONArray()
    for (i in maxOf(0, list.length() - KEEP) until list.length()) kept.put(list.getJSONObject(i))
    prefs.edit().putString(KEY, kept.toString()).apply()
    val total = prefs.getInt("count", 0) + 1
    prefs.edit().putInt("count", total).apply()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = context.getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "New messages from your partner"
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
          },
        )
      }
    }

    val open = Intent(Intent.ACTION_VIEW, Uri.parse("us://talk"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val openPi = PendingIntent.getActivity(context, ID, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL)
      else @Suppress("DEPRECATION") Notification.Builder(context).setPriority(Notification.PRIORITY_HIGH)
    // Their photo, like a messenger. Kept on disk so a failed download still shows the last one.
    val photo = avatar(context, avatarUrl)
    photo?.let { builder.setLargeIcon(it) }
    builder
      .setSmallIcon(CallRing.smallIcon(context))
      .setContentTitle(sender)
      .setContentText(if (total > 1) "$total new messages" else text)
      .setCategory(Notification.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setNumber(total)
      .setContentIntent(openPi)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val style = Notification.MessagingStyle(Person.Builder().setName("You").build())
      for (i in 0 until kept.length()) {
        val m = kept.getJSONObject(i)
        val person = Person.Builder().setName(m.getString("s"))
        photo?.let { person.setIcon(Icon.createWithBitmap(it)) }
        style.addMessage(m.getString("t"), m.getLong("w"), person.build())
      }
      builder.setStyle(style)
    } else {
      val style = Notification.InboxStyle().setSummaryText(if (total > 1) "$total new messages" else null)
      for (i in 0 until kept.length()) style.addLine(kept.getJSONObject(i).getString("t"))
      builder.setStyle(style)
    }
    context.getSystemService(NotificationManager::class.java).notify(ID, builder.build())
  }

  /** Runs on OneSignal's background thread, so a short blocking download is fine. */
  private fun avatar(context: Context, url: String?): Bitmap? {
    val file = File(context.cacheDir, "us-partner-avatar.png")
    // No photo in the push means they have none now.
    if (url == null) {
      file.delete()
      return null
    }
    run {
      try {
        val conn = URL(url).openConnection().apply { connectTimeout = 4000; readTimeout = 4000 }
        val bmp = conn.getInputStream().use { BitmapFactory.decodeStream(it) }
        if (bmp != null) {
          val side = minOf(bmp.width, bmp.height)
          val square = Bitmap.createBitmap(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side)
          val sized = Bitmap.createScaledBitmap(square, 256, 256, true)
          file.outputStream().use { sized.compress(Bitmap.CompressFormat.PNG, 100, it) }
          return sized
        }
      } catch (_: Exception) {}
    }
    return if (file.exists()) BitmapFactory.decodeFile(file.path) else null
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    context.getSystemService(NotificationManager::class.java).cancel(ID)
  }
}
