import 'package:dio/dio.dart';

enum FailureKind {
  offline,
  timeout,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  rateLimited,
  server,
  invalid,
  cancelled,
  unknown,
}

class ApiFailure implements Exception {
  ApiFailure(this.kind, [this.cause]);
  final FailureKind kind;
  final Object? cause;
  factory ApiFailure.from(Object error) {
    if (error is ApiFailure) return error;
    if (error is DioException) {
      if (CancelToken.isCancel(error)) {
        return ApiFailure(FailureKind.cancelled, error);
      }
      if ([
        DioExceptionType.connectionTimeout,
        DioExceptionType.receiveTimeout,
        DioExceptionType.sendTimeout,
      ].contains(error.type)) {
        return ApiFailure(FailureKind.timeout, error);
      }
      if (error.type == DioExceptionType.connectionError) {
        return ApiFailure(FailureKind.offline, error);
      }
      return ApiFailure(switch (error.response?.statusCode ?? 0) {
        400 || 415 || 422 => FailureKind.invalid,
        401 => FailureKind.unauthorized,
        403 => FailureKind.forbidden,
        404 => FailureKind.notFound,
        409 => FailureKind.conflict,
        429 => FailureKind.rateLimited,
        >= 500 => FailureKind.server,
        _ => FailureKind.unknown,
      }, error);
    }
    return ApiFailure(FailureKind.unknown, error);
  }
  String get userMessage => switch (kind) {
    FailureKind.offline ||
    FailureKind.timeout => 'Check your connection and try again.',
    FailureKind.unauthorized => 'Your session expired. Please sign in again.',
    FailureKind.notFound => 'This is no longer available.',
    FailureKind.rateLimited => 'Please wait a moment before trying again.',
    FailureKind.conflict => 'This changed elsewhere. Refresh to continue.',
    _ => 'Something went wrong. Please try again.',
  };
  @override
  String toString() => userMessage;
}
