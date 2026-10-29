// Module natif de l'APK Apogée : lecture Health Connect (séances Garmin, FC, vitesse, distance, calories,
// dénivelé, sommeil, FC de repos). Exposé à l'app web par Capacitor sous `window.Capacitor.Plugins.ApogeeHealth`.
// Lecture seule : l'app n'écrit jamais dans Health Connect.
package com.mathieu.apogee

import android.content.Intent
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
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

@CapacitorPlugin(name = "ApogeeHealth")
class ApogeeHealthPlugin : Plugin() {
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
        "Weight" to WeightRecord::class,
        "Vo2Max" to Vo2MaxRecord::class,
        "HeartRateVariability" to HeartRateVariabilityRmssdRecord::class,
        "Steps" to StepsRecord::class,
        "FloorsClimbed" to FloorsClimbedRecord::class,
        "BasalMetabolicRate" to BasalMetabolicRateRecord::class,
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

    /** Appelé par la page dès que son propre écran de démarrage est dessiné : l'écran de lancement d'Android peut alors s'effacer. */
    @PluginMethod
    fun hideSplash(call: PluginCall) {
        SplashGate.ready = true
        call.resolve()
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

    private suspend fun <T : Record> readAll(c: HealthConnectClient, type: KClass<T>, start: Instant, end: Instant, page: Int = 1000): List<T> {
        val out = ArrayList<T>()
        var token: String? = null
        do {
            val res = c.readRecords(ReadRecordsRequest(type, TimeRangeFilter.between(start, end), pageSize = page, pageToken = token))
            out.addAll(res.records)
            token = res.pageToken
        } while (!token.isNullOrEmpty())
        return out
    }

    /** Sources Garmin qui ont écrit dans Health Connect ces derniers jours : les totaux du jour ne portent que sur elles, comme Garmin Connect (sinon Health Connect mélange aussi le compteur de pas du téléphone). Aucune trouvée : toutes les sources. */
    private suspend fun garminOrigins(c: HealthConnectClient, end: Instant): Set<DataOrigin> {
        val found = HashSet<DataOrigin>()
        val steps = safe { readAll(c, StepsRecord::class, end.minusSeconds(7 * 86400L), end) }
        if (steps != null) for (r in steps) if (r.metadata.dataOrigin.packageName.contains("garmin", ignoreCase = true)) found.add(r.metadata.dataOrigin)
        val cals = safe { readAll(c, TotalCaloriesBurnedRecord::class, end.minusSeconds(7 * 86400L), end) }
        if (cals != null) for (r in cals) if (r.metadata.dataOrigin.packageName.contains("garmin", ignoreCase = true)) found.add(r.metadata.dataOrigin)
        return found
    }

    /** Une mesure sur un intervalle de temps (pas, étages, calories) telle que Garmin la dépose. */
    private class Piece(val start: Instant, val end: Instant, val value: Double, val modified: Long = 0L)

    /** Intervalles de temps déjà comptés (disjoints), pour ne jamais compter deux fois un même moment. */
    private class Cover {
        private val map = java.util.TreeMap<Long, Long>()

        /** Parties de [s, e[ pas encore comptées. */
        fun gaps(s: Long, e: Long): List<LongArray> {
            val out = ArrayList<LongArray>()
            var cur = s
            val before = map.floorEntry(s)
            val from = if (before != null && before.value > s) before.key else s
            for (entry in map.subMap(from, true, e, false).entries) {
                if (entry.value <= cur) continue
                if (entry.key > cur) out.add(longArrayOf(cur, minOf(entry.key, e)))
                cur = maxOf(cur, entry.value)
                if (cur >= e) break
            }
            if (cur < e) out.add(longArrayOf(cur, e))
            return out
        }

        fun add(s: Long, e: Long) {
            var ns = s
            var ne = e
            val before = map.floorEntry(s)
            if (before != null && before.value >= s) { ns = minOf(ns, before.key); ne = maxOf(ne, before.value) }
            val keys = ArrayList(map.subMap(ns, true, ne, true).keys)
            for (k in keys) { val v = map[k]; if (v != null && v > ne) ne = v; map.remove(k) }
            map[ns] = ne
        }
    }

    private class DayTotals(val days: HashMap<String, Double>, val overlaps: Int, val naive: HashMap<String, Double>)

    /** Répartit `amount` entre les jours locaux traversés par [a, b[, au prorata du temps passé dans chaque jour. */
    private fun spread(out: HashMap<String, Double>, a: Long, b: Long, amount: Double, zone: java.time.ZoneId) {
        val total = (b - a).toDouble()
        if (total <= 0.0) return
        var cur = a
        while (cur < b) {
            val date = Instant.ofEpochMilli(cur).atZone(zone).toLocalDate()
            val next = minOf(b, date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli())
            val key = date.toString()
            out[key] = (out[key] ?: 0.0) + amount * (next - cur).toDouble() / total
            cur = next
        }
    }

    /**
     * Total par jour local. Les mesures se recouvrent parfois (une séance déposée en plus du suivi de la journée) : Health Connect les additionne alors deux fois.
     * On part des plus courtes (le suivi le plus fin) et on ne compte jamais deux fois un même moment. Sans recouvrement, c'est la simple somme.
     */
    private fun dayTotals(pieces: List<Piece>, zone: java.time.ZoneId): DayTotals {
        val days = HashMap<String, Double>()
        val naive = HashMap<String, Double>()
        val cover = Cover()
        var overlaps = 0
        for (p in pieces.sortedBy { it.end.toEpochMilli() - it.start.toEpochMilli() }) {
            val s = p.start.toEpochMilli()
            val e = p.end.toEpochMilli()
            val len = e - s
            if (len <= 0L) {
                val key = p.start.atZone(zone).toLocalDate().toString()
                days[key] = (days[key] ?: 0.0) + p.value
                naive[key] = (naive[key] ?: 0.0) + p.value
                continue
            }
            spread(naive, s, e, p.value, zone)
            val gaps = cover.gaps(s, e)
            var counted = 0L
            for (g in gaps) {
                counted += g[1] - g[0]
                spread(days, g[0], g[1], p.value * (g[1] - g[0]).toDouble() / len.toDouble(), zone)
            }
            if (counted < len) overlaps++
            cover.add(s, e)
        }
        return DayTotals(days, overlaps, naive)
    }

    /** Mesures des sources données (toutes si `origins` est vide) pour un type : "steps", "floors", "active" ou "total". */
    private suspend fun pieces(c: HealthConnectClient, kind: String, start: Instant, end: Instant, origins: Set<DataOrigin>): List<Piece> {
        val names = origins.map { it.packageName }.toSet()
        return when (kind) {
            "steps" -> readAll(c, StepsRecord::class, start, end, 300).filter { names.isEmpty() || names.contains(it.metadata.dataOrigin.packageName) }.map { Piece(it.startTime, it.endTime, it.count.toDouble(), it.metadata.lastModifiedTime.epochSecond) }
            "floors" -> readAll(c, FloorsClimbedRecord::class, start, end, 300).filter { names.isEmpty() || names.contains(it.metadata.dataOrigin.packageName) }.map { Piece(it.startTime, it.endTime, it.floors, it.metadata.lastModifiedTime.epochSecond) }
            "active" -> readAll(c, ActiveCaloriesBurnedRecord::class, start, end).filter { names.isEmpty() || names.contains(it.metadata.dataOrigin.packageName) }.map { Piece(it.startTime, it.endTime, it.energy.inKilocalories, it.metadata.lastModifiedTime.epochSecond) }
            else -> readAll(c, TotalCaloriesBurnedRecord::class, start, end).filter { names.isEmpty() || names.contains(it.metadata.dataOrigin.packageName) }.map { Piece(it.startTime, it.endTime, it.energy.inKilocalories, it.metadata.lastModifiedTime.epochSecond) }
        }
    }

    /** Lit un type par tranches de 30 jours (mémoire) et en tire un total par jour local. */
    private suspend fun dailyOf(c: HealthConnectClient, kind: String, from: java.time.LocalDateTime, to: java.time.LocalDateTime, origins: Set<DataOrigin>, zone: java.time.ZoneId, errors: MutableList<String>? = null): DayTotals? {
        val all = ArrayList<Piece>()
        var a = from
        val span = if (kind == "steps" || kind == "floors") 7L else 30L
        while (a < to) {
            val b = if (a.plusDays(span) < to) a.plusDays(span) else to
            // une mesure à cheval sur deux tranches est lue deux fois : on la garde une fois (début dans la tranche)
            val got = try { pieces(c, kind, a.atZone(zone).toInstant(), b.atZone(zone).toInstant(), origins) } catch (e: Exception) { errors?.add(kind + " : " + e.javaClass.simpleName + " " + (e.message ?: "")); return null }
            all.addAll(got)
            a = b
        }
        val seen = HashSet<String>()
        val uniq = all.filter { seen.add(it.start.toEpochMilli().toString() + "/" + it.end.toEpochMilli() + "/" + it.value) }
        return dayTotals(uniq, zone)
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
                    // temps réellement endormi : étapes « dormir » (2), léger (4), profond (5), paradoxal (6) ; l'éveil (1, 7), la sortie du lit (3) et l'inconnu (0) sont exclus
                    var asleep = 0L
                    for (st in s.stages) {
                        if (st.stage == 2 || st.stage == 4 || st.stage == 5 || st.stage == 6) asleep += st.endTime.epochSecond - st.startTime.epochSecond
                    }
                    nights.put(JSObject().put("id", s.metadata.id).putN("clientRecordId", s.metadata.clientRecordId)
                        .put("startTime", s.startTime.toString()).put("endTime", s.endTime.toString())
                        .putN("startZoneOffsetSeconds", s.startZoneOffset?.totalSeconds)
                        .putN("asleepSec", if (s.stages.isEmpty()) null else asleep))
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

    @PluginMethod
    fun readWeight(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val records = JSArray()
                for (r in readAll(c, WeightRecord::class, start, end)) {
                    records.put(JSObject().put("id", r.metadata.id).put("time", r.time.toString())
                        .putN("zoneOffsetSeconds", r.zoneOffset?.totalSeconds).put("kg", r.weight.inKilograms))
                }
                call.resolve(JSObject().put("records", records))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture du poids impossible") }
        }
    }

    /** Dépense du jour (calories actives et totales, repos compris), un total par jour local, uniquement les sources Garmin et sans compter deux fois un même moment. */
    @PluginMethod
    fun readDailyEnergy(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val zone = java.time.ZoneId.systemDefault()
                val from = java.time.LocalDateTime.ofInstant(start, zone).toLocalDate().atStartOfDay()
                val to = java.time.LocalDateTime.ofInstant(end, zone)
                val origins = garminOrigins(c, end)
                val days = JSArray()
                val active = if (origins.isEmpty()) null else dailyOf(c, "active", from, to, origins, zone)
                val total = if (origins.isEmpty()) null else dailyOf(c, "total", from, to, origins, zone)
                if (active != null && total != null) {
                    val keys = java.util.TreeSet<String>()
                    keys.addAll(active.days.keys); keys.addAll(total.days.keys)
                    for (day in keys) days.put(JSObject().put("day", day).putN("activeKcal", active.days[day]).putN("totalKcal", total.days[day]).putN("basalKcal", null))
                } else {
                    val slice = java.time.Period.ofDays(1)
                    val groups = c.aggregateGroupByPeriod(
                        AggregateGroupByPeriodRequest(
                            setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL),
                            TimeRangeFilter.between(from, to), slice, origins
                        )
                    )
                    for (g in groups) {
                        days.put(JSObject().put("day", g.startTime.toLocalDate().toString())
                            .putN("activeKcal", g.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories)
                            .putN("totalKcal", g.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories)
                            .putN("basalKcal", null))
                    }
                }
                // dépense de base (repos) : lecture séparée, une autorisation en retard ne bloque pas le reste (Garmin ne la dépose pas toujours)
                val basal = safe { c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL), TimeRangeFilter.between(from, to), java.time.Period.ofDays(1), origins)) }
                val basalByDay = HashMap<String, Double?>()
                for (g in basal ?: emptyList()) basalByDay[g.startTime.toLocalDate().toString()] = g.result[BasalMetabolicRateRecord.BASAL_CALORIES_TOTAL]?.inKilocalories
                for (i in 0 until days.length()) {
                    val o = days.getJSONObject(i)
                    val b = basalByDay[o.getString("day")]
                    if (b != null && b > 0.0) o.put("basalKcal", b)
                }
                call.resolve(JSObject().put("days", days).put("origins", strArray(origins.map { it.packageName })).put("version", 2))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture de la dépense énergétique impossible") }
        }
    }

    /** Pas et étages montés du jour, un total par jour local, uniquement les sources Garmin et sans compter deux fois un même moment. Lecture séparée de la dépense : une autorisation en retard ne bloque pas le reste. */
    @PluginMethod
    fun readDailyActivity(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val zone = java.time.ZoneId.systemDefault()
                val from = java.time.LocalDateTime.ofInstant(start, zone).toLocalDate().atStartOfDay()
                val to = java.time.LocalDateTime.ofInstant(end, zone)
                val days = JSArray()
                val origins = garminOrigins(c, end)
                val errors = ArrayList<String>()
                // pas : total du jour calculé par Health Connect (mêmes sources). La lecture mesure par mesure plante quand Garmin dépose une mesure à 0 pas (« count must not be less than 1 »).
                val floors = if (origins.isEmpty()) null else dailyOf(c, "floors", from, to, origins, zone, errors)
                val byDay = java.util.TreeMap<String, JSObject>()
                fun put(day: String, k: String, v: Double?) { byDay.getOrPut(day) { JSObject() }.putN(k, v) }
                val st = try { c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(from, to), java.time.Period.ofDays(1), origins)) } catch (e: Exception) { errors.add("pas (total du jour) : " + e.javaClass.simpleName + " " + (e.message ?: "")); null }
                for (g in st ?: emptyList()) put(g.startTime.toLocalDate().toString(), "steps", g.result[StepsRecord.COUNT_TOTAL]?.toDouble())
                if (floors != null) { for ((day, v) in floors.days) put(day, "floors", v) }
                else {
                    val fl = try { c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL), TimeRangeFilter.between(from, to), java.time.Period.ofDays(1), origins)) } catch (e: Exception) { errors.add("étages (total du jour) : " + e.javaClass.simpleName + " " + (e.message ?: "")); null }
                    for (g in fl ?: emptyList()) put(g.startTime.toLocalDate().toString(), "floors", g.result[FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL])
                }
                for ((day, o) in byDay) days.put(o.put("day", day))
                call.resolve(JSObject().put("days", days).put("origins", strArray(origins.map { it.packageName })).put("errors", strArray(errors)).put("version", 3))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture des pas et étages impossible") }
        }
    }

    /** Diagnostic : pour chaque jour récent, ce que Garmin a déposé dans Health Connect (somme brute, total sans doublon, nombre de mesures qui se recouvrent) et quelles applications écrivent des pas. */
    @PluginMethod
    fun diagnoseGarmin(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val zone = java.time.ZoneId.systemDefault()
                val from = java.time.LocalDateTime.ofInstant(start, zone).toLocalDate().atStartOfDay()
                val to = java.time.LocalDateTime.ofInstant(end, zone)
                val origins = garminOrigins(c, end)
                val out = JSObject()
                out.put("origins", strArray(origins.map { it.packageName }))
                val apps = HashMap<String, Int>()
                // pas : jamais lus mesure par mesure (une mesure à 0 pas fait planter la lecture) ; origines et totaux viennent de l'agrégat du jour
                val appList = JSArray()
                for ((k, n) in apps) appList.put(JSObject().put("app", k).put("steps", n))
                out.put("apps", appList)
                val kinds = JSObject()
                for (kind in listOf("steps", "floors", "active", "total")) {
                    val k = JSObject()
                    if (kind != "steps") try {
                        val got = pieces(c, kind, from.atZone(zone).toInstant(), end, origins)
                        val t = dayTotals(got, zone)
                        k.put("records", got.size).put("overlaps", t.overlaps)
                        var last = 0L
                        for (p in got) if (p.end.epochSecond > last) last = p.end.epochSecond
                        k.put("lastEnd", last)
                        val dd = JSArray()
                        // dernière écriture de Garmin pour chaque jour : un jour figé avant minuit n'a pas reçu la fin de la journée
                        val modBy = HashMap<String, Long>()
                        for (p in got) { val dk = p.end.minusSeconds(1).atZone(zone).toLocalDate().toString(); if (p.modified > (modBy[dk] ?: 0L)) modBy[dk] = p.modified }
                        for (day in java.util.TreeSet(t.naive.keys)) dd.put(JSObject().put("day", day).put("raw", t.naive[day] ?: 0.0).put("clean", t.days[day] ?: 0.0).put("mod", modBy[day] ?: 0L))
                        k.put("days", dd)
                    } catch (e: Exception) { k.put("error", e.javaClass.simpleName + " " + (e.message ?: "")) }
                    // total du jour calculé par Health Connect lui-même (mêmes sources), pour comparer
                    try {
                        val per = java.time.Period.ofDays(1)
                        val rng = TimeRangeFilter.between(from, to)
                        val ag = JSArray()
                        when (kind) {
                            "steps" -> {
                                val seen = HashSet<String>()
                                for (x in c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(StepsRecord.COUNT_TOTAL), rng, per, origins))) {
                                    ag.put(JSObject().put("day", x.startTime.toLocalDate().toString()).putN("v", x.result[StepsRecord.COUNT_TOTAL]?.toDouble()))
                                    for (o in x.result.dataOrigins) seen.add(o.packageName)
                                }
                                out.put("stepsOrigins", strArray(seen.toList()))
                            }
                            "floors" -> for (x in c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL), rng, per, origins))) ag.put(JSObject().put("day", x.startTime.toLocalDate().toString()).putN("v", x.result[FloorsClimbedRecord.FLOORS_CLIMBED_TOTAL]))
                            "active" -> for (x in c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), rng, per, origins))) ag.put(JSObject().put("day", x.startTime.toLocalDate().toString()).putN("v", x.result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories))
                            else -> for (x in c.aggregateGroupByPeriod(AggregateGroupByPeriodRequest(setOf(TotalCaloriesBurnedRecord.ENERGY_TOTAL), rng, per, origins))) ag.put(JSObject().put("day", x.startTime.toLocalDate().toString()).putN("v", x.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories))
                        }
                        k.put("agg", ag)
                    } catch (e: Exception) { k.put("aggError", e.javaClass.simpleName + " " + (e.message ?: "")) }
                    kinds.put(kind, k)
                }
                out.put("kinds", kinds)
                call.resolve(out)
            } catch (e: Exception) { call.reject(e.message ?: "Diagnostic impossible") }
        }
    }

    /** VO₂max déposé par la montre, s'il y en a (Garmin ne l'envoie pas toujours). */
    @PluginMethod
    fun readVo2Max(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val records = JSArray()
                for (r in readAll(c, Vo2MaxRecord::class, start, end)) {
                    records.put(JSObject().put("id", r.metadata.id).put("time", r.time.toString())
                        .putN("zoneOffsetSeconds", r.zoneOffset?.totalSeconds).put("value", r.vo2MillilitersPerMinuteKilogram))
                }
                call.resolve(JSObject().put("records", records))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture du VO2max impossible") }
        }
    }

    /** Variabilité cardiaque (RMSSD, ms), si la montre la dépose. */
    @PluginMethod
    fun readHrv(call: PluginCall) {
        val c = client() ?: return call.reject("Health Connect indisponible")
        val (start, end) = range(call) ?: return call.reject("Période invalide")
        scope.launch {
            try {
                val records = JSArray()
                for (r in readAll(c, HeartRateVariabilityRmssdRecord::class, start, end)) {
                    records.put(JSObject().put("id", r.metadata.id).put("time", r.time.toString())
                        .putN("zoneOffsetSeconds", r.zoneOffset?.totalSeconds).put("ms", r.heartRateVariabilityMillis))
                }
                call.resolve(JSObject().put("records", records))
            } catch (e: Exception) { call.reject(e.message ?: "Lecture de la HRV impossible") }
        }
    }

    /** JSONObject.put(k, null) retire la clé : on écrit un vrai null JSON. */
    private fun strArray(xs: List<String>): JSArray { val a = JSArray(); for (x in xs) a.put(x); return a }

    private fun JSObject.putN(k: String, v: Any?): JSObject { put(k, v ?: org.json.JSONObject.NULL); return this }

    private inline fun <T> safe(block: () -> T): T? = try { block() } catch (e: Exception) { null }
}

/** Garde l'écran de lancement natif affiché tant que la page web n'a pas dessiné le sien (lu par MainActivity). */
object SplashGate {
    @JvmField
    @Volatile
    var ready: Boolean = false
}
