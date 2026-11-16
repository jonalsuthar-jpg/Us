package expo.modules.uscall

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log

/**
 * Which microphone a call listens through, and Bluetooth earbuds as plain
 * headphones. WebRTC's audio device module comes from react-native-webrtc
 * (patched to expose it), reached by reflection so this module needs no
 * build-time dependency on it.
 *
 * "Phone mic + earbuds" works like headphones on a phone call: the earbuds
 * play in their good-quality media mode (A2DP) instead of the muffled
 * headset mode, and the phone's own mic picks up your voice. That needs the
 * phone out of call mode, where Android sends call sound to A2DP and records
 * from the built-in mic; WebRTC still records with voice processing on.
 */
object CallAudio {
  private const val TAG = "UsCall"

  private fun adm(): Any? =
    try {
      Class.forName("com.oney.WebRTCModule.WebRTCModule").getField("current").get(null)
    } catch (e: Exception) {
      null
    }

  private fun field(target: Any, name: String): Any? {
    var cls: Class<*>? = target.javaClass
    while (cls != null) {
      try {
        return cls.getDeclaredField(name).apply { isAccessible = true }.get(target)
      } catch (_: NoSuchFieldException) {
        cls = cls.superclass
      }
    }
    return null
  }

  private fun audio(context: Context) = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  fun mode(context: Context): Int = audio(context).mode

  private fun inputs(context: Context) = audio(context).getDevices(AudioManager.GET_DEVICES_INPUTS)
  private fun outputs(context: Context) = audio(context).getDevices(AudioManager.GET_DEVICES_OUTPUTS)

  private fun isHeadsetMic(d: AudioDeviceInfo) =
    d.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || d.type == AudioDeviceInfo.TYPE_USB_HEADSET

  /** What there is to choose from right now. */
  fun available(context: Context): Map<String, Boolean> =
    mapOf(
      "headsetMic" to inputs(context).any { isHeadsetMic(it) },
      "bluetoothMic" to inputs(context).any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO },
      "bluetoothMedia" to outputs(context).any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP },
    )

  /** "phone": the built-in mic even with earphones in; "auto": whatever Android picks. */
  fun preferMic(context: Context, which: String): Boolean {
    val adm = adm() ?: return false
    val device = if (which == "phone") inputs(context).firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC } else null
    if (which == "phone" && device == null) return false
    return try {
      adm.javaClass.getMethod("setPreferredInputDevice", AudioDeviceInfo::class.java).invoke(adm, device)
      true
    } catch (e: Exception) {
      Log.w(TAG, "preferred mic", e)
      false
    }
  }

  /** The AudioTrack WebRTC is playing the call through, while one is. */
  private fun playout(): AudioTrack? {
    val adm = adm() ?: return null
    val output = field(adm, "audioOutput") ?: return null
    return field(output, "audioTrack") as? AudioTrack
  }

  /**
   * Bluetooth earbuds as headphones (on) or back to Android's call routing
   * (off). Returns where the call's sound is going afterwards, or null.
   */
  fun bluetoothMedia(context: Context, on: Boolean): String? {
    val am = audio(context)
    val a2dp = outputs(context).firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
    val track = playout()
    return try {
      if (on) {
        if (a2dp == null) return null
        am.mode = AudioManager.MODE_NORMAL
        track?.setPreferredDevice(a2dp)
      } else {
        track?.setPreferredDevice(null)
      }
      track?.routedDevice?.type?.let { describe(it) }
    } catch (e: Exception) {
      Log.w(TAG, "bluetooth media", e)
      null
    }
  }

  private fun describe(type: Int) =
    when (type) {
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetoothMedia"
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetoothCall"
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
      else -> "other"
    }

  /** The call is over: Android picks again next time. */
  fun reset(context: Context) {
    preferMic(context, "auto")
    try {
      playout()?.setPreferredDevice(null)
    } catch (_: Exception) {}
  }
}
