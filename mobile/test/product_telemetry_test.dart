import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:app/core/db/app_database.dart';
import 'package:app/core/telemetry/product_telemetry.dart';

class _Adapter implements HttpClientAdapter {
  bool offline = true;
  final List<List<dynamic>> batches = [];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    batches.add((options.data as Map)['events'] as List);
    if (offline) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    return ResponseBody.fromString(
      '{"accepted":1,"duplicates":0}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(
    () => PackageInfo.setMockInitialValues(
      appName: 'test',
      packageName: 'test',
      version: '1.0.0',
      buildNumber: '6',
      buildSignature: '',
    ),
  );
  test('corrupt offline storage does not disable later telemetry', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    await db.writeRecord('product-telemetry:1', 'not-json-private-cache');
    final adapter = _Adapter()..offline = false;
    final dio = Dio(BaseOptions(baseUrl: 'https://example.test/api/v1/'))
      ..httpClientAdapter = adapter;
    final client = ProductTelemetry(
      dio,
      db,
      'owner',
      () => true,
      configured: true,
    );
    client.track(
      TelemetryEvent.navigationScreenOpened,
      properties: {'screen': 'feed', 'feature': 'feed'},
    );
    await client.initialize();
    await client.flush();
    final payload = jsonEncode(adapter.batches);
    expect(payload, contains('navigation.screen_opened'));
    expect(payload, isNot(contains('not-json-private-cache')));
    client.dispose();
    await client.pendingWrites;
    await db.close();
    dio.close();
  });
  test(
    'offline retries preserve IDs, bounded storage and owner isolation',
    () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      final adapter = _Adapter(),
          dio = Dio(BaseOptions(baseUrl: 'https://example.test/api/v1/'));
      dio.httpClientAdapter = adapter;
      var current = true;
      final client = ProductTelemetry(
        dio,
        db,
        'fixture-owner',
        () => current,
        configured: true,
      );
      await client.initialize();
      client.track(
        TelemetryEvent.dsaProblemOpened,
        entityId: '00000000-0000-0000-0000-000000000001',
      );
      await client.flush();
      final ids = adapter.batches.first
          .map((e) => (e as Map)['event_id'])
          .toSet();
      adapter.offline = false;
      await client.flush();
      expect(
        adapter.batches.last.map((e) => (e as Map)['event_id']).toSet(),
        ids,
      );
      await client.flush(); // Deliver the bounded retry diagnostic too.
      await client.pendingWrites;
      expect(
        jsonDecode((await db.readRecord('product-telemetry:1'))!),
        isEmpty,
      );
      for (var i = 0; i < 250; i++) {
        client.track(TelemetryEvent.feedOpened);
      }
      await client.pendingWrites;
      final stored = (await db.readRecord('product-telemetry:1'))!;
      expect((jsonDecode(stored) as List).length, 200);
      expect(stored.length, lessThanOrEqualTo(131072));
      expect(stored, isNot(contains('access_token')));
      current = false;
      final count = adapter.batches.length;
      await client.flush();
      expect(adapter.batches.length, count);
      client.dispose();
      await db.close();
      dio.close();
    },
  );
  test(
    'privacy opt out clears queued events and rejects private properties',
    () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory()), dio = Dio();
      final client = ProductTelemetry(
        dio,
        db,
        'owner',
        () => true,
        configured: true,
      );
      await client.initialize();
      client.track(
        TelemetryEvent.aiMessageSubmitted,
        properties: {'prompt': 'PRIVATE'},
      );
      await client.preference(false);
      await client.pendingWrites;
      expect(
        jsonDecode((await db.readRecord('product-telemetry:1'))!),
        isEmpty,
      );
      client.track(TelemetryEvent.feedOpened);
      await client.pendingWrites;
      expect(
        jsonDecode((await db.readRecord('product-telemetry:1'))!),
        isEmpty,
      );
      client.dispose();
      await db.close();
      dio.close();
    },
  );
}
