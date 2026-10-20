import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/api/api_failure.dart';
import '../../core/auth/auth_repository.dart';
import '../../core/reasonai/reasonai_client.dart';
import '../../app/env.dart';
import 'canonical_models.dart';

class CanonicalDsaApi {
  const CanonicalDsaApi(this.backend, this.web);
  final Dio backend, web;
  Future<T> _call<T>(Future<T> Function() action) async {
    try {
      return await action();
    } catch (error) {
      throw ApiFailure.from(error);
    }
  }

  Future<CatalogPage> catalog({
    String search = '',
    String? category,
    String? difficulty,
    String? cursor,
    CancelToken? token,
  }) => _call(
    () async => CatalogPage.parse(
      (await backend.get(
        'dsa/problems',
        queryParameters: {
          'limit': 50,
          'sort': 'title_asc',
          if (search.trim().isNotEmpty) 'search': search.trim(),
          if (category != null) 'category': category,
          if (difficulty != null) 'difficulty': difficulty,
          if (cursor != null) 'cursor': cursor,
        },
        cancelToken: token,
      )).data,
    ),
  );
  Future<Problem> problem(String slug, {String? version, CancelToken? token}) =>
      _call(() async {
        final resolved = object(
          (await backend.get(
            'dsa/resolve',
            queryParameters: {
              'problem': slug,
              if (version != null) 'problem_version_id': version,
            },
            cancelToken: token,
          )).data,
        );
        final result = Problem.parse(
          (await backend.get(
            'dsa/problems/${Uri.encodeComponent(string(resolved, 'id'))}',
            queryParameters: {
              'problem_version_id': string(resolved, 'problem_version_id'),
            },
            cancelToken: token,
          )).data,
        );
        return result;
      });
  Future<List<Json>> categories({CancelToken? token}) => _call(
    () async => objects(
      object(
        (await backend.get('dsa/categories', cancelToken: token)).data,
      )['items'],
    ),
  );
  Future<Json> capabilities(Problem p, {CancelToken? token}) => _call(
    () async => object(
      (await web.get(
        '/api/dsa/execution-capabilities',
        queryParameters: {'problemId': p.id, 'problemVersionId': p.version},
        cancelToken: token,
      )).data,
    ),
  );
  Future<List<Json>> tests(Problem p, {CancelToken? token}) => _call(() async {
    final result = <Json>[];
    String? cursor;
    for (var page = 0; page < 100; page++) {
      final body = object(
        (await backend.get(
          'dsa/problems/${p.id}/test-cases',
          queryParameters: {
            'problem_version_id': p.version,
            'limit': 50,
            if (cursor != null) 'cursor': cursor,
          },
          cancelToken: token,
        )).data,
      );
      if (body['problem_version_id'] != p.version) {
        throw const FormatException('Test version mismatch.');
      }
      result.addAll(objects(body['items']));
      if (body['has_more'] != true) return result;
      final next = string(body, 'next_cursor');
      if (next == cursor) throw const FormatException('Repeated test cursor.');
      cursor = next;
    }
    throw const FormatException('Test page limit exceeded.');
  });
  Future<List<Json>> progress({CancelToken? token}) => _call(
    () async => objects(
      object(
        (await web.get('/api/dsa/learner-progress', cancelToken: token)).data,
      )['items'],
    ),
  );
  Future<List<Json>> companies(List<Problem> problems, {CancelToken? token}) =>
      _call(
        () async => objects(
          object(
            (await web.post(
              '/api/dsa/board-companies',
              data: {
                'versions': problems.map((p) => p.version).toSet().toList(),
              },
              cancelToken: token,
            )).data,
          )['items'],
        ),
      );
  Future<Set<String>> bookmarks({CancelToken? token}) => _call(() async {
    final ids = <String>{};
    for (var page = 1; page <= 1000; page++) {
      final body = object(
        (await backend.get(
          'dsa/me/bookmarks',
          // DSA endpoints cap page_size at 50 (generic learning APIs allow 100).
          queryParameters: {'page': page, 'page_size': 50},
          cancelToken: token,
        )).data,
      );
      ids.addAll(
        objects(body['items']).map((i) => string(i, 'content_item_id')),
      );
      if (page >= (object(body['pagination'])['total_pages'] as int)) {
        return ids;
      }
    }
    throw const FormatException('Bookmark page limit exceeded.');
  });
  Future<void> bookmark(String id, bool save) => _call(() async {
    if (save) {
      await backend.post('dsa/me/bookmarks', data: {'problem_id': id});
    } else {
      await backend.delete('dsa/me/bookmarks/${Uri.encodeComponent(id)}');
    }
  });
  Future<Execution> create(Json request, {CancelToken? token}) => _call(
    () async => Execution.parse(
      (await web.post(
        '/api/dsa/executions',
        data: request,
        cancelToken: token,
      )).data,
    ),
  );
  Future<Execution> execution(String id, {CancelToken? token}) => _call(
    () async => Execution.parse(
      (await web.get(
        '/api/dsa/executions/${Uri.encodeComponent(id)}',
        cancelToken: token,
      )).data,
    ),
  );
  Future<Execution> cancel(String id, {CancelToken? token}) => _call(
    () async => Execution.parse(
      (await web.delete(
        '/api/dsa/executions/${Uri.encodeComponent(id)}',
        cancelToken: token,
      )).data,
    ),
  );
  Future<SubmissionPage> history(
    Problem p, {
    Json? cursor,
    CancelToken? token,
  }) => _call(
    () async => SubmissionPage.parse(
      (await web.get(
        '/api/dsa/submissions',
        queryParameters: {
          'problemId': p.id,
          'problemVersionId': p.version,
          ...?cursor,
        },
        cancelToken: token,
      )).data,
    ),
  );
  Future<AiReport> report(
    String id, {
    bool retry = false,
    CancelToken? token,
  }) => _call(() async {
    final response = retry
        ? await web.post(
            '/api/dsa/submissions/${Uri.encodeComponent(id)}/report',
            cancelToken: token,
          )
        : await web.get(
            '/api/dsa/submissions/${Uri.encodeComponent(id)}/report',
            cancelToken: token,
          );
    final report = AiReport.parse(response.data);
    if (report.submissionId != id) {
      throw const FormatException('Report identity mismatch.');
    }
    return report;
  });
}

final executionDioProvider = Provider<Dio>((ref) {
  ref.watch(authStateProvider.select((state) => state.value?.user.id));
  final dio = createApiDio(
    AppEnv.webBaseUrl,
    ref.watch(authRepositoryProvider),
  );
  dio.options.followRedirects = false;
  dio.options.headers.addAll({
    'Accept': 'application/json',
    'X-DSA-Execution-Version': '1',
  });
  dio.interceptors.add(ReasonAICanonicalRedirectInterceptor(dio));
  ref.onDispose(() => dio.close(force: true));
  return dio;
});
final canonicalDsaApiProvider = Provider<CanonicalDsaApi>(
  (ref) => CanonicalDsaApi(
    ref.watch(backendDioProvider),
    ref.watch(executionDioProvider),
  ),
);
final canonicalProgressProvider = FutureProvider.autoDispose<List<Json>>((
  ref,
) async {
  final token = CancelToken();
  ref.onDispose(token.cancel);
  return ref.watch(canonicalDsaApiProvider).progress(token: token);
});
