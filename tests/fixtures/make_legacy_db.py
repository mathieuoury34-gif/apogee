# Construit une base « ancienne app » de test à partir des vraies migrations Drizzle.
import sqlite3, json, sys, glob, os, math
out = sys.argv[1]
if os.path.exists(out): os.remove(out)
db = sqlite3.connect(out)
here = os.path.dirname(os.path.abspath(__file__))
for f in sorted(glob.glob(os.path.join(here, '00*.sql'))):
    sql = open(f).read().replace('--> statement-breakpoint', ';')
    db.executescript(sql)
c = db.cursor()
c.execute("insert into athlete(id, display_name, birth_date, sex, availability, equipment, injuries) values (1,'Mathieu','2002-03-10','M','[\"mon\",\"wed\"]','[\"Piscine 25 m\"]','[]')")
c.execute("insert into race(name, race_date, swim_distance_m, bike_distance_m, run_distance_m, target_total_seconds, target_run_seconds, is_primary) values ('Ironman 70.3 Aix','2027-05-23',1900,90000,21100,20700,6600,1)")
c.execute("insert into zone(kind,value,unit,measured_at,source,notes) values ('vma', 4.3889,'m_s','2026-09-01T00:00:00Z','test',null)")
c.execute("insert into zone(kind,value,unit,measured_at,source,notes) values ('hr_max', 196,'bpm','2026-08-25T00:00:00Z','estimation','Estimation de Tanaka (208 − 0,7 × âge)')")
c.execute("insert into training_phase(label, phase, start_date, end_date, intent) values ('Reprise','base','2026-09-01','2026-09-28','Volume')")
c.execute("insert into planned_session(discipline, planned_date, title, origin, idempotency_key) values ('RUN','2026-09-02','Footing','coach','k-1')")
ps = c.lastrowid
c.execute("insert into planned_block(planned_session_id, parent_block_id, position, kind, measure, measure_value, target_type) values (?,null,0,'WARMUP','TIME',600,'NONE')", (ps,))
c.execute("insert into planned_block(planned_session_id, parent_block_id, position, kind, set_mode, set_count, target_type) values (?,null,1,'SET','REPEAT',4,'NONE')", (ps,))
setid = c.lastrowid
c.execute("insert into planned_block(planned_session_id, parent_block_id, position, kind, measure, measure_value, target_type, target_low) values (?,?,0,'WORK','DISTANCE',400,'PACE',240)", (ps, setid))
c.execute("insert into planned_block(planned_session_id, parent_block_id, position, kind, measure, measure_value, target_type) values (?,?,1,'RECOVERY','TIME',90,'NONE')", (ps, setid))
# séance réalisée avec une longue série cardio (pages de débordement)
start = 1788343200  # 2026-09-02T10:00:00Z
hr = [[start + i*11, int(130 + 25*math.sin(i/30))] for i in range(400)]
c.execute("""insert into actual_session(garmin_activity_id, discipline, raw_exercise_type, start_at, end_at, zone_offset_minutes, duration_sec, distance_m, avg_hr_bpm, hr_sample_count, hr_series)
 values ('g-123','RUN','56','2026-09-02T10:00:00.000Z','2026-09-02T11:13:20.000Z',120,4400,12000,138,400,?)""", (json.dumps(hr),))
a1 = c.lastrowid
c.execute("insert into feedback(actual_session_id, rpe, comment) values (?,6,'Bonnes jambes')", (a1,))
c.execute("""insert into actual_session(garmin_activity_id, discipline, raw_exercise_type, start_at, end_at, zone_offset_minutes, duration_sec)
 values ('manual:abcd','STRENGTH','manual','2026-09-03T12:00:00.000Z','2026-09-03T13:00:00.000Z',0,3600)""")
a2 = c.lastrowid
c.execute("insert into session_link(planned_session_id, actual_session_id, link_type) values (null, ?, 'manual')", (a2,))
c.execute("insert into sleep_night(night_date,start_at,end_at,duration_sec) values ('2026-09-02','2026-09-01T22:00:00Z','2026-09-02T06:00:00Z',28800)")
c.execute("insert into resting_hr(day,bpm) values ('2026-09-02',48)")
c.execute("insert into interruption(label,start_date,end_date,reason,daily_load_override,suspends_reminders) values ('GR20','2026-09-10','2026-09-12','external_load',45,1)")
c.execute("insert into coach_exchange(direction, exchange_schema_version, status, operation_count, notes) values ('export','apogee/1','applied',1,'{\"kind\":\"export\",\"sessions\":[{\"discipline\":\"RUN\",\"day\":\"2026-09-02\"}]}')")
# beaucoup de lignes pour forcer des pages intérieures
for i in range(300):
    c.execute("insert into resting_hr(day,bpm) values (?,?)", ('2025-%02d-%02d' % (1 + i // 28, 1 + i % 28), 50 + i % 5))
db.commit(); db.close()
