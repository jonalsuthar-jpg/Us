package expo.modules.uscall

import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UsCallModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UsCall")

    /**
     * "Hang up" pressed on the ongoing-call notification, maybe with the app
     * closed; a call answered or declined on my other device.
     */
    Events("onHangupRequested", "onCallHandledElsewhere")

    OnCreate {
      CallService.onHangup = { sendEvent("onHangupRequested") }
      CallRing.onHandledElsewhere = { callId -> sendEvent("onCallHandledElsewhere", mapOf("callId" to callId)) }
    }
    OnDestroy {
      CallService.onHangup = null
      CallRing.onHandledElsewhere = null
    }

    /** Keep the mic (and camera on video calls) while Us is in the background. */
    Function("startCallService") { title: String, video: Boolean ->
      val intent = Intent(context, CallService::class.java)
        .putExtra(CallService.EXTRA_TITLE, title)
        .putExtra(CallService.EXTRA_VIDEO, video)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    Function("stopCallService") {
      context.stopService(Intent(context, CallService::class.java))
    }

    /** Stop the native ringing for this call (or any) — the app has taken over. */
    Function("cancelIncomingRing") { callId: String? ->
      CallRing.cancel(context, callId)
    }

    /** While a call is on screen, show it over the lock screen. */
    Function("setShowWhenLocked") { on: Boolean ->
      appContext.currentActivity?.let { activity -> activity.runOnUiThread { showWhenLocked(activity, on) } }
    }

    /** Android's audio mode now (3 = in a call), to notice call mode lost mid-call. */
    Function("audioMode") { CallAudio.mode(context) }

    /** Mics and Bluetooth outputs there are to pick from right now. */
    Function("audioChoices") { CallAudio.available(context) }

    /** "phone" keeps the built-in mic with earphones in; "auto" lets Android pick. */
    Function("preferMic") { which: String -> CallAudio.preferMic(context, which) }

    /** Bluetooth earbuds as headphones, with the phone's mic. Returns where the sound went. */
    Function("bluetoothMedia") { on: Boolean -> CallAudio.bluetoothMedia(context, on) }

    Function("resetCallAudio") { CallAudio.reset(context) }

    /** The chat is open: clear the gathered message notification. */
    Function("clearMessageNotifications") {
      ChatNotifications.clear(context)
    }

    /** Android 14+ lets people turn off full-screen ringing for an app. */
    Function("canRingFullScreen") {
      if (Build.VERSION.SDK_INT >= 34) context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent() else true
    }

    Function("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        context.startActivity(
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
    }
  }

  companion object {
    fun showWhenLocked(activity: Activity, on: Boolean) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
        activity.setShowWhenLocked(on)
        activity.setTurnScreenOn(on)
      } else {
        @Suppress("DEPRECATION")
        val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        if (on) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
      }
    }
  }
}
