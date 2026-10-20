import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:app/features/dsa/canonical_models.dart';

const problemId = '10000000-0000-4000-8000-000000000001';
const problemVersion = '20000000-0000-4000-8000-000000000001';
const categoryId = '30000000-0000-4000-8000-000000000001';
const submissionId = '40000000-0000-4000-8000-000000000001';
const problemSlug = 'array-total';
Json problemFixture([int index = 1]) => {
  'id': '10000000-0000-4000-8000-${index.toString().padLeft(12, '0')}',
  'problem_version_id':
      '20000000-0000-4000-8000-${index.toString().padLeft(12, '0')}',
  'slug': index == 1 ? problemSlug : 'problem-$index',
  'title': index == 1 ? 'Array total' : 'Problem $index',
  'difficulty': index.isEven ? 'medium' : 'easy',
  'availability': 'available',
  'categories': [
    {'id': categoryId, 'name': 'Arrays', 'slug': 'arrays'},
  ],
  'topics': <Json>[],
  'description': 'Return the sum of all supplied numbers.',
  'constraints': ['1 <= len(nums) <= 100'],
  'examples': [
    {
      'input': {
        'nums': [1, 2],
      },
      'output': 3,
    },
  ],
  'function_contract': {
    'function': 'solve',
    'input': {'nums': 'list[int]'},
    'output': 'int',
  },
  'supported_contract_languages': ['python'],
};
Json executionFixture({
  String status = 'completed',
  String mode = 'submit',
  String verdict = 'accepted',
}) => {
  'submissionId': submissionId,
  'problemId': problemId,
  'problemVersionId': problemVersion,
  'mode': mode,
  'language': 'python',
  'status': status,
  'createdAt': '2026-10-19T00:00:00Z',
  'updatedAt': '2026-10-19T00:00:01Z',
  if (status == 'completed')
    'result': {
      'verdict': verdict,
      'passedTests': 3,
      'totalTests': 3,
      'executionTimeMs': 7,
    },
};
Json capabilitiesFixture() => {
  'run': true,
  'submit': true,
  'languages': ['python'],
  'gradingLevel': 'official',
  'approvedContract': {
    'problemId': problemId,
    'problemVersionId': problemVersion,
    'contractRevision': 'a' * 64,
    'sourceNotice': null,
    'contract': {
      'entrypoint': 'solve',
      'inputMode': 'kwargs',
      'checker': 'exact_json',
      'adapter': {
        'id': 'reasonai-python',
        'version': 'reasonai-python:1',
        'invocation': 'function',
        'parameters': [
          {'name': 'nums', 'pythonType': 'list[int]', 'codec': 'json'},
        ],
        'returnType': 'int',
        'result': {'source': 'return', 'codec': 'json'},
      },
    },
  },
};
Json reportFixture(
  String status, {
  String source = 'def solve(nums):\n    return sum(nums)',
}) => {
  'submissionId': submissionId,
  'sourceCode': source,
  'codeSha256': 'b' * 64,
  'enabled': true,
  'report': {
    'id': '50000000-0000-4000-8000-000000000001',
    'status': status,
    'model': 'fixture/model',
    'rubric': 'dsa-code-intelligence:1',
    'attempts': 1,
    'createdAt': '2026-10-19T00:00:00Z',
    'updatedAt': '2026-10-19T00:00:01Z',
    if (status == 'completed')
      'analysis': {
        'summary': 'Fixture saved analysis',
        'complexity': {
          'time': 'O(n)',
          'space': 'O(1)',
          'explanation': 'One pass',
          'confidence': 'high',
          'caveats': <String>[],
        },
        'correctness': {
          'evidence': ['Actual fixture verdict'],
          'assumptions': <String>[],
          'edgeCases': <String>[],
          'invariants': <String>[],
        },
        'quality': {
          'readability': 'Clear',
          'naming': 'Clear',
          'modularity': 'Clear',
          'robustness': 'Check edges',
        },
        'optimization': {
          'approaches': <String>[],
          'tradeoffs': <String>[],
          'patterns': <String>[],
          'suggestions': <String>[],
        },
        'learning': {
          'strengths': ['Simple'],
          'practice': ['Arrays'],
          'concepts': ['Iteration'],
          'earlierAttempts': 'No inference',
        },
      },
  },
};

class ContractServer implements HttpClientAdapter {
  ContractServer({this.count = 3});
  final int count;
  final requests = <RequestOptions>[];
  final jobs = <String, Json>{};
  bool loseNextCreate = false, metadataFails = false;
  int launches = 0, reportRetries = 0;
  String reportStatus = 'completed';
  final bookmarks = <String>{};
  ResponseBody json(Object? value, [int status = 200]) =>
      ResponseBody.fromString(
        jsonEncode(value),
        status,
        headers: {
          'content-type': ['application/json'],
        },
      );
  @override
  Future<ResponseBody> fetch(
    RequestOptions o,
    Stream<Uint8List>? stream,
    Future<void>? cancel,
  ) async {
    requests.add(o);
    final path = o.uri.path;
    if (path.endsWith('/dsa/problems')) {
      final start =
          int.tryParse(o.queryParameters['cursor']?.toString() ?? '0') ?? 0;
      final page = [
        for (var i = start + 1; i <= count && i <= start + 50; i++)
          problemFixture(i),
      ];
      final more = start + 50 < count;
      return json({
        'items': page,
        'has_more': more,
        'next_cursor': more ? '${start + 50}' : null,
      });
    }
    if (path.endsWith('/dsa/resolve')) return json(problemFixture());
    if (path.endsWith('/dsa/problems/$problemId')) {
      return json(problemFixture());
    }
    if (path.endsWith('/dsa/categories')) {
      return json({
        'items': [
          {
            'id': categoryId,
            'name': 'Arrays',
            'slug': 'arrays',
            'problem_count': count,
          },
        ],
      });
    }
    if (path.endsWith('/test-cases')) {
      return json({
        'problem_version_id': problemVersion,
        'items': [
          {
            'id': categoryId,
            'input_json': {
              'nums': [1, 2],
            },
            'expected_output_json': 3,
          },
        ],
        'has_more': false,
        'next_cursor': null,
        'has_verified_public_tests': true,
      });
    }
    if (path == '/api/dsa/execution-capabilities') {
      return json(capabilitiesFixture());
    }
    if (path == '/api/dsa/board-companies') {
      return json({
        'items': (object(o.data)['versions'] as List)
            .map(
              (v) => {
                'problemVersionId': v,
                'slug': 'fixture-co',
                'name': 'Fixture Co',
                'reviewStatus': 'reviewed',
              },
            )
            .toList(),
      });
    }
    if (path == '/api/dsa/learner-progress') {
      if (metadataFails) return json({'error': 'Offline fixture'}, 503);
      return json({
        'items': [
          {
            'problemId': problemId,
            'problemVersionId': problemVersion,
            'executionStatus': jobs.isEmpty ? null : 'solved',
            'learningStatus': 'new',
            'previousVersionPassed': false,
            'categoryIds': [categoryId],
          },
        ],
      });
    }
    if (path.endsWith('/dsa/me/bookmarks') && o.method == 'GET') {
      if ((o.queryParameters['page_size'] as int) > 50) {
        return json({'detail': 'page_size must be at most 50'}, 422);
      }
      return json({
        'items': bookmarks.map((id) => {'content_item_id': id}).toList(),
        'pagination': {'total_pages': 1},
      });
    }
    if (path.endsWith('/dsa/me/bookmarks') && o.method == 'POST') {
      bookmarks.add(object(o.data)['problem_id'] as String);
      return json({'changed': true});
    }
    if (path.endsWith('/dsa/me/bookmarks/$problemId') && o.method == 'DELETE') {
      bookmarks.remove(problemId);
      return json({'changed': true});
    }
    if (path == '/api/dsa/executions' && o.method == 'POST') {
      final request = Map<String, dynamic>.from(o.data as Map);
      final key = string(request, 'idempotencyKey');
      if (!jobs.containsKey(key)) {
        jobs[key] = request;
        launches++;
      } else if (jsonEncode(jobs[key]) != jsonEncode(request)) {
        return json({'error': 'Changed idempotent body'}, 409);
      }
      if (loseNextCreate) {
        loseNextCreate = false;
        throw DioException(
          requestOptions: o,
          type: DioExceptionType.connectionError,
          error: 'Fixture lost response after commit',
        );
      }
      return json(
        executionFixture(status: 'queued', mode: request['mode'] as String),
        202,
      );
    }
    if (path == '/api/dsa/executions/$submissionId') {
      return json(
        executionFixture(
          mode: jobs.isEmpty ? 'submit' : jobs.values.last['mode'] as String,
          status: o.method == 'DELETE' ? 'cancelled' : 'completed',
        ),
      );
    }
    if (path == '/api/dsa/submissions') {
      return json({
        'items': jobs.isEmpty ? <Json>[] : [executionFixture()],
        'next': null,
      });
    }
    if (path == '/api/dsa/submissions/$submissionId/report') {
      if (o.method == 'POST') {
        reportRetries++;
        reportStatus = 'completed';
      }
      return json(reportFixture(reportStatus));
    }
    if (path.endsWith('/knowledge/feed')) {
      return json({'items': <Json>[], 'hasMore': false, 'nextCursor': null});
    }
    if (path.endsWith('/knowledge/events/batch')) {
      return json({'accepted': true});
    }
    if (path.endsWith('/me')) {
      return json({'display_name': 'Fixture learner', 'roles': <String>[]});
    }
    if (path.endsWith('/me/reviews/due') ||
        path.endsWith('/me/bookmarks') ||
        path.endsWith('/me/notes')) {
      return json({
        'items': <Json>[],
        'pagination': {'total_pages': 0},
      });
    }
    throw StateError('Unexpected fixture contract: ${o.method} $path');
  }

  @override
  void close({bool force = false}) {}
}
