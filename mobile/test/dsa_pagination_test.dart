import 'dart:convert';
import 'dart:typed_data';
import 'package:app/features/dsa/dsa_api.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

class _PagedAdapter implements HttpClientAdapter {
  final pages = <String>[];
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final page = options.uri.queryParameters['page']!;
    pages.add(page);
    return ResponseBody.fromString(
      jsonEncode({
        'items': [
          {'slug': 'item-$page', 'title': 'Problem $page'},
        ],
        'pagination': {
          'page': int.parse(page),
          'page_size': 100,
          'total_items': 2,
          'total_pages': 2,
        },
      }),
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
  test('bookmarks load every backend page', () async {
    final adapter = _PagedAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api/v1/'))
      ..httpClientAdapter = adapter;
    final bookmarks = await DsaApi(dio).bookmarks();
    expect(bookmarks.map((item) => item['slug']), ['item-1', 'item-2']);
    expect(adapter.pages, ['1', '2']);
  });
}
