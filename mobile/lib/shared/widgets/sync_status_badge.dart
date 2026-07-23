import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:app/core/sync/sync_status_provider.dart';

class SyncStatusBadge extends ConsumerWidget {
  const SyncStatusBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(syncStatusProvider);
    final theme = Theme.of(context);

    IconData icon;
    Color color;
    String label;

    switch (state.status) {
      case SyncStatus.idle:
        icon = Icons.cloud_outlined;
        color = theme.colorScheme.onSurfaceVariant;
        label = 'Idle';
        break;
      case SyncStatus.offline:
        icon = Icons.cloud_off;
        color = theme.colorScheme.error;
        label = 'Offline';
        break;
      case SyncStatus.authenticationRequired:
        icon = Icons.no_accounts;
        color = theme.colorScheme.error;
        label = 'Login required';
        break;
      case SyncStatus.serverFailure:
        icon = Icons.cloud_off;
        color = theme.colorScheme.error;
        label = 'Server Error';
        break;
      case SyncStatus.partialFailure:
        icon = Icons.warning_amber_rounded;
        color = theme.colorScheme.error;
        label = 'Partial Sync Error';
        break;
      case SyncStatus.syncing:
        icon = Icons.sync;
        color = theme.colorScheme.primary;
        label = 'Syncing...';
        break;
      case SyncStatus.syncIssue:
        icon = Icons.error_outline;
        color = theme.colorScheme.error;
        label = 'Sync Issue';
        break;
      case SyncStatus.pendingChanges:
        icon = Icons.cloud_upload_outlined;
        color = theme.colorScheme.tertiary;
        label = '${state.pendingCount} pending';
        break;
      case SyncStatus.upToDate:
        icon = Icons.cloud_done_outlined;
        color = theme.colorScheme.onSurfaceVariant;
        label = 'Up to date';
        break;
    }

    return InkWell(
      onTap: state.status == SyncStatus.syncIssue
          ? () => context.push('/conflicts')
          : null,
      child: Tooltip(
        message: label,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 4.0),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (state.status == SyncStatus.syncing)
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: color,
                  ),
                )
              else
                Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: theme.textTheme.labelSmall?.copyWith(color: color),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
