// Module natif de l'APK Quadra : lecture Health Connect (séances Garmin, FC, vitesse, distance, calories,
// dénivelé, sommeil, FC de repos). Exposé à l'app web par Capacitor sous `window.Capacitor.Plugins.QuadraHealth`.
// Lecture seule : l'app n'écrit jamais dans Health Connect.
package com.mathieu.quadra

import android.content.Intent
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.Instant
import kotlin.reflect.KClass

@CapacitorPlugin(name = "QuadraHealth")
class QuadraHealthPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var launcher: ActivityResultLauncher<Set<String>>? = null
    private var pendingPermissionCall: PluginCall? = null

    private val types: Map<String, KClass<out Record>> = linkedMapOf(
        "ExerciseSession" to ExerciseSessionRecord::class,
        "HeartRate" to HeartRateRecord::class,
        "Speed" to SpeedRecord::class,
        "Distance" to DistanceRecord::class,
        "ActiveCaloriesBurned" to ActiveCaloriesBurnedRecord::class,
        "TotalCaloriesBurned" to TotalCaloriesBurnedRecord::class,
        "ElevationGained" to ElevationGainedRecord::class,
        "SleepSession" to SleepSessionRecord::class,
        "RestingHeartRate" to RestingHeartRateRecord::class,
    )
    private val readPermissions: Map<String, String> get() = types.mapValues { HealthPermission.getReadPermission(it.value) }
    private val historyPermission = "android.permission.health.READ_HEALTH_DATA_HISTORY"

    override fun load() {
        launcher = activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { _ ->
            val call = pendingPermissionCall ?: return@registerForActivityResult
            pendingPermissionCall = null
            permissions(call)
        }
    }

    private fun client(): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) HealthConnectClient.getOrCreate(context) else null

    @PluginMethod
    fun availability(call: PluginCall) {
        val status = when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }
        call.resolve(JSObject().put("status", status))
    }

    @PluginMethod
    fun permissions(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        scope.launch {
            try {
                val granted = c.permissionController.getGrantedPermissions()
                val ok = JSArray(); val missing = JSArray()
                for ((name, perm) in readPermissions) if (granted.contains(perm)) ok.put(name) else missing.put(name)
                call.resolve(JSObject().put("granted", ok).put("missing", missing).put("history", granted.contains(historyPermission)))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture des autorisations impossible") }
        }
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        if (client() == null) return call.reject("Health Connect indisponible")
        val l = launcher ?: return call.reject("Écran d'autorisation indisponible")
        pendingPermissionCall = call
        activity.runOnUiThread { l.launch(readPermissions.values.toSet() + historyPermission) }
    }

    @PluginMethod
    fun openSettings(call: PluginCall) {
        try {
            val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) { call.reject(e.message ?: "Réglages Health Connect introuvables") }
    }

    private suspend fun <T : Record> readAll(c: HealthConnectClient, type: KClass<T>, start: Instant, end: Instant): List<T> {
        val out = ArrayList<T>()
        var token: String? = null
        do {
            val res = c.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(start, end), pageSize = 1000, pageToken = token))
            out.addAll(res.records)
            token = res.pageToken
        } while (!token.isNullOrEmpty())
        return out
    }

    private fun range(call: PluginCall): Pair<Instant, Instant>? = try {
        Instant.parse(call.getString("start")) to Instant.parse(call.getString("end"))
    } catch (e: Exception) { null }

    @PluginMethod
    fun readSessions(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val sessions = readAll(c, ExerciseSessionRecord::class, start, end)
                val list = JSArray()
                for (s in sessions) {
                    val f = TimeRangeFilter.between(s.startTime, s.endTime)
                    val hr = JSArray()
                    safe { readAll(c, HeartRateRecord::class, s.startTime, s.endTime) }?.flatMap { it.samples }?.sortedBy { it.time }?.forEach {
                        hr.put(JSArray().put(it.time.epochSecond).put(it.beatsPerMinute))
                    }
                    val speed = JSArray()
                    safe { readAll(c, SpeedRecord::class, s.startTime, s.endTime) }?.flatMap { it.samples }?.sortedBy { it.time }?.forEach {
                        speed.put(JSArray().put(it.time.epochSecond).put(it.speed.inMetersPerSecond))
                    }
                    // Totaux : agrégats Health Connect (dédoublonnés entre sources) sur la durée de la séance
                    val agg = safe {
                        c.aggregate(androidx.health.connect.client.request.AggregateRequest(
                            setOf(DistanceRecord.DISTANCE_TOTAL, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL, ElevationGainedRecord.ELEVATION_GAINED_TOTAL), f))
                    }
                    val o = JSObject()
                    o.put("id", s.metadata.id)
                    o.putN("clientRecordId", s.metadata.clientRecordId)
                    o.put("startTime", s.startTime.toString())
                    o.put("endTime", s.endTime.toString())
                    o.putN("startZoneOffsetSeconds", s.startZoneOffset?.totalSeconds)
                    o.put("exerciseType", s.exerciseType)
                    o.putN("title", s.title)
                    o.putN("distanceM", agg?.get(DistanceRecord.DISTANCE_TOTAL)?.inMeters)
                    o.putN("activeKcal", agg?.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)?.inKilocalories)
                    o.putN("totalKcal", agg?.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL)?.inKilocalories)
                    o.putN("elevationM", agg?.get(ElevationGainedRecord.ELEVATION_GAINED_TOTAL)?.inMeters)
                    o.put("hr", hr)
                    o.put("speed", speed)
                    list.put(o)
                }
                call.resolve(JSObject().put("sessions", list))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture des séances impossible") }
        }
    }

    @PluginMethod
    fun readSleep(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val nights = JSArray()
                for (s in readAll(c, SleepSessionRecord::class, start, end)) {
                    nights.put(JSObject().put("id", s.metadata.id).putN("clientRecordId", s.metadata.clientRecordId)
                        .put("startTime", s.startTime.toString()).put("endTime", s.endTime.toString())
                        .putN("startZoneOffsetSeconds", s.startZoneOffset?.totalSeconds))
                }
                call.resolve(JSObject().put("nights", nights))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture du sommeil impossible") }
        }
    }

    @PluginMethod
    fun readResting(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val records = JSArray()
                for (r in readAll(c, RestingHeartRateRecord::class, start, end)) {
                    records.put(JSObject().put("id", r.metadata.id).put("time", r.time.toString())
                        .putN("zoneOffsetSeconds", r.zoneOffset?.totalSeconds).put("bpm", r.beatsPerMinute))
                }
                call.resolve(JSObject().put("records", records))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture de la FC de repos impossible") }
        }
    }

    /** JSONObject.put(k, null) retire la clé : on écrit un vrai null JSON. */
    private fun JSObject.putN(k: String, v: Any?): JSObject { put(k, v ?: org.json.JSONObject.NULL); return this }

    private inline fun <T> safe(block: () -> T): T? = try { block() } catch (e: Exception) { null }
}
