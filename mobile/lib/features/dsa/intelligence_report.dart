import 'package:flutter/material.dart';
import '../../shared/widgets/reading_content.dart';
import 'canonical_models.dart';

class CodeIntelligenceReport extends StatelessWidget {
  const CodeIntelligenceReport({super.key, required this.analysis});
  final Json analysis;

  Json section(String key) => analysis[key] is Map ? object(analysis[key]) : {};

  @override
  Widget build(BuildContext context) {
    final complexity = section('complexity');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (analysis['summary'] is String)
          _ReportSection(
            title: 'Your solution at a glance',
            icon: Icons.auto_awesome_outlined,
            children: [ReadingContent(data: analysis['summary'] as String)],
          ),
        if (complexity.isNotEmpty)
          _ReportSection(
            title: 'Complexity estimates',
            icon: Icons.speed_outlined,
            children: [
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  for (final pair in [('time', 'Time'), ('space', 'Space')])
                    if (complexity[pair.$1] is String)
                      Container(
                        constraints: const BoxConstraints(minWidth: 112),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Theme.of(
                            context,
                          ).colorScheme.surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              pair.$2,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            const SizedBox(height: 4),
                            SelectableText(
                              complexity[pair.$1] as String,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ],
                        ),
                      ),
                ],
              ),
              ..._fields(complexity, [
                ('explanation', 'Why'),
                ('confidence', 'Confidence'),
                ('caveats', 'What could change the estimate'),
              ]),
            ],
          ),
        for (final spec in [
          (
            'correctness',
            'Correctness & evidence',
            Icons.fact_check_outlined,
            [
              ('evidence', 'Execution evidence'),
              ('assumptions', 'Assumptions'),
              ('edgeCases', 'Edge cases to consider'),
              ('invariants', 'What must stay true'),
            ],
          ),
          (
            'quality',
            'Code quality',
            Icons.code_outlined,
            [
              ('readability', 'Readability'),
              ('naming', 'Naming'),
              ('modularity', 'Structure'),
              ('robustness', 'Robustness'),
            ],
          ),
          (
            'optimization',
            'Improve your approach',
            Icons.trending_up,
            [
              ('approaches', 'Alternative approaches'),
              ('tradeoffs', 'Trade-offs'),
              ('patterns', 'Useful patterns'),
              ('suggestions', 'Next improvements'),
            ],
          ),
          (
            'learning',
            'What to practise next',
            Icons.school_outlined,
            [
              ('strengths', 'What you did well'),
              ('practice', 'Practice suggestions'),
              ('concepts', 'Concepts to revisit'),
              ('earlierAttempts', 'About earlier attempts'),
            ],
          ),
        ])
          if (_fields(section(spec.$1), spec.$4).isNotEmpty)
            _ReportSection(
              title: spec.$2,
              icon: spec.$3,
              children: _fields(section(spec.$1), spec.$4),
            ),
      ],
    );
  }

  List<Widget> _fields(Json values, List<(String, String)> fields) => [
    for (final (key, label) in fields)
      if ((values[key] is String &&
              (values[key] as String).trim().isNotEmpty) ||
          (values[key] is List &&
              (values[key] as List).whereType<String>().isNotEmpty))
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              if (values[key] is String)
                ReadingContent(data: values[key] as String)
              else
                for (final line in (values[key] as List).whereType<String>())
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: ReadingContent(data: '• $line'),
                  ),
            ],
          ),
        ),
  ];
}

class _ReportSection extends StatelessWidget {
  const _ReportSection({
    required this.title,
    required this.icon,
    required this.children,
  });
  final String title;
  final IconData icon;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  icon,
                  size: 20,
                  color: Theme.of(context).colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      ),
    ),
  );
}
