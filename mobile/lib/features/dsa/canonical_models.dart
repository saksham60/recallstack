import 'dart:convert';

typedef Json = Map<String, dynamic>;
Json object(Object? value) {
  if (value is! Map) throw const FormatException('Expected an object.');
  return Map<String, dynamic>.from(value);
}

String string(Json value, String key) {
  final result = value[key];
  if (result is! String || result.isEmpty) {
    throw FormatException('Missing $key.');
  }
  return result;
}

List<Json> objects(Object? value) {
  if (value is! List) throw const FormatException('Expected a list.');
  return value.map(object).toList();
}

String pretty(Object? value) =>
    const JsonEncoder.withIndent('  ').convert(value);

class Problem {
  Problem.parse(Object? value) : data = object(value) {
    for (final key in ['id', 'problem_version_id', 'slug', 'title']) {
      string(data, key);
    }
  }
  final Json data;
  String get id => string(data, 'id');
  String get version => string(data, 'problem_version_id');
  String get slug => string(data, 'slug');
  String get title => string(data, 'title');
  String? get difficulty => data['difficulty'] as String?;
  String get description => data['description'] as String? ?? '';
  List<Json> get categories => objects(data['categories'] ?? []);
  List<Json> get examples => objects(data['examples'] ?? []);
  List<String> get constraints =>
      (data['constraints'] as List? ?? []).whereType<String>().toList();
  Json get contract => object(data['function_contract'] ?? {});
  String get draftKey => 'canonical:$id:$version:python';
  Json tutorContext(String approach, String code, {String? submissionId}) => {
    'contentId': id,
    'problemVersionId': version,
    'slug': slug,
    'title': title,
    'language': 'python',
    'userApproach': approach,
    'userCode': code,
    'userNotes': '',
    if (submissionId != null) 'selectedSubmissionId': submissionId,
  };
}

class CatalogPage {
  CatalogPage.parse(Object? value) {
    final json = object(value);
    items = objects(json['items']).map(Problem.parse).toList();
    hasMore = json['has_more'] == true;
    cursor = json['next_cursor'] as String?;
    if (hasMore && (cursor == null || cursor!.isEmpty)) {
      throw const FormatException('Missing catalog cursor.');
    }
  }
  late final List<Problem> items;
  late final bool hasMore;
  late final String? cursor;
}

const executionStates = {
  'queued',
  'running',
  'completed',
  'failed',
  'timed_out',
  'cancelled',
};
const judgeVerdicts = {
  'accepted',
  'provisional_pass',
  'passed_public_tests',
  'wrong_answer',
  'runtime_error',
  'syntax_error',
  'time_limit_exceeded',
  'output_limit_exceeded',
};
String verdictLabel(String value) => value == 'provisional_pass'
    ? 'Passed current tests'
    : value.replaceAll('_', ' ');

class Execution {
  Execution.parse(Object? value) : data = object(value) {
    for (final key in [
      'submissionId',
      'problemId',
      'problemVersionId',
      'mode',
      'status',
      'createdAt',
    ]) {
      string(data, key);
    }
    if (!executionStates.contains(status) ||
        !{'run', 'submit'}.contains(mode)) {
      throw const FormatException('Unsupported execution state.');
    }
    if (data['result'] != null &&
        !judgeVerdicts.contains(object(data['result'])['verdict'])) {
      throw const FormatException('Unsupported judge verdict.');
    }
  }
  final Json data;
  String get id => string(data, 'submissionId');
  String get problemId => string(data, 'problemId');
  String get version => string(data, 'problemVersionId');
  String get mode => string(data, 'mode');
  String get status => string(data, 'status');
  bool get terminal => !{'queued', 'running'}.contains(status);
  Json? get result => data['result'] == null ? null : object(data['result']);
  String? get error => data['error'] as String?;
  String get label => result == null
      ? verdictLabel(status)
      : verdictLabel(string(result!, 'verdict'));
  void requireScope(Problem problem, {String? submissionId}) {
    if (problemId != problem.id ||
        version != problem.version ||
        (submissionId != null && submissionId != id)) {
      throw const FormatException(
        'Submission does not belong to this problem/version.',
      );
    }
  }
}

class SubmissionPage {
  SubmissionPage.parse(Object? value) {
    final json = object(value);
    items = objects(json['items']).map(Execution.parse).toList();
    next = json['next'] == null ? null : object(json['next']);
    if (next != null) {
      string(next!, 'before');
      string(next!, 'beforeId');
    }
  }
  late final List<Execution> items;
  late final Json? next;
}

class AiReport {
  AiReport.parse(Object? value) : data = object(value) {
    string(data, 'submissionId');
    if (data['sourceCode'] is! String || data['enabled'] is! bool) {
      throw const FormatException('Invalid saved report.');
    }
    final report = data['report'];
    if (report != null &&
        !{
          'queued',
          'generating',
          'completed',
          'failed',
          'rate_limited',
        }.contains(object(report)['status'])) {
      throw const FormatException('Unsupported report state.');
    }
  }
  final Json data;
  String get submissionId => string(data, 'submissionId');
  String get source => data['sourceCode'] as String;
  bool get enabled => data['enabled'] == true;
  Json? get report => data['report'] == null ? null : object(data['report']);
  String? get status => report?['status'] as String?;
  bool get pending =>
      enabled && (report == null || {'queued', 'generating'}.contains(status));
  Json? get analysis =>
      report?['analysis'] == null ? null : object(report!['analysis']);
}
