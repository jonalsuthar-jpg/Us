package expo.modules.uscall

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * Answering from the lock screen opens the app with a flag asking it to show
 * over the lock screen. Applied here as the activity starts — before
 * JavaScript loads — so the call appears at once instead of after an unlock.
 */
class UsCallPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(
      object : ReactActivityLifecycleListener {
        private var activity: WeakReference<Activity>? = null

        override fun onCreate(activity: Activity, savedInstanceState: Bundle?) {
          this.activity = WeakReference(activity)
          apply(activity, activity.intent)
        }

        override fun onNewIntent(intent: Intent): Boolean {
          activity?.get()?.let { apply(it, intent) }
          return false
        }

        private fun apply(activity: Activity, intent: Intent?) {
          if (intent?.getBooleanExtra(CallRing.EXTRA_SHOW_WHEN_LOCKED, false) == true) UsCallModule.showWhenLocked(activity, true)
        }
      },
    )
}
