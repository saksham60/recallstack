import 'dart:typed_data';
import 'package:app/core/db/app_database.dart';
import 'package:app/features/dsa/dsa_api.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

class _ReviewServer implements HttpClientAdapter {
  final bodies = <Map<String, dynamic>>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    bodies.add(Map<String, dynamic>.from(options.data as Map));
    if (bodies.length == 1) {
      throw DioException(
        requestOptions: options,
        type: DioExceptionType.connectionError,
      );
    }
    return ResponseBody.fromString(
      '{}',
      200,
      headers: {
        'content-type': ['application/json'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test(
    'interrupted revision retries persist the exact original event and row version',
    () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      final server = _ReviewServer();
      final dio = Dio(BaseOptions(baseUrl: 'https://fixture.test/api/v1/'))
        ..httpClientAdapter = server;
      final first = DsaApi(dio, database: db);
      final card = {'card_id': 'card', 'row_version': 7};
      await expectLater(
        first.submitReview(card, 'good'),
        throwsA(isA<Exception>()),
      );
      await DsaApi(dio, database: db).submitReview(card, 'good');
      expect(server.bodies, hasLength(2));
      expect(server.bodies.last, server.bodies.first);
      expect(server.bodies.last['expected_row_version'], 7);
      expect(await db.readRecord('review:card:7:good'), isNull);
    },
  );
}
