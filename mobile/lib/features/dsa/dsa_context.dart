import '../../core/api/safe_url.dart';
import 'dsa_models.dart';

String _limit(String? value, int length) {
  final text = value ?? '';
  return text.length > length ? text.substring(0, length) : text;
}

Map<String, dynamic> buildDsaContext(
  StudyNote note, {
  String approach = '',
  String code = '',
  List<Map<String, dynamic>> notes = const [],
}) {
  final data = note.data;
  final categories = (data['categories'] as List? ?? [])
      .map((e) => (e as Map)['name'])
      .whereType<String>()
      .join(', ');
  Map? recognize;
  for (final block in note.blocks) {
    if (block['type'] == 'recognize') {
      recognize = block['payload'] as Map?;
      break;
    }
  }
  final source = recognize?['source'] is Map
      ? recognize!['source'] as Map
      : const {};
  final rawCompanies = source['companies'];
  final companies = rawCompanies is String
      ? rawCompanies.split(RegExp(r'[,;\n]'))
      : rawCompanies is List
      ? rawCompanies.whereType<String>().toList()
      : <String>[];
  final resource = note.primaryResource;
  final sourceUrl = safeHttpUrl(resource?['url'] as String?)?.toString();
  final summary = _limit(
    (data['summary'] as String?)?.isNotEmpty == true
        ? data['summary'] as String
        : recognize?['text'] as String?,
    4000,
  );
  return {
    'contentId': _limit(note.id, 256),
    'slug': _limit(note.slug, 300),
    'title': _limit(note.title, 300),
    if (note.difficulty != null) 'difficulty': _limit(note.difficulty, 300),
    if (categories.isNotEmpty) 'category': _limit(categories, 300),
    if (resource != null)
      'sourceProvider': _limit(
        (resource['provider_name'] as String?)?.isNotEmpty == true
            ? resource['provider_name'] as String
            : resource['provider_slug'] as String?,
        300,
      ),
    if (sourceUrl != null) 'sourceUrl': sourceUrl,
    if (summary.isNotEmpty) 'summary': summary,
    if (companies.isNotEmpty)
      'companies': companies
          .map((e) => _limit(e.trim(), 200))
          .where((e) => e.isNotEmpty)
          .take(50)
          .toList(),
    if (source['remarks'] is String)
      'remarks': _limit(source['remarks'] as String, 4000),
    'userApproach': _limit(approach, 12000),
    'userNotes': _limit(
      notes.map((e) => e['body']).whereType<String>().join('\n\n'),
      12000,
    ),
    'userCode': _limit(code, 24000),
  };
}
