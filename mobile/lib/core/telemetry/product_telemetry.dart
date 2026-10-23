import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:uuid/uuid.dart';
import '../api/api_client.dart';
import '../auth/auth_repository.dart';
import '../db/app_database.dart';
import 'registry.dart';
import 'diagnostic_sink.dart';
export 'registry.dart' show TelemetryEvent;

ProductTelemetry? _active;
void productEvent(
  TelemetryEvent event, {
  Map<String, dynamic> properties = const {},
  String? entityId,
}) {
  _active?.track(event, properties: properties, entityId: entityId);
}

bool _validProperties(String name, Object? candidate) {
  if (candidate is! Map<String, dynamic> ||
      !telemetryRegistry.containsKey(name)) {
    return false;
  }
  final properties = candidate;
  final definition = telemetryRegistry[name] as Map<String, dynamic>;
  final allowed = definition['properties'] as Map<String, dynamic>;
  if (properties.keys.any((k) => !allowed.containsKey(k))) return false;
  for (final entry in properties.entries) {
    final kind = allowed[entry.key], value = entry.value;
    if (kind is List
        ? !kind.contains(value)
        : kind == 'bool'
        ? value is! bool
        : ['count', 'duration', 'active'].contains(kind)
        ? value is! int ||
              value < 0 ||
              value >
                  (kind == 'active'
                      ? 30
                      : kind == 'duration'
                      ? 600000
                      : 10000)
        : value is! String ||
              !RegExp(r'^[a-zA-Z0-9_.-]{1,80}$').hasMatch(value)) {
      return false;
    }
  }
  return true;
}

/// Owner-scoped, bounded metadata only. Receipts survive connectivity retries.
class ProductTelemetry {
  ProductTelemetry(
    this.dio,
    this.db,
    this.owner,
    this.isCurrent, {
    this.configured = const bool.fromEnvironment('PRODUCT_TELEMETRY_ENABLED'),
  });
  final Dio dio;
  final AppDatabase db;
  final String owner;
  final bool Function() isCurrent;
  final bool configured;
  Future<void> get pendingWrites => _writes;
  final List<Map<String, dynamic>> _queue = [];
  final List<(TelemetryEvent, Map<String, dynamic>, String?)> _cold = [];
  String _session = const Uuid().v4(), _journey = const Uuid().v4();
  DateTime _lastAction = DateTime.now();
  bool _busy = false, _disposed = false, enabled = false, _ready = false;
  int retries = 0, dropped = 0;
  int _reportedDropped = 0;
  Timer? _timer;
  Future<void> _writes = Future.value();
  static const _key = 'product-telemetry:1';

  Future<void> initialize() async {
    try {
      enabled =
          configured &&
          await db.readRecord('product-telemetry-preference') != 'off';
      final saved = await db.readRecord(_key);
      try {
        if (saved != null && saved.length <= 131072) {
          final rows = jsonDecode(saved);
          if (rows is List && rows.length <= 200) {
            for (final row in rows) {
              if (row is Map<String, dynamic> &&
                  row.keys.every(
                    (key) => {
                      'event_id',
                      'schema_version',
                      'event_name',
                      'session_id',
                      'journey_id',
                      'occurred_at',
                      'source',
                      'entity_id',
                      'properties',
                    }.contains(key),
                  ) &&
                  _validProperties(
                    row['event_name'] as String? ?? '',
                    row['properties'],
                  ) &&
                  row['schema_version'] == 1 &&
                  row['source'] == 'mobile' &&
                  telemetryRegistry.containsKey(row['event_name']) &&
                  DateTime.tryParse(
                        row['occurred_at'] as String? ?? '',
                      )?.isAfter(
                        DateTime.now().subtract(const Duration(days: 7)),
                      ) ==
                      true) {
                _queue.add(row);
              }
            }
          }
        }
      } catch (_) {
        track(
          TelemetryEvent.diagnosticsClientError,
          properties: {'category': 'invalid_payload', 'count': 1},
        );
      }
      if (_disposed || !isCurrent()) return;
      _ready = true;
      PackageInfo? info;
      try {
        info = await PackageInfo.fromPlatform();
      } catch (_) {
        /* Version stays unknown. */
      }
      if (_disposed || !isCurrent()) return;
      track(
        TelemetryEvent.sessionStarted,
        properties: {
          'app_version': info?.version ?? 'unknown',
          'build_version': info?.buildNumber ?? 'unknown',
          'os_family': Platform.isAndroid
              ? 'android'
              : Platform.isIOS
              ? 'ios'
              : Platform.isWindows
              ? 'windows'
              : Platform.isMacOS
              ? 'macos'
              : 'linux',
          'device_class': 'unknown',
        },
      );
      final cold = List.of(_cold);
      _cold.clear();
      for (final (event, properties, entityId) in cold) {
        track(event, properties: properties, entityId: entityId);
      }
      _timer = Timer.periodic(const Duration(seconds: 30), (_) {
        if (WidgetsBinding.instance.lifecycleState ==
                AppLifecycleState.resumed &&
            DateTime.now().difference(_lastAction).inSeconds < 60) {
          track(
            TelemetryEvent.sessionActive,
            properties: {'active_seconds': 30},
          );
        }
        unawaited(flush());
      });
    } catch (_) {
      _ready = true; /* Collection never blocks startup. */
    }
  }

  void track(
    TelemetryEvent event, {
    Map<String, dynamic> properties = const {},
    String? entityId,
  }) {
    if (!_ready) {
      if (configured &&
          !_disposed &&
          isCurrent() &&
          _cold.length < 20 &&
          _validProperties(event.wire, properties)) {
        _cold.add((event, Map.of(properties), entityId));
      }
      return;
    }
    if (!enabled || !_ready || _disposed || !isCurrent()) return;
    try {
      if (!_validProperties(event.wire, properties)) return;
      if (event != TelemetryEvent.sessionActive) {
        if (DateTime.now().difference(_lastAction).inMinutes >= 30) {
          _session = const Uuid().v4();
          _journey = const Uuid().v4();
        }
        _lastAction = DateTime.now();
      }
      final row = <String, dynamic>{
        'event_id': const Uuid().v4(),
        'schema_version': 1,
        'event_name': event.wire,
        'session_id': _session,
        'journey_id': _journey,
        'occurred_at': DateTime.now().toUtc().toIso8601String(),
        'source': 'mobile',
        if (entityId != null &&
            RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(entityId))
          'entity_id': entityId,
        'properties': properties,
      };
      if (jsonEncode(row).length > 2048) {
        dropped++;
        return;
      }
      while (_queue.length >= 200 || jsonEncode(_queue).length > 129024) {
        _queue.removeAt(0);
        dropped++;
      }
      _queue.add(row);
      _persist();
    } catch (_) {
      dropped++;
    }
  }

  void newJourney() {
    _journey = const Uuid().v4();
  }

  void _persist() {
    final value = jsonEncode(_queue);
    _writes = _writes
        .then((_) => db.writeRecord(_key, value))
        .catchError((Object _) {});
  }

  Future<void> preference(bool value) async {
    enabled = value && configured;
    await db.writeRecord('product-telemetry-preference', value ? 'on' : 'off');
    if (!enabled) {
      _queue.clear();
      _persist();
    }
  }

  Future<void> flush() async {
    if (!enabled || _busy || _disposed || !isCurrent() || _queue.isEmpty) {
      return;
    }
    _busy = true;
    final batch = _queue.take(30).toList();
    try {
      await dio.post(
        'telemetry/events',
        data: {'events': batch},
        options: Options(
          extra: {'requestOwner': owner},
          sendTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
      if (_disposed || !isCurrent()) return;
      final ids = batch.map((r) => r['event_id']).toSet();
      _queue.removeWhere((r) => ids.contains(r['event_id']));
      if (dropped > _reportedDropped || retries > 0) {
        final delta = dropped - _reportedDropped;
        _reportedDropped = dropped;
        track(
          TelemetryEvent.diagnosticsDelivery,
          properties: {
            'category': 'delivery',
            'count': delta.clamp(0, 10000),
            'retry_count': retries.clamp(0, 10000),
          },
        );
      }
      retries = 0;
      _persist();
    } on DioException catch (error) {
      if (_disposed || !isCurrent()) return;
      retries++;
      if ([400, 413, 422].contains(error.response?.statusCode) ||
          retries >= 5) {
        final ids = batch.map((r) => r['event_id']).toSet();
        _queue.removeWhere((r) => ids.contains(r['event_id']));
        dropped += batch.length;
        retries = 0;
        _persist();
      }
    } catch (_) {
      /* Next bounded timer retries delivery. */
    } finally {
      _busy = false;
    }
  }

  void dispose() {
    _disposed = true;
    _timer?.cancel();
  }
}

final productTelemetryProvider = Provider<ProductTelemetry?>((ref) {
  final auth = ref.watch(authRepositoryProvider);
  final owner = ref.watch(authStateProvider.select((s) => s.value?.user.id));
  if (owner == null) return null;
  final client = ProductTelemetry(
    ref.watch(backendDioProvider),
    ref.watch(appDatabaseProvider),
    owner,
    () => auth.current?.user.id == owner,
  );
  _active = client;
  productApiFailureSink = (category) => client.track(
    TelemetryEvent.diagnosticsApiFailed,
    properties: {'category': category, 'count': 1},
  );
  unawaited(client.initialize());
  ref.onDispose(() {
    client.dispose();
    if (identical(_active, client)) {
      _active = null;
      productApiFailureSink = null;
    }
  });
  return client;
});

class TelemetryLifecycle extends ConsumerStatefulWidget {
  const TelemetryLifecycle({super.key, required this.child});
  final Widget child;
  @override
  ConsumerState<TelemetryLifecycle> createState() => _TelemetryLifecycleState();
}

class _TelemetryLifecycleState extends ConsumerState<TelemetryLifecycle>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final client = ref.read(productTelemetryProvider);
    if (state == AppLifecycleState.resumed) {
      client?.track(TelemetryEvent.sessionForegrounded);
    }
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      client?.track(TelemetryEvent.sessionBackgrounded);
      unawaited(client?.flush());
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(productTelemetryProvider);
    return widget.child;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }
}
