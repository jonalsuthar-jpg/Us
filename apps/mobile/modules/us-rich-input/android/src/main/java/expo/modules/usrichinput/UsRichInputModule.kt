package expo.modules.usrichinput

import android.content.Context
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.core.view.ContentInfoCompat
import androidx.core.view.ViewCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

/** What a keyboard may hand the chat field: GIFs, stickers, and the odd short video. */
private val MIME_TYPES = arrayOf("image/gif", "image/png", "image/webp", "image/jpeg", "video/mp4")
private val EXT = mapOf("image/gif" to "gif", "image/png" to "png", "image/webp" to "webp", "image/jpeg" to "jpg", "video/mp4" to "mp4")
/** Bigger than any keyboard GIF; anything over it is dropped rather than read into memory. */
private const val MAX_BYTES = 20L * 1024 * 1024

/**
 * Lets a React Native text field take rich content: a GIF or sticker picked
 * on Gboard (or any keyboard that commits content), or an image pasted in.
 * It registers an OnReceiveContentListener on the field, which is how
 * AppCompat tells the keyboard which types it accepts. Each picture is copied
 * into the cache (the keyboard's link only lasts while it's being read) and
 * reported to JS as "onContent". Text pastes go through as before.
 */
class UsRichInputModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UsRichInput")
    Events("onContent")

    AsyncFunction("listen") { tag: Int ->
      val edit = findEditText(appContext.findView<View>(tag)) ?: return@AsyncFunction false
      ViewCompat.setOnReceiveContentListener(edit, MIME_TYPES) { _, payload -> receive(tag, payload) }
      // A keyboard already open asks again what this field takes.
      (context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager)?.restartInput(edit)
      true
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") { tag: Int ->
      findEditText(appContext.findView<View>(tag))?.let { ViewCompat.setOnReceiveContentListener(it, null, null) }
      Unit
    }.runOnQueue(Queues.MAIN)
  }

  /** Takes the pictures; anything else (text) is handed back to the field. */
  private fun receive(tag: Int, payload: ContentInfoCompat): ContentInfoCompat? {
    val split = payload.partition { it.uri != null }
    val media = split.first ?: return split.second
    val clip = media.clip
    for (i in 0 until clip.itemCount) {
      val uri = clip.getItemAt(i).uri ?: continue
      try {
        copy(uri, clip.description.let { d -> (0 until d.mimeTypeCount).map(d::getMimeType) })?.let { sendEvent("onContent", it + ("tag" to tag)) }
      } catch (_: Exception) {
        // An unreadable link: skip it.
      }
    }
    return split.second
  }

  private fun copy(uri: Uri, offered: List<String>): Map<String, Any>? {
    val resolver = context.contentResolver
    val mime = (resolver.getType(uri) ?: offered.firstOrNull { it in EXT }) ?: return null
    val ext = EXT[mime] ?: return null
    val dir = File(context.cacheDir, "rich-input").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}.$ext")
    resolver.openInputStream(uri)?.use { input ->
      file.outputStream().use { out ->
        val buf = ByteArray(64 * 1024)
        var total = 0L
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          total += n
          if (total > MAX_BYTES) {
            out.close()
            file.delete()
            return null
          }
          out.write(buf, 0, n)
        }
      }
    } ?: return null
    val (width, height, durationMs) = measure(file, mime)
    return mapOf("uri" to Uri.fromFile(file).toString(), "mime" to mime, "width" to width, "height" to height, "durationMs" to durationMs, "size" to file.length())
  }

  /** Width, height, and for a video its length in ms. */
  private fun measure(file: File, mime: String): Triple<Int, Int, Long> =
    if (mime.startsWith("video/")) {
      val r = MediaMetadataRetriever()
      try {
        r.setDataSource(file.path)
        val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        if (rotation % 180 != 0) Triple(h, w, ms) else Triple(w, h, ms)
      } catch (_: Exception) {
        Triple(0, 0, 0L)
      } finally {
        r.release()
      }
    } else {
      val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(file.path, o)
      Triple(o.outWidth.coerceAtLeast(0), o.outHeight.coerceAtLeast(0), 0L)
    }

  /** The field itself, or the first one inside the view (RN may wrap it). */
  private fun findEditText(view: View?): EditText? {
    if (view is EditText) return view
    if (view is ViewGroup) for (i in 0 until view.childCount) findEditText(view.getChildAt(i))?.let { return it }
    return null
  }
}
