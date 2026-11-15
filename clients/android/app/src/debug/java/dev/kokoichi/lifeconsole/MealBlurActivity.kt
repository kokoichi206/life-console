package dev.kokoichi.lifeconsole

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.graphics.RenderEffect
import android.graphics.Shader
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.TextView
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate.InstallState
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import java.util.concurrent.Executors
import kotlin.math.roundToInt

class MealBlurActivity : Activity() {
    private val imageExecutor = Executors.newSingleThreadExecutor()
    private val segmenter = SubjectSegmentation.getClient(
        SubjectSegmenterOptions.Builder().enableForegroundBitmap().build(),
    )
    private val moduleInstaller by lazy { ModuleInstall.getClient(this) }
    private lateinit var status: TextView
    private lateinit var photoButton: Button
    private lateinit var repeatButton: Button
    private lateinit var originalImage: ImageView
    private lateinit var foregroundImage: ImageView
    private lateinit var displayModes: RadioGroup
    private lateinit var preview: FrameLayout
    private lateinit var imageStage: FrameLayout
    private var selectedPhotoUri: Uri? = null
    private var sourceBitmap: Bitmap? = null
    private var foregroundBitmap: Bitmap? = null
    private val moduleListener = InstallStatusListener { update ->
        update.progressInfo?.let { progress ->
            status.text = getString(
                R.string.meal_blur_model_download,
                progress.bytesDownloaded * 100 / progress.totalBytesToDownload,
            )
        }
        when (update.installState) {
            InstallState.STATE_COMPLETED -> modelReady()

            InstallState.STATE_FAILED, InstallState.STATE_CANCELED -> {
                status.text = getString(R.string.meal_blur_model_status_error, update.errorCode)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val screen = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(getColor(R.color.widget_surface))
            setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                view.setPadding(
                    dp(16) + bars.left,
                    bars.top + dp(12),
                    dp(16) + bars.right,
                    bars.bottom + dp(12),
                )
                insets
            }
        }
        setContentView(screen)
        val nightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        val barAppearance = if (nightMode == Configuration.UI_MODE_NIGHT_YES) {
            0
        } else {
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        }
        window.insetsController!!.setSystemBarsAppearance(
            barAppearance,
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
        )
        selectedPhotoUri = savedInstanceState?.getString("photoUri")?.let(Uri::parse)
        screen.addView(text("食事写真の自動ぼかし", 22f))
        screen.addView(text("料理の選択は不要です。処理は端末内で行い、写真はアップロードしません。", 14f))
        status = text("認識モデルを確認しています…", 14f)
        screen.addView(status)
        photoButton = Button(this).apply {
            text = "食事の写真を選ぶ"
            setTextColor(getColor(R.color.widget_foreground))
            backgroundTintList = ColorStateList.valueOf(getColor(R.color.widget_border))
            isEnabled = false
            setOnClickListener { pickPhoto() }
        }
        screen.addView(photoButton)
        displayModes = RadioGroup(this).apply { orientation = RadioGroup.HORIZONTAL }
        for (label in listOf("元画像", "背景ぼかし", "残す範囲")) {
            displayModes.addView(
                RadioButton(this).apply {
                    id = View.generateViewId()
                    text = label
                    textSize = 14f
                    setTextColor(getColor(R.color.widget_foreground))
                    buttonTintList = ColorStateList.valueOf(getColor(R.color.widget_accent))
                },
                RadioGroup.LayoutParams(0, RadioGroup.LayoutParams.WRAP_CONTENT, 1f),
            )
        }
        displayModes.check(displayModes.getChildAt(1).id)
        displayModes.setOnCheckedChangeListener { _, _ -> showPreview() }
        screen.addView(displayModes)
        preview = FrameLayout(this).apply {
            setBackgroundColor(getColor(R.color.widget_border))
            addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> resizeImageStage() }
        }
        imageStage = FrameLayout(this).apply { clipChildren = true }
        originalImage = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "元の食事写真"
        }
        foregroundImage = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            contentDescription = "自動で残した範囲"
        }
        imageStage.addView(originalImage, FrameLayout.LayoutParams(-1, -1))
        imageStage.addView(foregroundImage, FrameLayout.LayoutParams(-1, -1))
        preview.addView(imageStage, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        screen.addView(preview, LinearLayout.LayoutParams(-1, 0, 1f))
        repeatButton = Button(this).apply {
            text = "同じ写真で再計測"
            setTextColor(getColor(R.color.widget_foreground))
            backgroundTintList = ColorStateList.valueOf(getColor(R.color.widget_border))
            isEnabled = false
            setOnClickListener { processPhoto { sourceBitmap!! } }
        }
        screen.addView(repeatButton)
        screen.addView(text("長辺最大 1,600 px・ぼかし半径 20 dp。食事の保存や栄養解析は実行しません。", 12f))
        prepareModel()
    }

    private fun text(value: String, size: Float) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(getColor(R.color.widget_foreground))
        setPadding(0, dp(4), 0, dp(4))
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

    private fun prepareModel() {
        val request = ModuleInstallRequest.newBuilder().addApi(
            segmenter,
        ).setListener(moduleListener).build()
        moduleInstaller.installModules(request)
            .addOnSuccessListener(this) { response ->
                if (response.areModulesAlreadyInstalled()) modelReady()
            }
            .addOnFailureListener(this) { error ->
                status.text = getString(R.string.meal_blur_model_error, error.message)
            }
    }

    private fun modelReady() {
        status.text = "準備できました。写真を選ぶと、自動で背景をぼかします。"
        photoButton.isEnabled = true
        selectedPhotoUri?.let { uri -> processPhoto { decodePhoto(uri) } }
    }

    @Suppress("DEPRECATION")
    private fun pickPhoto() {
        startActivityForResult(
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
            },
            1,
        )
    }

    @Deprecated("Activity の写真選択結果を受け取る")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 1 && resultCode == RESULT_OK) {
            val uri = data!!.data!!
            selectedPhotoUri = uri
            displayModes.check(displayModes.getChildAt(1).id)
            processPhoto { decodePhoto(uri) }
        }
    }

    private fun decodePhoto(uri: Uri): Bitmap =
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, uri)) {
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
            decoder.setTargetColorSpace(
                android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB),
            )
        }

    private fun processPhoto(loadBitmap: () -> Bitmap) {
        photoButton.isEnabled = false
        repeatButton.isEnabled = false
        originalImage.setImageDrawable(null)
        foregroundImage.setImageDrawable(null)
        status.text = "端末内で処理しています…"
        imageExecutor.execute {
            val startedAt = SystemClock.elapsedRealtime()
            val processed = runCatching {
                val source = loadBitmap()
                val loadedAt = SystemClock.elapsedRealtime()
                val result = Tasks.await(segmenter.process(InputImage.fromBitmap(source, 0)))
                val finishedAt = SystemClock.elapsedRealtime()
                Triple(
                    source,
                    result.foregroundBitmap!!,
                    "画像読込 ${loadedAt - startedAt} ms ／ 領域推定 ${finishedAt - loadedAt} ms\n${source.width} × ${source.height} px",
                )
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                processed.onSuccess { (source, foreground, timing) ->
                    if (sourceBitmap !== source) sourceBitmap?.recycle()
                    foregroundBitmap?.recycle()
                    sourceBitmap = source
                    foregroundBitmap = foreground
                    originalImage.setImageBitmap(source)
                    foregroundImage.setImageBitmap(foreground)
                    status.text = timing
                    resizeImageStage()
                    showPreview()
                }.onFailure { error ->
                    status.text = getString(
                        R.string.meal_blur_photo_error,
                        error.cause?.message ?: error.message,
                    )
                }
                photoButton.isEnabled = true
                repeatButton.isEnabled = processed.isSuccess
            }
        }
    }

    private fun showPreview() {
        val selected = displayModes.checkedRadioButtonId
        originalImage.visibility =
            if (selected == displayModes.getChildAt(2).id) View.INVISIBLE else View.VISIBLE
        foregroundImage.visibility =
            if (selected == displayModes.getChildAt(0).id) View.INVISIBLE else View.VISIBLE
        originalImage.setRenderEffect(
            if (selected == displayModes.getChildAt(1).id) {
                RenderEffect.createBlurEffect(
                    dp(20).toFloat(),
                    dp(20).toFloat(),
                    Shader.TileMode.CLAMP,
                )
            } else {
                null
            },
        )
    }

    private fun resizeImageStage() {
        val source = sourceBitmap ?: return
        if (preview.width == 0 || preview.height == 0) return
        val scale = minOf(
            preview.width.toFloat() / source.width,
            preview.height.toFloat() / source.height,
        )
        imageStage.layoutParams = FrameLayout.LayoutParams(
            (source.width * scale).roundToInt(),
            (source.height * scale).roundToInt(),
            Gravity.CENTER,
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("photoUri", selectedPhotoUri?.toString())
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        moduleInstaller.unregisterListener(moduleListener)
        imageExecutor.execute { segmenter.close() }
        imageExecutor.shutdown()
        super.onDestroy()
    }
}
