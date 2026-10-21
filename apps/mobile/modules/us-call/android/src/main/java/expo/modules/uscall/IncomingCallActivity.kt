package expo.modules.uscall

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference

/**
 * The ringing screen shown over the lock screen when a call comes in and Us
 * isn't open. Answer opens the app straight into the call (still over the
 * lock screen); Decline opens it just long enough to decline.
 */
class IncomingCallActivity : Activity() {
  private var callId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = WeakReference(this)
    render()
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    render()
  }

  override fun onDestroy() {
    if (current?.get() === this) current = null
    super.onDestroy()
  }

  private fun render() {
    callId = intent.getStringExtra(CallRing.EXTRA_CALL_ID)
    val caller = intent.getStringExtra(CallRing.EXTRA_CALLER) ?: "Us"
    val video = intent.getBooleanExtra(CallRing.EXTRA_VIDEO, false)
    val dp = resources.displayMetrics.density

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(Color.parseColor("#241933"))
      setPadding((24 * dp).toInt(), (120 * dp).toInt(), (24 * dp).toInt(), (64 * dp).toInt())
    }
    val initial = TextView(this).apply {
      text = caller.trim().take(1).uppercase()
      textSize = 44f
      setTextColor(Color.parseColor("#9C1645"))
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.parseColor("#FFDDE5")) }
    }
    root.addView(initial, LinearLayout.LayoutParams((112 * dp).toInt(), (112 * dp).toInt()))
    root.addView(
      TextView(this).apply {
        text = caller
        textSize = 32f
        setTextColor(Color.WHITE)
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(0, (28 * dp).toInt(), 0, 0)
      },
      LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT),
    )
    root.addView(
      TextView(this).apply {
        text = if (video) "Incoming video call" else "Incoming voice call"
        textSize = 18f
        setTextColor(Color.parseColor("#D4C2E6"))
        gravity = Gravity.CENTER
        setPadding(0, (8 * dp).toInt(), 0, 0)
      },
      LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT),
    )
    root.addView(android.widget.Space(this), LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))

    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    buttons.addView(roundButton("Decline", "#E2336A", dp) { act("decline") }, LinearLayout.LayoutParams(0, (64 * dp).toInt(), 1f).apply { marginEnd = (12 * dp).toInt() })
    buttons.addView(roundButton("Answer", "#258F4C", dp) { act("answer") }, LinearLayout.LayoutParams(0, (64 * dp).toInt(), 1f).apply { marginStart = (12 * dp).toInt() })
    root.addView(buttons, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

    setContentView(root)
  }

  private fun roundButton(label: String, color: String, dp: Float, onClick: () -> Unit) =
    Button(this).apply {
      text = label
      textSize = 18f
      isAllCaps = false
      setTextColor(Color.WHITE)
      background = GradientDrawable().apply { cornerRadius = 32 * dp; setColor(Color.parseColor(color)) }
      setOnClickListener { onClick() }
    }

  private fun act(action: String) {
    val id = callId ?: return finish()
    CallRing.cancel(this, id)
    startActivity(CallRing.launchIntent(this, id, action))
    finish()
  }

  companion object {
    private var current: WeakReference<IncomingCallActivity>? = null

    /** The call stopped ringing elsewhere (answered, cancelled, missed). */
    fun dismiss(callId: String) {
      val activity = current?.get() ?: return
      if (activity.callId == callId) activity.runOnUiThread { activity.finish() }
    }
  }
}
