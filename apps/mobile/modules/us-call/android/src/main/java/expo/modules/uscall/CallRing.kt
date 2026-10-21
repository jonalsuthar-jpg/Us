package expo.modules.uscall

import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

/**
 * The ringing notification for an incoming call: rings and vibrates until
 * answered (like a phone call), shows over the lock screen, and opens the
 * full-screen IncomingCallActivity when the phone is locked or asleep.
 */
object CallRing {
  private const val CHANNEL = "us_incoming_calls"
  private const val RING_SECONDS = 45L
  const val EXTRA_CALL_ID = "us.callId"
  const val EXTRA_CALLER = "us.caller"
  const val EXTRA_VIDEO = "us.video"
  const val EXTRA_SHOW_WHEN_LOCKED = "us.showWhenLocked"

  private var ringingCallId: String? = null

  fun notificationId(callId: String) = "us-ring-$callId".hashCode()

  /** Opens the app on the call, answering or declining it there. */
  fun launchIntent(context: Context, callId: String, action: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse("us://talk?callId=${Uri.encode(callId)}&callAction=$action"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      // Answering from the lock screen keeps the call on top of it.
      .putExtra(EXTRA_SHOW_WHEN_LOCKED, action == "answer")

  fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("ic_stat_onesignal_default", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  fun appInForeground(context: Context): Boolean {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val me = am.runningAppProcesses?.firstOrNull { it.pid == android.os.Process.myPid() } ?: return false
    return me.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(NotificationManager::class.java)
    if (nm.getNotificationChannel(CHANNEL) != null) return
    val channel = NotificationChannel(CHANNEL, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Rings when your partner calls"
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build(),
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 800, 600, 800, 600)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    nm.createNotificationChannel(channel)
  }

  fun show(context: Context, callId: String, caller: String, video: Boolean) {
    ensureChannel(context)
    val id = notificationId(callId)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val screen = Intent(context, IncomingCallActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
      .putExtra(EXTRA_CALL_ID, callId)
      .putExtra(EXTRA_CALLER, caller)
      .putExtra(EXTRA_VIDEO, video)
    val screenPi = PendingIntent.getActivity(context, id, screen, flags)
    val answerPi = PendingIntent.getActivity(context, id + 1, launchIntent(context, callId, "answer"), flags)
    val declinePi = PendingIntent.getActivity(context, id + 2, launchIntent(context, callId, "decline"), flags)

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL)
      else @Suppress("DEPRECATION") Notification.Builder(context).setPriority(Notification.PRIORITY_MAX)
    builder
      .setSmallIcon(smallIcon(context))
      .setContentTitle(caller)
      .setContentText(if (video) "Incoming video call" else "Incoming voice call")
      .setCategory(Notification.CATEGORY_CALL)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(screenPi)
      .setFullScreenIntent(screenPi, true)
      .addAction(Notification.Action.Builder(Icon.createWithResource(context, android.R.drawable.ic_menu_close_clear_cancel), "Decline", declinePi).build())
      .addAction(Notification.Action.Builder(Icon.createWithResource(context, android.R.drawable.ic_menu_call), "Answer", answerPi).build())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) builder.setTimeoutAfter(RING_SECONDS * 1000)
    val notification = builder.build()
    // Keep ringing until it's answered, declined or times out — not just once.
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    context.getSystemService(NotificationManager::class.java).notify(id, notification)
    ringingCallId = callId
  }

  /** Stop ringing: this call, or whichever is ringing when callId is null. */
  fun cancel(context: Context, callId: String?) {
    val id = callId ?: ringingCallId ?: return
    context.getSystemService(NotificationManager::class.java).cancel(notificationId(id))
    if (ringingCallId == id) ringingCallId = null
    IncomingCallActivity.dismiss(id)
  }
}
