import 'dart:io';

import 'package:app/core/api/api_error_handler.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

DioException _error({
  int? statusCode,
  DioExceptionType type = DioExceptionType.badResponse,
  Object? error,
}) {
  final options = RequestOptions(path: '/test');
  return DioException(
    requestOptions: options,
    type: type,
    error: error,
    response: statusCode == null
        ? null
        : Response<void>(requestOptions: options, statusCode: statusCode),
  );
}

void main() {
  for (final type in [
    DioExceptionType.connectionError,
    DioExceptionType.connectionTimeout,
    DioExceptionType.sendTimeout,
    DioExceptionType.receiveTimeout,
  ]) {
    test('$type is offline', () {
      expect(
        ApiErrorHandler.classify(_error(type: type)),
        SyncErrorType.offline,
      );
    });
  }

  test('DNS SocketException is offline', () {
    expect(
      ApiErrorHandler.classify(
        _error(error: const SocketException('DNS lookup failed')),
      ),
      SyncErrorType.offline,
    );
  });

  for (final status in [401, 403]) {
    test('HTTP $status requires authentication', () {
      expect(
        ApiErrorHandler.classify(_error(statusCode: status)),
        SyncErrorType.authRequired,
      );
    });
  }

  for (final status in [500, 503, 599]) {
    test('HTTP $status is a server failure', () {
      expect(
        ApiErrorHandler.classify(_error(statusCode: status)),
        SyncErrorType.serverFailure,
      );
    });
  }

  test('HTTP 429 remains a recoverable non-server condition', () {
    expect(
      ApiErrorHandler.classify(_error(statusCode: 429)),
      SyncErrorType.unknown,
    );
  });
}
