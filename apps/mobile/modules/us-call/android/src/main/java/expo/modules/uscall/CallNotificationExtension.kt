package expo.modules.uscall

import android.util.Log
import com.onesignal.notifications.INotificationReceivedEvent
import com.onesignal.notifications.INotificationServiceExtension

/**
 * OneSignal passes every push here first, even when Us is closed. A call push
 * becomes a ringing call (full screen when locked) instead of a plain
 * notification; the "missed" push that follows stops the ringing. Messages
 * gather into one conversation notification instead of one each.
 */
class CallNotificationExtension : INotificationServiceExtension {
  override fun onNotificationReceived(event: INotificationReceivedEvent) {
    val data = event.notification.additionalData ?: return
    if (data.optString("category") == "new_message") {
      // With Us open, the app shows messages live and suppresses the push.
      if (CallRing.appInForeground(event.context)) return
      event.preventDefault()
      ChatNotifications.add(
        event.context,
        event.notification.title ?: "Us",
        event.notification.body ?: "New message",
        data.optString("avatar").ifEmpty { null },
      )
      return
    }
    val callId = data.optString("callId").takeIf { it.isNotEmpty() } ?: return
    when (data.optString("category")) {
      "incoming_call" -> {
        // With Us open, the app rings itself.
        if (CallRing.appInForeground(event.context)) return
        val caller = data.optString("callerName").ifEmpty { event.notification.title ?: "Us" }
        try {
          CallRing.show(event.context, callId, caller, data.optString("media") == "video")
        } catch (e: Exception) {
          // Never a silent call: OneSignal's own notification shows instead.
          Log.e("UsCall", "ringing failed", e)
          return
        }
        event.preventDefault()
      }
      "call_ended" -> CallRing.cancel(event.context, callId)
    }
  }
}
