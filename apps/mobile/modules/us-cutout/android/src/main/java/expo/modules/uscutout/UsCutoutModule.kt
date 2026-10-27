package expo.modules.uscutout

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * Sticker cut-out: lift the subject out of a photo (Google ML Kit subject
 * segmentation, on the device), trim to it, add a white outline, and fit it
 * in a transparent square. Returns the PNG's file address, or null when no
 * subject was found (the app then offers a square crop).
 */
class UsCutoutModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UsCutout")

    AsyncFunction("cutout") { uri: String, outline: Int, size: Int, promise: Promise ->
      val ctx = context
      Thread {
        try {
          val photo = loadUpright(ctx, Uri.parse(uri), 1600)
          if (photo == null) {
            promise.reject("ERR_CUTOUT_LOAD", "Couldn't open that photo", null)
            return@Thread
          }
          val segmenter = SubjectSegmentation.getClient(
            SubjectSegmenterOptions.Builder().enableForegroundBitmap().build(),
          )
          segmenter.process(InputImage.fromBitmap(photo, 0))
            .addOnSuccessListener { result ->
              Thread {
                try {
                  val fg = result.foregroundBitmap
                  val out = if (fg == null) null else compose(ctx, fg, outline, size)
                  promise.resolve(out?.let { mapOf("uri" to it, "width" to size, "height" to size) })
                } catch (e: Throwable) {
                  promise.reject("ERR_CUTOUT", e.message ?: "Cut-out failed", e)
                } finally {
                  segmenter.close()
                }
              }.start()
            }
            .addOnFailureListener { e ->
              segmenter.close()
              promise.reject("ERR_CUTOUT", e.message ?: "Cut-out failed", e)
            }
        } catch (e: Throwable) {
          promise.reject("ERR_CUTOUT", e.message ?: "Cut-out failed", e)
        }
      }.start()
    }
  }

  /** The photo, scaled so its long side is at most `max`, turned the right way up. */
  private fun loadUpright(ctx: Context, uri: Uri, maxSide: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bmp = ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null
    val rotation = ctx.contentResolver.openInputStream(uri)?.use {
      when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
        ExifInterface.ORIENTATION_ROTATE_90 -> 90f
        ExifInterface.ORIENTATION_ROTATE_180 -> 180f
        ExifInterface.ORIENTATION_ROTATE_270 -> 270f
        else -> 0f
      }
    } ?: 0f
    if (rotation == 0f) return bmp
    val m = Matrix().apply { postRotate(rotation) }
    return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
  }

  /** Trim to the subject, fit it in a `size` square with room for the outline, draw the outline, save as PNG. */
  private fun compose(ctx: Context, fg: Bitmap, outline: Int, size: Int): String? {
    val w = fg.width
    val h = fg.height
    val px = IntArray(w * h)
    fg.getPixels(px, 0, w, 0, 0, w, h)
    var left = w
    var top = h
    var right = -1
    var bottom = -1
    for (y in 0 until h) {
      for (x in 0 until w) {
        if ((px[y * w + x] ushr 24) > 24) {
          if (x < left) left = x
          if (x > right) right = x
          if (y < top) top = y
          if (y > bottom) bottom = y
        }
      }
    }
    if (right < left || bottom < top) return null
    val crop = Bitmap.createBitmap(fg, left, top, right - left + 1, bottom - top + 1)

    val margin = outline + 6
    val box = (size - margin * 2).toFloat()
    val scale = min(box / crop.width, box / crop.height)
    val dw = crop.width * scale
    val dh = crop.height * scale
    val dx = (size - dw) / 2f
    val dy = (size - dh) / 2f

    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    if (outline > 0) {
      // The outline: the subject's silhouette in white, stamped in a ring around it.
      val white = Paint(paint).apply { colorFilter = PorterDuffColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN) }
      for (r in listOf(outline / 2f, outline.toFloat())) {
        for (i in 0 until 32) {
          val a = i * Math.PI * 2 / 32
          val ox = (cos(a) * r).toFloat()
          val oy = (sin(a) * r).toFloat()
          canvas.drawBitmap(crop, null, RectF(dx + ox, dy + oy, dx + ox + dw, dy + oy + dh), white)
        }
      }
    }
    canvas.drawBitmap(crop, null, RectF(dx, dy, dx + dw, dy + dh), paint)

    val file = File(ctx.cacheDir, "cutout-${System.currentTimeMillis()}.png")
    FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.PNG, 100, it) }
    return Uri.fromFile(file).toString()
  }
}
