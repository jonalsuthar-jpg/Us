package expo.modules.uscall

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Runs for the length of a call. Android cuts the microphone (and camera) of
 * an app that goes to the background unless a foreground service like this
 * one holds them; its notification takes you back to the call.
 */
class CallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Call in progress"
    val video = intent?.getBooleanExtra(EXTRA_VIDEO, false) ?: false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL) == null) {
        nm.createNotificationChannel(
          NotificationChannel(CHANNEL, "Ongoing call", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shown while you're on a call"
            setShowBadge(false)
          },
        )
      }
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
    val openPi = open?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL)
      else @Suppress("DEPRECATION") Notification.Builder(this)
    val notification = builder
      .setSmallIcon(CallRing.smallIcon(this))
      .setContentTitle(title)
      .setContentText("Tap to return to the call")
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setContentIntent(openPi)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val mic = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        try {
          startForeground(NOTIFICATION_ID, notification, if (video) mic or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else mic)
        } catch (e: SecurityException) {
          // No camera permission (voice-only so far): keep at least the microphone.
          startForeground(NOTIFICATION_ID, notification, mic)
        }
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      Log.w("UsCall", "could not start the call service", e)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  companion object {
    private const val CHANNEL = "us_ongoing_call"
    private const val NOTIFICATION_ID = 4711
    const val EXTRA_TITLE = "title"
    const val EXTRA_VIDEO = "video"
  }
}
