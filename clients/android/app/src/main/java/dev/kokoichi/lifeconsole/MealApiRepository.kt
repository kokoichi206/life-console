package dev.kokoichi.lifeconsole

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.util.UUID
import net.openid.appauth.AuthorizationService
import org.json.JSONArray
import org.json.JSONObject

internal data class MealRecord(
    val id: String,
    val photoIds: List<String>,
    val memo: String,
    val occurredAt: String,
    val blurredPhotoIds: List<String>,
    val tags: List<String>,
)

internal data class MealGalleryPage(val meals: List<MealRecord>, val nextTo: String?)

internal data class MealPhotoUpload(
    val photoId: String,
    val url: String,
    val headers: Map<String, String>,
    val expiresAt: String,
)

internal fun parseMealRecord(json: JSONObject): MealRecord {
    val photoIds = buildList {
        if (!json.isNull("photoId")) add(json.getString("photoId"))
        val additional = json.getJSONArray("additionalPhotoIds")
        for (i in 0 until additional.length()) add(additional.getString(i))
    }
    return MealRecord(
        json.getString("id"),
        photoIds,
        json.getString("memo"),
        json.getString("occurredAt"),
        json.getJSONArray("blurredPhotoIds").let { ids ->
            (0 until ids.length()).map { ids.getString(it) }
        },
        json.getJSONArray("tags").let { tags ->
            (0 until tags.length()).map { tags.getString(it) }
        },
    )
}

internal class MealApiRepository(
    private val context: Context,
    private val authorization: AuthorizationService,
) {
    fun gallery(to: String = LocalDate.now(japanZone).toString()): MealGalleryPage {
        val data = json("/api/v1/meal-gallery?to=$to").getJSONObject("data")
        val records = data.getJSONArray("meals")
        return MealGalleryPage(
            (0 until records.length()).map { parseMealRecord(records.getJSONObject(it)) },
            if (data.isNull("nextTo")) null else data.getString("nextTo"),
        )
    }

    fun readPhoto(photoId: String, backgroundBlur: Boolean = false, maxEdge: Int = 1600): Bitmap {
        val variant = if (backgroundBlur) "?variant=blurred" else ""
        val connection = connection("/api/v1/meal-photos/$photoId/content$variant", "GET")
        try {
            requireSuccess(connection)
            val bytes = connection.inputStream.use { it.readBytes() }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            val options = BitmapFactory.Options()
            while (maxOf(bounds.outWidth, bounds.outHeight) /
                (options.inSampleSize.coerceAtLeast(1) * 2) >=
                maxEdge
            ) {
                options.inSampleSize = options.inSampleSize.coerceAtLeast(1) * 2
            }
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
                ?: throw IOException("食事の写真を読み込めませんでした。")
        } finally {
            connection.disconnect()
        }
    }

    fun reservePhoto(): MealPhotoUpload {
        val data = json(
            "/api/v1/meal-photos/upload",
            JSONObject().put(
                "clientId",
                UUID.randomUUID().toString(),
            ).put("contentType", "image/jpeg"),
        ).getJSONObject("data")
        val headers = data.getJSONObject("requiredHeaders")
        return MealPhotoUpload(
            data.getString("photoId"),
            data.getString("uploadUrl"),
            headers.keys().asSequence().associateWith { headers.getString(it) },
            data.getString("expiresAt"),
        )
    }

    fun downloadOriginalPhoto(photoId: String, file: File) {
        val request = connection("/api/v1/meal-photos/$photoId/content", "GET")
        try {
            requireSuccess(request)
            request.inputStream.use { input -> file.outputStream().use { input.copyTo(it) } }
        } finally {
            request.disconnect()
        }
    }

    fun reserveBlurPhoto(photoId: String): MealPhotoUpload? {
        val response =
            json(
                "/api/v1/meal-photos/$photoId/blur/upload",
                JSONObject().put("contentType", "image/jpeg"),
            )
        if (response.isNull("data")) return null
        val data = response.getJSONObject("data")
        val headers = data.getJSONObject("requiredHeaders")
        return MealPhotoUpload(
            data.getString("photoId"),
            data.getString("uploadUrl"),
            headers.keys().asSequence().associateWith {
                headers.getString(it)
            },
            data.getString("expiresAt"),
        )
    }

    fun completeBlurPhoto(photoId: String) {
        json("/api/v1/meal-photos/$photoId/blur/complete", JSONObject())
    }

    fun uploadPhoto(upload: MealPhotoUpload, file: File) {
        val destination = URL(URL(BuildConfig.MEAL_API_ORIGIN), upload.url)
        val request = destination.openConnection() as HttpURLConnection
        try {
            request.instanceFollowRedirects = false
            request.connectTimeout = 15_000
            request.readTimeout = 30_000
            request.requestMethod = "PUT"
            request.doOutput = true
            request.setFixedLengthStreamingMode(file.length())
            val origin = URL(BuildConfig.MEAL_API_ORIGIN)
            val sameOrigin = destination.protocol == origin.protocol &&
                destination.authority == origin.authority
            if (sameOrigin) {
                authorize(request)
            }
            for ((name, value) in upload.headers) request.setRequestProperty(name, value)
            request.outputStream.use { output -> file.inputStream().use { it.copyTo(output) } }
            if (sameOrigin) {
                requireSuccess(request)
            } else if (request.responseCode !in 200..299) {
                throw IOException("写真をアップロードできませんでした（HTTP ${request.responseCode}）。")
            }
        } finally {
            request.disconnect()
        }
    }

    fun createMeal(
        clientId: String,
        photoIds: List<String>,
        memo: String,
        occurredAt: String,
        calories: Int?,
    ): MealRecord {
        val request = JSONObject().put("clientId", clientId).put("memo", memo)
            .put("occurredAt", occurredAt).put("tags", JSONArray())
            .put("photoId", photoIds.firstOrNull() ?: JSONObject.NULL)
            .put("additionalPhotoIds", JSONArray(photoIds.drop(1)))
        if (calories != null) request.put("manualCaloriesKcal", calories)
        return parseMealRecord(json("/api/v1/meals", request).getJSONObject("data"))
    }

    fun updateMeal(meal: MealRecord, photoIds: List<String>, memo: String, occurredAt: String) {
        json(
            "/api/v1/meals/${meal.id}",
            JSONObject().put("memo", memo).put("occurredAt", occurredAt)
                .put("tags", JSONArray(meal.tags))
                .put("photoId", photoIds.firstOrNull() ?: JSONObject.NULL)
                .put("additionalPhotoIds", JSONArray(photoIds.drop(1))),
            "PUT",
        )
    }

    fun analyzeMeal(mealId: String) {
        json("/api/v1/nutrition/analyze", JSONObject().put("mealId", mealId))
    }

    fun analysisStatus(meal: MealRecord): String? {
        val day = java.time.Instant.parse(meal.occurredAt).atZone(japanZone).toLocalDate()
        val records = json("/api/v1/nutrition?from=$day&to=$day").getJSONArray("data")
        for (index in 0 until records.length()) {
            val record = records.getJSONObject(index)
            if (record.getString("mealId") == meal.id) {
                if (record.isNull("analysisStatus")) return null
                return record.getString("analysisStatus")
            }
        }
        throw IOException("食事記録が見つかりません。一覧を更新してください。")
    }

    private fun authorize(connection: HttpURLConnection) {
        if (BuildConfig.MEAL_API_USES_OAUTH) {
            connection.setRequestProperty(
                "Authorization",
                "Bearer ${WidgetOAuth.freshToken(context, authorization)}",
            )
        }
    }

    private fun connection(path: String, method: String): HttpURLConnection =
        (URL(BuildConfig.MEAL_API_ORIGIN + path).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false
            connectTimeout = 15_000
            readTimeout = 30_000
            requestMethod = method
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", WidgetOAuth.USER_AGENT)
            authorize(this)
        }

    private fun json(path: String, body: JSONObject? = null, method: String = "POST"): JSONObject {
        val request = connection(path, if (body == null) "GET" else method)
        try {
            if (body != null) {
                request.doOutput = true
                request.setRequestProperty("Content-Type", "application/json")
                request.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            requireSuccess(request)
            return request.inputStream.bufferedReader().use { JSONObject(it.readText()) }
        } finally {
            request.disconnect()
        }
    }

    private fun requireSuccess(request: HttpURLConnection) {
        val status = request.responseCode
        if (status in 200..299) return
        if (BuildConfig.MEAL_API_USES_OAUTH &&
            (status in 300..399 || status == 401 || status == 403)
        ) {
            throw WidgetLoginRequired()
        }
        val error = request.errorStream.bufferedReader().use { JSONObject(it.readText()) }
        throw IOException(error.getJSONObject("error").getString("message"))
    }
}
