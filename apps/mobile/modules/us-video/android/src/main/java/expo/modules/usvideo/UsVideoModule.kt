package expo.modules.usvideo

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import kotlin.math.min

/**
 * Make a chat video smaller before it's encrypted and sent: re-encode it to
 * H.264 + AAC at a target bitrate, scaled so its short side is at most
 * `maxHeight` (never scaled up). Runs on the phone's hardware encoders via
 * Media3 Transformer, and reports progress as "onProgress" events (0–1).
 */
@OptIn(UnstableApi::class)
class UsVideoModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val main = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("UsVideo")
    Events("onProgress")

    AsyncFunction("compress") { uri: String, maxHeight: Int, videoBitrate: Int, promise: Promise ->
      val ctx = context
      val source = Uri.parse(uri)
      val out = File(ctx.cacheDir, "us-video/${UUID.randomUUID()}.mp4").apply { parentFile?.mkdirs() }

      // Transformer is driven from a thread with a Looper; its callbacks arrive there too.
      main.post {
        try {
          val effects = if (shortSide(ctx, source) > maxHeight) Effects(listOf(), listOf(Presentation.createForShortSide(maxHeight))) else Effects.EMPTY
          val item = EditedMediaItem.Builder(MediaItem.fromUri(source)).setEffects(effects).build()
          val encoders = DefaultEncoderFactory.Builder(ctx)
            .setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(videoBitrate).build())
            .setEnableFallback(true)
            .build()
          lateinit var transformer: Transformer
          var done = false
          val progress = ProgressHolder()
          val tick = object : Runnable {
            override fun run() {
              if (done) return
              if (transformer.getProgress(progress) == Transformer.PROGRESS_STATE_AVAILABLE) {
                sendEvent("onProgress", mapOf("progress" to progress.progress / 100.0))
              }
              main.postDelayed(this, 300)
            }
          }
          transformer = Transformer.Builder(ctx)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .setEncoderFactory(encoders)
            .addListener(object : Transformer.Listener {
              override fun onCompleted(composition: Composition, result: ExportResult) {
                done = true
                promise.resolve(
                  mapOf(
                    "uri" to Uri.fromFile(out).toString(),
                    "size" to out.length().toDouble(),
                    "width" to result.width,
                    "height" to result.height,
                    "durationMs" to result.durationMs.toDouble(),
                  ),
                )
              }

              override fun onError(composition: Composition, result: ExportResult, exception: ExportException) {
                done = true
                out.delete()
                promise.reject("ERR_VIDEO_COMPRESS", exception.message ?: "Couldn't make the video smaller", exception)
              }
            })
            .build()
          transformer.start(item, out.absolutePath)
          main.postDelayed(tick, 300)
        } catch (e: Exception) {
          out.delete()
          promise.reject("ERR_VIDEO_COMPRESS", e.message ?: "Couldn't make the video smaller", e)
        }
      }
    }
  }

  /** The source's shorter side in pixels (0 if it can't be read: then it isn't scaled). */
  private fun shortSide(ctx: Context, uri: Uri): Int {
    val r = MediaMetadataRetriever()
    return try {
      r.setDataSource(ctx, uri)
      val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      min(w, h)
    } catch (_: Exception) {
      0
    } finally {
      r.release()
    }
  }
}
