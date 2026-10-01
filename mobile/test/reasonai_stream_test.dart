import 'dart:convert';
import 'dart:typed_data';
import 'package:app/core/reasonai/reasonai_events.dart';
import 'package:app/core/reasonai/reasonai_stream.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(
    this.chunks, {
    this.contentType = 'application/x-ndjson',
    this.status = 200,
  });
  final List<List<int>> chunks;
  final String contentType;
  final int status;
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async => ResponseBody(
    Stream.fromIterable(chunks.map(Uint8List.fromList)),
    status,
    headers: {
      Headers.contentTypeHeader: [contentType],
    },
  );
  @override
  void close({bool force = false}) {}
}

List<int> _bytes(String text) => utf8.encode(text);
void main() {
  final started = jsonEncode({
    'protocolVersion': 1,
    'runId': 'r1',
    'seq': 0,
    'type': 'run.started',
  });
  final finalText = jsonEncode({
    'protocolVersion': 1,
    'runId': 'r1',
    'seq': 1,
    'type': 'text.final',
    'messageId': 'm',
    'partId': 'p',
    'text': 'café',
  });
  final completed = jsonEncode({
    'protocolVersion': 1,
    'runId': 'r1',
    'seq': 2,
    'type': 'run.completed',
  });
  test(
    'NDJSON handles split UTF-8 and ignores duplicate and foreign events',
    () async {
      final foreign = jsonEncode({
        'protocolVersion': 1,
        'runId': 'other',
        'seq': 1,
        'type': 'run.failed',
        'message': 'not ours',
      });
      final bytes = _bytes(
        '$started\n$finalText\n$finalText\n$foreign\n$completed\n',
      );
      final split = bytes.indexOf(0xC3) + 1;
      final dio = Dio(BaseOptions(baseUrl: 'https://example.com/'));
      dio.httpClientAdapter = _Adapter([
        bytes.sublist(0, 8),
        bytes.sublist(8, split),
        bytes.sublist(split),
      ]);
      final events = await const ReasonAIStream()
          .open(dio: dio, path: 'chat', body: {}, token: CancelToken())
          .toList();
      expect(events.map((e) => e.type), [
        'run.started',
        'text.final',
        'run.completed',
      ]);
      expect(events[1].data['text'], 'café');
    },
  );
  test('missing terminal event interrupts', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/'));
    dio.httpClientAdapter = _Adapter([_bytes('$started\n')]);
    expect(
      const ReasonAIStream()
          .open(dio: dio, path: 'chat', body: {}, token: CancelToken())
          .toList(),
      throwsA(isA<RunInterrupted>()),
    );
  });
  test('JSON fallback is a single non-stream response', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/'));
    dio.httpClientAdapter = _Adapter([
      _bytes('{"text":"Done","sources":[]}'),
    ], contentType: 'application/json');
    final events = await const ReasonAIStream()
        .open(dio: dio, path: 'chat', body: {}, token: CancelToken())
        .toList();
    expect(events.single, isA<NonStreamResponse>());
    expect(events.single.data['text'], 'Done');
  });
  test('HTTP error exposes the server JSON message', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/'));
    dio.httpClientAdapter = _Adapter(
      [_bytes('{"error":"Invalid or oversized story conversation."}')],
      contentType: 'application/json',
      status: 400,
    );
    await expectLater(
      const ReasonAIStream()
          .open(dio: dio, path: 'chat', body: {}, token: CancelToken())
          .toList(),
      throwsA(
        isA<ReasonAIHttpException>()
            .having((error) => error.statusCode, 'status', 400)
            .having(
              (error) => error.message,
              'message',
              'Invalid or oversized story conversation.',
            ),
      ),
    );
  });
}
