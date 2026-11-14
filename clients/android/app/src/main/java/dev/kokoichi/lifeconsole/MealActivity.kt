package dev.kokoichi.lifeconsole

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.TimePickerDialog
import android.content.ClipData
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import androidx.core.content.FileProvider
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate.InstallState
import java.io.File
import java.time.Instant
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.roundToInt
import net.openid.appauth.AuthorizationService
import org.json.JSONArray
import org.json.JSONObject

class MealActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var authorization: AuthorizationService
    private lateinit var api: MealApiRepository
    private lateinit var processor: MealPhotoProcessor
    private lateinit var content: LinearLayout
    private lateinit var status: TextView
    private var revision = 0
    private var screen = "list"
    private var selectedMeal: MealRecord? = null
    private var galleryTo: String? = null
    private var nextTo: String? = null
    private var loadingMore = false
    private val meals = mutableListOf<MealRecord>()
    private val savedPhotoBlur = mutableMapOf<String, Boolean>()
    private var modelReady = false
    private var busy = false
    private var saveAttempted = false
    private var returningFromLogin = false
    private var draftId = UUID.randomUUID().toString()
    private var draftMemo = ""
    private var draftCalories = ""
    private var draftOccurredAt = LocalDateTime.now(japanZone)
    private val photos = mutableListOf<PreparedMealPhoto>()
    private var saveButton: Button? = null
    private val photoButtons = mutableListOf<Button>()
    private val moduleInstaller by lazy { ModuleInstall.getClient(this) }
    private val moduleListener = InstallStatusListener { update ->
        when (update.installState) {
            InstallState.STATE_COMPLETED -> {
                modelReady = true
                updatePhotoButtons()
                if (screen == "entry") status.setText(R.string.meal_blur_ready)
            }

            InstallState.STATE_FAILED, InstallState.STATE_CANCELED -> {
                status.setText(R.string.meal_blur_download_failed)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        authorization = WidgetOAuth.service(this)
        api = MealApiRepository(this, authorization)
        processor = MealPhotoProcessor(this)
        restoreDraft(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
            ) {
                goBack()
            }
        }
        if (screen == "entry") showEntry() else showGallery()
        moduleInstaller.installModules(
            ModuleInstallRequest.newBuilder().addApi(
                processor.segmenter,
            ).setListener(moduleListener).build(),
        ).addOnSuccessListener(this) {
            if (it.areModulesAlreadyInstalled()) {
                modelReady = true
                updatePhotoButtons()
                if (screen == "entry") status.setText(R.string.meal_blur_ready)
            }
        }.addOnFailureListener(this) { status.setText(R.string.meal_blur_download_failed) }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (busy) return
        when (screen) {
            "entry" -> showEntry()
            "detail" -> showDetail(selectedMeal!!)
            else -> showGallery()
        }
    }

    override fun onResume() {
        super.onResume()
        if (returningFromLogin) {
            returningFromLogin = false
            if (screen == "list") showGallery()
        }
    }

    private fun page(title: String) {
        revision++
        saveButton = null
        photoButtons.clear()
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(20))
            setBackgroundColor(getColor(R.color.widget_surface))
        }
        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(content)
            setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        }
        setContentView(scroll)
        val lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
            WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        val dark =
            resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
                Configuration.UI_MODE_NIGHT_YES
        window.insetsController!!.setSystemBarsAppearance(if (dark) 0 else lightBars, lightBars)
        content.addView(label(title, 24f))
        if (!BuildConfig.MEAL_API_USES_OAUTH) {
            content.addView(
                label(getString(R.string.meal_local_environment), 12f),
            )
        }
        status = label("", 14f)
        status.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        content.addView(status)
    }

    private fun label(value: String, size: Float = 16f) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(getColor(R.color.widget_foreground))
        setPadding(0, dp(6), 0, dp(6))
    }

    private fun button(title: String, action: () -> Unit) = Button(this).apply {
        text = title
        setTextColor(getColor(R.color.widget_foreground))
        backgroundTintList = ColorStateList.valueOf(getColor(R.color.widget_border))
        setOnClickListener { action() }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).roundToInt()

    private fun showGallery() {
        loadingMore = false
        screen = "list"
        page(getString(R.string.meal_list))
        content.addView(button(getString(R.string.record_meal)) { newDraft() })
        content.addView(button(getString(R.string.meal_reload)) { showGallery() })
        val cards = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        content.addView(cards)
        operation(getString(R.string.meal_loading), {
            api.gallery(galleryTo ?: java.time.LocalDate.now(japanZone).toString())
        }) { page ->
            meals.clear()
            meals.addAll(page.meals)
            nextTo = page.nextTo
            renderMealCards(cards)
        }
    }

    private fun renderMealCards(cards: LinearLayout) {
        cards.removeAllViews()
        status.text = getString(R.string.meal_count, meals.size)
        if (meals.isEmpty()) cards.addView(label(getString(R.string.meal_empty)))
        for (meal in meals) {
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(0, dp(12), 0, dp(16))
            }
            card.addView(button(formatDate(meal.occurredAt)) { showDetail(meal) })
            meal.photoIds.firstOrNull()?.let { photoId ->
                val image =
                    addSavedPhoto(
                        card,
                        photoId,
                        meal.blurredPhotoIds.contains(photoId),
                        getString(R.string.meal_open_photo),
                        200,
                    )
                image.setOnClickListener { showDetail(meal) }
            }
            if (meal.memo.isNotEmpty()) card.addView(label(meal.memo))
            if (meal.photoIds.size >
                1
            ) {
                card.addView(
                    label(getString(R.string.meal_photo_count, meal.photoIds.size), 12f),
                )
            }
            cards.addView(card)
        }
        nextTo?.let { to ->
            cards.addView(
                button(getString(R.string.meal_more)) {
                    if (loadingMore) return@button
                    loadingMore = true
                    operation(getString(R.string.meal_loading), { api.gallery(to) }) { page ->
                        loadingMore = false
                        meals.addAll(page.meals)
                        nextTo = page.nextTo
                        renderMealCards(cards)
                    }
                },
            )
        }
    }

    private fun showDetail(meal: MealRecord) {
        screen = "detail"
        selectedMeal = meal
        page(getString(R.string.meal_detail))
        content.addView(button(getString(R.string.meal_back_to_list)) { showGallery() })
        content.addView(label(formatDate(meal.occurredAt)))
        if (meal.memo.isNotEmpty()) content.addView(label(meal.memo))
        for ((index, photoId) in meal.photoIds.withIndex()) {
            content.addView(
                label(getString(R.string.meal_photo_number, (index + 1).toString()), 14f),
            )
            addSavedPhoto(
                content,
                photoId,
                meal.blurredPhotoIds.contains(photoId),
                getString(
                    R.string.meal_photo_number,
                    (
                        index +
                            1
                        ).toString(),
                ),
                420,
            )
        }
        status.setText(R.string.meal_saved_photo_notice)
    }

    private fun addSavedPhoto(
        parent: LinearLayout,
        photoId: String,
        hasBlur: Boolean,
        description: String,
        height: Int,
    ): ImageView {
        val image = photoView(description, height)
        parent.addView(image)
        fun display(enabled: Boolean) {
            loadImage(image, "$photoId:$enabled") { api.readPhoto(photoId, enabled) }
        }
        val enabled = hasBlur && savedPhotoBlur.getOrPut(photoId) { true }
        display(enabled)
        if (hasBlur) {
            parent.addView(
                Switch(this).apply {
                    text = getString(R.string.meal_background_blur)
                    setTextColor(getColor(R.color.widget_foreground))
                    isChecked = enabled
                    setOnCheckedChangeListener { _, checked ->
                        savedPhotoBlur[photoId] = checked
                        display(checked)
                    }
                },
            )
        }
        return image
    }

    private fun newDraft() {
        photos.clear()
        draftId = UUID.randomUUID().toString()
        draftMemo = ""
        draftCalories = ""
        draftOccurredAt = LocalDateTime.now(japanZone)
        saveAttempted = false
        showEntry()
    }

    private fun showEntry() {
        screen = "entry"
        page(getString(R.string.record_meal))
        status.setText(if (modelReady) R.string.meal_blur_ready else R.string.meal_blur_preparing)
        content.addView(
            button(getString(R.string.meal_back_to_list)) { goBack() }.apply {
                isEnabled =
                    !busy
            },
        )
        val library = button(getString(R.string.meal_pick_photos)) { pickPhotos() }
        val camera = button(getString(R.string.meal_take_photo)) { takePhoto() }
        photoButtons.addAll(listOf(camera, library))
        content.addView(camera)
        content.addView(library)
        updatePhotoButtons()
        for ((index, photo) in photos.withIndex()) {
            content.addView(
                label(getString(R.string.meal_photo_number, (index + 1).toString()), 16f),
            )
            val image =
                photoView(getString(R.string.meal_photo_number, (index + 1).toString()), 280)
            content.addView(image)
            showDraftPhoto(image, photo)
            content.addView(
                Switch(this).apply {
                    text = getString(R.string.meal_background_blur)
                    setTextColor(getColor(R.color.widget_foreground))
                    thumbTintList = ColorStateList.valueOf(getColor(R.color.widget_accent))
                    contentDescription =
                        getString(R.string.meal_photo_blur_label, (index + 1).toString())
                    isChecked = photo.blurEnabled
                    isEnabled = !busy && !saveAttempted
                    setOnCheckedChangeListener { _, enabled ->
                        photo.blurEnabled = enabled
                        showDraftPhoto(image, photo)
                    }
                },
            )
            content.addView(
                button(getString(R.string.meal_rotate_photo)) {
                    busy = true
                    showEntry()
                    operation(getString(R.string.meal_processing), {
                        processor.prepare(photo.id, photo.rawFile, (photo.quarterTurns + 3) % 4)
                    }) { rotated ->
                        rotated.blurEnabled = photo.blurEnabled
                        photos[index] = rotated
                        busy = false
                        showEntry()
                    }
                }.apply { isEnabled = !busy && !saveAttempted },
            )
            content.addView(
                button(getString(R.string.meal_remove_photo)) {
                    photos.remove(photo)
                    deleteDraftPhoto(photo)
                    showEntry()
                }.apply { isEnabled = !busy && !saveAttempted },
            )
        }
        content.addView(label(getString(R.string.meal_date)))
        content.addView(
            button(draftOccurredAt.format(DateTimeFormatter.ofPattern("yyyy/M/d HH:mm"))) {
                chooseDateTime()
            }
                .apply { isEnabled = !busy && !saveAttempted },
        )
        content.addView(label(getString(R.string.meal_memo)))
        content.addView(
            EditText(this).apply {
                setText(draftMemo)
                setTextColor(getColor(R.color.widget_foreground))
                contentDescription = getString(R.string.meal_memo)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
                filters = arrayOf(InputFilter.LengthFilter(2000))
                minLines = 2
                isEnabled = !busy && !saveAttempted
                onTextChanged {
                    draftMemo = it
                    updateSaveButton()
                }
            },
        )
        content.addView(label(getString(R.string.meal_calories)))
        content.addView(
            EditText(this).apply {
                setText(draftCalories)
                setTextColor(getColor(R.color.widget_foreground))
                contentDescription = getString(R.string.meal_calories)
                inputType = InputType.TYPE_CLASS_NUMBER
                isEnabled = !busy && !saveAttempted
                onTextChanged {
                    draftCalories = it
                    updateSaveButton()
                }
            },
        )
        content.addView(label(getString(R.string.meal_analysis_notice), 12f))
        saveButton =
            button(getString(if (saveAttempted) R.string.meal_retry_save else R.string.meal_save)) {
                saveMeal()
            }
        content.addView(saveButton)
        content.addView(label(getString(R.string.meal_blur_save_notice), 12f))
        updateSaveButton()
    }

    private fun updatePhotoButtons() {
        for (button in photoButtons) button.isEnabled = modelReady && !busy && !saveAttempted
    }

    private fun updateSaveButton() {
        saveButton?.isEnabled = !busy && (photos.isNotEmpty() || draftMemo.isNotBlank())
    }

    private fun showDraftPhoto(image: ImageView, photo: PreparedMealPhoto) {
        val path = photo.selectedFile.absolutePath
        loadImage(image, path) {
            BitmapFactory.decodeFile(path)
                ?: error(getString(R.string.meal_photo_failed))
        }
    }

    private fun photoView(description: String, height: Int) = ImageView(this).apply {
        contentDescription = description
        scaleType = ImageView.ScaleType.FIT_CENTER
        setBackgroundColor(getColor(R.color.widget_border))
        layoutParams = LinearLayout.LayoutParams(-1, dp(height))
    }

    private fun loadImage(image: ImageView, key: String, load: () -> Bitmap) {
        image.tag = key
        val expectedRevision = revision
        executor.execute {
            val result = runCatching(load)
            runOnUiThread {
                if (isDestroyed || expectedRevision != revision || image.tag != key) {
                    result.getOrNull()?.recycle()
                    return@runOnUiThread
                }
                result.onSuccess { image.setImageBitmap(it) }
                    .onFailure { status.setText(R.string.meal_photo_failed) }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun pickPhotos() {
        startActivityForResult(
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                type = "image/*"
                addCategory(Intent.CATEGORY_OPENABLE)
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            },
            1,
        )
    }

    private fun cameraFile() = File(File(cacheDir, "meal-camera").apply { mkdirs() }, "capture.jpg")

    @Suppress("DEPRECATION")
    private fun takePhoto() {
        val uri = FileProvider.getUriForFile(this, "$packageName.mealphotos", cameraFile())
        startActivityForResult(
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                clipData = ClipData.newRawUri("meal", uri)
                addFlags(
                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            },
            2,
        )
    }

    @Deprecated("Activity の写真取得結果を受け取る")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK) return
        val sources = when (requestCode) {
            1 -> data!!.clipData?.let { items ->
                (0 until items.itemCount).map { items.getItemAt(it).uri }
            }
                ?: listOf(data.data!!)

            2 -> listOf(Uri.fromFile(cameraFile()))

            else -> return
        }
        busy = true
        showEntry()
        operation(getString(R.string.meal_processing), {
            sources.map { uri ->
                val id = UUID.randomUUID().toString()
                val raw = File(File(cacheDir, "meal-drafts").apply { mkdirs() }, "$id-source")
                val input = contentResolver.openInputStream(uri)!!
                try {
                    raw.outputStream().use { output -> input.copyTo(output) }
                } finally {
                    input.close()
                }
                processor.prepare(id, raw)
            }
        }) { prepared ->
            photos.addAll(prepared)
            busy = false
            showEntry()
        }
    }

    private fun chooseDateTime() {
        DatePickerDialog(this, { _, year, month, day ->
            TimePickerDialog(this, { _, hour, minute ->
                draftOccurredAt = LocalDateTime.of(year, month + 1, day, hour, minute)
                showEntry()
            }, draftOccurredAt.hour, draftOccurredAt.minute, true).show()
        }, draftOccurredAt.year, draftOccurredAt.monthValue - 1, draftOccurredAt.dayOfMonth).show()
    }

    private fun saveMeal() {
        val calories = if (draftCalories.isBlank()) null else draftCalories.toIntOrNull()
        if (draftCalories.isNotBlank() && (calories == null || calories < 0)) {
            status.setText(R.string.meal_invalid_calories)
            return
        }
        busy = true
        saveAttempted = true
        showEntry()
        operation(getString(R.string.meal_saving), {
            for (photo in photos) {
                if (!photo.uploaded) {
                    val reservation = photo.upload
                    val upload = if (reservation == null ||
                        Instant.parse(reservation.expiresAt) <= Instant.now()
                    ) {
                        api.reservePhoto().also { photo.upload = it }
                    } else {
                        reservation
                    }
                    api.uploadPhoto(upload, photo.originalFile)
                    photo.uploaded = true
                }
                val photoId = photo.upload!!.photoId
                if (!photo.blurUploaded) {
                    val upload = api.reserveBlurPhoto(photoId)
                    if (upload != null) {
                        api.uploadPhoto(upload, photo.blurredFile)
                        api.completeBlurPhoto(photoId)
                    }
                    photo.blurUploaded = true
                }
            }
            api.createMeal(
                draftId,
                photos.map { it.upload!!.photoId },
                draftMemo,
                draftOccurredAt.atZone(japanZone).toInstant().toString(),
                calories,
            )
        }) { saved ->
            for (photo in photos) {
                savedPhotoBlur[photo.upload!!.photoId] = photo.blurEnabled
                deleteDraftPhoto(photo)
            }
            photos.clear()
            busy = false
            saveAttempted = false
            draftMemo = ""
            draftCalories = ""
            galleryTo = Instant.parse(saved.occurredAt).atZone(japanZone).toLocalDate().toString()
            Toast.makeText(this, R.string.meal_saved, Toast.LENGTH_SHORT).show()
            showGallery()
        }
    }

    private fun <T> operation(message: String, run: () -> T, complete: (T) -> Unit) {
        status.text = message
        val expectedRevision = revision
        executor.execute {
            val result = runCatching(run)
            runOnUiThread {
                if (isDestroyed || expectedRevision != revision) return@runOnUiThread
                result.onSuccess(complete).onFailure { error ->
                    busy = false
                    loadingMore = false
                    if (screen == "entry") showEntry()
                    status.text = if (error is WidgetLoginRequired) {
                        getString(R.string.meal_login_required)
                    } else {
                        getString(R.string.meal_operation_failed, error.message)
                    }
                    if (error is WidgetLoginRequired) {
                        content.addView(
                            button(getString(R.string.meal_login)) {
                                returningFromLogin = true
                                startActivity(Intent(this, WidgetLoginActivity::class.java))
                            },
                        )
                    }
                }
            }
        }
    }

    private fun goBack() {
        if (busy) return
        when (screen) {
            "entry" -> {
                if (photos.isEmpty() && draftMemo.isBlank() &&
                    draftCalories.isBlank()
                ) {
                    showGallery()
                } else {
                    val message = if (saveAttempted) {
                        R.string.meal_discard_attempted
                    } else {
                        R.string.meal_discard_message
                    }
                    AlertDialog.Builder(this).setTitle(R.string.meal_discard_title)
                        .setMessage(message)
                        .setNegativeButton(R.string.meal_keep_editing, null)
                        .setPositiveButton(R.string.meal_back_to_list) { _, _ ->
                            for (photo in photos) deleteDraftPhoto(photo)
                            photos.clear()
                            showGallery()
                        }.show()
                }
            }

            "detail" -> showGallery()

            else -> finish()
        }
    }

    @Deprecated("Android 12 の戻る操作を受け取る")
    // API 33 以降は onBackInvokedDispatcher に登録し、この経路は API 31・32 で使う。
    @SuppressLint("GestureBackNavigation")
    override fun onBackPressed() = goBack()

    private fun deleteDraftPhoto(photo: PreparedMealPhoto) {
        photo.rawFile.delete()
        photo.originalFile.delete()
        photo.blurredFile.delete()
    }

    private fun formatDate(value: String): String = Instant.parse(value).atZone(japanZone)
        .format(DateTimeFormatter.ofPattern("yyyy/M/d HH:mm"))

    private fun EditText.onTextChanged(changed: (String) -> Unit) {
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) =
                Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit
            override fun afterTextChanged(s: Editable?) {
                changed(s.toString())
            }
        })
    }

    private fun restoreDraft(saved: Bundle?) {
        if (saved == null) return
        screen = saved.getString("screen")!!
        draftId = saved.getString("draftId")!!
        draftMemo = saved.getString("memo")!!
        draftCalories = saved.getString("calories")!!
        draftOccurredAt = LocalDateTime.parse(saved.getString("occurredAt"))
        saveAttempted = saved.getBoolean("saveAttempted")
        val records = JSONArray(saved.getString("photos"))
        for (i in 0 until records.length()) {
            val json = records.getJSONObject(i)
            photos.add(
                PreparedMealPhoto(
                    json.getString("id"),
                    File(json.getString("raw")),
                    json.getInt("turns"),
                    File(json.getString("original")),
                    File(json.getString("blurred")),
                    json.getBoolean("enabled"),
                    if (json.isNull("upload")) {
                        null
                    } else {
                        json.getJSONObject("upload").let { upload ->
                            val headers = upload.getJSONObject("headers")
                            MealPhotoUpload(
                                upload.getString("photoId"),
                                upload.getString("url"),
                                headers.keys().asSequence().associateWith { headers.getString(it) },
                                upload.getString("expiresAt"),
                            )
                        }
                    },
                    json.getBoolean("uploaded"),
                    json.getBoolean("blurUploaded"),
                ),
            )
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("screen", screen)
        outState.putString("draftId", draftId)
        outState.putString("memo", draftMemo)
        outState.putString("calories", draftCalories)
        outState.putString("occurredAt", draftOccurredAt.toString())
        outState.putBoolean("saveAttempted", saveAttempted)
        outState.putString(
            "photos",
            JSONArray(
                photos.map { photo ->
                    JSONObject().put("id", photo.id).put("raw", photo.rawFile.absolutePath)
                        .put(
                            "turns",
                            photo.quarterTurns,
                        ).put("original", photo.originalFile.absolutePath)
                        .put(
                            "blurred",
                            photo.blurredFile.absolutePath,
                        ).put("enabled", photo.blurEnabled).put("uploaded", photo.uploaded)
                        .put("blurUploaded", photo.blurUploaded)
                        .put(
                            "upload",
                            photo.upload?.let { upload ->
                                JSONObject().put("photoId", upload.photoId).put("url", upload.url)
                                    .put("headers", JSONObject(upload.headers))
                                    .put("expiresAt", upload.expiresAt)
                            } ?: JSONObject.NULL,
                        )
                },
            ).toString(),
        )
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        moduleInstaller.unregisterListener(moduleListener)
        executor.execute {
            processor.segmenter.close()
            authorization.dispose()
        }
        executor.shutdown()
        super.onDestroy()
    }
}
