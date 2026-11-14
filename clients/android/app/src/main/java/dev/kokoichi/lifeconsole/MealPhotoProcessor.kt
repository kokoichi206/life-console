package dev.kokoichi.lifeconsole

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorSpace
import android.graphics.HardwareRenderer
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.PixelFormat
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.hardware.HardwareBuffer
import android.media.ImageReader
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import java.io.File
import kotlin.math.roundToInt

internal data class PreparedMealPhoto(
    val id: String,
    val rawFile: File,
    val quarterTurns: Int,
    val originalFile: File,
    val blurredFile: File,
    var blurEnabled: Boolean = true,
    var upload: MealPhotoUpload? = null,
    var uploaded: Boolean = false,
    var blurUploaded: Boolean = false,
) {
    val selectedFile: File get() = if (blurEnabled) blurredFile else originalFile
}

internal class MealPhotoProcessor(private val context: Context) {
    val segmenter = SubjectSegmentation.getClient(
        SubjectSegmenterOptions.Builder().enableForegroundBitmap().build(),
    )

    fun prepare(id: String, rawFile: File, quarterTurns: Int = 0): PreparedMealPhoto {
        val decoded = ImageDecoder.decodeBitmap(ImageDecoder.createSource(rawFile)) {
                decoder,
                info,
                _,
            ->
            val scale = minOf(1.0, 1600.0 / maxOf(info.size.width, info.size.height))
            decoder.setTargetSize(
                (info.size.width * scale).roundToInt(),
                (info.size.height * scale).roundToInt(),
            )
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
        }
        val source = if (quarterTurns == 0) {
            decoded
        } else {
            Bitmap.createBitmap(
                decoded,
                0,
                0,
                decoded.width,
                decoded.height,
                Matrix().apply {
                    postRotate(quarterTurns * 90f)
                },
                true,
            ).also { decoded.recycle() }
        }
        try {
            val foreground = Tasks.await(
                segmenter.process(InputImage.fromBitmap(source, 0)),
            ).foregroundBitmap!!
            try {
                val blurred = blurBackground(source, foreground)
                try {
                    val folder = File(context.cacheDir, "meal-drafts").apply { mkdirs() }
                    val originalFile = File(folder, "$id-original.jpg")
                    val blurredFile = File(folder, "$id-blurred.jpg")
                    originalFile.outputStream().use {
                        source.compress(Bitmap.CompressFormat.JPEG, 82, it)
                    }
                    blurredFile.outputStream().use {
                        blurred.compress(Bitmap.CompressFormat.JPEG, 82, it)
                    }
                    return PreparedMealPhoto(id, rawFile, quarterTurns, originalFile, blurredFile)
                } finally {
                    blurred.recycle()
                }
            } finally {
                foreground.recycle()
            }
        } finally {
            source.recycle()
        }
    }

    private fun blurBackground(source: Bitmap, foreground: Bitmap): Bitmap {
        val reader = ImageReader.newInstance(
            source.width,
            source.height,
            PixelFormat.RGBA_8888,
            1,
            HardwareBuffer.USAGE_GPU_SAMPLED_IMAGE or HardwareBuffer.USAGE_GPU_COLOR_OUTPUT,
        )
        val renderer = HardwareRenderer()
        val node = RenderNode("Meal background blur")
        try {
            renderer.setSurface(reader.surface)
            renderer.setContentRoot(node)
            node.setPosition(0, 0, source.width, source.height)
            // プレビューの表示幅に依存せず、画像の長辺に対して同じ強さで保存する。
            val radius = maxOf(source.width, source.height) * 0.04f
            node.setRenderEffect(
                RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.CLAMP),
            )
            node.beginRecording().drawBitmap(source, 0f, 0f, null)
            node.endRecording()
            renderer.createRenderRequest().setWaitForPresent(true).syncAndDraw()
            return reader.acquireNextImage()!!.use { image ->
                image.hardwareBuffer!!.use { buffer ->
                    val hardwareBitmap = Bitmap.wrapHardwareBuffer(
                        buffer,
                        ColorSpace.get(ColorSpace.Named.SRGB),
                    )!!
                    try {
                        hardwareBitmap.copy(Bitmap.Config.ARGB_8888, true).also { result ->
                            Canvas(result).drawBitmap(foreground, 0f, 0f, null)
                        }
                    } finally {
                        hardwareBitmap.recycle()
                    }
                }
            }
        } finally {
            renderer.destroy()
            reader.close()
            node.discardDisplayList()
        }
    }
}
