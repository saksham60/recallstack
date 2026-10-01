import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../core/api/safe_url.dart';
import '../theme/app_theme.dart';

class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.aspectRatio = 1.8,
    this.radius = 16,
    this.height,
  });
  final String? url;
  final double aspectRatio, radius;
  final double? height;
  @override
  Widget build(BuildContext context) {
    final uri = safeHttpUrl(url);
    const fallback = ColoredBox(
      color: AppColors.elevated,
      child: Center(
        child: Icon(Icons.image_outlined, color: AppColors.mutedText, size: 28),
      ),
    );
    final image = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: uri == null
          ? fallback
          : CachedNetworkImage(
              imageUrl: uri.toString(),
              width: double.infinity,
              height: double.infinity,
              fit: BoxFit.cover,
              placeholder: (_, _) => fallback,
              errorWidget: (_, _, _) => fallback,
            ),
    );
    return height == null
        ? AspectRatio(aspectRatio: aspectRatio, child: image)
        : SizedBox(width: double.infinity, height: height, child: image);
  }
}
