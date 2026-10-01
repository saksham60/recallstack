import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

Uri? safeHttpUrl(String? value) {
  final uri = Uri.tryParse(value ?? '');
  return uri != null &&
          (uri.scheme == 'http' || uri.scheme == 'https') &&
          uri.host.isNotEmpty
      ? uri
      : null;
}

Future<bool> openExternal(BuildContext context, String? value) async {
  final uri = safeHttpUrl(value);
  final opened =
      uri != null && await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!opened) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open this link.')),
      );
    }
  }
  return opened;
}
