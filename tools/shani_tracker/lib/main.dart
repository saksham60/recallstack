import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:timezone/data/latest.dart' as tz;
import 'package:timezone/timezone.dart' as tz;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Notifications.init();
  runApp(const ShaniApp());
}

class Notifications {
  static final plugin = FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    tz.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation('Asia/Kolkata'));
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await plugin.initialize(settings);
    final android = plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.requestNotificationsPermission();
  }

  static Future<void> schedule(int hour, int minute) async {
    await plugin.cancel(1001);
    await plugin.cancel(1002);
    final now = tz.TZDateTime.now(tz.local);
    var daily = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!daily.isAfter(now)) daily = daily.add(const Duration(days: 1));
    await plugin.zonedSchedule(
      1001,
      'Shani practice',
      'Complete today’s mantra goal.',
      daily,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'shani_daily',
          'Daily Shani Reminder',
          channelDescription: 'Daily mantra practice reminder',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.time,
    );

    final daysToSat = (DateTime.saturday - now.weekday) % 7;
    var saturday = tz.TZDateTime(tz.local, now.year, now.month, now.day + daysToSat, hour, minute);
    if (!saturday.isAfter(now)) saturday = saturday.add(const Duration(days: 7));
    await plugin.zonedSchedule(
      1002,
      'Saturday practice',
      'Shani Stotra • Hanuman Chalisa • Seva',
      saturday,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'shani_saturday',
          'Saturday Shani Reminder',
          channelDescription: 'Saturday add-on reminder',
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
      matchDateTimeComponents: DateTimeComponents.dayOfWeekAndTime,
    );
  }
}

class ShaniApp extends StatelessWidget {
  const ShaniApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Shani Tracker',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFF91A7FF),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  static const total = 23004;
  static const start = DateTime(2026, 9, 26);
  final tts = FlutterTts();
  Map<String, int> daily = {};
  int hour = 7;
  int minute = 30;
  bool loading = true;

  String keyOf(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  int dayNumber(DateTime d) => DateTime(d.year, d.month, d.day).difference(start).inDays + 1;
  int goalMalas(int day) => day >= 1 && day <= 37 && (day - 1) % 3 == 0 ? 6 : 5;
  int get todayDay => dayNumber(DateTime.now());
  int get todayTarget => goalMalas(todayDay) * 108;
  int get todayCount => daily[keyOf(DateTime.now())] ?? 0;
  int get totalCount => daily.values.fold(0, (a, b) => a + b);

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    hour = p.getInt('hour') ?? 7;
    minute = p.getInt('minute') ?? 30;
    final raw = p.getString('daily');
    if (raw != null) {
      daily = (jsonDecode(raw) as Map<String, dynamic>).map((k, v) => MapEntry(k, v as int));
    }
    await Notifications.schedule(hour, minute);
    setState(() => loading = false);
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('daily', jsonEncode(daily));
    await p.setInt('hour', hour);
    await p.setInt('minute', minute);
  }

  Future<void> add(int value) async {
    final k = keyOf(DateTime.now());
    setState(() => daily[k] = (daily[k] ?? 0) + value);
    await save();
  }

  Future<void> undoMala() async {
    final k = keyOf(DateTime.now());
    setState(() => daily[k] = ((daily[k] ?? 0) - 108).clamp(0, 999999));
    await save();
  }

  Future<void> playMantra() async {
    await tts.stop();
    final dynamic langs = await tts.getLanguages;
    final hasHindi = langs is List && langs.any((e) => e.toString().toLowerCase().startsWith('hi'));
    await tts.setSpeechRate(0.32);
    await tts.setPitch(1.0);
    if (hasHindi) {
      await tts.setLanguage('hi-IN');
      await tts.speak('ॐ प्रां प्रीं प्रौं सः शनैश्चराय नमः');
    } else {
      await tts.setLanguage('en-IN');
      await tts.speak('Om. Praam. Preem. Praum. Sah. Sha naish cha raa ya. Namah.');
    }
  }

  Future<void> pickReminder() async {
    final value = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: hour, minute: minute),
    );
    if (value == null) return;
    setState(() {
      hour = value.hour;
      minute = value.minute;
    });
    await save();
    await Notifications.schedule(hour, minute);
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final beforeStart = todayDay < 1;
    final shownDay = todayDay.clamp(1, 40);
    final todayProgress = (todayCount / todayTarget).clamp(0.0, 1.0).toDouble();
    final allProgress = (totalCount / total).clamp(0.0, 1.0).toDouble();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Shani Tracker'),
        actions: [IconButton(onPressed: pickReminder, icon: const Icon(Icons.notifications_outlined))],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(beforeStart ? 'Starts Saturday, 26 Sep' : 'Day $shownDay of 40', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text('${goalMalas(todayDay)} malas • $todayTarget reps', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          LinearProgressIndicator(value: todayProgress, minHeight: 12),
          const SizedBox(height: 6),
          Text('$todayCount / $todayTarget today'),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  const Text('ॐ प्रां प्रीं प्रौं सः शनैश्चराय नमः', textAlign: TextAlign.center, style: TextStyle(fontSize: 27, height: 1.5)),
                  const SizedBox(height: 4),
                  const Text('Om Praam Preem Praum Sah Shanaishcharaya Namah', textAlign: TextAlign.center),
                  const SizedBox(height: 14),
                  FilledButton.icon(onPressed: playMantra, icon: const Icon(Icons.volume_up), label: const Text('Play mantra')),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => add(108), child: const Padding(padding: EdgeInsets.symmetric(vertical: 14), child: Text('+ 1 Mala (108)', style: TextStyle(fontSize: 18)))),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => add(27), child: const Text('+27'))),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton(onPressed: () => add(1), child: const Text('+1'))),
            const SizedBox(width: 8),
            Expanded(child: OutlinedButton(onPressed: undoMala, child: const Text('Undo mala'))),
          ]),
          const SizedBox(height: 24),
          const Text('Overall progress', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          LinearProgressIndicator(value: allProgress, minHeight: 10),
          const SizedBox(height: 6),
          Text('$totalCount / $total'),
          const SizedBox(height: 24),
          const Text('Before mantra', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          const Text('Freshen up • quiet place • Ganesha 3–11× • sankalpa • 3 slow breaths'),
          if (DateTime.now().weekday == DateTime.saturday) ...[
            const SizedBox(height: 20),
            const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Saturday\n• Dasharatha Shani Stotra\n• Hanuman Chalisa\n• Daan / seva'))),
          ],
          const SizedBox(height: 22),
          Text('Reminder: ${TimeOfDay(hour: hour, minute: minute).format(context)}', textAlign: TextAlign.center),
          const SizedBox(height: 28),
        ],
      ),
    );
  }
}
