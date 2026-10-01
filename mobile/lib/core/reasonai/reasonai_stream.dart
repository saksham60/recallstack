import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import '../telemetry/app_logger.dart';
import 'reasonai_events.dart';

class ReasonAIHttpException implements Exception {
  const ReasonAIHttpException(this.statusCode, this.message, {this.code});
  final int statusCode;
  final String message;
  final String? code;

  static Future<ReasonAIHttpException> fromDio(DioException error) async {
    final response = error.response;
    final status = response?.statusCode ?? 0;
    Object? payload = response?.data;
    if (payload is ResponseBody) {
      try {
        payload = jsonDecode(
          await utf8.decoder.bind(payload.stream.cast<List<int>>()).join(),
        );
      } catch (_) {
        payload = null;
      }
    } else if (payload is String) {
      try {
        payload = jsonDecode(payload);
      } catch (_) {
        payload = null;
      }
    }
    final body = payload is Map ? payload : const {};
    final serverMessage = body['error'];
    final fallback = switch (status) {
      400 => 'ReasonAI could not read this request.',
      401 => 'Your session expired. Please sign in again.',
      429 => 'ReasonAI is busy. Please try again shortly.',
      503 => 'ReasonAI is unavailable. Please try again later.',
      _ => 'ReasonAI request failed (HTTP $status).',
    };
    return ReasonAIHttpException(
      status,
      serverMessage is String && serverMessage.isNotEmpty
          ? serverMessage
          : fallback,
      code: body['code'] is String ? body['code'] as String : null,
    );
  }

  @override
  String toString() => message;
}

class ReasonAIStream {
  const ReasonAIStream();
  Stream<ReasonAIEvent> open({
    required Dio dio,
    required String path,
    required Map<String, dynamic> body,
    required CancelToken token,
    void Function(Headers)? onHeaders,
  }) async* {
    Timer? timer;
    var timedOut = false;
    void arm() {
      timer?.cancel();
      timer = Timer(const Duration(seconds: 120), () {
        timedOut = true;
        token.cancel('ReasonAI timeout');
      });
    }

    arm();
    try {
      final response = await dio.post<ResponseBody>(
        path,
        data: body,
        cancelToken: token,
        options: Options(
          responseType: ResponseType.stream,
          headers: {
            'Accept': 'application/x-ndjson',
            'Content-Type': 'application/json',
          },
        ),
      );
      onHeaders?.call(response.headers);
      final lines = response.data!.stream
          .cast<List<int>>()
          .transform(utf8.decoder)
          .transform(const LineSplitter());
      final type = response.headers.value(Headers.contentTypeHeader) ?? '';
      if (!type.toLowerCase().contains('application/x-ndjson')) {
        final text = await lines.join('\n');
        final decoded = jsonDecode(text);
        if (decoded is! Map) throw const ProtocolError('Invalid JSON response');
        if (!token.isCancelled) {
          yield NonStreamResponse(Map<String, dynamic>.from(decoded));
        }
        return;
      }
      String? runId;
      var lastSeq = -1;
      var terminal = false;
      await for (final line in lines) {
        if (token.isCancelled) break;
        if (line.trim().isEmpty) continue;
        final decoded = jsonDecode(line);
        if (decoded is! Map) throw const ProtocolError('Invalid JSON line');
        final event = parseEvent(Map<String, dynamic>.from(decoded));
        if (event == null) continue;
        if (runId == null) {
          if (event.type != 'run.started') {
            throw const ProtocolError('First event must be run.started');
          }
          runId = event.runId;
        }
        if (event.runId != runId || event.seq <= lastSeq) continue;
        lastSeq = event.seq;
        arm();
        yield event;
        if (event.type == 'run.completed' ||
            event.type == 'run.failed' ||
            event.type == 'run.cancelled') {
          terminal = true;
          break;
        }
      }
      if (timedOut) throw StreamTimeout();
      if (!token.isCancelled && !terminal) throw RunInterrupted();
    } on DioException catch (error) {
      if (timedOut) throw StreamTimeout();
      if (!token.isCancelled) {
        if (error.response != null) {
          throw await ReasonAIHttpException.fromDio(error);
        }
        rethrow;
      }
    } catch (error) {
      AppLogger.error(error);
      if (timedOut) throw StreamTimeout();
      if (!token.isCancelled) rethrow;
    } finally {
      timer?.cancel();
    }
  }
}
