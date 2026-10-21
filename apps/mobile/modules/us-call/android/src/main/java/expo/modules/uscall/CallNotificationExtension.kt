package expo.modules.uscall

import com.onesignal.notifications.INotificationReceivedEvent
import com.onesignal.notifications.INotificationServiceExtension

/**
 * OneSignal passes every push here first, even when Us is closed. A call push
 * becomes a ringing call (full screen when locked) instead of a plain
 * notification; the "missed" push that follows stops the ringing.
 */
class CallNotificationExtension : INotificationServiceExtension {
  override fun onNotificationReceived(event: INotificationReceivedEvent) {
    val data = event.notification.additionalData ?: return
    val callId = data.optString("callId").takeIf { it.isNotEmpty() } ?: return
    when (data.optString("category")) {
      "incoming_call" -> {
        // With Us open, the app rings itself.
        if (CallRing.appInForeground(event.context)) return
        event.preventDefault()
        val caller = data.optString("callerName").ifEmpty { event.notification.title ?: "Us" }
        CallRing.show(event.context, callId, caller, data.optString("media") == "video")
      }
      "call_ended" -> CallRing.cancel(event.context, callId)
    }
  }
}
